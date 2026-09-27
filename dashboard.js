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


    setText(
        "weather-alert",
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

    let serverCooldownUntil = null;


    if (
        currentRoomState &&
        currentRoomState.ac_cooldown_until
    ) {

        const parsed =
            new Date(
                currentRoomState.ac_cooldown_until
            ).getTime();


        if (
            !Number.isNaN(
                parsed
            )
        ) {

            serverCooldownUntil =
                parsed;
        }
    }


    /*
     * Prefer the ESP32/database cooldown.
     * Use the dashboard local timer only as a fallback.
     */

    if (
        serverCooldownUntil !== null
    ) {

        return Math.max(
            0,
            serverCooldownUntil -
            Date.now()
        );
    }


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
// WEATHER OBSERVATION
// ========================================================

function setWeatherDisplayUnavailable(
    message = "UNAVAILABLE"
) {

    setText(
        "weather-temperature",
        "-- °C"
    );


    setText(
        "weather-feels-like",
        "-- °C"
    );


    setText(
        "weather-humidity",
        "--%"
    );


    setText(
        "weather-condition",
        message
    );


    setText(
        "weather-location",
        "--"
    );


    setText(
        "weather-observed-at",
        "--"
    );
}


function formatWeatherNumber(
    value,
    unit
) {

    const number =
        Number(
            value
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        return (
            "-- " +
            unit
        );
    }


    return (
        number.toFixed(1) +
        " " +
        unit
    );
}


async function loadLatestWeatherObservation() {

    console.log(
        "[RVJ] Loading latest weather observation..."
    );


    try {

        const {
            data,
            error
        } =
            await client.rpc(
                "get_latest_weather_observation"
            );


        if (
            error
        ) {

            console.error(
                "[RVJ] Weather RPC error:",
                error
            );


            setWeatherDisplayUnavailable(
                "ERROR"
            );


            return;
        }


        if (
            !data ||
            !Array.isArray(data) ||
            data.length === 0
        ) {

            console.log(
                "[RVJ] No weather observations found."
            );


            setWeatherDisplayUnavailable(
                "NO DATA"
            );


            return;
        }


        const weather =
            data[0];


        console.log(
            "[RVJ] Latest weather:",
            weather
        );


        // ------------------------------------------------
        // WEATHER FRESHNESS
        // ------------------------------------------------

        if (
            !isFresh(
                weather.observed_at,
                WEATHER_TIMEOUT_MS
            )
        ) {

            setWeatherText(
                "weather-temperature",
                "-- °C"
            );


            setWeatherText(
                "weather-feels-like",
                "-- °C"
            );


            setWeatherText(
                "weather-humidity",
                "--%"
            );


            setWeatherText(
                "weather-condition",
                "DATA STALE"
            );


            setWeatherText(
                "weather-location",
                weather.location ||
                "--"
            );


            setWeatherText(
                "weather-observed-at",
                weather.observed_at
                    ? new Date(
                        weather.observed_at
                    ).toLocaleString(
                        "en-PH"
                    )
                    : "--"
            );


            return;
        }


        // ------------------------------------------------
        // TEMPERATURE
        // ------------------------------------------------

        setWeatherText(
            "weather-temperature",
            formatWeatherNumber(
                weather.temperature_c,
                "°C"
            )
        );


        // ------------------------------------------------
        // FEELS LIKE
        // ------------------------------------------------

        setWeatherText(
            "weather-feels-like",
            formatWeatherNumber(
                weather.feels_like_c,
                "°C"
            )
        );


        // ------------------------------------------------
        // HUMIDITY
        // ------------------------------------------------

        setWeatherText(
            "weather-humidity",
            formatWeatherNumber(
                weather.humidity,
                "%"
            )
        );


        // ------------------------------------------------
        // CONDITION
        // ------------------------------------------------

        setWeatherText(
            "weather-condition",
            weather.condition ||
            "--"
        );


        // ------------------------------------------------
        // LOCATION
        // ------------------------------------------------

        setWeatherText(
            "weather-location",
            weather.location ||
            "--"
        );


        // ------------------------------------------------
        // OBSERVED AT
        // ------------------------------------------------

        if (
            weather.observed_at
        ) {

            const date =
                new Date(
                    weather.observed_at
                );


            if (
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                setWeatherText(
                    "weather-observed-at",
                    date.toLocaleString(
                        "en-PH"
                    )
                );

            } else {

                setWeatherText(
                    "weather-observed-at",
                    weather.observed_at
                );
            }

        } else {

            setWeatherText(
                "weather-observed-at",
                "--"
            );
        }


    } catch (
        error
    ) {

        console.error(
            "[RVJ] Weather load error:",
            error
        );


        setWeatherDisplayUnavailable(
            "ERROR"
        );
    }
}


function setWeatherText(
    name,
    value
) {

    getElements(
        name
    ).forEach(
```
