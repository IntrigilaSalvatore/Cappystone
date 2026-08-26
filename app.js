// ============================================================
// RVJ SMART AC DASHBOARD
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const SUPABASE_URL =
    "https://raphpzlmjjzgwohjgczu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


// ============================================================
// SUPABASE CLIENT
// ============================================================

if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
) {

    throw new Error(
        "Supabase JavaScript library was not loaded."
    );
}


const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


// ============================================================
// APPLICATION STATE
// ============================================================

const state = {

    rooms: [],

    selectedRoomId: null,

    selectedRoom: null,

    roomState: null,

    temperatureHistory: [],

    performanceHistory: [],

    degradationEvents: [],

    realtimeChannel: null,

    temperatureChart: null,

    performanceChart: null
};


// ============================================================
// UI HELPERS
// ============================================================

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


// ============================================================
// ERROR HANDLING
// ============================================================

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


// ============================================================
// LOAD ROOMS
// ============================================================

async function loadRooms() {

    console.log(
        "Loading rooms..."
    );


    const {
        data,
        error
    } =
        await supabaseClient
            .from("rooms")
            .select(
                "id, room_code, room_name, location, capacity, active"
            )
            .eq(
                "active",
                true
            )
            .order(
                "room_code"
            );


    if (error) {

        showError(
            `Room error: ${error.message}`
        );

        return false;
    }


    state.rooms =
        data || [];


    console.log(
        "Rooms returned:",
        state.rooms
    );


    if (
        state.rooms.length === 0
    ) {

        showError(
            "No active rooms found."
        );

        return false;
    }


    setupRoomSelector();


    const savedRoom =
        localStorage.getItem(
            "rvj_selected_room"
        );


    const savedRoomExists =
        state.rooms.some(
            room =>
                String(room.id) ===
                String(savedRoom)
        );


    await selectRoom(
        savedRoomExists
            ? Number(savedRoom)
            : state.rooms[0].id
    );


    return true;
}


// ============================================================
// ROOM SELECTOR
// ============================================================

