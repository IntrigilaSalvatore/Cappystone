(function () {

```
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


const WEATHER_POLL_INTERVAL_MS =
    10 * 60 * 1000;


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

let weatherTimer = null;

let cooldownWasActive = false;

let dashboardCooldownUntil = null;

let previousACStatus = null;

let latestWeatherObservation = null;


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
// DATE HELPERS
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
// CLEAR LIVE DEVICE DATA
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


    /*
     * Weather is intentionally NOT cleared here.
     *
     * OpenWeather data is independent from the Master Node.
     */


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
// COOLDOWN
// ========================================================

function startDashboardCooldown() {

    dashboardCooldownUntil =
        Date.now() +
        (3 * 60 * 1000);

    cooldownWasActive =
        true;

    updateCooldownDisplay();
}


function getCooldownRemainingMs() {

    /*
     * Prefer the ESP32/database cooldown timestamp.
     */

    if (
        currentRoomState &&
        currentRoomState.ac_cooldown_until
    ) {

        const cooldownUntil =
            new Date(
                currentRoomState.ac_cooldown_until
            ).getTime();


        if (
            !Number.isNaN(
                cooldownUntil
            )
        ) {

            return Math.max(
                0,
                cooldownUntil -
                Date.now()
            );
        }
    }


    /*
     * Dashboard fallback.
     */

    if (
        dashboardCooldownUntil !== null
    ) {

        return Math.max(
            0,
            dashboardCooldownUntil -
            Date.now()
        );
    }


    return 0;
}


function formatCooldown(
    milliseconds
) {

    const totalSeconds =
        Math.ceil(
            milliseconds /
            1000
        );


    const minutes =
        Math.floor(
            totalSeconds /
            60
        );


    const seconds =
        totalSeconds %
        60;


    return (
        `${minutes}:${String(seconds).padStart(2, "0")}`
    );
}


function updateCooldownDisplay() {

    const commandStatus =
        document.querySelector(
            '[data-rvj="command-status"]'
        );


    if (!commandStatus) {

        return;
    }


    const remainingMs =
        getCooldownRemainingMs();


    if (
        remainingMs > 0
    ) {

        cooldownWasActive =
            true;


        commandStatus.textContent =
            `AC COOLDOWN: ${formatCooldown(remainingMs)} remaining. ` +
            `AC cannot be turned ON yet.`;

        return;
    }


    if (
        dashboardCooldownUntil !== null
    ) {

        dashboardCooldownUntil =
            null;
    }


    if (
        cooldownWasActive
    ) {

        cooldownWasActive =
            false;


        commandStatus.textContent =
            "AC COOLDOWN COMPLETE. Press ON or present RFID to activate.";
    }
}


// ========================================================
// WEATHER
// ========================================================

function displayWeatherUnavailable(
    message
) {

    setText(
        "weather-alert",
        message ||
        "WEATHER UNAVAILABLE"
    );
}


function displayWeatherObservation(
    weather
) {

    if (!weather) {

        displayWeatherUnavailable(
            "NO DATA"
        );

        return;
    }


    latestWeatherObservation =
        weather;


    if (
        !weather.observed_at
    ) {

        displayWeatherUnavailable(
            "NO DATA"
        );

        return;
    }


    /*
     * Never present old weather as current.
     */

    if (
        !isFresh(
            weather.observed_at,
            WEATHER_TIMEOUT_MS
        )
    ) {

        setText(
            "weather-alert",
            "WEATHER DATA STALE"
        );

        return;
    }


    const temperature =
        Number(
            weather.temperature_c
        );


    const feelsLike =
        Number(
            weather.feels_like_c
        );


    const humidity =
        Number(
            weather.humidity
        );


    const condition =
        weather.condition ||
        "Unknown";


    // ----------------------------------------------------
    // KEEP EXISTING DESIGN
    // ----------------------------------------------------
    //
    // We use the existing Weather Alert card.
    //

    let displayText =
        "";


    if (
        Number.isFinite(
            temperature
        )
    ) {

        displayText =
            `${temperature.toFixed(1)}°C`;

    } else {

        displayText =
            "--°C";
    }


    if (
        Number.isFinite(
            feelsLike
        )
    ) {

        displayText +=
            ` | Feels ${feelsLike.toFixed(1)}°C`;
    }


    if (
        Number.isFinite(
            humidity
        )
    ) {

        displayText +=
            ` | ${humidity.toFixed(0)}%`;
    }


    displayText +=
        ` | ${condition}`;


    setText(
        "weather-alert",
        displayText
    );


    // ----------------------------------------------------
    // FULL WEATHER DETAILS ON HOVER
    // ----------------------------------------------------

    getElements(
        "weather-alert"
    ).forEach(
        element => {

            element.title =
                `${weather.location || "Weather"}\n` +
                `Temperature: ${
                    Number.isFinite(temperature)
                        ? temperature.toFixed(1) + "°C"
                        : "--"
                }\n` +
                `Feels Like: ${
                    Number.isFinite(feelsLike)
                        ? feelsLike.toFixed(1) + "°C"
                        : "--"
                }\n` +
                `Humidity: ${
                    Number.isFinite(humidity)
                        ? humidity.toFixed(0) + "%"
                        : "--"
                }\n` +
                `Condition: ${condition}\n` +
                `Observed: ${
                    new Date(
                        weather.observed_at
                    ).toLocaleString(
                        "en-PH"
                    )
                }`;
        }
    );
}


// ========================================================
// LOAD WEATHER DIRECTLY FROM TABLE
// ========================================================

async function loadLatestWeatherObservation() {

    console.log(
        "[RVJ] Loading latest weather observation..."
    );


    try {

        const result =
            await client
                .from(
                    "weather_observations"
                )
                .select(
                    "id, location, temperature_c, feels_like_c, humidity, condition, observed_at"
                )
                .order(
                    "observed_at",
                    {
                        ascending:
                            false
                    }
                )
                .limit(
                    1
                );


        if (
            result.error
        ) {

            console.error(
                "[RVJ] Weather query error:",
                result.error
            );


            displayWeatherUnavailable(
                "WEATHER ERROR"
            );


            return;
        }


        if (
            !result.data ||
            result.data.length === 0
        ) {

            console.log(
                "[RVJ] No weather observations found."
            );


            displayWeatherUnavailable(
                "NO WEATHER DATA"
            );


            return;
        }


        const weather =
            result.data[0];


        console.log(
            "[RVJ] Latest weather:",
            weather
        );


        displayWeatherObservation(
            weather
        );


    } catch (
        error
    ) {

        console.error(
            "[RVJ] Weather load error:",
            error
        );


        displayWeatherUnavailable(
            "WEATHER ERROR"
        );
    }
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


    // ----------------------------------------------------
    // DETECT AC OFF TRANSITION
    // ----------------------------------------------------

    const currentACStatus =
        String(
            data.ac_power ??
            data.ac_status ??
            ""
        )
            .trim()
            .toUpperCase();


    if (
        previousACStatus === "ON" &&
        currentACStatus === "OFF"
    ) {

        startDashboardCooldown();
    }


    previousACStatus =
        currentACStatus;


    // ----------------------------------------------------
    // MASTER LAST SEEN
    // ----------------------------------------------------

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


    // ----------------------------------------------------
    // COOLDOWN
    // ----------------------------------------------------

    updateCooldownDisplay();


    // ----------------------------------------------------
    // CROWD
    // ----------------------------------------------------

    displayCrowdState(
        data
    );


    // ----------------------------------------------------
    // TEMPERATURE
    // ----------------------------------------------------

    updateTemperatureDisplay();


    // ----------------------------------------------------
    // AC
    // ----------------------------------------------------

    setText(
        "ac-status",
        data.ac_power
            ? "ON"
            : "OFF"
    );


    // ----------------------------------------------------
    // RFID
    // ----------------------------------------------------

    setText(
        "rfid-status",
        data.rfid_present
            ? "PRESENT"
            : "REMOVED"
    );


    // ----------------------------------------------------
    // CONTROL MODE
    // ----------------------------------------------------

    setText(
        "control-mode",
        data.ac_control_mode ||
        "RFID"
    );


    // ----------------------------------------------------
    // DOOR
    // ----------------------------------------------------

    setText(
        "door-status",
        data.door_open
            ? "OPEN"
            : "CLOSED"
    );


    // ----------------------------------------------------
    // PERFORMANCE
    // ----------------------------------------------------

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


    // ----------------------------------------------------
    // DEGRADATION
    // ----------------------------------------------------

    displayDegradationState(
        data
    );


    // ----------------------------------------------------
    // LAST UPDATE
    // ----------------------------------------------------

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


    // ----------------------------------------------------
    // ENABLE COMMANDS
    // ----------------------------------------------------

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


    previousACStatus =
        null;


    dashboardCooldownUntil =
        null;


    cooldownWasActive =
        false;


    clearLiveDeviceData();


    disableAdminControls();


    setText(
        "connection-status",
        "CONNECTING"
    );


    await loadRoomState();


    await loadTemperatureReadings();


    /*
     * Weather is global, so it is not tied to classroom
     * selection. We intentionally do not clear it here.
     */


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


            // ------------------------------------------------
            // COMMAND STATUS
            // ------------------------------------------------

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

                        if (
                            command.command ===
                            "ON"
                        ) {

                            updateCooldownDisplay();

                        } else {

                            setText(
                                "command-status",
                                `${command.command} failed.`
                            );
                        }
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
// WEATHER POLLING
// ========================================================

function startWeatherPolling() {

    if (
        weatherTimer
    ) {

        clearInterval(
            weatherTimer
        );
    }


    weatherTimer =
        setInterval(
            loadLatestWeatherObservation,
            WEATHER_POLL_INTERVAL_MS
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


                    updateCooldownDisplay();


                    if (
                        currentRoomState
                    ) {

                        displayCrowdState(
                            currentRoomState
                        );
                    }
                }


                /*
                 * Weather is independent from Master status.
                 * It is refreshed by its own 10-minute timer.
                 */

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
        "[RVJ] sendACCommand():",
        command
    );


    if (
        !masterOnline
    ) {

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

        setText(
            "command-status",
            "Command blocked: crowd density scan in progress."
        );


        return;
    }


    // ====================================================
    // COOLDOWN PROTECTION
    // ====================================================

    if (
        command ===
        "ON"
    ) {

        const cooldownRemaining =
            getCooldownRemainingMs();


        if (
            cooldownRemaining >
            0
        ) {

            cooldownWasActive =
                true;


            setText(
                "command-status",
                `AC COOLDOWN: ${formatCooldown(cooldownRemaining)} remaining. Please wait.`
            );


            console.log(
                "[RVJ] ON blocked by AC cooldown."
            );


            return;
        }
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
        "[RVJ] Inserting into ac_commands:",
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
                "[RVJ] Binding:",
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


    /*
     * Load weather independently from the Master Node.
     */

    await loadLatestWeatherObservation();


    await loadRooms();


    startDatabasePolling();


    startWeatherPolling();


    startFreshnessMonitor();
}


// ========================================================
// PUBLIC API
// ========================================================

window.RVJDashboard = {

    loadRooms,

    loadRoomState,

    loadTemperatureReadings,

    loadLatestWeatherObservation,

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
```

})();

