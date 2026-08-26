(function () {

    "use strict";


    console.log(
        "======================================"
    );

    console.log(
        "RVJ DASHBOARD NEW FILE LOADED"
    );

    console.log(
        "dashboard.js"
    );

    console.log(
        "======================================"
    );


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

    if (
        !window.supabase
    ) {

        console.error(
            "Supabase library is missing."
        );

        return;
    }


    console.log(
        "Supabase library detected."
    );


    // ========================================================
    // CLIENT
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
    // STATE
    // ========================================================

    let currentRoomId =
        null;


    let rooms =
        [];


    // ========================================================
    // ELEMENT HELPER
    // ========================================================

    function get(
        name
    ) {

        return document.querySelectorAll(
            `[data-rvj="${name}"]`
        );
    }


    function text(
        name,
        value
    ) {

        get(name).forEach(
            element => {

                element.textContent =
                    value;

            }
        );
    }


    // ========================================================
    // DISPLAY ROOM
    // ========================================================

    function displayRoom(
        room
    ) {

        text(
            "room-code",
            room.room_code ||
            "--"
        );


        text(
            "room-name",
            room.room_name ||
            "--"
        );


        text(
            "room-location",
            room.location ||
            "--"
        );


        text(
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
            "DISPLAYING ROOM STATE:",
            data
        );


        if (!data) {

            text(
                "temperature",
                "--"
            );

            return;
        }


        text(
            "temperature",
            data.avg_temperature_c ===
            null ||
            data.avg_temperature_c ===
            undefined
                ? "--"
                : `${Number(
                    data.avg_temperature_c
                ).toFixed(1)} °C`
        );


        text(
            "ac-status",
            data.ac_power
                ? "ON"
                : "OFF"
        );


        text(
            "rfid-status",
            data.rfid_present
                ? "PRESENT"
                : "REMOVED"
        );


        text(
            "control-mode",
            data.ac_control_mode ||
            "RFID"
        );


        text(
            "door-status",
            data.door_open
                ? "OPEN"
                : "CLOSED"
        );


        text(
            "crowd-count",
            data.crowd_count ??
            0
        );


        text(
            "crowd-alert",
            data.overcrowded
                ? "OVERCROWDED"
                : "NORMAL"
        );


        text(
            "weather-alert",
            data.hot_weather
                ? "HOT WEATHER"
                : "NORMAL"
        );


        text(
            "performance-score",
            data.performance_score ===
            null ||
            data.performance_score ===
            undefined
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
            result.data ||
            [];


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
        }


        currentRoomId =
            Number(
                rooms[0].id
            );


        displayRoom(
            rooms[0]
        );


        if (selector) {

            selector.value =
                String(
                    currentRoomId
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
                                Number(
                                    item.id
                                ) ===
                                currentRoomId
                        );


                    if (
                        room
                    ) {

                        displayRoom(
                            room
                        );

                        await loadRoomState();
                    }
                };
        }


        await loadRoomState();


        text(
            "connection-status",
            "CONNECTED"
        );


        text(
            "system-status",
            "Dashboard connected to Supabase."
        );
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


        if (
            result.error
        ) {

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

    function subscribe() {

        if (
            !currentRoomId
        ) {

            return;
        }


        const channel =
            client
                .channel(
                    `rvj-${currentRoomId}`
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
                            "REALTIME:",
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


        window.__RVJ_REALTIME_CHANNEL__ =
            channel;
    }


    // ========================================================
    // START
    // ========================================================

    async function start() {

        console.log(
            "Starting dashboard..."
        );


        await loadRooms();


        subscribe();
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
                once:
                    true
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

        state: {

            get roomId() {

                return currentRoomId;
            },

            get rooms() {

                return rooms;
            }
        }
    };

})();
