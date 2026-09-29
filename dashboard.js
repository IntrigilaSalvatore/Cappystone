// ========================================================
// LOGOUT & SESSION MANAGEMENT
// ========================================================
async function handleLogout() {
    const logId = localStorage.getItem("current_log_id");
    
    if (logId) {
        try {
            await client
                .from("access_logs")
                .update({ 
                    logout_time: new Date().toISOString(),
                    status: "COMPLETED"
                })
                .eq("id", logId);
        } catch (err) {
            console.error("[RVJ] Logout timestamp update failed:", err);
        }
    }

    localStorage.removeItem("access_granted");
    localStorage.removeItem("user_role");
    localStorage.removeItem("current_user");
    localStorage.removeItem("current_log_id");
    window.location.href = "login.html";
}

// Make handleLogout globally available for onclick in HTML
window.handleLogout = handleLogout;

// ========================================================
// ACCESS LOGS (ADMIN ONLY VIEW)
// ========================================================
async function loadAccessLogs() {
    const userRole = localStorage.getItem("user_role") || "FACULTY";
    const currentUser = localStorage.getItem("current_user") || "User";

    // Display Current User Badge in Header
    const userInfoSpan = document.getElementById("userInfo");
    if (userInfoSpan) {
        userInfoSpan.textContent = `${currentUser} (${userRole})`;
    }

    // Hide audit logs panel if user is FACULTY
    const auditPanel = document.getElementById("adminAuditPanel");
    if (userRole !== "ADMIN") {
        if (auditPanel) auditPanel.style.display = "none";
        return;
    }

    // Show panel for ADMIN
    if (auditPanel) auditPanel.style.display = "block";

    try {
        const { data, error } = await client
            .from("access_logs")
            .select("*")
            .order("login_time", { ascending: false })
            .limit(15);

        if (error) {
            console.error("[RVJ] Error loading access logs:", error);
            return;
        }

        const tbody = document.getElementById("accessLogsTableBody");
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding: 10px; text-align: center; color: #64748b;">No login records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(log => {
            const loginStr = log.login_time ? new Date(log.login_time).toLocaleString("en-PH") : "--";
            const logoutStr = log.logout_time ? new Date(log.logout_time).toLocaleString("en-PH") : "Active Session";
            const isOnline = !log.logout_time;

            return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: bold; color: #1e40af;">${log.username}</td>
                    <td style="padding: 8px;">
                        <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background: ${log.user_role === 'ADMIN' ? '#dbeafe' : '#fef3c7'}; color: ${log.user_role === 'ADMIN' ? '#1e40af' : '#92400e'};">
                            ${log.user_role}
                        </span>
                    </td>
                    <td style="padding: 8px; font-size: 12px;">${loginStr}</td>
                    <td style="padding: 8px; font-size: 12px; color: ${isOnline ? '#22c55e' : '#64748b'}; font-weight: ${isOnline ? 'bold' : 'normal'};">${logoutStr}</td>
                    <td style="padding: 8px;">
                        <span style="font-size: 11px; font-weight: bold; color: ${isOnline ? '#22c55e' : '#64748b'};">
                            ${isOnline ? 'ONLINE' : 'LOGGED OUT'}
                        </span>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("[RVJ] Failed to render access logs:", err);
    }
}

// Call loadAccessLogs inside your start() function in dashboard.js
