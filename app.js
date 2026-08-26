// ============================================================
// RVJ SMART AC DASHBOARD
// app.js
// ============================================================


// ============================================================
// SUPABASE
// ============================================================

const SUPABASE_URL =
    "https://raphpzlmjjzgwohjgczu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


const supabase =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


// ============================================================
// STATE
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

function elements(name) {

    return document.querySelectorAll(
        `[data-rvj="${name}"]`
    );
}


function setText(
    name,
    value
) {

    elements(name).forEach(
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

    elements(name).forEach(
        element => {

            element.dataset.status =
                value;

        }
    );
}


// ============================================================
// LOAD ROOMS
// ============================================================

async function loadRooms() {

    const {
        data,
        error
    } = await supabase
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

        console.error(
            "Room loading error:",
            error
        );

        setText(
            "system-status",
            error.message
        );

        return false;
    }


    state.rooms =
        data || [];


    const selectors =
        elements(
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
        }
    );


    if (
        state.rooms.length === 0
    ) {

        setText(
            "system-status",
            "No active rooms found."
        );

        return false;
    }


    selectors.forEach(
        selector => {

            selector.addEventListener(
                "change",
                async event => {

                    await selectRoom(
                        Number(
                            event.target.value
                        )
                    );
                }
            );
        }
    );


    const saved =
        localStorage.getItem(
            "rvj_selected_room"
        );


    const savedRoom =
        state.rooms.find(
            room =>
                String(room.id) ===
                String(saved)
        );


    if (
        savedRoom
    ) {

        await selectRoom(
            savedRoom.id
        );

    } else {

        await selectRoom(
            state.rooms[0].id
        );
    }


    return true;
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


    elements(
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


    if (
        state.realtimeChannel
    ) {

        await supabase.removeChannel(
            state.realtimeChannel
        );

        state.realtimeChannel =
            null;
    }


    await loadRoomState();

    await loadTemperatureHistory();

    await loadPerformanceHistory();

    await loadDegradationEvents();

    renderTemperatureChart();

    renderPerformanceChart();

    subscribeRealtime();


    setText(
        "connection-status",
        "CONNECTED"
    );
}


// ============================================================
// ROOM STATE
// ============================================================

async function loadRoomState() {

    const {
        data,
        error
    } = await supabase
        .from("room_state")
        .select("*")
        .eq(
            "room_id",
            state.selectedRoomId
        )
        .maybeSingle();


    if (error) {

        console.error(
            error
        );

        return;
    }


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


    setStatus(
        "ac-status",
        data.ac_power
            ? "on"
            : "off"
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


    setStatus(
        "door-status",
        data.door_open
            ? "open"
            : "closed"
    );


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


    setText(
        "weather-alert",
        data.hot_weather
            ? "HOT WEATHER"
            : "NORMAL"
    );


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

    } else {

        setText(
            "performance-score",
            "--"
        );
    }


    setText(
        "performance-status",
        data.performance_status ||
        "UNKNOWN"
    );


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
    } = await supabase
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
            "Temperature history:",
            error
        );

        return;
    }


    state.temperatureHistory =
        data || [];
}


// ============================================================
// BUILD AVERAGE TEMPERATURE CHART DATA
// ============================================================

function buildTemperatureChartData() {

    const grouped =
        new Map();


    state.temperatureHistory.forEach(
        reading => {

            const time =
                new Date(
                    reading.recorded_at
                );


            const key =
                time.toISOString();


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


    const labels = [];

    const values = [];


    grouped.forEach(
        (temps, key) => {

            const average =
                temps.reduce(
                    (
                        sum,
                        value
                    ) =>
                        sum + value,
                    0
                ) /
                temps.length;


            labels.push(
                formatChartTime(
                    key
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
                        false,

                    scales: {

                        y: {

                            title: {

                                display:
                                    true,

                                text:
                                    "Temperature °C"
                            }
                        }

                    }

                }
            }
        );
}


// ============================================================
// PERFORMANCE HISTORY
// ============================================================

async function loadPerformanceHistory() {

    const {
        data,
        error
    } = await supabase
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
            "Performance history:",
            error
        );

        return;
    }


    state.performanceHistory =
        data || [];


    if (
        state.performanceHistory.length
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
// PERFORMANCE CHART
// ============================================================

function renderPerformanceChart() {

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
                formatChartTime(
                    sample.recorded_at
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
                                100,

                            title: {

                                display:
                                    true,

                                text:
                                    "Score"
                            }
                        }
                    }
                }
            }
        );
}


