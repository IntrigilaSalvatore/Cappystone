// ============================================================
// RVJ SMART AC DASHBOARD
// app.js
//
// Responsibilities:
// - Supabase initialization
// - Room loading
// - Room selection
// - Live room_state updates
// - AC command creation
// - AC event monitoring
// - Temperature history
// - Performance data
// - Degradation state
// - UI updates through data-* attributes
//
// This file intentionally does NOT control page layout.
// ============================================================


// ============================================================
// SUPABASE CONFIGURATION
// ============================================================

const SUPABASE_URL =
    "https://raphpzlmjjzgwohjgczu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";


// ============================================================
// CREATE SUPABASE CLIENT
// ============================================================

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

    lastAcEvent: null,

    realtimeChannel: null,

    loading: false
};


// ============================================================
// GENERIC UI HELPERS
// ============================================================

function getElements(attribute) {

    return document.querySelectorAll(
        `[data-rvj="${attribute}"]`
    );
}


function setText(attribute, value) {

    const elements =
        getElements(attribute);


    elements.forEach(
        element => {

            element.textContent =
                value;

        }
    );
}


function setAttribute(
    attribute,
    name,
    value
) {

    const elements =
        getElements(attribute);


    elements.forEach(
        element => {

            element.setAttribute(
                name,
                value
            );

        }
    );
}


function setClass(
    attribute,
    className
) {

    const elements =
        getElements(attribute);


    elements.forEach(
        element => {

            element.className =
                className;

        }
    );
}


function setHidden(
    attribute,
    hidden
) {

    const elements =
        getElements(attribute);


    elements.forEach(
        element => {

            element.hidden =
                hidden;

        }
    );
}


function dispatchStateEvent(
    eventName,
    detail
) {

    window.dispatchEvent(
        new CustomEvent(
            eventName,
            {
                detail
            }
        )
    );
}


// ============================================================
// ERROR DISPLAY
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


    setAttribute(
        "connection-status",
        "data-status",
        "error"
    );
}


// ============================================================
// CONNECTION STATUS
// ============================================================

function showConnected() {

    setText(
        "connection-status",
        "CONNECTED"
    );


    setAttribute(
        "connection-status",
        "data-status",
        "connected"
    );
}


function showConnecting() {

    setText(
        "connection-status",
        "CONNECTING"
    );


    setAttribute(
        "connection-status",
        "data-status",
        "connecting"
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

        showError(
            `Failed to load rooms: ${error.message}`
        );

        return false;
    }


    state.rooms =
        data || [];


    populateRoomSelector();


    if (
        state.rooms.length === 0
    ) {

        showError(
            "No active classrooms were found."
        );

        return false;
    }


    // Restore the previously selected room
    // when possible.

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


    if (
        savedExists
    ) {

        await selectRoom(
            Number(savedRoom)
        );

    } else {

        await selectRoom(
            state.rooms[0].id
        );
    }


    return true;
}


// ============================================================
// POPULATE ROOM SELECTOR
// ============================================================

function populateRoomSelector() {

    const selectors =
        document.querySelectorAll(
            '[data-rvj="room-selector"]'
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


            selector.addEventListener(
                "change",
                async event => {

                    const roomId =
                        Number(
                            event.target.value
                        );


                    await selectRoom(
                        roomId
                    );
                }
            );
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
            "Selected room does not exist."
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


    // Update room labels immediately.

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
        room.location || "RVJ"
    );


    setText(
        "room-capacity",
        room.capacity
    );


    // Keep all selectors synchronized.

    const selectors =
        document.querySelectorAll(
            '[data-rvj="room-selector"]'
        );


    selectors.forEach(
        selector => {

            selector.value =
                String(room.id);

        }
    );


    showConnecting();


    // Stop the previous Realtime channel.

    await unsubscribeRealtime();


    // Load current state.

    await loadRoomState();


    // Load historical data.

    await loadTemperatureHistory();

    await loadPerformanceHistory();

    await loadDegradationEvents();


    // Start live updates.

    await subscribeRealtime();


    showConnected();


    dispatchStateEvent(
        "rvj:roomChanged",
        room
    );
}


// ============================================================
// LOAD ROOM STATE
// ============================================================

