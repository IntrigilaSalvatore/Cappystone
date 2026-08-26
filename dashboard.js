(function () {

    "use strict";

    console.log("======================================");
    console.log("RVJ DASHBOARD NEW FILE LOADED");
    console.log("dashboard.js");
    console.log("======================================");


    // ========================================================
    // SUPABASE CONFIGURATION
    // ========================================================

    const SUPABASE_URL =
        "https://raphpzlmjjzgwohjgczu.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


    // ========================================================
    // CHECK SUPABASE
    // ========================================================

    if (!window.supabase) {

        console.error(
            "Supabase library is missing."
        );

        return;
    }


    console.log(
        "Supabase library detected."
    );


    // ========================================================
    // CREATE SUPABASE CLIENT
    // ========================================================

    const client =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );


    console.log(
        "Supabase client created."
    );


    // ========================================================
    // APPLICATION STATE
    // ========================================================

    let currentRoomId = null;

    let rooms = [];

    let realtimeChannel = null;


    // ========================================================
    // ELEMENT HELPER
    // ========================================================

    function get(name) {

        return document.querySelectorAll(
            `[data-rvj="${name}"]`
        );
    }


    function text(name, value) {

        get(name).forEach(
            element => {

                element.textContent = value;

            }
        );
    }


    // ========================================================
    // DISPLAY ROOM INFORMATION
    // ========================================================

    function displayRoom(room) {

        text(
            "room-code",
            room.room_code || "--"
        );

        text(
            "room-name",
            room.room_name || "--"
        );

        text(
            "room-location",
            room.location || "--"
        );

        text(
            "room-capacity",
            room.capacity ?? "--"
        );
    }


    // ========================================================
    // DISPLAY ROOM STATE
    // ========================================================

    function displayState(data) {

        console.log(
            "DISPLAYING ROOM STATE:",
            data
        );


        if (!data) {

            text(
                "temperature",
                "--"
            );

            text(
                "ac-status",
                "OFF"
            );

            text(
                "rfid-status",
                "REMOVED"
            );

            text(
                "control-mode",
                "RFID"
            );

            text(
                "door-status",
                "CLOSED"
            );

            text(
                "crowd-count",
                "0"
            );

            text(
                "crowd-alert",
                "NORMAL"
            );

            text(
                "weather-alert",
                "NORMAL"
            );

            text(
                "performance-score",
                "--"
            );

            text(
                "performance-status",
                "UNKNOWN"
            );

            text(
                "degradation-factor",
                "NONE"
            );

            return;
        }


        // ====================================================
        // TEMPERATURE
        // ====================================================

        text(
            "temperature",
            data.avg_temperature_c === null ||
            data.avg_temperature_c === undefined
                ? "--"
                : `${Number(
                    data.avg_temperature_c
                ).toFixed(1)} °C`
        );


        // ====================================================
        // AC STATUS
        // ====================================================

        text(
            "ac-status",
            data.ac_power
                ? "ON"
                : "OFF"
        );


        // ====================================================
        // RFID
        // ====================================================

        text(
            "rfid-status",
            data.rfid_present
                ? "PRESENT"
                : "REMOVED"
        );


        // ====================================================
        // CONTROL MODE
        // ====================================================

        text(
            "control-mode",
            data.ac_control_mode ||
            "RFID"
        );


        // ====================================================
        // DOOR
        // ====================================================

        text(
            "door-status",
            data.door_open
                ? "OPEN"
                : "CLOSED"
        );


        // ====================================================
        // CROWD
        // ====================================================

        text(
            "crowd-count",
            data.crowd_count ?? 0
        );


        text(
            "crowd-alert",
            data.overcrowded
                ? "OVERCROWDED"
                : "NORMAL"
        );


        // ====================================================
        // WEATHER
        // ====================================================

        text(
            "weather-alert",
            data.hot_weather
                ? "HOT WEATHER"
                : "NORMAL"
        );


        // ====================================================
        // PERFORMANCE
        // ====================================================

        text(
            "performance-score",
            data.performance_score === null ||
            data.performance_score === undefined
                ? "--"
                : Number(
                    data.performance_score
                ).toFixed(0)
        );


        text(
            "performance-status",
            data.performance_status ||
            "UNKNOWN"
        );


        // ====================================================
        // LAST UPDATE
        // ====================================================

        text(
            "last-update",
            data.updated_at
                ? new Date(
                    data.updated_at
                ).toLocaleString(
                    "en-PH"
                )
                : "--"
        );


        // ====================================================
        // DEGRADATION ANALYSIS
        //
        // THIS IS THE PART YOU ASKED ABOUT.
        //
        // The room_state object has already been loaded above.
        // We now pass that same object to the degradation
        // display function.
        // ====================================================

        displayDegradationState(data);
    }


    // ========================================================
    // DISPLAY DEGRADATION STATE
    // ========================================================

    function displayDegradationState(data) {

        console.log(
            "DISPLAYING DEGRADATION STATE:",
            data
        );


        // ----------------------------------------------------
        // Door factor
        // ----------------------------------------------------

        text(
            "door-factor",
            data.door_open
                ? "ACTIVE"
                : "NORMAL"
        );


        // ----------------------------------------------------
        // Crowd factor
        // ----------------------------------------------------

        text(
            "crowd-factor",
            data.overcrowded
                ? "ACTIVE"
                : "NORMAL"
        );


        // ----------------------------------------------------
        // Weather factor
        // ----------------------------------------------------

        text(
            "weather-factor",
            data.hot_weather
                ? "ACTIVE"
                : "NORMAL"
        );


        // ----------------------------------------------------
        // Primary degradation factor
        // ----------------------------------------------------

        text(
            "degradation-factor",
            data.degradation_factor ||
            "NONE"
        );
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


        if (result.error) {

            text(
                "system-status",
                `ROOM ERROR: ${result.error.message}`
            );

            console.error(
                result.error
            );

            return;
        }


        rooms =
            result.data || [];


        if (
            rooms.length === 0
        ) {

            text(
                "system-status",
                "No rooms returned."
            );

            return;
        }


        const selector =
            document.querySelector(
                '[data-rvj="room-selector"]'
            );


        if (selector) {

            selector.innerHTML = "";


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

                    currentRoomId =
                        Number(
                            selector.value
                        );


                    const room =
                        rooms.find(
                            item =>
                                Number(item.id) ===
                                currentRoomId
                        );


                    if (room) {

                        displayRoom(
                            room
                        );

                        await loadRoomState();
                    }
                };
        }


        currentRoomId =
            Number(
                rooms[0].id
            );


        if (selector) {

            selector.value =
                String(
                    currentRoomId
                );
        }


        displayRoom(
            rooms[0]
        );


        await loadRoomState();


        text(
            "connection-status",
            "CONNECTED"
        );


        text(
            "system-status",
            "Dashboard connected to Supabase."
        );


        subscribeToRealtime();
    }


    // ========================================================
    // LOAD ROOM STATE
    // ========================================================

    async function loadRoomState() {

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


        if (result.error) {

            text(
                "system-status",
                `ROOM STATE ERROR: ${result.error.message}`
            );

            console.error(
                result.error
            );

            return;
        }


        displayState(
            result.data
        );
    }


    // ========================================================
    // COMMAND BUTTONS
    // ========================================================

    document
        .querySelectorAll(
            "[data-ac-command]"
        )
        .forEach(
            button => {

                button.onclick =
                    async function () {

                        const command =
                            button.dataset.acCommand;


                        console.log(
                            "Sending command:",
                            command
                        );


                        text(
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


                        console.log(
                            "COMMAND RESPONSE:",
                            result
                        );


                        if (
                            result.error
                        ) {

                            text(
                                "command-status",
                                `ERROR: ${result.error.message}`
                            );

                            return;
                        }


                        text(
                            "command-status",
                            `Command ${command} sent.`
                        );
                    };
            }
        );


    // ========================================================
    // REALTIME
    // ========================================================

    function subscribeToRealtime() {

        if (
            !currentRoomId
        ) {

            return;
        }


        if (
            realtimeChannel
        ) {

            client.removeChannel(
                realtimeChannel
            );

            realtimeChannel =
                null;
        }


        realtimeChannel =
            client
                .channel(
                    `rvj-room-${currentRoomId}`
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
                            `room_id=eq.${currentRoomId}`
                    },
                    payload => {

                        console.log(
                            "REALTIME ROOM STATE:",
                            payload
                        );


                        displayState(
                            payload.new
                        );
                    }
                )
                .subscribe(
                    status => {

                        console.log(
                            "REALTIME STATUS:",
                            status
                        );
                    }
                );
    }


    // ========================================================
    // START
    // ========================================================

    async function start() {

        console.log(
            "Starting dashboard..."
        );


        await loadRooms();
    }


    // ========================================================
    // WAIT FOR DOM
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


    // ========================================================
    // PUBLIC API
    // ========================================================

    window.RVJDashboard = {

        loadRooms,

        loadRoomState,

        displayDegradationState,

        getCurrentRoomId: function () {

            return currentRoomId;
        }

    };

})();
