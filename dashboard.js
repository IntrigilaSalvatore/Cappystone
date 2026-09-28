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
        "[RVJ] dashboard.js v99 loaded (Hard 3-Minute Hold Latch active)."
    );


    // ========================================================
    // FRESHNESS (3-MINUTE ALLOWANCE)
    // ========================================================

    const MASTER_TIMEOUT_MS =
        3 * 60 * 1000; // 3 minutes (180,000 ms)


    const TEMPERATURE_TIMEOUT_MS =
        3 * 60 * 1000; // 3 minutes (180,000 ms)


    const CROWD_TIMEOUT_MS =
        10 * 60 * 1000;


    const WEATHER_TIMEOUT_MS =
        10 * 60 * 1000;


    const POLL_INTERVAL_MS =
        10000;


    const WEATHER_POLL_INTERVAL_MS =
        60000;


    const FRESHNESS_INTERVAL_MS =
        1000;


    const DASHBOARD_COOLDOWN_MS =
        3 * 60 * 1000;


    // ========================================================
    // STATE
    // ========================================================

    let rooms = [];

    let currentRoomId = null;

    let currentRoomState = null;

    let latestTemperatureReadings = [];

    let lastMasterSeenAt = null;

    // Hard 3-minute hold timers (prevents momentary UNAVAILABLE flickers)
    let onlineHoldUntilMs = 0;

    let tempHoldUntilMs = 0;

    let lastValidTempValue = null;

    let lastSeenServerSignature = "";

    let latestWeatherData = null;

    let masterOnline = false;

    let realtimeChannel = null;

    let pollTimer = null;

    let weatherPollTimer = null;

    let freshnessTimer = null;

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
    // DATE & FRESHNESS HELPERS
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


        // If age < 0, Supabase's server clock is a few seconds ahead of this laptop's clock,
        // which means the data was JUST created and is 100% fresh.
        if (age < 0) {

            return true;
        }


        return age <= timeoutMs;
    }


    function extendOnlineHold() {

        onlineHoldUntilMs =
            Date.now() +
            MASTER_TIMEOUT_MS;
    }


    function extendTempHold(tempValue) {

        if (Number.isFinite(tempValue)) {

            lastValidTempValue =
                tempValue;

            tempHoldUntilMs =
                Date.now() +
                TEMPERATURE_TIMEOUT_MS;
        }
    }


    function getNewestTimestamp(
        timestamps
    ) {

        let newestDate = null;


        timestamps.forEach(
            ts => {

                const parsed =
                    parseDate(ts);

                if (
                    parsed &&
                    (
                        !newestDate ||
                        parsed.getTime() > newestDate.getTime()
                    )
                ) {

                    newestDate = parsed;
                }
            }
        );


        return newestDate
            ? newestDate.toISOString()
            : null;
    }


    function refreshMasterActivityTimestamp() {

        const candidateTimestamps = [];


        if (currentRoomState) {

            if (currentRoomState.master_last_seen_at) {
                candidateTimestamps.push(
                    currentRoomState.master_last_seen_at
                );
            }

            if (currentRoomState.updated_at) {
                candidateTimestamps.push(
                    currentRoomState.updated_at
                );
            }
        }


        latestTemperatureReadings.forEach(
            reading => {

                if (reading && reading.recorded_at) {
                    candidateTimestamps.push(
                        reading.recorded_at
                    );
                }
            }
        );


        const newestServerTs =
            getNewestTimestamp(
                candidateTimestamps
            );


        if (newestServerTs) {

            lastMasterSeenAt =
                newestServerTs;

            if (
                isFresh(newestServerTs, MASTER_TIMEOUT_MS) ||
                (lastSeenServerSignature !== "" && newestServerTs !== lastSeenServerSignature)
            ) {

                extendOnlineHold();
            }

            lastSeenServerSignature =
                newestServerTs;
        }
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
            "crowd-alert",
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
    // MASTER ONLINE (WITH 3-MINUTE LATCH)
    // ========================================================

    function masterIsActuallyOnline() {

        refreshMasterActivityTimestamp();


        if (Date.now() < onlineHoldUntilMs) {

            return true;
        }


        if (
            isFresh(
                lastMasterSeenAt,
                MASTER_TIMEOUT_MS
            )
        ) {

            extendOnlineHold();
            return true;
        }


        return false;
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


            if (currentRoomState) {

                displayRoomState(currentRoomState);
            }


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

    }


    // ========================================================
    // COOLDOWN
    // ========================================================

    function getCooldownRemainingMs() {

        if (
            dashboardCooldownUntil
        ) {

            return Math.max(
                0,
                dashboardCooldownUntil -
                Date.now()
            );
        }


        if (
            !currentRoomState ||
            !currentRoomState.ac_cooldown_until
        ) {

            return 0;
        }


        const cooldownUntil =
            new Date(
                currentRoomState.ac_cooldown_until
            ).getTime();


        if (
            Number.isNaN(
                cooldownUntil
            )
        ) {

            return 0;
        }


        return Math.max(
            0,
            cooldownUntil -
            Date.now()
        );
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


    function startDashboardCooldown() {

        dashboardCooldownUntil =
            Date.now() +
            DASHBOARD_COOLDOWN_MS;


        cooldownWasActive =
            true;


        updateCooldownDisplay();
    }


    function updateCooldownDisplay() {

        const commandStatus =
            document.querySelector(
                '[data-rvj="command-status"]'
            );


        const remainingMs =
            getCooldownRemainingMs();


        if (
            remainingMs > 0
        ) {

            cooldownWasActive =
                true;


            if (
                commandStatus
            ) {

                commandStatus.textContent =
                    `AC COOLDOWN: ${formatCooldown(remainingMs)} remaining. AC cannot be turned ON yet.`;
            }


            return;
        }


        if (
            dashboardCooldownUntil
        ) {

            dashboardCooldownUntil =
                null;
        }


        if (
            cooldownWasActive
        ) {

            cooldownWasActive =
                false;


            if (
                commandStatus
            ) {

                commandStatus.textContent =
                    "AC COOLDOWN COMPLETE. Press ON or tap RFID to activate.";
            }
        }
    }


   // ========================================================
    // CROWD (ONLY LOW / MEDIUM / HIGH + BUSY BANNER)
    // ========================================================

    let crowdScanWasActive = false;

    function displayCrowdState(
        data
    ) {

        if (
            !masterOnline ||
            !data
        ) {

            setText(
                "crowd-alert",
                "UNAVAILABLE"
            );

            return;
        }


        const scanStatus =
            String(data.crowd_scan_status || "READY")
                .trim()
                .toUpperCase();


        if (
            scanStatus === "CHECKING"
        ) {

            crowdScanWasActive = true;

            // 1. Top Header Badge
            setText(
                "connection-status",
                "SCANNING CROWD..."
            );

            // 2. Top System Overview Banner
            setText(
                "system-status",
                "⏳ BUSY: Master Node is scanning classroom crowd density (~4 seconds). Controls will resume momentarily..."
            );

            // 3. Live Telemetry Card & Degradation Factor
            setText(
                "crowd-alert",
                "SCANNING..."
            );

            setText(
                "crowd-factor",
                "SCANNING..."
            );

            // 4. Bottom Admin Command Output
            setText(
                "command-status",
                "⏳ Master Node is performing a 4-second crowd scan. Admin buttons will unlock momentarily..."
            );

            disableAdminControls();

            return;
        }


        // If scan just finished, restore the normal status messages and unlock buttons
        if (crowdScanWasActive) {

            crowdScanWasActive = false;

            setText(
                "connection-status",
                "DEVICE ONLINE"
            );

            setText(
                "system-status",
                "Master Node is online and reporting."
            );

            if (getCooldownRemainingMs() === 0) {
                setText(
                    "command-status",
                    "Crowd scan complete. Ready for commands."
                );
            }

            enableAdminControls();
        }


        // Display strictly LOW, MEDIUM, or HIGH
        const rawLevel =
            String(data.crowd_level || "LOW")
                .trim()
                .toUpperCase();


        let level = "LOW";

        if (rawLevel === "HIGH" || data.overcrowded === true) {
            level = "HIGH";
        } else if (rawLevel === "MEDIUM" || rawLevel === "MID") {
            level = "MEDIUM";
        } else {
            level = "LOW";
        }


        setText(
            "crowd-alert",
            level
        );
    }

    // ========================================================
    // TEMPERATURE (WITH 3-MINUTE LATCH)
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
            freshReadings.length > 0
        ) {

            let total = 0;

            freshReadings.forEach(
                reading => {
                    total += Number(reading.temperature_c);
                }
            );

            const average =
                total / freshReadings.length;

            extendTempHold(average);

            setText(
                "temperature",
                `${average.toFixed(1)} °C`
            );

            return;
        }


        // Fallback 1: Use avg_temperature_c from room_state
        if (
            currentRoomState &&
            currentRoomState.avg_temperature_c !== null &&
            currentRoomState.avg_temperature_c !== undefined
        ) {

            const roomTemp =
                Number(currentRoomState.avg_temperature_c);

            if (Number.isFinite(roomTemp)) {

                extendTempHold(roomTemp);

                setText(
                    "temperature",
                    `${roomTemp.toFixed(1)} °C`
                );

                return;
            }
        }


        // Fallback 2: Hold last valid temperature for the full 3-minute latch
        if (
            lastValidTempValue !== null &&
            Date.now() < tempHoldUntilMs
        ) {

            setText(
                "temperature",
                `${Number(lastValidTempValue).toFixed(1)} °C`
            );

            return;
        }


        setText(
            "temperature",
            "SENSOR DATA UNAVAILABLE"
        );
    }


    // ========================================================
    // WEATHER
    // ========================================================

    function displayWeatherObservation(
        data
    ) {

        latestWeatherData =
            data;


        const elements =
            getElements(
                "weather-alert"
            );


        if (
            !data
        ) {

            setText(
                "weather-alert",
                "UNAVAILABLE"
            );


            elements.forEach(
                element => {

                    element.removeAttribute(
                        "title"
                    );

                }
            );


            return;
        }


        const observedAt =
            parseDate(
                data.observed_at
            );


        if (
            !observedAt ||
            !isFresh(
                data.observed_at,
                WEATHER_TIMEOUT_MS
            )
        ) {

            setText(
                "weather-alert",
                "UNAVAILABLE"
            );


            elements.forEach(
                element => {

                    element.title =
                        "Latest weather observation is stale.";

                }
            );


            return;
        }


        const temperature =
            Number(
                data.temperature_c
            );


        const feelsLike =
            Number(
                data.feels_like_c
            );


        const humidity =
            Number(
                data.humidity
            );


        const condition =
            data.condition
                ? String(
                    data.condition
                )
                : "UNKNOWN";


        const parts = [];


        if (
            Number.isFinite(
                temperature
            )
        ) {

            parts.push(
                `${temperature.toFixed(1)}°C`
            );
        }


        if (
            Number.isFinite(
                feelsLike
            )
        ) {

            parts.push(
                `Feels ${feelsLike.toFixed(1)}°C`
            );
        }


        if (
            Number.isFinite(
                humidity
            )
        ) {

            parts.push(
                `${humidity.toFixed(0)}%`
            );
        }


        if (
            condition
        ) {

            parts.push(
                condition
            );
        }


        const displayValue =
            parts.length > 0
                ? parts.join(" | ")
                : "UNAVAILABLE";


        setText(
            "weather-alert",
            displayValue
        );


        const location =
            data.location
                ? String(
                    data.location
                )
                : "Unknown location";


        const observedText =
            observedAt.toLocaleString(
                "en-PH"
            );


        elements.forEach(
            element => {

                element.title =
                    `Location: ${location}\n` +
                    `Observed: ${observedText}`;

            }
        );
    }


    async function loadLatestWeatherObservation() {

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
                    )
                    .maybeSingle();


            if (
                result.error
            ) {

                console.error(
                    "[RVJ] Weather query error:",
                    result.error
                );

                return;
            }


            displayWeatherObservation(
                result.data
            );


        } catch (
            error
        ) {

            console.error(
                "[RVJ] Weather loading failed:",
                error
            );
        }
    }


    function startWeatherPolling() {

        if (
            weatherPollTimer
        ) {

            clearInterval(
                weatherPollTimer
            );
        }


        weatherPollTimer =
            setInterval(
                function () {

                    loadLatestWeatherObservation();

                },
                WEATHER_POLL_INTERVAL_MS
            );
    }


