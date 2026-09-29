(function () {
    "use strict";

    // ========================================================
    // SUPABASE CONFIG
    // ========================================================
    const SUPABASE_URL = "https://raphpzlmjjzgwohjgczu.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-SIrgE8sT5liBPH0jOSTdA_CREkwiPd";

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        console.error("[RVJ] Supabase JS library was not loaded.");
        return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    console.log("[RVJ] dashboard.js loaded (User attribution & Hard 3-Minute Hold Latch active).");

    // ========================================================
    // CONSTANTS & TIMEOUTS
    // ========================================================
    const MASTER_TIMEOUT_MS = 3 * 60 * 1000;      // 3 minutes
    const TEMPERATURE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
    const WEATHER_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours (always show latest weather)
    const POLL_INTERVAL_MS = 10000;               // 10 seconds
    const WEATHER_POLL_INTERVAL_MS = 60000;        // 60 seconds
    const FRESHNESS_INTERVAL_MS = 1000;           // 1 second
    const DASHBOARD_COOLDOWN_MS = 3 * 60 * 1000;  // 3 minutes
    const OPTIMAL_EFFECTIVE_TEMP_MAX_C = 26.0;
    const AC_EVALUATION_DELAY_MS = 10 * 60 * 1000; // 10 minutes at OPTIMAL before grading
    const MIN_COOLING_DROP_C = 0.5;                // Minimum °C drop required if still > 26°C

    // ========================================================
    // STATE
    // ========================================================
    let acTurnedOnAtMs = 0;
    let acBaselineTempC = null;
    let rooms = [];
    let currentRoomId = null;
    let currentRoomState = null;
    let latestTemperatureReadings = [];
    let lastMasterSeenAt = null;

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
    let crowdScanWasActive = false;

    // ========================================================
    // UI HELPERS
    // ========================================================
    function getElements(name) {
        return document.querySelectorAll(`[data-rvj="${name}"]`);
    }

    function setText(name, value) {
        getElements(name).forEach(element => {
            element.textContent = value;
        });
    }

    function setStatus(name, value) {
        getElements(name).forEach(element => {
            element.dataset.status = value;
        });
    }

    function getCommandDisplayName(command) {
        switch (command) {
            case "ON": return "Force AC ON";
            case "OFF": return "Force AC OFF";
            case "SET_TEMP_LOW": return "LOW temperature";
            case "SET_TEMP_MID": return "MEDIUM temperature";
            case "SET_TEMP_HIGH": return "HIGH temperature";
            case "CLEAR_OVERRIDE": return "Clear Override";
            default: return command;
        }
    }

    // ========================================================
    // DATE & FRESHNESS HELPERS
    // ========================================================
    function parseDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function isFresh(timestamp, timeoutMs) {
        const date = parseDate(timestamp);
        if (!date) return false;
        const age = Date.now() - date.getTime();
        if (age < 0) return true;
        return age <= timeoutMs;
    }

    function extendOnlineHold() {
        onlineHoldUntilMs = Date.now() + MASTER_TIMEOUT_MS;
    }

    function extendTempHold(tempValue) {
        if (Number.isFinite(tempValue)) {
            lastValidTempValue = tempValue;
            tempHoldUntilMs = Date.now() + TEMPERATURE_TIMEOUT_MS;
        }
    }

    function getNewestTimestamp(timestamps) {
        let newestDate = null;
        timestamps.forEach(ts => {
            const parsed = parseDate(ts);
            if (parsed && (!newestDate || parsed.getTime() > newestDate.getTime())) {
                newestDate = parsed;
            }
        });
        return newestDate ? newestDate.toISOString() : null;
    }

    function refreshMasterActivityTimestamp() {
        const candidateTimestamps = [];

        // Only count actual temperature readings so room_state/weather updates
        // cannot falsely keep the badge on DEVICE ONLINE
        latestTemperatureReadings.forEach(reading => {
            if (reading && reading.recorded_at) {
                candidateTimestamps.push(reading.recorded_at);
            }
        });

        const newestServerTs = getNewestTimestamp(candidateTimestamps);
        if (newestServerTs) {
            lastMasterSeenAt = newestServerTs;
            if (isFresh(newestServerTs, TEMPERATURE_TIMEOUT_MS)) {
                if (lastSeenServerSignature !== "" && newestServerTs !== lastSeenServerSignature) {
                    extendOnlineHold();
                }
            }
            lastSeenServerSignature = newestServerTs;
        }
    }
    
    // ========================================================
    // ADMIN CONTROLS ENABLING / DISABLING
    // ========================================================
    function disableAdminControls() {
        document.querySelectorAll("[data-ac-command]").forEach(button => {
            button.disabled = true;
        });
    }

    function enableAdminControls() {
        document.querySelectorAll("[data-ac-command]").forEach(button => {
            button.disabled = false;
        });
    }

    // ========================================================
    // CLEAR LIVE DATA
    // ========================================================
    function clearLiveDeviceData() {
        setText("temperature", "UNAVAILABLE");
        setText("ac-status", "UNAVAILABLE");
        setText("rfid-status", "UNAVAILABLE");
        setText("control-mode", "UNAVAILABLE");
        setText("door-status", "UNAVAILABLE");
        setText("crowd-alert", "UNAVAILABLE");
        setText("performance-score", "UNAVAILABLE");
        setText("performance-status", "UNAVAILABLE");
        setText("door-factor", "UNAVAILABLE");
        setText("crowd-factor", "UNAVAILABLE");
        setText("weather-factor", "UNAVAILABLE");
        setText("degradation-factor", "UNAVAILABLE");
        setText("last-update", "UNAVAILABLE");
    }

    // ========================================================
    // MASTER ONLINE MONITOR
    // ========================================================
    function masterIsActuallyOnline() {
        refreshMasterActivityTimestamp();
        if (Date.now() < onlineHoldUntilMs) return true;
        if (isFresh(lastMasterSeenAt, MASTER_TIMEOUT_MS)) {
            extendOnlineHold();
            return true;
        }
        return false;
    }

    function updateMasterStatus() {
        const online = masterIsActuallyOnline();
        if (online === masterOnline) return;

        masterOnline = online;
        console.log("[RVJ] Master online status:", masterOnline);

        if (masterOnline) {
            setText("connection-status", "DEVICE ONLINE");
            setStatus("connection-status", "connected");
            enableAdminControls();
            setText("system-status", "Master Node is online and reporting.");
            if (currentRoomState) displayRoomState(currentRoomState);
        } else {
            setText("connection-status", "DEVICE OFFLINE");
            setStatus("connection-status", "offline");
            disableAdminControls();
            setText("temperature", "UNAVAILABLE");
            setText("system-status", "Master Node is offline or its Internet connection is unavailable.");
            if (currentRoomState) displayRoomState(currentRoomState);
        }
    }

    // ========================================================
    // ROOM DISPLAY
    // ========================================================
    function displayRoom(room) {
        setText("room-code", room.room_code || "--");
        setText("room-name", room.room_name || "--");
        setText("room-location", room.location || "--");
    }

    // ========================================================
    // COOLDOWN LOGIC
    // ========================================================
    function getCooldownRemainingMs() {
        if (dashboardCooldownUntil) {
            return Math.max(0, dashboardCooldownUntil - Date.now());
        }
        if (!currentRoomState || !currentRoomState.ac_cooldown_until) {
            return 0;
        }
        const cooldownUntil = new Date(currentRoomState.ac_cooldown_until).getTime();
        return Number.isNaN(cooldownUntil) ? 0 : Math.max(0, cooldownUntil - Date.now());
    }

    function formatCooldown(milliseconds) {
        const totalSeconds = Math.ceil(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function startDashboardCooldown() {
        dashboardCooldownUntil = Date.now() + DASHBOARD_COOLDOWN_MS;
        cooldownWasActive = true;
        updateCooldownDisplay();
    }

    function updateCooldownDisplay() {
        const commandStatus = document.querySelector('[data-rvj="command-status"]');
        const remainingMs = getCooldownRemainingMs();

        if (remainingMs > 0) {
            cooldownWasActive = true;
            if (commandStatus) {
                commandStatus.textContent = `AC COOLDOWN: ${formatCooldown(remainingMs)} remaining. AC cannot be turned ON yet.`;
            }
            return;
        }

        if (dashboardCooldownUntil) dashboardCooldownUntil = null;

        if (cooldownWasActive) {
            cooldownWasActive = false;
            if (commandStatus) {
                commandStatus.textContent = "AC COOLDOWN COMPLETE. Press ON or tap RFID to activate.";
            }
        }
    }

    // ========================================================
    // CROWD MONITORING
    // ========================================================
    function displayCrowdState(data) {
        if (!data) {
            setText("crowd-alert", "UNAVAILABLE");
            return;
        }

        const scanStatus = String(data.crowd_scan_status || "READY").trim().toUpperCase();

        if (scanStatus === "CHECKING") {
            crowdScanWasActive = true;
            setText("connection-status", "SCANNING CROWD...");
            setText("system-status", "⏳ BUSY: Master Node is scanning classroom crowd density (~4 seconds). Controls will resume momentarily...");
            setText("crowd-alert", "SCANNING...");
            setText("crowd-factor", "SCANNING...");
            setText("command-status", "⏳ Master Node is performing a 4-second crowd scan. Admin buttons will unlock momentarily...");
            disableAdminControls();
            return;
        }

        if (crowdScanWasActive) {
            crowdScanWasActive = false;
            setText("connection-status", "DEVICE ONLINE");
            setText("system-status", "Master Node is online and reporting.");
            if (getCooldownRemainingMs() === 0) {
                setText("command-status", "Crowd scan complete. Ready for commands.");
            }
            enableAdminControls();
        }

        const rawLevel = String(data.crowd_level || "LOW").trim().toUpperCase();
        let level = "LOW";
        if (rawLevel === "HIGH" || data.overcrowded === true) {
            level = "HIGH";
        } else if (rawLevel === "MEDIUM" || rawLevel === "MID") {
            level = "MEDIUM";
        } else {
            level = "LOW";
        }

        setText("crowd-alert", level);
    }

    // ========================================================
    // TEMPERATURE DISPLAY
    // ========================================================
    function updateTemperatureDisplay() {
        if (!masterOnline) {
            setText("temperature", "UNAVAILABLE");
            evaluateCoolingPerformance(currentRoomState);
            return;
        }

        const freshReadings = latestTemperatureReadings.filter(reading =>
            isFresh(reading.recorded_at, TEMPERATURE_TIMEOUT_MS)
        );

        if (freshReadings.length > 0) {
            let total = 0;
            freshReadings.forEach(reading => {
                total += Number(reading.temperature_c);
            });
            const average = total / freshReadings.length;
            extendTempHold(average);
            setText("temperature", `${average.toFixed(1)} °C`);
            evaluateCoolingPerformance(currentRoomState);
            return;
        }

        if (lastValidTempValue !== null && Date.now() < tempHoldUntilMs) {
            setText("temperature", `${Number(lastValidTempValue).toFixed(1)} °C`);
            evaluateCoolingPerformance(currentRoomState);
            return;
        }

        setText("temperature", "SENSOR DATA UNAVAILABLE");
        evaluateCoolingPerformance(currentRoomState);
    }

    // ========================================================
    // WEATHER OBSERVATION
    // ========================================================
    function displayWeatherObservation(data) {
        latestWeatherData = data;
        const elements = getElements("weather-alert");

        if (!data) {
            setText("weather-alert", "UNAVAILABLE");
            elements.forEach(element => element.removeAttribute("title"));
            return;
        }

        const observedAt = parseDate(data.observed_at);
        if (!observedAt || !isFresh(data.observed_at, WEATHER_TIMEOUT_MS)) {
            setText("weather-alert", "UNAVAILABLE");
            elements.forEach(element => {
                element.title = "Latest weather observation is stale.";
            });
            return;
        }

        const temperature = Number(data.temperature_c);
        const feelsLike = Number(data.feels_like_c);
        const humidity = Number(data.humidity);
        const condition = data.condition ? String(data.condition) : "UNKNOWN";

        const parts = [];
        if (Number.isFinite(temperature)) parts.push(`${temperature.toFixed(1)}°C`);
        if (Number.isFinite(feelsLike)) parts.push(`Feels ${feelsLike.toFixed(1)}°C`);
        if (Number.isFinite(humidity)) parts.push(`${humidity.toFixed(0)}%`);
        if (condition) parts.push(condition);

        const displayValue = parts.length > 0 ? parts.join(" | ") : "UNAVAILABLE";
        setText("weather-alert", displayValue);

        const location = data.location ? String(data.location) : "Unknown location";
        const observedText = observedAt.toLocaleString("en-PH");

        elements.forEach(element => {
            element.title = `Location: ${location}\nObserved: ${observedText}`;
        });
    }

    async function loadLatestWeatherObservation() {
        try {
            const result = await client
                .from("weather_observations")
                .select("id, location, temperature_c, feels_like_c, humidity, condition, observed_at")
                .order("observed_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (result.error) {
                console.error("[RVJ] Weather query error:", result.error);
                return;
            }
            displayWeatherObservation(result.data);
        } catch (error) {
            console.error("[RVJ] Weather loading failed:", error);
        }
    }

    function startWeatherPolling() {
        if (weatherPollTimer) clearInterval(weatherPollTimer);
        weatherPollTimer = setInterval(loadLatestWeatherObservation, WEATHER_POLL_INTERVAL_MS);
    }

    // ========================================================
    // COOLING PERFORMANCE EVALUATION
    // ========================================================
    function evaluateCoolingPerformance(data) {

        const stateData = data || currentRoomState;
        const isAcOn = Boolean(
            stateData && (
                stateData.ac_power === true ||
                String(stateData.ac_power).toUpperCase() === "TRUE" ||
                String(stateData.ac_status).toUpperCase() === "ON"
            )
        );

        // 1. When AC is OFF, reset cooling timer & baseline and show AC OFF
        if (!isAcOn) {
            acTurnedOnAtMs = 0;
            acBaselineTempC = null;
            setText("performance-status", "AC OFF");
            return;
        }

        const freshReadings = latestTemperatureReadings.filter(reading =>
            isFresh(reading.recorded_at, TEMPERATURE_TIMEOUT_MS) &&
            Number.isFinite(Number(reading.temperature_c))
        );

        let temps = freshReadings.map(r => Number(r.temperature_c));

        if (temps.length === 0 && lastValidTempValue !== null && Date.now() < tempHoldUntilMs) {
            temps = [Number(lastValidTempValue)];
        }

        const avgTemp = temps.length > 0
            ? (temps.reduce((acc, val) => acc + val, 0) / temps.length)
            : NaN;

        // 2. Start the 10-minute timer & record baseline temp when AC turns ON
        if (acTurnedOnAtMs === 0) {
            acTurnedOnAtMs = Date.now();
        }
        if (acBaselineTempC === null && Number.isFinite(avgTemp)) {
            acBaselineTempC = avgTemp;
        }

        // 3. Always display OPTIMAL for the first 10 minutes so the AC has time to cool the room
        if (Date.now() - acTurnedOnAtMs < AC_EVALUATION_DELAY_MS) {
            setText("performance-status", "OPTIMAL");
            return;
        }

        if (temps.length === 0) {
            setText("performance-status", "WAITING FOR DATA");
            return;
        }

        // 4. After 10 minutes, evaluate if room reached <= 26°C OR cooled by at least 0.5°C
        const maxTemp = Math.max(...temps);
        const minTemp = Math.min(...temps);
        const tempSpread = maxTemp - minTemp;
        const effectiveTemp = avgTemp + (0.5 * tempSpread);
        const tempDrop = acBaselineTempC !== null ? (acBaselineTempC - avgTemp) : 0;

        const isOptimal =
            (effectiveTemp <= OPTIMAL_EFFECTIVE_TEMP_MAX_C) ||
            (tempDrop >= MIN_COOLING_DROP_C);

        setText("performance-status", isOptimal ? "OPTIMAL" : "POOR");
    }

    // ========================================================
    // DEGRADATION ANALYSIS
    // ========================================================
    function isBurningHotSunnyWeather(weather) {
        if (!weather || !isFresh(weather.observed_at, WEATHER_TIMEOUT_MS)) {
            return false;
        }
        const now = new Date();
        const hour = now.getHours() + (now.getMinutes() / 60);
        const isDaytime = (hour >= 6.0 && hour <= 17.5);

        if (!isDaytime) return false;

        const condition = String(weather.condition || "").toLowerCase();
        if (condition.includes("rain") || condition.includes("storm") || condition.includes("drizzle") || condition.includes("thunder")) {
            return false;
        }

        const tempC = Number(weather.temperature_c);
        const feelsC = Number(weather.feels_like_c);
        return ((Number.isFinite(tempC) && tempC >= 34.0) || (Number.isFinite(feelsC) && feelsC >= 39.0));
    }

    function displayDegradationState(data) {
      if (!data) return;

        const doorActive = Boolean(data.door_open);
        setText("door-factor", doorActive ? "HIGH" : "LOW");

        let crowdActive = false;
        if (data.crowd_scan_status === "CHECKING") {
            setText("crowd-factor", "CHECKING");
        } else {
            crowdActive = Boolean(data.overcrowded);
            setText("crowd-factor", crowdActive ? "HIGH" : "LOW");
        }

        const weatherActive = isBurningHotSunnyWeather(latestWeatherData);
        setText("weather-factor", weatherActive ? "HIGH" : "LOW");

        let primaryFactor = "NONE";
        if (doorActive) primaryFactor = "DOOR / WINDOW OPEN";
        else if (crowdActive) primaryFactor = "OVERCROWDING";
        else if (weatherActive) primaryFactor = "HIGH OUTDOOR HEAT";

        setText("degradation-factor", primaryFactor);
    }

    // ========================================================
    // DISPLAY ROOM STATE
    // ========================================================
    function displayRoomState(data) {
        if (data) currentRoomState = data;
        if (!currentRoomState) return;

        const activeData = currentRoomState;
        const currentACStatus = String(activeData.ac_power ?? activeData.ac_status ?? "").trim().toUpperCase();

        if ((previousACStatus === "ON" || previousACStatus === "TRUE") && (currentACStatus === "OFF" || currentACStatus === "FALSE")) {
            startDashboardCooldown();
        }

        previousACStatus = currentACStatus;
        masterOnline = masterIsActuallyOnline();

        if (!masterOnline) {
            disableAdminControls();
            setText("connection-status", "DEVICE OFFLINE");
            setStatus("connection-status", "offline");
            setText("system-status", "Master Node is offline or its Internet connection is unavailable.");
        } else {
            setText("connection-status", "DEVICE ONLINE");
            setStatus("connection-status", "connected");
            setText("system-status", "Master Node is online and reporting.");
        }

        updateCooldownDisplay();
        displayCrowdState(activeData);
        updateTemperatureDisplay();

        setText("ac-status", activeData.ac_power ? "ON" : "OFF");
        setText("rfid-status", activeData.rfid_present ? "PRESENT" : "REMOVED");
        setText("control-mode", activeData.ac_control_mode || "RFID");
        setText("door-status", activeData.door_open ? "OPEN" : "CLOSED");

        evaluateCoolingPerformance(activeData);
        displayDegradationState(activeData);

        const latestUpdateTs = lastMasterSeenAt || activeData.updated_at || activeData.master_last_seen_at;
        setText("last-update", latestUpdateTs ? new Date(latestUpdateTs).toLocaleString("en-PH") : "--");

        if (masterOnline && activeData.crowd_scan_status !== "CHECKING") {
            enableAdminControls();
        }
    }

    // ========================================================
    // TEMPERATURE READINGS LOADING
    // ========================================================
    async function loadTemperatureReadings() {
        if (!currentRoomId) return;

        const result = await client
            .from("temperature_readings")
            .select("id, device_id, temperature_c, recorded_at")
            .eq("room_id", currentRoomId)
            .order("recorded_at", { ascending: false })
            .limit(20);

        if (result.error) {
            console.error("[RVJ] Temperature query error:", result.error);
            updateTemperatureDisplay();
            return;
        }

        const newestByDevice = new Map();
        (result.data || []).forEach(reading => {
            if (!newestByDevice.has(reading.device_id)) {
                newestByDevice.set(reading.device_id, reading);
            }
        });

        latestTemperatureReadings = Array.from(newestByDevice.values());
        updateMasterStatus();

        if (masterOnline && currentRoomState) {
            displayRoomState(currentRoomState);
        } else {
            updateTemperatureDisplay();
        }
    }

    // ========================================================
    // ROOM STATE LOADING
    // ========================================================
    async function loadRoomState() {
        if (!currentRoomId) return;

        const result = await client
            .from("room_state")
            .select("*")
            .eq("room_id", currentRoomId)
            .maybeSingle();

        if (result.error || !result.data) {
            if (result.error) console.error("[RVJ] Room state error:", result.error);
            return;
        }

        displayRoomState(result.data);
    }

    // ========================================================
    // ROOMS LOADING
    // ========================================================
    async function loadRooms() {
        const result = await client
            .from("rooms")
            .select("*")
            .eq("active", true)
            .order("room_code");

        if (result.error) {
            showError(result.error.message);
            return false;
        }

        rooms = result.data || [];
        if (rooms.length === 0) {
            showError("No active classrooms found.");
            return false;
        }

        setupRoomSelector();

        const savedRoom = localStorage.getItem("rvj_selected_room");
        const savedExists = rooms.some(room => String(room.id) === String(savedRoom));

        await selectRoom(savedExists ? Number(savedRoom) : Number(rooms[0].id));
        return true;
    }

    function setupRoomSelector() {
        getElements("room-selector").forEach(selector => {
            selector.innerHTML = "";
            rooms.forEach(room => {
                const option = document.createElement("option");
                option.value = room.id;
                option.textContent = `${room.room_code} - ${room.room_name}`;
                selector.appendChild(option);
            });

            selector.onchange = async function () {
                await selectRoom(Number(selector.value));
            };
        });
    }

    async function selectRoom(roomId) {
        const room = rooms.find(item => Number(item.id) === Number(roomId));
        if (!room) return;

        currentRoomId = Number(room.id);
        localStorage.setItem("rvj_selected_room", String(room.id));

        getElements("room-selector").forEach(selector => {
            selector.value = String(room.id);
        });

        displayRoom(room);

        if (realtimeChannel) {
            await client.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }

        currentRoomState = null;
        latestTemperatureReadings = [];
        lastMasterSeenAt = null;
        onlineHoldUntilMs = 0;
        tempHoldUntilMs = 0;
        lastValidTempValue = null;
        lastSeenServerSignature = "";
        masterOnline = false;
        cooldownWasActive = false;
        dashboardCooldownUntil = null;
        previousACStatus = null;

        clearLiveDeviceData();
        disableAdminControls();
        setText("connection-status", "CONNECTING");

        await loadTemperatureReadings();
        await loadRoomState();
        subscribeToRealtime();
    }

    // ========================================================
    // REALTIME SUBSCRIPTIONS
    // ========================================================
    function subscribeToRealtime() {
        if (!currentRoomId) return;

        const roomId = currentRoomId;
        realtimeChannel = client
            .channel(`rvj-room-${roomId}-${Date.now()}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "room_state", filter: `room_id=eq.${roomId}` },
                payload => {
        
                    displayRoomState(payload.new);
                }
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "temperature_readings", filter: `room_id=eq.${roomId}` },
                payload => {
                    extendOnlineHold();
                    const index = latestTemperatureReadings.findIndex(reading => reading.device_id === payload.new.device_id);
                    if (index === -1) {
                        latestTemperatureReadings.push(payload.new);
                    } else {
                        latestTemperatureReadings[index] = payload.new;
                    }
                    updateMasterStatus();
                    updateTemperatureDisplay();
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "ac_commands", filter: `room_id=eq.${roomId}` },
                payload => {
                    
                    const command = payload.new;
                    if (!command) return;

                    if (command.status === "EXECUTED") {
                        setText("command-status", `${getCommandDisplayName(command.command)} executed successfully.`);
                    } else if (command.status === "FAILED") {
                        if (command.command === "ON") {
                            updateCooldownDisplay();
                        } else {
                            setText("command-status", `${command.command} failed.`);
                        }
                    }
                }
            )
            .subscribe();
    }

    // ========================================================
    // POLLING & MONITOR TIMERS
    // ========================================================
    function startDatabasePolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async function () {
            if (!currentRoomId) return;
            await loadTemperatureReadings();
            await loadRoomState();
        }, POLL_INTERVAL_MS);
    }

    function startFreshnessMonitor() {
        if (freshnessTimer) clearInterval(freshnessTimer);
        freshnessTimer = setInterval(function () {
            if (!currentRoomId) return;
            updateMasterStatus();
            if (masterOnline) {
                updateTemperatureDisplay();
                updateCooldownDisplay();
                if (currentRoomState) {
                    displayCrowdState(currentRoomState);
                }
            }
        }, FRESHNESS_INTERVAL_MS);
    }

    // ========================================================
    // SEND COMMAND FUNCTION (Attaches Logged-In Username)
    // ========================================================
    async function sendACCommand(command) {
        if (!masterOnline) {
            setText("command-status", "Command blocked: Master Node is offline.");
            return;
        }

        if (currentRoomState && currentRoomState.crowd_scan_status === "CHECKING") {
            setText("command-status", "Command blocked: crowd density scan in progress.");
            return;
        }

        if (command === "ON") {
            const cooldownRemaining = getCooldownRemainingMs();
            if (cooldownRemaining > 0) {
                cooldownWasActive = true;
                setText("command-status", `AC COOLDOWN: ${formatCooldown(cooldownRemaining)} remaining. Please wait.`);
                return;
            }
        }

        const validCommands = ["ON", "OFF", "SET_TEMP_LOW", "SET_TEMP_MID", "SET_TEMP_HIGH", "CLEAR_OVERRIDE"];
        if (!validCommands.includes(command)) return;

        const displayName = getCommandDisplayName(command);
        setText("command-status", `Sending ${displayName}...`);

        try {
            const activeUser = localStorage.getItem("current_user") || "ADMIN";
            const result = await client.from("ac_commands").insert({
                room_id: currentRoomId,
                command: command,
                source: activeUser, // Records user responsible for action
                status: "PENDING"
            });

            if (result.error) {
                setText("command-status", `ERROR: ${result.error.message}`);
                return;
            }

            setText("command-status", `${displayName} command sent. Waiting for Master Node`);
        } catch (error) {
            setText("command-status", `ERROR: ${error.message}`);
        }
    }

    // ========================================================
    // BUTTON LISTENERS
    // ========================================================
    function setupCommandButtons() {
        document.querySelectorAll("[data-ac-command]").forEach(button => {
            button.addEventListener("click", function () {
                sendACCommand(button.dataset.acCommand);
            });
        });
    }

    function showError(message) {
        console.error("[RVJ Dashboard]", message);
        setText("system-status", message);
        setText("connection-status", "ERROR");
    }

    // ========================================================
    // STARTUP ENTRYPOINT
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
        getMasterStatus: function () {
            return masterOnline;
        }
    };

    // ========================================================
    // DOM READY LISTENER
    // ========================================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
