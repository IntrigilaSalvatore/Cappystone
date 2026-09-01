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

    // Master heartbeat is sent every 10 seconds.
    //
    // Dashboard allows up to 60 seconds before declaring
    // the Master Node offline.

    const MASTER_TIMEOUT_MS =
        60000;


    // Temp Nodes send every 30 seconds.
    //
    // Allow up to 90 seconds before declaring temperature
    // telemetry stale.

    const TEMPERATURE_TIMEOUT_MS =
        90000;


    // Crowd scan runs every 5 minutes.
    //
    // Allow one missed scan.

    const CROWD_TIMEOUT_MS =
        10 * 60 * 1000;


    // Weather analysis runs every 5 minutes.

    const WEATHER_TIMEOUT_MS =
        10 * 60 * 1000;


    // Check freshness every second.

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
    // UI HELPERS
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
    // DATE
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
    // FRESHNESS
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
    // MASTER ONLINE STATUS
    // ========================================================

    function calculateMasterOnline() {

        if (
            !lastMasterSeenAt
        ) {

            return false;
        }


        return isFresh(
            lastMasterSeenAt,
            MASTER_TIMEOUT_MS
        );
    }


    // ========================================================
    // MASTER STATUS UPDATE
    // ========================================================

    function updateMasterStatus() {

        const online =
            calculateMasterOnline();


        if (
            online ===
            masterOnline
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


            // Refresh current telemetry.

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
                "Master Node is offline or its Internet connection is down. Live device data is unavailable."
            );


            disableAdminControls();


            clearLiveDeviceData();
        }
    }


    // ========================================================
    // CLEAR DEVICE DATA
    // ========================================================

    function clearLiveDeviceData() {

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


        setText(
            "performance-score",
            "UNAVAILABLE"
        );


        setText(
            "performance-status",
            "UNAVAILABLE"
        );


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


        setText(
            "last-update",
            "UNAVAILABLE"
        );
    }


    // ========================================================
    // ADMIN CONTROLS
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


            masterOnline =
                false;


            clearLiveDeviceData();

            disableAdminControls();

            setText(
                "connection-status",
                "DEVICE OFFLINE"
            );


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
                "Master Node is offline or its Internet connection is down."
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
        // LAST UPDATE
        // ====================================================

        setText(
            "last-update",
            data.updated_at
                ? formatDateTime(
                    data.updated_at
                )
                : "--"
        );
    }


    // ========================================================
    // TEMPERATURE DISPLAY
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


        const now =
            Date.now();


        const freshReadings =
            latestTemperatureReadings.filter(
                reading => {

                    const date =
                        parseDate(
                            reading.recorded_at
                        );


                    if (!date) {

                        return false;
                    }


                    const age =
                        now -
                        date.getTime();


                    return (
                        age >= 0 &&
                        age <=
                        TEMPERATURE_TIMEOUT_MS
                    );
                }
            );


        // ----------------------------------------------------
        // No fresh sensors
        // ----------------------------------------------------

        if (
            freshReadings.length === 0
        ) {

            setText(
                "temperature",
                "SENSOR DATA UNAVAILABLE"
            );


            return;
        }


        // ----------------------------------------------------
        // Any fresh sensors are acceptable.
        //
        // 1 sensor -> that sensor
        // 2 sensors -> average of 2
        // 3 sensors -> average of 3
        // ----------------------------------------------------

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


        console.log(
            `Temperature display using ${freshReadings.length} fresh sensor(s).`
        );
    }


    // ========================================================
    // DISPLAY DEGRADATION
    // ========================================================

    function displayDegradationState(
        data
    ) {

        if (
            !masterOnline
        ) {

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
        // Primary Factor
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


            updateTemperatureDisplay();


            return;
        }


        // ----------------------------------------------------
        // Keep newest record for each device.
        // ----------------------------------------------------

        const newestByDevice =
            new Map();


        (result.data || []).forEach(
            reading => {

                if (
                    !newestByDevice.has(
                        reading.device_id
                    )
                ) {

                    newestByDevice.set(
                        reading.device_id,
                        reading
                    );
                }
            }
        );


        latestTemperatureReadings =
            Array.from(
                newestByDevice.values()
            );


        console.log(
            "Latest readings:",
            latestTemperatureReadings
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
                .select(
                    "*"
                )
                .eq(
                    "active",
                    true
                )
                .order(
                    "room_code"
                );


        if (
            result.error
        ) {

            showError(
                `ROOM ERROR: ${result.error.message}`
            );


            return false;
        }


        rooms =
            result.data || [];


        console.log(
            "Rooms:",
            rooms
        );


        if (
            rooms.length === 0
        ) {

            showError(
                "No rooms returned."
            );


            return false;
        }


        setupRoomSelector();


        const savedRoom =
            localStorage.getItem(
                "rvj_selected_room"
            );


        const savedExists =
            rooms.some(
                room =>
                    String(room.id) ===
                    String(savedRoom)
            );


        await selectRoom(
            savedExists
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


        if (
            realtimeChannel
        ) {

            await client.removeChannel(
                realtimeChannel
            );


            realtimeChannel =
                null;
        }


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


        await loadRoomState();


        await loadTemperatureReadings();


        subscribeToRealtime();


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

            console.error(
                "Room state error:",
                result.error
            );


            clearLiveDeviceData();


            disableAdminControls();


            setText(
                "connection-status",
                "DEVICE OFFLINE"
            );


            return;
        }


        displayState(
            result.data
        );
    }


    // ========================================================
    // ADMIN COMMAND
    // ========================================================

    async function sendACCommand(
        command
    ) {

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
    // ADMIN BUTTONS
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
                    payload => {

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
                );


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
    // FRESHNESS MONITOR
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
    // ERROR
    // ========================================================

    function showError(
        message
    ) {

        console.error(
            "[RVJ Dashboard]",
            message
        );


        setText(
            "system-status",
            message
        );


        setText(
            "connection-status",
            "ERROR"
        );
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
    // START
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


        await loadRooms();


        startFreshnessMonitor();
    }


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
                once:
                    true
            }
        );

    } else {

        start();
    }

})();