// ========================================================
    // AC COOLING PERFORMANCE FORMULA (OPTIMAL vs POOR)
    // ========================================================
    //
    // Uses all available fresh thermometers (1, 2, or 3 nodes):
    //   T_avg    = average of active sensors
    //   T_spread = max(sensor) - min(sensor)
    //   T_eff    = T_avg + (0.5 * T_spread)
    //
    // If T_eff <= 26.0°C -> OPTIMAL
    // If T_eff >  26.0°C -> POOR
    //

    const OPTIMAL_EFFECTIVE_TEMP_MAX_C = 26.0;

    function evaluateCoolingPerformance(
        data
    ) {

        if (
            !masterOnline
        ) {

            setText(
                "performance-status",
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
                    ) &&
                    Number.isFinite(
                        Number(reading.temperature_c)
                    )
            );


        let temps =
            freshReadings.map(
                r => Number(r.temperature_c)
            );


        // Fallback if individual readings list is empty but room_state has avg_temperature_c
        if (
            temps.length === 0 &&
            data &&
            data.avg_temperature_c !== null &&
            data.avg_temperature_c !== undefined &&
            Number.isFinite(Number(data.avg_temperature_c))
        ) {

            temps = [
                Number(data.avg_temperature_c)
            ];
        } else if (
            temps.length === 0 &&
            lastValidTempValue !== null &&
            Date.now() < tempHoldUntilMs
        ) {

            temps = [
                Number(lastValidTempValue)
            ];
        }


        if (
            temps.length === 0
        ) {

            setText(
                "performance-status",
                "UNAVAILABLE"
            );

            return;
        }


        const sum =
            temps.reduce(
                (acc, val) => acc + val,
                0
            );

        const avgTemp =
            sum / temps.length;

        const maxTemp =
            Math.max(...temps);

        const minTemp =
            Math.min(...temps);

        const tempSpread =
            maxTemp - minTemp;

        // Effective thermal index combines mean room temp + spatial imbalance across sensors
        const effectiveTemp =
            avgTemp + (0.5 * tempSpread);

        const status =
            effectiveTemp <= OPTIMAL_EFFECTIVE_TEMP_MAX_C
                ? "OPTIMAL"
                : "POOR";

        setText(
            "performance-status",
            status
        );
    }


    // ========================================================
    // DEGRADATION ANALYSIS (LOW / HIGH + PRIMARY IMPACT RANKING)
    // ========================================================

    function displayDegradationState(
        data
    ) {

        if (
            !masterOnline ||
            !data
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


        // ----------------------------------------------------
        // 1. DOOR OPEN IMPACT (LOW vs HIGH + Severity Score)
        // ----------------------------------------------------
        const isDoorHigh =
            Boolean(data.door_open);

        setText(
            "door-factor",
            isDoorHigh
                ? "HIGH"
                : "LOW"
        );

        let doorSeverity = 0;

        if (isDoorHigh) {
            // Calculate thermal gap across sensors if available
            const temps =
                latestTemperatureReadings
                    .filter(r => isFresh(r.recorded_at, TEMPERATURE_TIMEOUT_MS))
                    .map(r => Number(r.temperature_c))
                    .filter(n => Number.isFinite(n));

            const spread =
                temps.length >= 2
                    ? (Math.max(...temps) - Math.min(...temps))
                    : 1.5;

            // Open door warm-air infiltration has the highest base thermal penalty (1.0+)
            doorSeverity =
                1.0 + Math.max(0, (spread - 1.5) * 0.4);
        }


        // ----------------------------------------------------
        // 2. CROWD DENSITY IMPACT (LOW vs HIGH + Severity Score)
        // ----------------------------------------------------
        const rawCrowdLevel =
            String(data.crowd_level || "LOW")
                .trim()
                .toUpperCase();

        const isCrowdHigh =
            rawCrowdLevel === "HIGH" ||
            Boolean(data.overcrowded) ||
            Number(data.crowd_count || 0) > 40;

        if (
            String(data.crowd_scan_status || "").toUpperCase() === "CHECKING"
        ) {

            setText(
                "crowd-factor",
                "SCANNING..."
            );

        } else {

            setText(
                "crowd-factor",
                isCrowdHigh
                    ? "HIGH"
                    : "LOW"
            );
        }

        let crowdSeverity = 0;

        if (isCrowdHigh) {
            const extraDevices =
                Math.max(0, Number(data.crowd_count || 41) - 40);

            // Occupant metabolic heat load severity (base 0.85 + 0.02 per extra device above 40)
            crowdSeverity =
                0.85 + (extraDevices * 0.02);
        }


        // ----------------------------------------------------
        // 3. OUTDOOR WEATHER IMPACT (LOW vs HIGH + Severity Score)
        // ----------------------------------------------------
        let isWeatherHigh =
            Boolean(data.hot_weather);

        let outdoorTemp =
            Number(data.outdoor_temperature_c || 0);

        let feelsLikeTemp =
            outdoorTemp;

        if (
            latestWeatherData &&
            isFresh(
                latestWeatherData.observed_at,
                WEATHER_TIMEOUT_MS
            )
        ) {

            outdoorTemp =
                Number(latestWeatherData.temperature_c || 0);

            feelsLikeTemp =
                Number(latestWeatherData.feels_like_c || outdoorTemp);

            if (
                outdoorTemp >= 32.0 ||
                feelsLikeTemp >= 35.0
            ) {
                isWeatherHigh = true;
            }
        }

        setText(
            "weather-factor",
            isWeatherHigh
                ? "HIGH"
                : "LOW"
        );

        let weatherSeverity = 0;

        if (isWeatherHigh) {
            const degreesOver =
                Math.max(
                    0,
                    feelsLikeTemp - 35.0,
                    outdoorTemp - 32.0
                );

            // Envelope conductive heat gain severity (base 0.70 + 0.08 per °C above threshold)
            weatherSeverity =
                0.70 + (degreesOver * 0.08);
        }


        // ----------------------------------------------------
        // 4. PRIMARY IMPACT (Predominant Factor or NONE)
        // ----------------------------------------------------
        const highFactors = [];

        if (isDoorHigh) {
            highFactors.push({
                name: "DOOR OPEN",
                severity: doorSeverity
            });
        }

        if (isCrowdHigh) {
            highFactors.push({
                name: "CROWD DENSITY",
                severity: crowdSeverity
            });
        }

        if (isWeatherHigh) {
            highFactors.push({
                name: "OUTDOOR WEATHER",
                severity: weatherSeverity
            });
        }

        if (highFactors.length === 0) {

            // All 3 factors are LOW
            setText(
                "degradation-factor",
                "NONE"
            );

        } else {

            // Sort descending by severity score so the strongest impact wins
            highFactors.sort(
                (a, b) => b.severity - a.severity
            );

            setText(
                "degradation-factor",
                highFactors[0].name
            );
        }
    }


    // ========================================================
    // DISPLAY ROOM STATE
    // ========================================================

    function displayRoomState(
        data
    ) {

        if (data) {

            currentRoomState =
                data;
        }


        if (
            !currentRoomState
        ) {

            return;
        }


        const activeData =
            currentRoomState;


        const currentACStatus =
            String(
                activeData.ac_power ??
                activeData.ac_status ??
                ""
            )
                .trim()
                .toUpperCase();


        if (
            (previousACStatus === "ON" || previousACStatus === "TRUE") &&
            (currentACStatus === "OFF" || currentACStatus === "FALSE")
        ) {

            startDashboardCooldown();
        }


        previousACStatus =
            currentACStatus;


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


        setText(
            "system-status",
            "Master Node is online and reporting."
        );


        updateCooldownDisplay();


        displayCrowdState(
            activeData
        );


        updateTemperatureDisplay();


        setText(
            "ac-status",
            activeData.ac_power
                ? "ON"
                : "OFF"
        );


        setText(
            "rfid-status",
            activeData.rfid_present
                ? "PRESENT"
                : "REMOVED"
        );


        setText(
            "control-mode",
            activeData.ac_control_mode ||
            "RFID"
        );


        setText(
            "door-status",
            activeData.door_open
                ? "OPEN"
                : "CLOSED"
        );


        evaluateCoolingPerformance(
            activeData
        );


        displayDegradationState(
            activeData
        );


        const latestUpdateTs =
            lastMasterSeenAt ||
            activeData.updated_at ||
            activeData.master_last_seen_at;


        setText(
            "last-update",
            latestUpdateTs
                ? new Date(
                    latestUpdateTs
                ).toLocaleString(
                    "en-PH"
                )
                : "--"
        );


        if (
            activeData.crowd_scan_status !==
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


        updateMasterStatus();


        if (
            masterOnline &&
            currentRoomState
        ) {

            displayRoomState(
                currentRoomState
            );

        } else {

            updateTemperatureDisplay();
        }
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
            result.error ||
            !result.data
        ) {

            if (result.error) {
                console.error(
                    "[RVJ] Room state error:",
                    result.error
                );
            }

            // Do NOT wipe existing UI if a single network poll returns empty
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


        if (
            !room
        ) {

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


        onlineHoldUntilMs =
            0;


        tempHoldUntilMs =
            0;


        lastValidTempValue =
            null;


        lastSeenServerSignature =
            "";


        masterOnline =
            false;


        cooldownWasActive =
            false;


        dashboardCooldownUntil =
            null;


        previousACStatus =
            null;


        clearLiveDeviceData();

        disableAdminControls();


        setText(
            "connection-status",
            "CONNECTING"
        );


        await loadTemperatureReadings();


        await loadRoomState();


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

                        extendOnlineHold();

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

                        extendOnlineHold();

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


                        updateMasterStatus();

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

                        extendOnlineHold();

                        const command =
                            payload.new;


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


                .subscribe();
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


                    await loadTemperatureReadings();

                    await loadRoomState();

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


                        updateCooldownDisplay();


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


            if (
                result.error
            ) {

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


        buttons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    function () {

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

        setupCommandButtons();


        disableAdminControls();


        await loadLatestWeatherObservation();


        startWeatherPolling();


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

})();