// ============================================================
// DEGRADATION
// ============================================================

async function loadDegradationEvents() {

    const {
        data,
        error
    } = await supabase
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
// ADMIN COMMAND
// ============================================================

async function sendACCommand(
    command
) {

    const allowed =
        [
            "ON",
            "OFF",
            "CLEAR_OVERRIDE"
        ];


    if (
        !allowed.includes(
            command
        )
    ) {

        return;
    }


    const {
        data,
        error
    } = await supabase
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

        console.error(
            error
        );


        setText(
            "command-status",
            error.message
        );


        return;
    }


    setText(
        "command-status",
        `Command ${command} sent.`
    );


    return data;
}


// ============================================================
// BUTTONS
// ============================================================

function setupButtons() {

    document
        .querySelectorAll(
            "[data-ac-command]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const command =
                            button.dataset.acCommand;


                        await sendACCommand(
                            command
                        );
                    }
                );
            }
        );
}


// ============================================================
// REALTIME
// ============================================================

function subscribeRealtime() {

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
            event: "UPDATE",
            schema: "public",
            table: "room_state",
            filter:
                `room_id=eq.${roomId}`
        },
        payload => {

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
            event: "INSERT",
            schema: "public",
            table: "temperature_readings",
            filter:
                `room_id=eq.${roomId}`
        },
        async payload => {

            state.temperatureHistory.push(
                payload.new
            );


            if (
                state.temperatureHistory.length >
                500
            ) {

                state.temperatureHistory.shift();
            }


            renderTemperatureChart();
        }
    );


    // --------------------------------------------------------
    // PERFORMANCE
    // --------------------------------------------------------

    channel.on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "performance_samples",
            filter:
                `room_id=eq.${roomId}`
        },
        payload => {

            state.performanceHistory.push(
                payload.new
            );


            if (
                state.performanceHistory.length >
                300
            ) {

                state.performanceHistory.shift();
            }


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


            renderPerformanceChart();
        }
    );


    // --------------------------------------------------------
    // AC EVENT
    // --------------------------------------------------------

    channel.on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "ac_events",
            filter:
                `room_id=eq.${roomId}`
        },
        payload => {

            setText(
                "last-ac-event",
                formatEvent(
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
    // DEGRADATION
    // --------------------------------------------------------

    channel.on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "degradation_events",
            filter:
                `room_id=eq.${roomId}`
        },
        async () => {

            await loadDegradationEvents();
        }
    );


    // --------------------------------------------------------
    // SUBSCRIBE
    // --------------------------------------------------------

    channel.subscribe(
        (
            status,
            error
        ) => {

            console.log(
                "Realtime:",
                status
            );


            if (
                error
            ) {

                console.error(
                    error
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

function formatDateTime(
    value
) {

    if (!value) {

        return "--";
    }


    return new Date(
        value
    ).toLocaleString(
        "en-PH"
    );
}


function formatChartTime(
    value
) {

    const date =
        new Date(
            value
        );


    return date.toLocaleTimeString(
        "en-PH",
        {
            hour:
                "2-digit",

            minute:
                "2-digit",

            second:
                "2-digit"
        }
    );
}


function formatEvent(
    value
) {

    return String(
        value || "--"
    )
        .replace(
            /_/g,
            " "
        )
        .replace(
            /\b\w/g,
            char =>
                char.toUpperCase()
        );
}


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


// ============================================================
// START
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setText(
            "connection-status",
            "CONNECTING"
        );


        setupButtons();


        const success =
            await loadRooms();


        if (
            success
        ) {

            setText(
                "system-status",
                "Dashboard ready."
            );
        }
    }
);
