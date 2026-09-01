(function () {

    "use strict";


    // =========================================================
    // SUPABASE CONFIGURATION
    // =========================================================

    const SUPABASE_URL =
        "https://raphpzlmjjzgwohjgczu.supabase.co";


    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


    // =========================================================
    // CREATE CLIENT
    // =========================================================

    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {

        console.error(
            "Supabase JS library was not loaded."
        );

        return;
    }


    const client =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );


    console.log(
        "RVJ Dashboard: Supabase client initialized."
    );


    // =========================================================
    // FRESHNESS SETTINGS
    // =========================================================

    // Master sends heartbeat every 10 seconds.

    const MASTER_TIMEOUT_MS =
        60000;


    // Temp nodes send approximately every 30 seconds.

    const TEMPERATURE_TIMEOUT_MS =
        90000;


    // Refresh database data every 10 seconds.
    //
    // This is a fallback for Realtime.
    //

    const POLL_INTERVAL_MS =
        10000;


    // =========================================================
    // APPLICATION STATE
    // =========================================================

    let rooms = [];

    let currentRoomId = null;

    let currentRoom = null;

    let currentRoomState = null;

    let latestTemperatureReadings = [];

    let lastMasterSeenAt = null;

    let masterOnline = false;

    let realtimeChannel = null;

    let pollTimer = null;

    let freshnessTimer = null;


    // =========================================================
    // UI HELPERS
    // =========================================================

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


    // =========================================================
    // DATE HELPER
    // =========================================================

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


    // =========================================================
    // FRESHNESS
    // =========================================================

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


    // =========================================================
    // MASTER STATUS
    // =========================================================

    function calculateMasterOnline() {

        return isFresh(
            lastMasterSeenAt,
            MASTER_TIMEOUT_MS
        );
    }


    // =========================================================
    // CLEAR LIVE DEVICE DATA
    // =========================================================

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


    // =========================================================
    // ADMIN BUTTONS
    // =========================================================

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


    // =========================================================
    // APPLY MASTER STATUS
    // =========================================================

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


            // Immediately refresh.

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
                "Master Node is offline or its Internet connection is unavailable."
            );


            disableAdminControls();


            clearLiveDeviceData();
        }
    }


    // =========================================================
    // DISPLAY ROOM
    // =========================================================

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


    // =========================================================
    // DISPLAY TEMPERATURE
    // =========================================================

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


        const freshReadings =
            latestTemperatureReadings.filter(
                reading =>
                    isFresh(
                        reading.recorded_at,
                        TEMPERATURE_TIMEOUT_MS
                    )
            );


        // -----------------------------------------------------
        // No sensors
        // -----------------------------------------------------

        if (
            freshReadings.length === 0
        ) {

            setText(
                "temperature",
                "SENSOR DATA UNAVAILABLE"
            );


            return;
        }


        // -----------------------------------------------------
        // Use all fresh sensors.
        //
        // 1 sensor = 1 value
        // 2 sensors = average of 2
        // 3 sensors = average of 3
        // -----------------------------------------------------

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


    // =========================================================
    // DISPLAY ROOM STATE
    // =========================================================

    function displayRoomState(
        data
    ) {

        currentRoomState =
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


        // -----------------------------------------------------
        // HEARTBEAT
        // -----------------------------------------------------

        lastMasterSeenAt =
            data.master_last_seen_at;


        // -----------------------------------------------------
        // Determine device health
        // -----------------------------------------------------

        const online =
            calculateMasterOnline();


        if (
            !online
        ) {

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


        enableAdminControls();


        // =====================================================
        // TEMPERATURE
        // =====================================================

        updateTemperatureDisplay();


        // =====================================================
        // AC
        // =====================================================

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


        // =====================================================
        // RFID
        // =====================================================

        setText(
            "rfid-status",
            data.rfid_present === true
                ? "PRESENT"
                : "REMOVED"
        );


        // =====================================================
        // CONTROL MODE
        // =====================================================

        setText(
            "control-mode",
            data.ac_control_mode ||
            "RFID"
        );


        // =====================================================
        // DOOR
        // =====================================================

        setText(
            "door-status",
            data.door_open === true
                ? "OPEN"
                : "CLOSED"
        );


        // =====================================================
        // CROWD
        // =====================================================

        const crowdDataFresh =
            isFresh(
                data.crowd_last_scan_at,
                600000
            );


        if (
            crowdDataFresh
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


        // =====================================================
        // WEATHER
        // =====================================================

        const weatherFresh =
            isFresh(
                data.weather_last_updated_at,
                600000
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


        // =====================================================
        // PERFORMANCE
        // =====================================================

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


        // =====================================================
        // DEGRADATION
        // =====================================================

        displayDegradationState(
            data
        );


        // =====================================================
        // DATABASE UPDATED
        // =====================================================

        if (
            data.updated_at
        ) {

            setText(
                "last-update",
                formatDateTime(
                    data.updated_at
                )
            );
        }
    }


    // =========================================================
    // DEGRADATION
    // =========================================================

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


        // Door

        setText(
            "door-factor",
            data.door_open
                ? "ACTIVE"
                : "NORMAL"
        );


        // Crowd

        const crowdFresh =
            isFresh(
                data.crowd_last_scan_at,
                600000
            );


        if (
            crowdFresh
        ) {

            setText(
                "crowd-factor",
                data.overcrowded
                    ? "ACTIVE"
                    : "NORMAL"
            );

        } else {

            setText(
                "crowd-factor",
                "UNAVAILABLE"
            );
        }


        // Weather

        const weatherFresh =
            isFresh(
                data.weather_last_updated_at,
                600000
            );


        if (
            weatherFresh
        ) {

            setText(
                "weather-factor",
                data.hot_weather
                    ? "ACTIVE"
                    : "NORMAL"
            );

        } else {

            setText(
                "weather-factor",
                "UNAVAILABLE"
            );
        }


        // Primary factor

        setText(
            "degradation-factor",
            data.degradation_factor ||
            "NONE"
        );
    }


    // =========================================================
    // LOAD LATEST TEMPERATURES
    // =========================================================

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


        // -----------------------------------------------------
        // Get newest reading per device.
        // -----------------------------------------------------

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
            "Latest sensor readings:",
            latestTemperatureReadings
        );


        updateTemperatureDisplay();
    }


    // =========================================================
    // LOAD ROOM STATE
    // =========================================================

    async function loadRoomState() {

        if (
            !currentRoomId
        ) {

            return;
        }


        const result =
            await client
                .from(
                    "room_state"
                )
                .select(
                    "*"
                )
                .eq(
                    "room_id",
                    currentRoomId
                )
                .maybeSingle();


        console.log(
            "Room state response:",
            result
        );


        if (
            result.error
        ) {

            console.error(
                "Room state error:",
                result.error
            );


            setText(
                "system-status",
                `Room state error: ${result.error.message}`
            );


            return;
        }


        displayRoomState(
            result.data
        );
    }


    // =========================================================
    // LOAD ROOMS
    // =========================================================

    async function loadRooms() {

        console.log(
            "Loading rooms..."
        );


        const result =
            await client
                .from(
                    "rooms"
                )
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


        console.log(
            "Rooms response:",
            result
        );


        if (
            result.error
        ) {

            showError(
                `Room error: ${result.error.message}`
            );


            return false;
        }


        rooms =
            result.data || [];


        if (
            rooms.length === 0
        ) {

            showError(
                "No active classrooms found."
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


    // =========================================================
    // ROOM SELECTOR
    // =========================================================

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


    // =========================================================
    // SELECT ROOM
    // =========================================================

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


        currentRoom =
            room;


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


        // Reset live state while changing rooms.

        currentRoomState =
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


        // -----------------------------------------------------
        // Load immediately.
        // -----------------------------------------------------

        await loadRoomState();

        await loadTemperatureReadings();


        // -----------------------------------------------------
        // Reconnect Realtime.
        // -----------------------------------------------------

        subscribeToRealtime();


        // -----------------------------------------------------
        // Freshness check.
        // -----------------------------------------------------

        updateMasterStatus();
    }


    // =========================================================
    // ADMIN COMMAND
    // =========================================================

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
                .from(
                    "ac_commands"
                )
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


    // =========================================================
    // ADMIN BUTTON SETUP
    // =========================================================

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


    // =========================================================
    // REALTIME
    // =========================================================

    function subscribeToRealtime() {

        if (
            !currentRoomId
        ) {

            return;
        }


        const roomId =
            currentRoomId;


        if (
            realtimeChannel
        ) {

            try {

                client.removeChannel(
                    realtimeChannel
                );

            } catch (error) {

                console.warn(
                    error
                );
            }


            realtimeChannel =
                null;
        }


        realtimeChannel =
            client
                .channel(
                    `rvj-room-${roomId}-${Date.now()}`
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
                            "REALTIME room_state:",
                            payload.new
                        );


                        displayRoomState(
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

                        console.log(
                            "REALTIME temperature:",
                            payload.new
                        );


                        const existingIndex =
                            latestTemperatureReadings.findIndex(
                                reading =>
                                    reading.device_id ===
                                    payload.new.device_id
                            );


                        if (
                            existingIndex ===
                            -1
                        ) {

                            latestTemperatureReadings.push(
                                payload.new
                            );

                        } else {

                            latestTemperatureReadings[
                                existingIndex
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
                            "REALTIME:",
                            status
                        );


                        if (
                            error
                        ) {

                            console.error(
                                "REALTIME ERROR:",
                                error
                            );
                        }
                    }
                );
    }


    // =========================================================
    // DATABASE POLLING FALLBACK
    // =========================================================

    function startDatabasePolling() {

        if (
            pollTimer
        ) {

            clearInterval(
                pollTimer
            );
        }


        pollTimer =
            setInterval(
                async function () {

                    if (
                        !currentRoomId
                    ) {

                        return;
                    }


                    console.log(
                        "Polling Supabase..."
                    );


                    await loadRoomState();

                    await loadTemperatureReadings();

                },
                POLL_INTERVAL_MS
            );
    }


    // =========================================================
    // FRESHNESS MONITOR
    // =========================================================

    function startFreshnessMonitor() {

        if (
            freshnessTimer
        ) {

            clearInterval(
                freshnessTimer
            );
        }


        freshnessTimer =
            setInterval(
                function () {

                    if (
                        !currentRoomId
                    ) {

                        return;
                    }


                    updateMasterStatus();


                    if (
                        masterOnline
                    ) {

                        updateTemperatureDisplay();


                        if (
                            currentRoomState
                        ) {

                            displayDegradationState(
                                currentRoomState
                            );
                        }
                    }

                },
                1000
            );
    }


    // =========================================================
    // ERROR
    // =========================================================

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


        setStatus(
            "connection-status",
            "error"
        );
    }


    // =========================================================
    // FORMAT DATE
    // =========================================================

    function formatDateTime(
        value
    ) {

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


    // =========================================================
    // FORMAT EVENT
    // =========================================================

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


    // =========================================================
    // START
    // =========================================================

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


        const success =
            await loadRooms();


        if (
            success
        ) {

            setText(
                "system-status",
                "Dashboard connected. Waiting for live device telemetry."
            );
        }


        // Realtime is useful,
        // but polling is our safety net.

        startDatabasePolling();


        startFreshnessMonitor();
    }


    // =========================================================
    // PUBLIC API
    // =========================================================

    window.RVJDashboard = {

        loadRooms,

        loadRoomState,

        loadTemperatureReadings,

        sendACCommand,

        getMasterStatus:
            function () {

                return masterOnline;
            },

        getLastMasterSeen:
            function () {

                return lastMasterSeenAt;
            }

    };


    // =========================================================
    // DOM READY
    // =========================================================

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
