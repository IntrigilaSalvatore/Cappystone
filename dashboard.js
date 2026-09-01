(function () {

    "use strict";


    // ========================================================
    // SUPABASE CONFIGURATION
    // ========================================================

    const SUPABASE_URL =
        "https://raphpzlmjjzgwohjgczu.supabase.co";


    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


    // ========================================================
    // SUPABASE CLIENT
    // ========================================================

    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {

        console.error(
            "Supabase JavaScript library was not loaded."
        );

        return;
    }


    const client =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );


    console.log(
        "RVJ Dashboard Supabase client initialized."
    );


    // ========================================================
    // FRESHNESS CONFIGURATION
    // ========================================================

    // Master sends heartbeat every ~10 seconds.
    //
    // We allow up to 30 seconds before declaring it offline.

    const MASTER_TIMEOUT_MS =
        30000;


    // Temp nodes normally transmit every 10 seconds.
    //
    // Allow 30 seconds before considering telemetry stale.

    const TEMPERATURE_TIMEOUT_MS =
        30000;


    // Crowd analysis runs every 5 minutes.
    //
    // Allow one missed scan.

    const CROWD_TIMEOUT_MS =
        10 * 60 * 1000;


    // Weather analysis runs every 5 minutes.
    //
    // Again allow one missed run.

    const WEATHER_TIMEOUT_MS =
        10 * 60 * 1000;


    // Dashboard checks freshness once per second.

    const FRESHNESS_CHECK_INTERVAL_MS =
        1000;


    // ========================================================
    // STATE
    // ========================================================

    let currentRoomId =
        null;


    let rooms =
        [];


    let roomState =
        null;


    let latestTemperatureReadings =
        [];


    let realtimeChannel =
        null;


    let lastMasterSeenAt =
        null;


    let masterOnline =
        false;


    // ========================================================
    // ELEMENT HELPERS
    // ========================================================

    function getElements(name) {

        return document.querySelectorAll(
            `[data-rvj="${name}"]`
        );
    }


    function setText(
        name,
        value
    ) {

        getElements(name).forEach(
            element => {

                element.textContent =
                    value;

            }
        );
    }


    function setStatus(
        name,
        value
    ) {

        getElements(name).forEach(
            element => {

                element.dataset.status =
                    value;

            }
        );
    }


    // ========================================================
    // DATE PARSING
    // ========================================================

    function parseDate(
        value
    ) {

        if (!value) {

            return null;
        }


        const date =
            new Date(
                value
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return null;
        }


        return date;
    }


    // ========================================================
    // FRESHNESS CHECK
    // ========================================================

    function isFresh(
        timestamp,
        timeoutMs
    ) {

        const date =
            parseDate(
                timestamp
            );


        if (!date) {

            return false;
        }


        const age =
            Date.now() -
            date.getTime();


        return (
            age >= 0 &&
            age <= timeoutMs
        );
    }


    // ========================================================
    // MASTER ONLINE STATE
    // ========================================================

    function calculateMasterOnline() {

        if (!lastMasterSeenAt) {

            return false;
        }


        return isFresh(
            lastMasterSeenAt,
            MASTER_TIMEOUT_MS
        );
    }


    // ========================================================
    // SET MASTER ONLINE/OFFLINE
    // ========================================================

    function updateMasterStatus() {

        const online =
            calculateMasterOnline();


        // Only update when state changes.

        if (
            online === masterOnline
        ) {

            return;
        }


        masterOnline =
            online;


        if (
            masterOnline
        ) {

            console.log(
                "MASTER NODE ONLINE"
            );


            setText(
                "connection-status",
                "DEVICE ONLINE"
            );


            setStatus(
                "connection-status",
                "connected"
            );


            setText(
                "system-status",
                "Master Node is online and reporting."
            );


            enableAdminControls();


            // Refresh everything when the Master returns.

            loadRoomState();

            loadTemperatureReadings();

        } else {

            console.warn(
                "MASTER NODE OFFLINE"
            );


            setText(
                "connection-status",
                "DEVICE OFFLINE"
            );


            setStatus(
                "connection-status",
                "offline"
            );


            setText(
                "system-status",
                "Master Node is offline or has stopped reporting. Live device data is unavailable."
            );


            disableAdminControls();


            clearLiveDeviceData();
        }
    }


    // ========================================================
    // CLEAR LIVE DATA
    // ========================================================

    function clearLiveDeviceData() {

        // ----------------------------------------------------
        // Hardware state
        // ----------------------------------------------------

        setText(
            "temperature",
            "UNAVAILABLE"
        );


        setText(
            "ac-status",
            "UNAVAILABLE"
        );


        setText(
            "rfid-status",
            "UNAVAILABLE"
        );


        setText(
            "control-mode",
            "UNAVAILABLE"
        );


        setText(
            "door-status",
            "UNAVAILABLE"
        );


        setText(
            "crowd-count",
            "UNAVAILABLE"
        );


        setText(
            "crowd-alert",
            "UNAVAILABLE"
        );


        setText(
            "weather-alert",
            "UNAVAILABLE"
        );


        setText(
            "outdoor-temperature",
            "UNAVAILABLE"
        );


        // ----------------------------------------------------
        // Performance
        // ----------------------------------------------------

        setText(
            "performance-score",
            "UNAVAILABLE"
        );


        setText(
            "performance-status",
            "UNAVAILABLE"
        );


        // ----------------------------------------------------
        // Degradation
        // ----------------------------------------------------

        setText(
            "door-factor",
            "UNAVAILABLE"
        );


        setText(
            "crowd-factor",
            "UNAVAILABLE"
        );


        setText(
            "weather-factor",
            "UNAVAILABLE"
        );


        setText(
            "degradation-factor",
            "UNAVAILABLE"
        );


        // ----------------------------------------------------
        // Last update
        // ----------------------------------------------------

        setText(
            "last-update",
            "UNAVAILABLE"
        );
    }


    // ========================================================
    // DISABLE ADMIN CONTROLS
    // ========================================================

    function disableAdminControls() {

        document
            .querySelectorAll(
                "[data-ac-command]"
            )
            .forEach(
                button => {

                    button.disabled =
                        true;

                }
            );
    }


    // ========================================================
    // ENABLE ADMIN CONTROLS
    // ========================================================

    function enableAdminControls() {

        document
            .querySelectorAll(
                "[data-ac-command]"
            )
            .forEach(
                button => {

                    button.disabled =
                        false;

                }
            );
    }


    // ========================================================
    // DISPLAY ROOM
    // ========================================================

    function displayRoom(
        room
    ) {

        setText(
            "room-code",
            room.room_code ||
            "--"
        );


        setText(
            "room-name",
            room.room_name ||
            "--"
        );


        setText(
            "room-location",
            room.location ||
            "--"
        );


        setText(
            "room-capacity",
            room.capacity ??
            "--"
        );
    }


    // ========================================================
    // DISPLAY ROOM STATE
    // ========================================================

    function displayState(
        data
    ) {

        console.log(
            "ROOM STATE:",
            data
        );


        roomState =
            data;


        if (!data) {

            lastMasterSeenAt =
                null;


            updateMasterStatus();

            return;
        }


        // ====================================================
        // MASTER HEARTBEAT
        // ====================================================

        lastMasterSeenAt =
            data.master_last_seen_at;


        const online =
            calculateMasterOnline();


        if (!online) {

            masterOnline =
                false;


            clearLiveDeviceData();

            disableAdminControls();

            setText(
                "connection-status",
                "DEVICE OFFLINE"
            );


            setStatus(
                "connection-status",
                "offline"
            );


            setText(
                "system-status",
                "Master Node is offline or has stopped reporting."
            );


            return;
        }


        masterOnline =
            true;


        setText(
            "connection-status",
            "DEVICE ONLINE"
        );


        setStatus(
            "connection-status",
            "connected"
        );


        // ====================================================
        // TEMPERATURE
        // ====================================================
        //
        // We do not blindly trust avg_temperature_c.
        // Temperature readings are checked separately for
        // freshness.
        //

        updateTemperatureDisplay();


        // ====================================================
        // AC
        // ====================================================

        setText(
            "ac-status",
            data.ac_power === true
                ? "ON"
                : "OFF"
        );


        setStatus(
            "ac-status",
            data.ac_power === true
                ? "on"
                : "off"
        );


        // ====================================================
        // RFID
        // ====================================================

        setText(
            "rfid-status",
            data.rfid_present === true
                ? "PRESENT"
                : "REMOVED"
        );


        setStatus(
            "rfid-status",
            data.rfid_present === true
                ? "present"
                : "removed"
        );


        // ====================================================
        // CONTROL MODE
        // ====================================================

        setText(
            "control-mode",
            data.ac_control_mode ||
            "RFID"
        );


        // ====================================================
        // DOOR
        // ====================================================

        setText(
            "door-status",
            data.door_open === true
                ? "OPEN"
                : "CLOSED"
        );


        setStatus(
            "door-status",
            data.door_open === true
                ? "open"
                : "closed"
        );


        // ====================================================
        // CROWD
        // ====================================================

        const crowdFresh =
            isFresh(
                data.crowd_last_scan_at,
                CROWD_TIMEOUT_MS
            );


        if (
            crowdFresh
        ) {

            setText(
                "crowd-count",
                data.crowd_count ??
                0
            );


            setText(
                "crowd-alert",
                data.overcrowded
                    ? "OVERCROWDED"
                    : "NORMAL"
            );

        } else {

            setText(
                "crowd-count",
                "UNAVAILABLE"
            );


            setText(
                "crowd-alert",
                "DATA STALE"
            );
        }


        // ====================================================
        // WEATHER
        // ====================================================

        const weatherFresh =
            isFresh(
                data.weather_last_updated_at,
                WEATHER_TIMEOUT_MS
            );


        if (
            weatherFresh
        ) {

            setText(
                "weather-alert",
                data.hot_weather
                    ? "HOT WEATHER"
                    : "NORMAL"
            );


            if (
                data.outdoor_temperature_c !==
                null &&
                data.outdoor_temperature_c !==
                undefined
            ) {

                setText(
                    "outdoor-temperature",
                    `${Number(
                        data.outdoor_temperature_c
                    ).toFixed(1)} °C`
                );
            }

        } else {

            setText(
                "weather-alert",
                "UNAVAILABLE"
            );


            setText(
                "outdoor-temperature",
                "UNAVAILABLE"
            );
        }


        // ====================================================
        // PERFORMANCE
        // ====================================================

        if (
            data.performance_score !== null &&
            data.performance_score !== undefined
        ) {

            setText(
                "performance-score",
                Number(
                    data.performance_score
                ).toFixed(0)
            );


            setText(
                "performance-status",
                data.performance_status ||
                "UNKNOWN"
            );

        } else {

            setText(
                "performance-score",
                "NO DATA"
            );


            setText(
                "performance-status",
                "NO DATA"
            );
        }


        // ====================================================
        // DEGRADATION
        // ====================================================

        displayDegradationState(
            data
        );


        // ====================================================
        // LAST DATABASE UPDATE
        // ====================================================

        setText(
            "last-update",
            data.updated_at
                ? formatDateTime(
                    data.updated_at
                )
                : "--"
        );


        updateMasterStatus();
    }


    // ========================================================
    // TEMPERATURE READING FRESHNESS
    // ========================================================

    function updateTemperatureDisplay() {

        if (
            !masterOnline
        ) {

            setText(
                "temperature",
                "UNAVAILABLE"
            );

            return;
        }


        if (
            latestTemperatureReadings.length === 0
        ) {

            setText(
                "temperature",
                "NO DATA"
            );

            return;
        }


        const now =
            Date.now();


        const freshReadings =
            latestTemperatureReadings.filter(
                reading => {

                    const timestamp =
                        parseDate(
                            reading.recorded_at
                        );


                    if (!timestamp) {

                        return false;
                    }


                    const age =
                        now -
                        timestamp.getTime();


                    return (
                        age >= 0 &&
                        age <=
                        TEMPERATURE_TIMEOUT_MS
                    );
                }
            );


        // We expect all three nodes.

        if (
            freshReadings.length < 3
        ) {

            setText(
                "temperature",
                "SENSOR DATA INCOMPLETE"
            );

            return;
        }


        const total =
            freshReadings.reduce(
                (
                    sum,
                    reading
                ) =>
                    sum +
                    Number(
                        reading.temperature_c
                    ),
                0
            );


        const average =
            total /
            freshReadings.length;


        setText(
            "temperature",
            `${average.toFixed(1)} °C`
        );
    }


    // ========================================================
    // DEGRADATION STATE
    // ========================================================

    function displayDegradationState(
        data
    ) {

        if (!masterOnline) {

            setText(
                "door-factor",
                "UNAVAILABLE"
            );


            setText(
                "crowd-factor",
                "UNAVAILABLE"
            );


            setText(
                "weather-factor",
                "UNAVAILABLE"
            );


            setText(
                "degradation-factor",
                "UNAVAILABLE"
            );


            return;
        }


        // ----------------------------------------------------
        // Door
        // ----------------------------------------------------

        setText(
            "door-factor",
            data.door_open === true
                ? "ACTIVE"
                : "NORMAL"
        );


        // ----------------------------------------------------
        // Crowd
        // ----------------------------------------------------

        const crowdFresh =
            isFresh(
                data.crowd_last_scan_at,
                CROWD_TIMEOUT_MS
            );


        setText(
            "crowd-factor",
            crowdFresh
                ? (
                    data.overcrowded
                        ? "ACTIVE"
                        : "NORMAL"
                )
                : "UNAVAILABLE"
        );


        // ----------------------------------------------------
        // Weather
        // ----------------------------------------------------

        const weatherFresh =
            isFresh(
                data.weather_last_updated_at,
                WEATHER_TIMEOUT_MS
            );


        setText(
            "weather-factor",
            weatherFresh
                ? (
                    data.hot_weather
                        ? "ACTIVE"
                        : "NORMAL"
                )
                : "UNAVAILABLE"
        );


        // ----------------------------------------------------
        // Primary factor
        // ----------------------------------------------------

        setText(
            "degradation-factor",
            data.degradation_factor ||
            "NONE"
        );
    }


    // ========================================================
    // LOAD TEMPERATURE READINGS
    // ========================================================

    async function loadTemperatureReadings() {

        if (
            !currentRoomId
        ) {

            return;
        }


        const result =
            await client
                .from(
                    "temperature_readings"
                )
                .select(
                    "id, device_id, temperature_c, recorded_at"
                )
                .eq(
                    "room_id",
                    currentRoomId
                )
                .order(
                    "recorded_at",
                    {
                        ascending: false
                    }
                )
                .limit(
                    20
                );


        if (
            result.error
        ) {

            console.error(
                "Temperature query error:",
                result.error
            );


            latestTemperatureReadings =
                [];


            if (
                masterOnline
            ) {

                setText(
                    "temperature",
                    "NO DATA"
                );
            }


            return;
        }


        latestTemperatureReadings =
            result.data || [];


        // Get the newest reading per device.

        const newestByDevice =
            new Map();


        latestTemperatureReadings.forEach(
            reading => {

                const deviceId =
                    reading.device_id;


                if (
                    !newestByDevice.has(
                        deviceId
                    )
                ) {

                    newestByDevice.set(
                        deviceId,
                        reading
                    );
                }
            }
        );


        latestTemperatureReadings =
            Array.from(
                newestByDevice.values()
            );


        updateTemperatureDisplay();
    }


    // ========================================================
    // LOAD ROOMS
    // ========================================================

    async function loadRooms() {

        console.log(
            "REQUESTING rooms..."
        );


        const result =
            await client
                .from("rooms")
                .select("*")
                .eq(
                    "active",
                    true
                )
                .order(
                    "room_code"
                );


        console.log(
            "ROOM RESPONSE:",
            result
        );


        if (
            result.error
        ) {

            setText(
                "system-status",
                `ROOM ERROR: ${result.error.message}`
            );

            return false;
        }


        rooms =
            result.data || [];


        if (
            rooms.length === 0
        ) {

            setText(
                "system-status",
                "No rooms returned."
            );

            return false;
        }


        setupRoomSelector();


        const savedRoom =
            localStorage.getItem(
                "rvj_selected_room"
            );


        const savedRoomExists =
            rooms.some(
                room =>
                    String(room.id) ===
                    String(savedRoom)
            );


        await selectRoom(
            savedRoomExists
                ? Number(savedRoom)
                : Number(rooms[0].id)
        );


        return true;
    }


    // ========================================================
    // ROOM SELECTOR
    // ========================================================

    function setupRoomSelector() {

        getElements(
            "room-selector"
        ).forEach(
            selector => {

                selector.innerHTML =
                    "";


                rooms.forEach(
                    room => {

                        const option =
                            document.createElement(
                                "option"
                            );


                        option.value =
                            room.id;


                        option.textContent =
                            `${room.room_code} - ${room.room_name}`;


                        selector.appendChild(
                            option
                        );
                    }
                );


                selector.onchange =
                    async function () {

                        await selectRoom(
                            Number(
                                selector.value
                            )
                        );
                    };
            }
        );
    }


    // ========================================================
    // SELECT ROOM
    // ========================================================

    async function selectRoom(
        roomId
    ) {

        const room =
            rooms.find(
                item =>
                    Number(item.id) ===
                    Number(roomId)
            );


        if (!room) {

            return;
        }


        currentRoomId =
            Number(room.id);


        localStorage.setItem(
            "rvj_selected_room",
            String(room.id)
        );


        getElements(
            "room-selector"
        ).forEach(
            selector => {

                selector.value =
                    String(room.id);

            }
        );


        displayRoom(
            room
        );


        // Remove previous Realtime channel.

        if (
            realtimeChannel
        ) {

            await client.removeChannel(
                realtimeChannel
            );


            realtimeChannel =
                null;
        }


        // Reset live state.

        roomState =
            null;


        latestTemperatureReadings =
            [];


        lastMasterSeenAt =
            null;


        masterOnline =
            false;


        disableAdminControls();


        clearLiveDeviceData();


        setText(
            "connection-status",
            "CONNECTING"
        );


        // Load initial data.

        await loadRoomState();

        await loadTemperatureReadings();


        // Subscribe after initial data.

        subscribeToRealtime();


        // Check freshness.

        updateMasterStatus();
    }


    // ========================================================
    // LOAD ROOM STATE
    // ========================================================

    async function loadRoomState() {

        if (
            !currentRoomId
        ) {

            return;
        }


        console.log(
            "REQUESTING room_state for room:",
            currentRoomId
        );


        const result =
            await client
                .from("room_state")
                .select("*")
                .eq(
                    "room_id",
                    currentRoomId
                )
                .maybeSingle();


        console.log(
            "ROOM STATE RESPONSE:",
            result
        );


        if (
            result.error
        ) {

            setText(
                "system-status",
                `ROOM STATE ERROR: ${result.error.message}`
            );


            clearLiveDeviceData();

            disableAdminControls();

            return;
        }


        displayState(
            result.data
        );
    }


    // ========================================================
    // ADMIN COMMANDS
    // ========================================================

    async function sendACCommand(
        command
    ) {

        // Never allow commands while the Master is offline.

        if (
            !masterOnline
        ) {

            setText(
                "command-status",
                "Command blocked: Master Node is offline."
            );

            return;
        }


        const validCommands = [
            "ON",
            "OFF",
            "CLEAR_OVERRIDE"
        ];


        if (
            !validCommands.includes(
                command
            )
        ) {

            return;
        }


        setText(
            "command-status",
            `Sending ${command}...`
        );


        const result =
            await client
                .from("ac_commands")
                .insert({

                    room_id:
                        currentRoomId,

                    command:
                        command,

                    source:
                        "ADMIN",

                    status:
                        "PENDING"
                });


        if (
            result.error
        ) {

            console.error(
                "Command error:",
                result.error
            );


            setText(
                "command-status",
                `ERROR: ${result.error.message}`
            );


            return;
        }


        setText(
            "command-status",
            `Command ${command} sent.`
        );
    }


    // ========================================================
    // COMMAND BUTTONS
    // ========================================================

    function setupCommandButtons() {

        document
            .querySelectorAll(
                "[data-ac-command]"
            )
            .forEach(
                button => {

                    button.onclick =
                        async function () {

                            await sendACCommand(
                                button.dataset.acCommand
                            );

                        };

                }
            );
    }


    // ========================================================
    // REALTIME
    // ========================================================

    function subscribeToRealtime() {

        if (
            !currentRoomId
        ) {

            return;
        }


        const roomId =
            currentRoomId;


        realtimeChannel =
            client
                .channel(
                    `rvj-room-${roomId}`
                )


                // ------------------------------------------------
                // ROOM STATE
                // ------------------------------------------------

                .on(
                    "postgres_changes",
                    {
                        event:
                            "UPDATE",

                        schema:
                            "public",

                        table:
                            "room_state",

                        filter:
                            `room_id=eq.${roomId}`
                    },
                    payload => {

                        console.log(
                            "REALTIME ROOM STATE:",
                            payload.new
                        );


                        displayState(
                            payload.new
                        );
                    }
                )


                // ------------------------------------------------
                // TEMPERATURE
                // ------------------------------------------------

                .on(
                    "postgres_changes",
                    {
                        event:
                            "INSERT",

                        schema:
                            "public",

                        table:
                            "temperature_readings",

                        filter:
                            `room_id=eq.${roomId}`
                    },
                    async payload => {

                        console.log(
                            "REALTIME TEMPERATURE:",
                            payload.new
                        );


                        const existing =
                            latestTemperatureReadings.find(
                                reading =>
                                    reading.device_id ===
                                    payload.new.device_id
                            );


                        if (
                            !existing
                        ) {

                            latestTemperatureReadings.push(
                                payload.new
                            );

                        } else {

                            const index =
                                latestTemperatureReadings.indexOf(
                                    existing
                                );


                            latestTemperatureReadings[
                                index
                            ] =
                                payload.new;
                        }


                        updateTemperatureDisplay();
                    }
                )


                // ------------------------------------------------
                // PERFORMANCE
                // ------------------------------------------------

                .on(
                    "postgres_changes",
                    {
                        event:
                            "INSERT",

                        schema:
                            "public",

                        table:
                            "performance_samples",

                        filter:
                            `room_id=eq.${roomId}`
                    },
                    payload => {

                        if (
                            !masterOnline
                        ) {

                            return;
                        }


                        setText(
                            "performance-score",
                            Number(
                                payload.new.performance_score
                            ).toFixed(0)
                        );


                        setText(
                            "performance-status",
                            payload.new.performance_status ||
                            "UNKNOWN"
                        );
                    }
                )


                // ------------------------------------------------
                // AC EVENTS
                // ------------------------------------------------

                .on(
                    "postgres_changes",
                    {
                        event:
                            "INSERT",

                        schema:
                            "public",

                        table:
                            "ac_events",

                        filter:
                            `room_id=eq.${roomId}`
                    },
                    payload => {

                        if (
                            !masterOnline
                        ) {

                            return;
                        }


                        setText(
                            "last-ac-event",
                            formatEventName(
                                payload.new.event_type
                            )
                        );


                        setText(
                            "last-ac-event-time",
                            formatDateTime(
                                payload.new.occurred_at
                            )
                        );
                    }
                )


                // ------------------------------------------------
                // SUBSCRIBE
                // ------------------------------------------------

                .subscribe(
                    (
                        status,
                        error
                    ) => {

                        console.log(
                            "REALTIME STATUS:",
                            status
                        );


                        if (
                            error
                        ) {

                            console.error(
                                "Realtime error:",
                                error
                            );
                        }
                    }
                );
    }


    // ========================================================
    // PERIODIC FRESHNESS CHECK
    // ========================================================

    function startFreshnessMonitor() {

        setInterval(
            function () {

                if (
                    currentRoomId
                ) {

                    updateMasterStatus();


                    if (
                        masterOnline
                    ) {

                        updateTemperatureDisplay();


                        if (
                            roomState
                        ) {

                            displayDegradationState(
                                roomState
                            );
                        }
                    }
                }

            },
            FRESHNESS_CHECK_INTERVAL_MS
        );
    }


    // ========================================================
    // FORMAT DATE
    // ========================================================

    function formatDateTime(
        value
    ) {

        if (!value) {

            return "--";
        }


        const date =
            parseDate(
                value
            );


        if (!date) {

            return "--";
        }


        return date.toLocaleString(
            "en-PH"
        );
    }


    // ========================================================
    // FORMAT EVENT
    // ========================================================

    function formatEventName(
        value
    ) {

        if (!value) {

            return "--";
        }


        return String(
            value
        )
            .replace(
                /_/g,
                " "
            )
            .replace(
                /\b\w/g,
                character =>
                    character.toUpperCase()
            );
    }


    // ========================================================
    // STARTUP
    // ========================================================

    async function start() {

        console.log(
            "======================================"
        );

        console.log(
            "RVJ DASHBOARD START"
        );

        console.log(
            "======================================"
        );


        setupCommandButtons();


        disableAdminControls();


        const loaded =
            await loadRooms();


        if (
            loaded
        ) {

            setText(
                "system-status",
                "Waiting for Master Node heartbeat..."
            );
        }


        startFreshnessMonitor();
    }


    // ========================================================
    // PUBLIC API
    // ========================================================

    window.RVJDashboard = {

        loadRooms,

        loadRoomState,

        loadTemperatureReadings,

        sendACCommand,

        getMasterStatus: function () {

            return masterOnline;

        },

        getLastMasterSeen: function () {

            return lastMasterSeenAt;

        }

    };


    // ========================================================
    // DOM READY
    // ========================================================

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true
            }
        );

    } else {

        start();
    }


})();
