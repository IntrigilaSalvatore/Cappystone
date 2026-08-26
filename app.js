// ============================================================
// RVJ SMART AC DASHBOARD
// ============================================================


// ============================================================
// SUPABASE CONFIG
// ============================================================

const SUPABASE_URL =
    "https://raphpzlmjjzgwohjgczu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


// ============================================================
// CREATE SUPABASE CLIENT
// ============================================================

if (!window.supabase) {

    throw new Error(
        "Supabase JavaScript library did not load."
    );
}


const supabase =
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
// UI
// ============================================================

function getElements(name) {

    return document.querySelectorAll(
        `[data-rvj="${name}"]`
    );
}


function setText(name, value) {

    getElements(name).forEach(
        element => {

            element.textContent =
                value;

        }
    );
}


function setStatus(name, value) {

    getElements(name).forEach(
        element => {

            element.dataset.status =
                value;

        }
    );
}


// ============================================================
// ERROR
// ============================================================

function showError(message) {

    console.error(
        "[RVJ Dashboard]",
        message
    );


    setText(
        "system-status",
        message
    );
}


// ============================================================
// LOAD ROOMS
// ============================================================

async function loadRooms() {

    console.log(
        "Loading rooms..."
    );


    const result =
        await supabase
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


    if (result.error) {

        showError(
            `Room error: ${result.error.message}`
        );

        return false;
    }


    state.rooms =
        result.data || [];


    console.log(
        "Rooms:",
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


    const savedExists =
        state.rooms.some(
            room =>
                String(room.id) ===
                String(savedRoom)
        );


    await selectRoom(
        savedExists
            ? Number(savedRoom)
            : state.rooms[0].id
    );


    return true;
}


// ============================================================
// ROOM SELECTOR
// ============================================================

function setupRoomSelector() {

    const selectors =
        getElements(
            "room-selector"
        );


    selectors.forEach(
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

async function selectRoom(roomId) {

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


    // Remove previous realtime subscription.

    if (
        state.realtimeChannel
    ) {

        await supabase.removeChannel(
            state.realtimeChannel
        );


        state.realtimeChannel =
            null;
    }


    // --------------------------------------------------------
    // Load the important data FIRST.
    // --------------------------------------------------------

    await loadRoomState();

    await loadTemperatureHistory();

    await loadPerformanceHistory();

    await loadDegradationEvents();


    // --------------------------------------------------------
    // Charts are optional.
    // --------------------------------------------------------

    try {

        renderTemperatureChart();

    } catch (error) {

        console.error(
            "Temperature chart failed:",
            error
        );
    }


    try {

        renderPerformanceChart();

    } catch (error) {

        console.error(
            "Performance chart failed:",
            error
        );
    }


    // --------------------------------------------------------
    // Realtime is optional.
    // --------------------------------------------------------

    try {

        subscribeRealtime();

    } catch (error) {

        console.error(
            "Realtime initialization failed:",
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
// LOAD ROOM STATE
// ============================================================

async function loadRoomState() {

    console.log(
        "Loading room_state for room:",
        state.selectedRoomId
    );


    const result =
        await supabase
            .from("room_state")
            .select("*")
            .eq(
                "room_id",
                state.selectedRoomId
            )
            .maybeSingle();


    if (result.error) {

        showError(
            `Room state error: ${result.error.message}`
        );

        return;
    }


    console.log(
        "Room state:",
        result.data
    );


    state.roomState =
        result.data;


    renderRoomState(
        result.data
    );
}


// ============================================================
// RENDER ROOM STATE
// ============================================================

function renderRoomState(data) {

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


    // --------------------------------------------------------
    // Temperature
    // --------------------------------------------------------

    const averageTemp =
        data.avg_temperature_c;


    setText(
        "temperature",
        averageTemp === null ||
        averageTemp === undefined
            ? "--"
            : `${Number(
                averageTemp
            ).toFixed(1)} °C`
    );


    // --------------------------------------------------------
    // AC
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // RFID
    // --------------------------------------------------------

    setText(
        "rfid-status",
        data.rfid_present
            ? "PRESENT"
            : "REMOVED"
    );


    // --------------------------------------------------------
    // Control mode
    // --------------------------------------------------------

    setText(
        "control-mode",
        data.ac_control_mode ||
        "RFID"
    );


    // --------------------------------------------------------
    // Door
    // --------------------------------------------------------

    const doorOpen =
        data.door_open === true;


    setText(
        "door-status",
        doorOpen
            ? "OPEN"
            : "CLOSED"
    );


    setStatus(
        "door-status",
        doorOpen
            ? "open"
            : "closed"
    );


    // --------------------------------------------------------
    // Crowd
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Weather
    // --------------------------------------------------------

    setText(
        "weather-alert",
        data.hot_weather
            ? "HOT WEATHER"
            : "NORMAL"
    );


    // --------------------------------------------------------
    // Performance
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Last update
    // --------------------------------------------------------

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

    console.log(
        "Loading temperature history..."
    );


    const result =
        await supabase
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


    if (result.error) {

        console.error(
            "Temperature history error:",
            result.error
        );

        state.temperatureHistory =
            [];

        return;
    }


    state.temperatureHistory =
        result.data || [];


    console.log(
        "Temperature readings:",
        state.temperatureHistory.length
    );
}


// ============================================================
// PERFORMANCE HISTORY
// ============================================================

async function loadPerformanceHistory() {

    console.log(
        "Loading performance history..."
    );


    const result =
        await supabase
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


    if (result.error) {

        console.error(
            "Performance history error:",
            result.error
        );

        state.performanceHistory =
            [];

        return;
    }


    state.performanceHistory =
        result.data || [];


    console.log(
        "Performance samples:",
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
// DEGRADATION
// ============================================================

async function loadDegradationEvents() {

    const result =
        await supabase
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


    if (result.error) {

        console.error(
            "Degradation error:",
            result.error
        );

        return;
    }


    state.degradationEvents =
        result.data || [];


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
// TEMPERATURE CHART DATA
// ============================================================

function buildTemperatureChartData() {

    const buckets =
        new Map();


    state.temperatureHistory.forEach(
        reading => {

            const timestamp =
                new Date(
                    reading.recorded_at
                );


            // Group by minute.
            const minuteKey =
                Math.floor(
                    timestamp.getTime() /
                    60000
                );


            if (
                !buckets.has(
                    minuteKey
                )
            ) {

                buckets.set(
                    minuteKey,
                    []
                );
            }


            buckets
                .get(minuteKey)
                .push(
                    Number(
                        reading.temperature_c
                    )
                );
        }
    );


    const sortedKeys =
        Array.from(
            buckets.keys()
        ).sort(
            (a, b) =>
                a - b
        );


    const labels = [];

    const values = [];


    sortedKeys.forEach(
        minuteKey => {

            const valuesForMinute =
                buckets.get(
                    minuteKey
                );


            const average =
                valuesForMinute.reduce(
                    (
                        total,
                        value
                    ) =>
                        total + value,
                    0
                ) /
                valuesForMinute.length;


            labels.push(
                new Date(
                    minuteKey * 60000
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


            values.push(
                Number(
                    average.toFixed(2)
                )
            );
        }
    );


    return {
        labels,
        values
    };
}


// ============================================================
// TEMPERATURE CHART
// ============================================================

function renderTemperatureChart() {

    if (
        typeof Chart ===
        "undefined"
    ) {

        console.warn(
            "Chart.js is not loaded."
        );

        return;
    }


    const canvas =
        document.getElementById(
            "temperatureChart"
        );


    if (!canvas) {

        return;
    }


    const chartData =
        buildTemperatureChartData();


    if (
        state.temperatureChart
    ) {

        state.temperatureChart.destroy();
    }


    state.temperatureChart =
        new Chart(
            canvas,
            {
                type: "line",

                data: {

                    labels:
                        chartData.labels,

                    datasets: [
                        {
                            label:
                                "Average Temperature (°C)",

                            data:
                                chartData.values,

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

        console.warn(
            "Chart.js is not loaded."
        );

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
                type: "line",

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
        await supabase
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


    if (result.error) {

        showError(
            `Command error: ${result.error.message}`
        );

        setText(
            "command-status",
            "Command failed."
        );

        return;
    }


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
        supabase.channel(
            `rvj-room-${roomId}`
        );


    // --------------------------------------------------------
    // ROOM STATE
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // TEMPERATURE
    // --------------------------------------------------------

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
                    "Realtime temperature chart error:",
                    error
                );
            }
        }
    );


    // --------------------------------------------------------
    // PERFORMANCE
    // --------------------------------------------------------

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
                    "Realtime performance chart error:",
                    error
                );
            }
        }
    );


    // --------------------------------------------------------
    // AC EVENTS
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // REALTIME CONNECT
    // --------------------------------------------------------

    channel.subscribe(
        (
            status,
            error
        ) => {

            console.log(
                "Realtime status:",
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


            if (
                status ===
                "SUBSCRIBED"
            ) {

                setText(
                    "connection-status",
                    "CONNECTED"
                );
            }
        }
    );


    state.realtimeChannel =
        channel;
}


// ============================================================
// FORMATTING
// ============================================================

function formatDateTime(value) {

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


function formatEventName(value) {

    if (!value) {

        return "--";
    }


    return value
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
// STARTUP
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


    setText(
        "connection-status",
        "CONNECTING"
    );


    setupCommandButtons();


    const success =
        await loadRooms();


    if (!success) {

        return;
    }


    console.log(
        "Dashboard successfully initialized."
    );
}


// ============================================================
// START
// ============================================================

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
