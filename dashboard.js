(function () {

    "use strict";


    // ========================================================
    // SUPABASE
    // ========================================================

    const SUPABASE_URL =
        "https://raphpzlmjjzgwohjgczu.supabase.co";


    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {

        console.error(
            "[RVJ] Supabase JS library was not loaded."
        );

        return;
    }


    const client =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );


    console.log(
        "[RVJ] dashboard.js loaded."
    );


    // ========================================================
    // FRESHNESS
    // ========================================================

    const MASTER_TIMEOUT_MS =
        60000;


    const TEMPERATURE_TIMEOUT_MS =
        90000;


    const CROWD_TIMEOUT_MS =
        10 * 60 * 1000;


    const WEATHER_TIMEOUT_MS =
        10 * 60 * 1000;


    const POLL_INTERVAL_MS =
        10000;


    const FRESHNESS_INTERVAL_MS =
        1000;


    // ========================================================
    // STATE
    // ========================================================

    let rooms = [];

    let currentRoomId = null;

    let currentRoomState = null;

    let latestTemperatureReadings = [];

    let lastMasterSeenAt = null;

    let masterOnline = false;

    let realtimeChannel = null;

    let pollTimer = null;

    let freshnessTimer = null;


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
    // CLEAR LIVE DATA
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
    // MASTER ONLINE
    // ========================================================

    function masterIsActuallyOnline() {

        return isFresh(
            lastMasterSeenAt,
            MASTER_TIMEOUT_MS
        );
    }


    function updateMasterStatus() {

        const online =
            masterIsActuallyOnline();


        if (
            online ===
            masterOnline
        ) {

            return;
        }


        masterOnline =
            online;


        console.log(
            "[RVJ] Master online:",
            masterOnline
        );


        if (
            masterOnline
        ) {

            setText(
                "connection-status",
                "DEVICE ONLINE"
            );


            setStatus(
                "connection-status",
                "connected"
            );


            enableAdminControls();


            setText(
                "system-status",
                "Master Node is online and reporting."
            );


        } else {

            setText(
                "connection-status",
                "DEVICE OFFLINE"
            );


            setStatus(
                "connection-status",
                "offline"
            );


            disableAdminControls();


            clearLiveDeviceData();


            setText(
                "system-status",
                "Master Node is offline or its Internet connection is unavailable."
            );
        }
    }


    // ========================================================
    // ROOM
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
    // CROWD
    // ========================================================

    function displayCrowdState(
        data
    ) {

        if (
            !masterOnline
        ) {

            setText(
                "crowd-count",
                "UNAVAILABLE"
            );


            setText(
                "crowd-alert",
                "UNAVAILABLE"
            );


            return;
        }


        const scanStatus =
            data.crowd_scan_status ||
            "READY";


        if (
            scanStatus ===
            "CHECKING"
        ) {

            setText(
                "crowd-count",
                "CHECKING"
            );


            setText(
                "crowd-alert",
                "CHECKING"
            );


            setText(
                "system-status",
                "Checking crowd density. Administrator controls are temporarily disabled."
            );


            disableAdminControls();


            return;
        }


        if (
            !data.crowd_last_scan_at
        ) {

            setText(
                "crowd-count",
                "NO DATA"
            );


            setText(
                "crowd-alert",
                "NO DATA"
            );


            return;
        }


        if (
            !isFresh(
                data.crowd_last_scan_at,
                CROWD_TIMEOUT_MS
            )
        ) {

            setText(
                "crowd-count",
                "DATA STALE"
            );


            setText(
                "crowd-alert",
                "DATA STALE"
            );


            return;
        }


        setText(
            "crowd-count",
            data.crowd_count ??
            "NO DATA"
        );


        setText(
            "crowd-alert",
            data.crowd_level ||
            "LOW"
        );
    }


    // ========================================================
    // TEMPERATURE
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


        const freshReadings =
            latestTemperatureReadings.filter(
                reading =>
                    isFresh(
                        reading.recorded_at,
                        TEMPERATURE_TIMEOUT_MS
                    )
            );


        if (
            freshReadings.length === 0
        ) {

            setText(
                "temperature",
                "SENSOR DATA UNAVAILABLE"
            );


            return;
        }


        let total =
            0;


        freshReadings.forEach(
            reading => {

                total +=
                    Number(
                        reading.temperature_c
                    );

            }
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
    // DEGRADATION
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


        setText(
            "door-factor",
            data.door_open
                ? "ACTIVE"
                : "NORMAL"
        );


        if (
            data.crowd_scan_status ===
            "CHECKING"
        ) {

            setText(
                "crowd-factor",
                "CHECKING"
            );

        } else if (
            data.crowd_last_scan_at &&
            isFresh(
                data.crowd_last_scan_at,
                CROWD_TIMEOUT_MS
            )
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


        if (
            data.weather_last_updated_at &&
            isFresh(
                data.weather_last_updated_at,
                WEATHER_TIMEOUT_MS
            )
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


        setText(
            "degradation-factor",
            data.degradation_factor ||
            "NONE"
        );
    }


    // ========================================================
    // DISPLAY ROOM STATE
    // ========================================================

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


            setStatus(
                "connection-status",
                "offline"
            );


            return;
        }


        lastMasterSeenAt =
            data.master_last_seen_at;


        masterOnline =
            masterIsActuallyOnline();


        if (
            !masterOnline
        ) {

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
                "Master Node is offline or its Internet connection is unavailable."
            );


            return;
        }


        setText(
            "connection-status",
            "DEVICE ONLINE"
        );


        setStatus(
            "connection-status",
            "connected"
        );


        displayCrowdState(
            data
        );


        updateTemperatureDisplay();


        setText(
            "ac-status",
            data.ac_power
                ? "ON"
                : "OFF"
        );


        setText(
            "rfid-status",
            data.rfid_present
                ? "PRESENT"
                : "REMOVED"
        );


        setText(
            "control-mode",
            data.ac_control_mode ||
            "RFID"
        );


        setText(
            "door-status",
            data.door_open
                ? "OPEN"
                : "CLOSED"
        );


        const weatherFresh =
            data.weather_last_updated_at &&
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

        } else {

            setText(
                "weather-alert",
                "UNAVAILABLE"
            );
        }


        setText(
            "performance-score",
            data.performance_score !==
            null &&
            data.performance_score !==
            undefined
                ? Number(
                    data.performance_score
                ).toFixed(0)
                : "NO DATA"
        );


        setText(
            "performance-status",
            data.performance_status ||
            "NO DATA"
        );


        displayDegradationState(
            data
        );


        setText(
            "last-update",
            data.updated_at
                ? new Date(
                    data.updated_at
                ).toLocaleString(
                    "en-PH"
                )
                : "--"
        );


        // Do not re-enable during crowd scan.

        if (
            data.crowd_scan_status !==
            "CHECKING"
        ) {

            enableAdminControls();
        }
    }


    // ========================================================
    // TEMPERATURE READINGS
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
                        ascending:
                            false
                    }
                )
                .limit(
                    20
                );


        if (
            result.error
        ) {

            console.error(
                "[RVJ] Temperature query error:",
                result.error
            );


            latestTemperatureReadings =
                [];


            updateTemperatureDisplay();


            return;
        }


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


        updateTemperatureDisplay();
    }


    // ========================================================
    // ROOM STATE
    // ========================================================

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


        if (
            result.error
        ) {

            console.error(
                "[RVJ] Room state error:",
                result.error
            );


            return;
        }


        displayRoomState(
            result.data
        );
    }


    // ========================================================
    // ROOMS
    // ========================================================

    async function loadRooms() {

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


        if (
            result.error
        ) {

            showError(
                result.error.message
            );


            return false;
        }


        rooms =
            result.data ||
            [];


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
                    String(
                        room.id
                    ) ===
                    String(
                        savedRoom
                    )
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
                    Number(
                        item.id
                    ) ===
                    Number(
                        roomId
                    )
            );


        if (!room) {

            return;
        }


        currentRoomId =
            Number(
                room.id
            );


        localStorage.setItem(
            "rvj_selected_room",
            String(
                room.id
            )
        );


        getElements(
            "room-selector"
        ).forEach(
            selector => {

                selector.value =
                    String(
                        room.id
                    );
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


        currentRoomState =
            null;


        latestTemperatureReadings =
            [];


        lastMasterSeenAt =
            null;


        masterOnline =
            false;


        clearLiveDeviceData();

        disableAdminControls();


        setText(
            "connection-status",
            "CONNECTING"
        );


        await loadRoomState();


        await loadTemperatureReadings();


        subscribeToRealtime();
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
                    `rvj-room-${roomId}-${Date.now()}`
                )


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

                        displayRoomState(
                            payload.new
                        );
                    }
                )


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

                        const index =
                            latestTemperatureReadings.findIndex(
                                reading =>
                                    reading.device_id ===
                                    payload.new.device_id
                            );


                        if (
                            index ===
                            -1
                        ) {

                            latestTemperatureReadings.push(
                                payload.new
                            );

                        } else {

                            latestTemperatureReadings[
                                index
                            ] =
                                payload.new;
                        }


                        updateTemperatureDisplay();
                    }
                )


                .on(
                    "postgres_changes",
                    {
                        event:
                            "UPDATE",

                        schema:
                            "public",

                        table:
                            "ac_commands",

                        filter:
                            `room_id=eq.${roomId}`
                    },
                    payload => {

                        const command =
                            payload.new;


                        console.log(
                            "[RVJ] Command update:",
                            command
                        );


                        if (
                            command.status ===
                            "EXECUTED"
                        ) {

                            setText(
                                "command-status",
                                `${getCommandDisplayName(command.command)} executed successfully.`
                            );


                        } else if (
                            command.status ===
                            "FAILED"
                        ) {

                            setText(
                                "command-status",
                                `${command.command} failed.`
                            );
                        }
                    }
                )


                .subscribe(
                    (
                        status,
                        error
                    ) => {

                        console.log(
                            "[RVJ] REALTIME:",
                            status
                        );


                        if (
                            error
                        ) {

                            console.error(
                                "[RVJ] REALTIME ERROR:",
                                error
                            );
                        }
                    }
                );
    }


    // ========================================================
    // DATABASE POLLING
    // ========================================================

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


                    await loadRoomState();

                    await loadTemperatureReadings();

                },
                POLL_INTERVAL_MS
            );
    }


    // ========================================================
    // FRESHNESS MONITOR
    // ========================================================

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

                            displayCrowdState(
                                currentRoomState
                            );
                        }
                    }

                },
                FRESHNESS_INTERVAL_MS
            );
    }


    // ========================================================
    // COMMAND DISPLAY NAME
    // ========================================================

    function getCommandDisplayName(
        command
    ) {

        switch (
            command
        ) {

            case "ON":

                return "Force AC ON";


            case "OFF":

                return "Force AC OFF";


            case "SET_TEMP_LOW":

                return "LOW temperature";


            case "SET_TEMP_MID":

                return "MEDIUM temperature";


            case "SET_TEMP_HIGH":

                return "HIGH temperature";


            case "CLEAR_OVERRIDE":

                return "Clear Override";


            default:

                return command;
        }
    }


    // ========================================================
    // SEND AC COMMAND
    // ========================================================

    async function sendACCommand(
        command
    ) {

        console.log(
            "[RVJ] sendACCommand() called:",
            command
        );


        if (
            !masterOnline
        ) {

            console.warn(
                "[RVJ] Command blocked because Master is offline."
            );


            setText(
                "command-status",
                "Command blocked: Master Node is offline."
            );


            return;
        }


        if (
            currentRoomState &&
            currentRoomState.crowd_scan_status ===
            "CHECKING"
        ) {

            console.warn(
                "[RVJ] Command blocked because crowd scan is active."
            );


            setText(
                "command-status",
                "Command blocked: crowd density scan in progress."
            );


            return;
        }


        const validCommands = [

            "ON",

            "OFF",

            "SET_TEMP_LOW",

            "SET_TEMP_MID",

            "SET_TEMP_HIGH",

            "CLEAR_OVERRIDE"

        ];


        if (
            !validCommands.includes(
                command
            )
        ) {

            console.error(
                "[RVJ] Invalid command:",
                command
            );


            return;
        }


        const displayName =
            getCommandDisplayName(
                command
            );


        setText(
            "command-status",
            `Sending ${displayName}...`
        );


        console.log(
            "[RVJ] Inserting command into ac_commands:",
            {
                room_id:
                    currentRoomId,

                command:
                    command,

                source:
                    "ADMIN",

                status:
                    "PENDING"
            }
        );


        try {

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


            console.log(
                "[RVJ] Supabase insert result:",
                result
            );


            if (
                result.error
            ) {

                console.error(
                    "[RVJ] AC command insert error:",
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
                `${displayName} command sent. Waiting for Master...`
            );


        } catch (
            error
        ) {

            console.error(
                "[RVJ] Unexpected command error:",
                error
            );


            setText(
                "command-status",
                `ERROR: ${error.message}`
            );
        }
    }


    // ========================================================
    // COMMAND BUTTONS
    // ========================================================

    function setupCommandButtons() {

        const buttons =
            document.querySelectorAll(
                "[data-ac-command]"
            );


        console.log(
            "[RVJ] Command buttons found:",
            buttons.length
        );


        buttons.forEach(
            button => {

                console.log(
                    "[RVJ] Binding command button:",
                    button.dataset.acCommand
                );


                button.addEventListener(
                    "click",
                    function () {

                        console.log(
                            "[RVJ] BUTTON CLICK:",
                            button.dataset.acCommand
                        );


                        sendACCommand(
                            button.dataset.acCommand
                        );

                    }
                );

            }
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


        startDatabasePolling();


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

        getMasterStatus:
            function () {

                return masterOnline;
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
                once:
                    true
            }
        );

    } else {

        start();
    }

})();