function setupRoomSelector() {

    getElements(
        "room-selector"
    ).forEach(
        selector => {

            selector.innerHTML =
                "";


            state.rooms.forEach(
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
                async event => {

                    await selectRoom(
                        Number(
                            event.target.value
                        )
                    );
                };
        }
    );
}


// ============================================================
// SELECT ROOM
// ============================================================

async function selectRoom(
    roomId
) {

    const room =
        state.rooms.find(
            item =>
                Number(item.id) ===
                Number(roomId)
        );


    if (!room) {

        showError(
            "Selected room was not found."
        );

        return;
    }


    state.selectedRoomId =
        Number(room.id);


    state.selectedRoom =
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


    setText(
        "room-code",
        room.room_code
    );


    setText(
        "room-name",
        room.room_name
    );


    setText(
        "room-location",
        room.location || "--"
    );


    setText(
        "room-capacity",
        room.capacity
    );


    setText(
        "connection-status",
        "LOADING"
    );


    if (
        state.realtimeChannel
    ) {

        await supabaseClient.removeChannel(
            state.realtimeChannel
        );


        state.realtimeChannel =
            null;
    }


    // --------------------------------------------------------
    // IMPORTANT:
    // Load and display database data BEFORE charts.
    // --------------------------------------------------------

    await loadRoomState();

    await loadTemperatureHistory();

    await loadPerformanceHistory();

    await loadDegradationEvents();


    // --------------------------------------------------------
    // Charts cannot prevent the data cards from working.
    // --------------------------------------------------------

    try {

        renderTemperatureChart();

    } catch (error) {

        console.error(
            "Temperature chart error:",
            error
        );
    }


    try {

        renderPerformanceChart();

    } catch (error) {

        console.error(
            "Performance chart error:",
            error
        );
    }


    // --------------------------------------------------------
    // Realtime
    // --------------------------------------------------------

    try {

        subscribeRealtime();

    } catch (error) {

        console.error(
            "Realtime error:",
            error
        );
    }


    setText(
        "connection-status",
        "CONNECTED"
    );


    setText(
        "system-status",
        `Monitoring ${room.room_code}.`
    );
}


// ============================================================
// ROOM STATE
// ============================================================

async function loadRoomState() {

    console.log(
        "Loading room_state..."
    );


    const {
        data,
        error
    } =
        await supabaseClient
            .from("room_state")
            .select("*")
            .eq(
                "room_id",
                state.selectedRoomId
            )
            .maybeSingle();


    if (error) {

        showError(
            `Room state error: ${error.message}`
        );

        return;
    }


    console.log(
        "Room state:",
        data
    );


    state.roomState =
        data;


    renderRoomState(
        data
    );
}


// ============================================================
// RENDER ROOM STATE
// ============================================================

function renderRoomState(
    data
) {

    if (!data) {

        setText(
            "temperature",
            "--"
        );

        setText(
            "ac-status",
            "OFF"
        );

        setText(
            "rfid-status",
            "REMOVED"
        );

        setText(
            "control-mode",
            "RFID"
        );

        setText(
            "door-status",
            "CLOSED"
        );

        setText(
            "crowd-count",
            "0"
        );

        setText(
            "performance-score",
            "--"
        );

        setText(
            "performance-status",
            "UNKNOWN"
        );

        return;
    }


    // Temperature

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


    // AC

    const acOn =
        data.ac_power === true;


    setText(
        "ac-status",
        acOn
            ? "ON"
            : "OFF"
    );


    setStatus(
        "ac-status",
        acOn
            ? "on"
            : "off"
    );


    // RFID

    setText(
        "rfid-status",
        data.rfid_present
            ? "PRESENT"
            : "REMOVED"
    );


    // Control mode

    setText(
        "control-mode",
        data.ac_control_mode ||
        "RFID"
    );


    // Door

    setText(
        "door-status",
        data.door_open
            ? "OPEN"
            : "CLOSED"
    );


    setStatus(
        "door-status",
        data.door_open
            ? "open"
            : "closed"
    );


    // Crowd

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


    // Weather

    setText(
        "weather-alert",
        data.hot_weather
            ? "HOT WEATHER"
            : "NORMAL"
    );


    // Performance

    setText(
        "performance-score",
        data.performance_score === null ||
        data.performance_score === undefined
            ? "--"
            : Number(
                data.performance_score
            ).toFixed(0)
    );


    setText(
        "performance-status",
        data.performance_status ||
        "UNKNOWN"
    );


    // Last update

    setText(
        "last-update",
        formatDateTime(
            data.updated_at
        )
    );
}


// ============================================================
// TEMPERATURE HISTORY
// ============================================================

async function loadTemperatureHistory() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("temperature_readings")
            .select(
                "id, device_id, temperature_c, recorded_at"
            )
            .eq(
                "room_id",
                state.selectedRoomId
            )
            .order(
                "recorded_at",
                {
                    ascending: true
                }
            )
            .limit(
                500
            );


    if (error) {

        console.error(
            "Temperature history error:",
            error
        );

        state.temperatureHistory =
            [];

        return;
    }


    state.temperatureHistory =
        data || [];


    console.log(
        "Temperature records:",
        state.temperatureHistory.length
    );
}


// ============================================================
// PERFORMANCE HISTORY
// ============================================================

async function loadPerformanceHistory() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("performance_samples")
            .select("*")
            .eq(
                "room_id",
                state.selectedRoomId
            )
            .order(
                "recorded_at",
                {
                    ascending: true
                }
            )
            .limit(
                300
            );


    if (error) {

        console.error(
            "Performance history error:",
            error
        );

        state.performanceHistory =
            [];

        return;
    }


    state.performanceHistory =
        data || [];


    console.log(
        "Performance records:",
        state.performanceHistory.length
    );


    if (
        state.performanceHistory.length > 0
    ) {

        const latest =
            state.performanceHistory[
                state.performanceHistory.length - 1
            ];


        setText(
            "performance-score",
            Number(
                latest.performance_score
            ).toFixed(0)
        );


        setText(
            "performance-status",
            latest.performance_status
        );
    }
}