````

### 3. Change only this line in `index.html`

Your current version is:

```html
<script src="dashboard.js?v=25"></script>
````

Change it to:

```html
<script src="dashboard.js?v=26"></script>
```

Do **not** add another weather script to `index.html`.

### 4. What your existing Weather Alert card will show

Your current HTML stays:

```html
<span class="card-title">Weather Alert</span>
<span class="card-value" data-rvj="weather-alert">NORMAL</span>
```

The value will become something like:

```text
31.4°C | Feels 35.2°C | 68% | Clouds
```

The full location, feels-like value, humidity, condition, and observation time are available by hovering over the value.

The JavaScript is using Supabase's normal table query with `.select()`, `.order()`, and `.limit(1)`, which is the documented way to retrieve the newest row.

### 5. Test it

Before opening the page, make sure `weather_observations` actually contains data:

```sql
SELECT *
FROM public.weather_observations
ORDER BY observed_at DESC
LIMIT 1;
```

Then:

**Ctrl + F5**

Open **F12 → Console**.

You should see:

```text
[RVJ] dashboard.js loaded.
[RVJ] Loading latest weather observation...
[RVJ] Latest weather: ...
```

If the table has a row and the RLS policy is correct, the existing **Weather Alert** card should display it.

This setup deliberately removes the broken `get_latest_weather_observation()` RPC from the dashboard, so the previous **404 cannot occur on the weather query anymore**.