async function loadRoomState() {

    if (
        !state.selectedRoomId
    ) {

        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("room_state")
        .select(
            "*"
        )
        .eq(
            "room_id",
            state.selectedRoomId
        )
        .maybeSingle();


    if (error) {

        showError(
            `Failed to load room state: ${error.message}`
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
    roomState
) {

    if (!roomState) {

        setText(
            "temperature",
            "--"
        );

        setText(
            "ac-status",
            "OFF"
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

        return;
    }


    // --------------------------------------------------------
    // Temperature
    // --------------------------------------------------------

    if (
        roomState.avg_temperature_c !== null &&
        roomState.avg_temperature_c !== undefined
    ) {

        setText(
            "temperature",
            `${Number(
                roomState.avg_temperature_c
            ).toFixed(1)} °C`
        );

    } else {

        setText(
            "temperature",
            "--"
        );
    }


    // --------------------------------------------------------
    // AC
    // --------------------------------------------------------

    const acOn =
        roomState.ac_power === true;


    setText(
        "ac-status",
        acOn
            ? "ON"
            : "OFF"
    );


    setAttribute(
        "ac-status",
        "data-status",
        acOn
            ? "on"
            : "off"
    );


    // --------------------------------------------------------
    // RFID
    // --------------------------------------------------------

    setText(
        "rfid-status",
        roomState.rfid_present
            ? "PRESENT"
            : "REMOVED"
    );


    setAttribute(
        "rfid-status",
        "data-status",
        roomState.rfid_present
            ? "present"
            : "removed"
    );


    // --------------------------------------------------------
    // Control Mode
    // --------------------------------------------------------

    const adminOverride =
        roomState.admin_override === true;


    setText(
        "control-mode",
        adminOverride
            ? "ADMIN OVERRIDE"
            : "RFID"
    );


    setAttribute(
        "control-mode",
        "data-mode",
        adminOverride
            ? "admin"
            : "rfid"
    );


    // --------------------------------------------------------
    // Door
    // --------------------------------------------------------

    const doorOpen =
        roomState.door_open === true;


    setText(
        "door-status",
        doorOpen
            ? "OPEN"
            : "CLOSED"
    );


    setAttribute(
        "door-status",
        "data-status",
        doorOpen
            ? "open"
            : "closed"
    );


    // --------------------------------------------------------
    // Crowd
    // --------------------------------------------------------

    setText(
        "crowd-count",
        Number(
            roomState.crowd_count || 0
        )
    );


    // --------------------------------------------------------
    // Overcrowding
    // --------------------------------------------------------

    const overcrowded =
        roomState.overcrowded === true;


    setText(
        "crowd-alert",
        overcrowded
            ? "OVERCROWDED"
            : "NORMAL"
    );


    setAttribute(
        "crowd-alert",
        "data-status",
        overcrowded
            ? "alert"
            : "normal"
    );


    // --------------------------------------------------------
    // Hot Weather
    // --------------------------------------------------------

    const hotWeather =
        roomState.hot_weather === true;


    setText(
        "weather-alert",
        hotWeather
            ? "HOT WEATHER"
            : "NORMAL"
    );


    setAttribute(
        "weather-alert",
        "data-status",
        hotWeather
            ? "alert"
            : "normal"
    );


    // --------------------------------------------------------
    // Performance
    // --------------------------------------------------------

    if (
        roomState.performance_score !== null &&
        roomState.performance_score !== undefined
    ) {

        setText(
            "performance-score",
            `${Number(
                roomState.performance_score
            ).toFixed(0)}`
        );

    } else {

        setText(
            "performance-score",
            "--"
        );
    }


    setText(
        "performance-status",
        roomState.performance_status ||
        "UNKNOWN"
    );


    setAttribute(
        "performance-status",
        "data-status",
        (
            roomState.performance_status ||
            "UNKNOWN"
        ).toLowerCase()
    );


    // --------------------------------------------------------
    // Last update
    // --------------------------------------------------------

    if (
        roomState.updated_at
    ) {

        setText(
            "last-update",
            formatDateTime(
                roomState.updated_at
            )
        );
    }


    dispatchStateEvent(
        "rvj:stateUpdated",
        roomState
    );
}


// ============================================================
// LOAD TEMPERATURE HISTORY
// ============================================================

async function loadTemperatureHistory() {

    if (
        !state.selectedRoomId
    ) {

        return;
    }


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
                ascending: false
            }
        )
        .limit(
            300
        );


    if (error) {

        console.error(
            "Temperature history error:",
            error
        );

        return;
    }


    state.temperatureHistory =
        data || [];


    dispatchStateEvent(
        "rvj:temperatureHistoryUpdated",
        state.temperatureHistory
    );
}


// ============================================================
// LOAD PERFORMANCE HISTORY
// ============================================================

async function loadPerformanceHistory() {

    if (
        !state.selectedRoomId
    ) {

        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("performance_samples")
        .select(
            "*"
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
            300
        );


    if (error) {

        console.error(
            "Performance history error:",
            error
        );

        return;
    }


    state.performanceHistory =
        data || [];


    dispatchStateEvent(
        "rvj:performanceUpdated",
        state.performanceHistory
    );
}


// ============================================================
// LOAD DEGRADATION EVENTS
// ============================================================

async function loadDegradationEvents() {

    if (
        !state.selectedRoomId
    ) {

        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("degradation_events")
        .select(
            "*"
        )
        .eq(
            "room_id",
            state.selectedRoomId
        )
        .is(
            "resolved_at",
            null
        )
        .order(
            "detected_at",
            {
                ascending: false
            }
        );


    if (error) {

        console.error(
            "Degradation event error:",
            error
        );

        return;
    }


    state.degradationEvents =
        data || [];


    renderDegradation(
        state.degradationEvents
    );
}


// ============================================================
// RENDER DEGRADATION
// ============================================================

function renderDegradation(
    events
) {

    const doorEvent =
        events.find(
            event =>
                event.factor_type ===
                "DOOR_OPEN"
        );


    const crowdEvent =
        events.find(
            event =>
                event.factor_type ===
                "OVERCROWDING"
        );


    const weatherEvent =
        events.find(
            event =>
                event.factor_type ===
                "HOT_WEATHER"
        );


    setText(
        "door-factor",
        doorEvent
            ? "ACTIVE"
            : "NORMAL"
    );


    setText(
        "crowd-factor",
        crowdEvent
            ? "ACTIVE"
            : "NORMAL"
    );


    setText(
        "weather-factor",
        weatherEvent
            ? "ACTIVE"
            : "NORMAL"
    );


    dispatchStateEvent(
        "rvj:degradationUpdated",
        events
    );
}


// ============================================================
// ADMIN COMMAND
// ============================================================

async function sendACCommand(
    command
) {

    if (
        !state.selectedRoomId
    ) {

        showError(
            "No room is selected."
        );

        return false;
    }


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

        showError(
            `Invalid command: ${command}`
        );

        return false;
    }


    // --------------------------------------------------------
    // Prevent accidental double-clicks.
    // --------------------------------------------------------

    setAttribute(
        "admin-controls",
        "aria-busy",
        "true"
    );


    try {

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

            throw error;
        }


        dispatchStateEvent(
            "rvj:commandCreated",
            data
        );


        setText(
            "command-status",
            `Command ${command} sent.`
        );


        return true;

    } catch (error) {

        console.error(
            "AC command error:",
            error
        );


        showError(
            `Failed to send AC command: ${error.message}`
        );


        return false;

    } finally {

        setAttribute(
            "admin-controls",
            "aria-busy",
            "false"
        );
    }
}


// ============================================================
// COMMAND BUTTON SETUP
// ============================================================

function setupCommandButtons() {

    const buttons =
        document.querySelectorAll(
            "[data-ac-command]"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                async () => {

                    const command =
                        button.getAttribute(
                            "data-ac-command"
                        );


                    if (!command) {

                        return;
                    }


                    const confirmed =
                        window.confirm(
                            `Send AC command: ${command}?`
                        );


                    if (!confirmed) {

                        return;
                    }


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

async function unsubscribeRealtime() {

    if (
        !state.realtimeChannel
    ) {

        return;
    }


    await supabase.removeChannel(
        state.realtimeChannel
    );


    state.realtimeChannel =
        null;
}


// ============================================================
// SUBSCRIBE TO ROOM
// ============================================================

async function subscribeRealtime() {

    if (
        !state.selectedRoomId
    ) {

        return;
    }


    const roomId =
        state.selectedRoomId;


    const channelName =
        `rvj-room-${roomId}`;


    const channel =
        supabase.channel(
            channelName
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

            console.log(
                "room_state update:",
                payload
            );


            state.roomState =
                payload.new;


            renderRoomState(
                payload.new
            );


            dispatchStateEvent(
                "rvj:realtimeState",
                payload.new
            );
        }
    );


    // --------------------------------------------------------
    // AC EVENTS
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

            console.log(
                "AC event:",
                payload
            );


            state.lastAcEvent =
                payload.new;


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


            dispatchStateEvent(
                "rvj:acEvent",
                payload.new
            );
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


            dispatchStateEvent(
                "rvj:performancePoint",
                payload.new
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
                "Realtime status:",
                status
            );


            if (
                status ===
                "SUBSCRIBED"
            ) {

                showConnected();

            }


            if (
                status ===
                "CHANNEL_ERROR"
            ) {

                console.error(
                    "Realtime error:",
                    error
                );


                setText(
                    "connection-status",
                    "REALTIME ERROR"
                );
            }


            if (
                status ===
                "TIMED_OUT"
            ) {

                setText(
                    "connection-status",
                    "REALTIME TIMEOUT"
                );
            }
        }
    );


    state.realtimeChannel =
        channel;
}


// ============================================================
// FORMAT DATE/TIME
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
        "en-PH",
        {
            dateStyle:
                "medium",

            timeStyle:
                "medium"
        }
    );
}


// ============================================================
// FORMAT AC EVENT
// ============================================================

function formatEventName(
    eventName
) {

    if (!eventName) {

        return "--";
    }


    return eventName
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
//
// This exposes useful functions to the HTML team without
// exposing the raw application internals.
// ============================================================

window.RVJDashboard = {

    state,

    loadRooms,

    selectRoom,

    sendACCommand,

    loadRoomState,

    loadTemperatureHistory,

    loadPerformanceHistory,

    loadDegradationEvents,

    subscribeRealtime,

    unsubscribeRealtime
};


// ============================================================
// INITIALIZE APPLICATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        console.log(
            "RVJ Dashboard initializing..."
        );


        showConnecting();


        setupCommandButtons();


        const loaded =
            await loadRooms();


        if (
            loaded
        ) {

            setText(
                "system-status",
                "Dashboard ready."
            );
        }
    }
);