// ============================================================
// DEGRADATION EVENTS
// ============================================================

async function loadDegradationEvents() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("degradation_events")
            .select("*")
            .eq(
                "room_id",
                state.selectedRoomId
            )
            .is(
                "resolved_at",
                null
            );


    if (error) {

        console.error(
            "Degradation error:",
            error
        );

        return;
    }


    state.degradationEvents =
        data || [];


    setText(
        "door-factor",
        state.degradationEvents.some(
            event =>
                event.factor_type ===
                "DOOR_OPEN"
        )
            ? "ACTIVE"
            : "NORMAL"
    );


    setText(
        "crowd-factor",
        state.degradationEvents.some(
            event =>
                event.factor_type ===
                "OVERCROWDING"
        )
            ? "ACTIVE"
            : "NORMAL"
    );


    setText(
        "weather-factor",
        state.degradationEvents.some(
            event =>
                event.factor_type ===
                "HOT_WEATHER"
        )
            ? "ACTIVE"
            : "NORMAL"
    );
}


// ============================================================
// TEMPERATURE CHART
// ============================================================

function renderTemperatureChart() {

    if (
        typeof Chart ===
        "undefined"
    ) {

        return;
    }


    const canvas =
        document.getElementById(
            "temperatureChart"
        );


    if (!canvas) {

        return;
    }


    const grouped =
        new Map();


    state.temperatureHistory.forEach(
        reading => {

            const date =
                new Date(
                    reading.recorded_at
                );


            const key =
                Math.floor(
                    date.getTime() /
                    60000
                );


            if (
                !grouped.has(key)
            ) {

                grouped.set(
                    key,
                    []
                );
            }


            grouped
                .get(key)
                .push(
                    Number(
                        reading.temperature_c
                    )
                );
        }
    );


    const keys =
        Array.from(
            grouped.keys()
        ).sort(
            (a, b) =>
                a - b
        );


    const labels =
        keys.map(
            key =>
                new Date(
                    key * 60000
                ).toLocaleTimeString(
                    "en-PH",
                    {
                        hour:
                            "2-digit",

                        minute:
                            "2-digit"
                    }
                )
        );


    const values =
        keys.map(
            key => {

                const readings =
                    grouped.get(
                        key
                    );


                return Number(
                    (
                        readings.reduce(
                            (
                                sum,
                                value
                            ) =>
                                sum + value,
                            0
                        ) /
                        readings.length
                    ).toFixed(2)
                );
            }
        );


    if (
        state.temperatureChart
    ) {

        state.temperatureChart.destroy();
    }


    state.temperatureChart =
        new Chart(
            canvas,
            {
                type:
                    "line",

                data: {

                    labels,

                    datasets: [

                        {

                            label:
                                "Average Temperature (°C)",

                            data:
                                values,

                            tension:
                                0.25,

                            fill:
                                false
                        }

                    ]
                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false
                }
            }
        );
}


// ============================================================
// PERFORMANCE CHART
// ============================================================

function renderPerformanceChart() {

    if (
        typeof Chart ===
        "undefined"
    ) {

        return;
    }


    const canvas =
        document.getElementById(
            "performanceChart"
        );


    if (!canvas) {

        return;
    }


    if (
        state.performanceChart
    ) {

        state.performanceChart.destroy();
    }


    const labels =
        state.performanceHistory.map(
            sample =>
                new Date(
                    sample.recorded_at
                ).toLocaleTimeString(
                    "en-PH",
                    {
                        hour:
                            "2-digit",

                        minute:
                            "2-digit"
                    }
                )
        );


    const values =
        state.performanceHistory.map(
            sample =>
                Number(
                    sample.performance_score
                )
        );


    state.performanceChart =
        new Chart(
            canvas,
            {
                type:
                    "line",

                data: {

                    labels,

                    datasets: [

                        {

                            label:
                                "Performance Score",

                            data:
                                values,

                            tension:
                                0.25,

                            fill:
                                false
                        }

                    ]
                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    scales: {

                        y: {

                            min:
                                0,

                            max:
                                100
                        }
                    }
                }
            }
        );
}


