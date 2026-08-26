console.log("======================================");
console.log("RVJ DASHBOARD STARTING");
console.log("======================================");


// ============================================================
// SUPABASE
// ============================================================

const SUPABASE_URL =
    "https://raphpzlmjjzgwohjgczu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


console.log(
    "Supabase library:",
    window.supabase
);


if (!window.supabase) {

    console.error(
        "ERROR: Supabase JavaScript library was not loaded."
    );

    document.body.insertAdjacentHTML(
        "afterbegin",
        `
        <div style="
            padding:20px;
            background:#ffdddd;
            color:#900;
            font-family:Arial;
        ">
            ERROR: Supabase library failed to load.
        </div>
        `
    );

    throw new Error(
        "Supabase library not loaded."
    );
}


// ============================================================
// CREATE CLIENT
// ============================================================

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


console.log(
    "Supabase client created:",
    supabaseClient
);


// ============================================================
// HELPER
// ============================================================

function setText(
    name,
    value
) {

    const elements =
        document.querySelectorAll(
            `[data-rvj="${name}"]`
        );


    console.log(
        `Updating [data-rvj="${name}"]`,
        value,
        "elements:",
        elements.length
    );


    elements.forEach(
        element => {
            element.textContent =
                value;
        }
    );
}


// ============================================================
// TEST ROOMS
// ============================================================

async function testRooms() {

    console.log(
        "TEST 1: Loading rooms..."
    );


    const {
        data,
        error
    } = await supabaseClient
        .from("rooms")
        .select("*")
        .eq(
            "active",
            true
        );


    console.log(
        "ROOM DATA:",
        data
    );


    console.log(
        "ROOM ERROR:",
        error
    );


    if (error) {

        setText(
            "system-status",
            `ROOM ERROR: ${error.message}`
        );

        return false;
    }


    if (
        !data ||
        data.length === 0
    ) {

        setText(
            "system-status",
            "No active rooms found."
        );

        return false;
    }


    setText(
        "system-status",
        "Supabase connection working."
    );


    setText(
        "room-code",
        data[0].room_code
    );


    setText(
        "room-name",
        data[0].room_name
    );


    setText(
        "room-location",
        data[0].location || "--"
    );


    setText(
        "room-capacity",
        data[0].capacity
    );


    return true;
}


// ============================================================
// TEST ROOM STATE
// ============================================================

async function testRoomState() {

    console.log(
        "TEST 2: Loading room_state..."
    );


    const {
        data,
        error
    } = await supabaseClient
        .from("room_state")
        .select("*")
        .eq(
            "room_id",
            1
        )
        .maybeSingle();


    console.log(
        "ROOM STATE DATA:",
        data
    );


    console.log(
        "ROOM STATE ERROR:",
        error
    );


    if (error) {

        setText(
            "system-status",
            `ROOM STATE ERROR: ${error.message}`
        );

        return;
    }


    if (!data) {

        setText(
            "system-status",
            "Room exists but no room_state row was found."
        );

        return;
    }


    if (
        data.avg_temperature_c !== null &&
        data.avg_temperature_c !== undefined
    ) {

        setText(
            "temperature",
            `${Number(
                data.avg_temperature_c
            ).toFixed(1)} °C`
        );

    } else {

        setText(
            "temperature",
            "--"
        );
    }


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
        "door-status",
        data.door_open
            ? "OPEN"
            : "CLOSED"
    );


    setText(
        "crowd-count",
        data.crowd_count ?? 0
    );


    setText(
        "control-mode",
        data.ac_control_mode ||
        "RFID"
    );


    setText(
        "performance-score",
        data.performance_score ??
        "--"
    );


    setText(
        "performance-status",
        data.performance_status ||
        "UNKNOWN"
    );


    console.log(
        "Room state displayed successfully."
    );
}


// ============================================================
// TEST TEMPERATURE READINGS
// ============================================================

async function testTemperatureReadings() {

    console.log(
        "TEST 3: Loading temperature history..."
    );


    const {
        data,
        error
    } = await supabaseClient
        .from("temperature_readings")
        .select(
            "*"
        )
        .eq(
            "room_id",
            1
        )
        .order(
            "recorded_at",
            {
                ascending: false
            }
        )
        .limit(
            10
        );


    console.log(
        "TEMPERATURE DATA:",
        data
    );


    console.log(
        "TEMPERATURE ERROR:",
        error
    );


    if (error) {

        setText(
            "system-status",
            `TEMPERATURE ERROR: ${error.message}`
        );

        return;
    }


    console.log(
        `Received ${data.length} temperature records.`
    );
}


// ============================================================
// TEST REALTIME
// ============================================================

function testRealtime() {

    console.log(
        "TEST 4: Starting Realtime..."
    );


    const channel =
        supabaseClient
            .channel(
                "rvj-room-state-test"
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "room_state",
                    filter: "room_id=eq.1"
                },
                payload => {

                    console.log(
                        "REALTIME ROOM STATE:",
                        payload
                    );


                    testRoomState();
                }
            )
            .subscribe(
                (
                    status,
                    error
                ) => {

                    console.log(
                        "REALTIME STATUS:",
                        status
                    );


                    if (error) {

                        console.error(
                            "REALTIME ERROR:",
                            error
                        );
                    }


                    if (
                        status ===
                        "SUBSCRIBED"
                    ) {

                        setText(
                            "connection-status",
                            "CONNECTED"
                        );

                        setAttributeStatus(
                            "connection-status",
                            "connected"
                        );
                    }
                }
            );


    return channel;
}


// ============================================================
// STATUS ATTRIBUTE
// ============================================================

function setAttributeStatus(
    name,
    status
) {

    const elements =
        document.querySelectorAll(
            `[data-rvj="${name}"]`
        );


    elements.forEach(
        element => {

            element.dataset.status =
                status;
        }
    );
}


// ============================================================
// INITIALIZATION
// ============================================================

async function initialize() {

    console.log(
        "======================================"
    );

    console.log(
        "INITIALIZING TESTS"
    );

    console.log(
        "======================================"
    );


    try {

        setText(
            "connection-status",
            "CONNECTING"
        );


        const roomsOk =
            await testRooms();


        if (!roomsOk) {

            return;
        }


        await testRoomState();


        await testTemperatureReadings();


        testRealtime();


        setText(
            "connection-status",
            "CONNECTED"
        );


        setAttributeStatus(
            "connection-status",
            "connected"
        );


        console.log(
            "======================================"
        );

        console.log(
            "ALL DASHBOARD TESTS INITIALIZED"
        );

        console.log(
            "======================================"
        );

    } catch (error) {

        console.error(
            "FATAL DASHBOARD ERROR:",
            error
        );


        setText(
            "system-status",
            `FATAL ERROR: ${error.message}`
        );
    }
}


// ============================================================
// START
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    initialize
);