// ============================================================
// ADMIN COMMAND
// ============================================================

async function sendACCommand(
    command
) {

    const allowedCommands = [
        "ON",
        "OFF",
        "CLEAR_OVERRIDE"
    ];


    if (
        !allowedCommands.includes(
            command
        )
    ) {

        return;
    }


    setText(
        "command-status",
        `Sending ${command}...`
    );


    const {
        data,
        error
    } =
        await supabaseClient
            .from("ac_commands")
            .insert({
                room_id:
                    state.selectedRoomId,

                command:
                    command,

                source:
                    "ADMIN",

                status:
                    "PENDING"
            })
            .select()
            .single();


    if (error) {

        showError(
            `Command error: ${error.message}`
        );

        setText(
            "command-status",
            "Command failed."
        );

        return;
    }


    console.log(
        "Command created:",
        data
    );


    setText(
        "command-status",
        `Command ${command} sent.`
    );
}


// ============================================================
// COMMAND BUTTONS
// ============================================================

function setupCommandButtons() {

    document
        .querySelectorAll(
            "[data-ac-command]"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        await sendACCommand(
                            button.dataset.acCommand
                        );
                    };
            }
        );
}


// ============================================================
// REALTIME
// ============================================================

function subscribeRealtime() {

    if (
        !state.selectedRoomId
    ) {

        return;
    }


    const roomId =
        state.selectedRoomId;


    const channel =
        supabaseClient.channel(
            `rvj-room-${roomId}`
        );


    // Room state

    channel.on(
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
                "Realtime room_state:",
                payload.new
            );


            state.roomState =
                payload.new;


            renderRoomState(
                payload.new
            );
        }
    );


    // Temperature

    channel.on(
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

            state.temperatureHistory.push(
                payload.new
            );


            if (
                state.temperatureHistory.length >
                500
            ) {

                state.temperatureHistory.shift();
            }


            try {

                renderTemperatureChart();

            } catch (error) {

                console.error(
                    error
                );
            }
        }
    );


    // Performance

    channel.on(
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

            state.performanceHistory.push(
                payload.new
            );


            setText(
                "performance-score",
                Number(
                    payload.new.performance_score
                ).toFixed(0)
            );


            setText(
                "performance-status",
                payload.new.performance_status
            );


            try {

                renderPerformanceChart();

            } catch (error) {

                console.error(
                    error
                );
            }
        }
    );


    // AC events

    channel.on(
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
    );


    channel.subscribe(
        (
            status,
            error
        ) => {

            console.log(
                "Realtime status:",
                status
            );


            if (error) {

                console.error(
                    "Realtime error:",
                    error
                );
            }
        }
    );


    state.realtimeChannel =
        channel;
}


// ============================================================
// FORMATTERS
// ============================================================

function formatDateTime(
    value
) {

    if (!value) {

        return "--";
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

        return "--";
    }


    return date.toLocaleString(
        "en-PH"
    );
}


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


// ============================================================
// START
// ============================================================

async function initializeDashboard() {

    console.log(
        "======================================"
    );

    console.log(
        "RVJ DASHBOARD START"
    );

    console.log(
        "======================================"
    );


    try {

        setText(
            "connection-status",
            "CONNECTING"
        );


        setupCommandButtons();


        const success =
            await loadRooms();


        if (
            success
        ) {

            setText(
                "connection-status",
                "CONNECTED"
            );


            setText(
                "system-status",
                "Dashboard ready."
            );
        }

    } catch (error) {

        showError(
            `Dashboard startup error: ${error.message}`
        );
    }
}


document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);


// ============================================================
// PUBLIC API
// ============================================================

window.RVJDashboard = {

    state,

    selectRoom,

    loadRoomState,

    loadTemperatureHistory,

    loadPerformanceHistory,

    sendACCommand

};
