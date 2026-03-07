/**
 * popup.js
 * Dashboard functionality for CivicTag popup
 */

let tracker;
let locationDetector;

function byId(id) {
  return document.getElementById(id);
}

document.addEventListener("DOMContentLoaded", async () => {
  tracker = new ComplaintTracker();
  await tracker.initialize();

  locationDetector = new LocationDetector();
  await locationDetector.initialize();

  setupTabs();
  setupEventListeners();
  await loadDashboard();
  await loadComplaints();
  await loadSettings();
});

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((panel) => panel.classList.remove("active"));

  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const panel = byId(`${tabName}-tab`);
  if (tab) tab.classList.add("active");
  if (panel) panel.classList.add("active");

  if (tabName === "dashboard") loadDashboard();
  if (tabName === "complaints") loadComplaints();
}

function setupEventListeners() {
  byId("open-twitter")?.addEventListener("click", () => chrome.tabs.create({ url: "https://x.com/compose/post" }));
  byId("refresh-data")?.addEventListener("click", async () => {
    await loadDashboard();
    await loadComplaints();
    showNotification("Data refreshed", "success");
  });

  byId("test-connection")?.addEventListener("click", testBackendConnection);
  byId("save-location")?.addEventListener("click", saveLocation);
  byId("use-current-location")?.addEventListener("click", useCurrentLocation);
  byId("save-preferences")?.addEventListener("click", savePreferences);
  byId("export-data")?.addEventListener("click", exportData);
  byId("clear-data")?.addEventListener("click", clearData);

  byId("default-state")?.addEventListener("change", (e) => updateCityOptions(e.target.value));
}

async function loadDashboard() {
  try {
    const stats = await tracker.getStatistics();
    if (byId("stat-total")) byId("stat-total").textContent = stats.total;
    if (byId("stat-open")) byId("stat-open").textContent = stats.open;
    if (byId("stat-resolved")) byId("stat-resolved").textContent = stats.resolved;
    if (byId("stat-rate")) byId("stat-rate").textContent = `${stats.responseRate}%`;

    const followUps = await tracker.checkFollowUps();
    const followUpSection = byId("follow-up-section");
    if (followUpSection) {
      followUpSection.innerHTML = followUps.length
        ? `<div class="notification warning"><strong>${followUps.length} complaint(s) need follow-up.</strong></div>`
        : "";
    }
  } catch (error) {
    console.error("Error loading dashboard:", error);
  }
}

async function loadComplaints() {
  try {
    const complaints = await tracker.getAllComplaints();
    const complaintList = byId("complaint-list");
    if (!complaintList) return;

    if (!complaints.length) {
      complaintList.innerHTML = `<div class="empty-state"><p>No complaints yet.</p></div>`;
      return;
    }

    complaintList.innerHTML = complaints
      .map((c) => {
        const ago = formatTimeAgo(Date.now() - c.timestamp);
        return `<div class="complaint-item ${c.status}">
          <div class="complaint-header"><span class="complaint-category">${c.category}</span><span class="complaint-time">${ago}</span></div>
          <div class="complaint-text">${escapeHtml(c.tweetText || "")}</div>
          <div><span class="complaint-status status-${c.status}">${c.status.toUpperCase()}</span></div>
        </div>`;
      })
      .join("");
  } catch (error) {
    console.error("Error loading complaints:", error);
  }
}

async function loadSettings() {
  const result = await chrome.storage.local.get([
    "userState",
    "userCity",
    "userDistrict",
    "enableTweetRewriter",
    "enable48hReminder",
    "enable7dReminder"
  ]);

  const stateSelect = byId("default-state");
  if (stateSelect) {
    const states = locationDetector.getAllStates();
    states.forEach((state) => {
      if ([...stateSelect.options].some((o) => o.value === state)) return;
      const option = document.createElement("option");
      option.value = state;
      option.textContent = state;
      stateSelect.appendChild(option);
    });
  }

  if (result.userState && byId("default-state")) {
    byId("default-state").value = result.userState;
    updateCityOptions(result.userState);
  }
  if (result.userCity && byId("default-city")) byId("default-city").value = result.userCity;
  if (result.userDistrict && byId("default-district")) byId("default-district").value = result.userDistrict;

  if (byId("enable-tweet-rewriter")) byId("enable-tweet-rewriter").checked = result.enableTweetRewriter !== false;
  if (byId("enable-48h-reminder")) byId("enable-48h-reminder").checked = result.enable48hReminder !== false;
  if (byId("enable-7d-reminder")) byId("enable-7d-reminder").checked = result.enable7dReminder !== false;
}

function updateCityOptions(state) {
  const cityInput = byId("default-city");
  if (!state || !cityInput) return;
  const cities = locationDetector.getCitiesForState(state);
  if (cities.length > 0) {
    cityInput.placeholder = `e.g., ${cities[0]}`;
  }
}

async function testBackendConnection() {
  const btn = byId("test-connection");
  const statusDiv = byId("backend-status");
  if (btn) { btn.textContent = "Testing…"; btn.disabled = true; }
  try {
    const backendUrl = (typeof CIVICTAG_CONFIG !== 'undefined' ? CIVICTAG_CONFIG.BACKEND_URL : 'https://civictag-api.vercel.app');
    const response = await fetch(`${backendUrl}/api/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CivicTag-Client": "1" },
      body: JSON.stringify({ tweetText: "Test connection" })
    });
    if (response.ok || response.status === 400) {
      showNotification("✅ Backend is reachable!", "success");
      if (statusDiv) statusDiv.innerHTML = "<strong>✅ Connected — backend is online!</strong><br>CivicTag AI is ready.";
    } else {
      showNotification(`Backend returned ${response.status}`, "warning");
    }
  } catch (err) {
    showNotification("❌ Could not reach backend", "error");
    if (statusDiv) statusDiv.innerHTML = "<strong>❌ Backend unreachable</strong><br>Check your internet connection.";
  } finally {
    if (btn) { btn.textContent = "Test Connection"; btn.disabled = false; }
  }
}

async function saveLocation() {
  const userState = byId("default-state")?.value || "";
  const userCity = byId("default-city")?.value.trim() || "";
  const userDistrict = byId("default-district")?.value.trim() || "";

  if (!userState || !userCity) {
    showNotification("State and city are required", "warning");
    return;
  }

  await chrome.storage.local.set({
    userState,
    userCity,
    userDistrict,
    userSuburb: null
  });
  showNotification("Location saved", "success");
}

async function useCurrentLocation() {
  if (!navigator.geolocation) {
    showNotification("Geolocation is not supported", "error");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
          { headers: { "User-Agent": "CivicTag-Extension/2.0", "Accept-Language": "en" } }
        );
        const data = await res.json();
        const a = data.address || {};
        if (byId("default-state")) byId("default-state").value = a.state || "";
        if (byId("default-city")) byId("default-city").value = a.city || a.town || a.village || "";
        if (byId("default-district")) byId("default-district").value = a.county || a.state_district || "";
        showNotification("Current location loaded", "success");
      } catch {
        showNotification("Failed to resolve location", "error");
      }
    },
    () => showNotification("Location permission denied", "error"),
    { timeout: 10000, maximumAge: 300000 }
  );
}

async function savePreferences() {
  await chrome.storage.local.set({
    enableTweetRewriter: !!byId("enable-tweet-rewriter")?.checked,
    enable48hReminder: !!byId("enable-48h-reminder")?.checked,
    enable7dReminder: !!byId("enable-7d-reminder")?.checked
  });
  showNotification("Preferences saved", "success");
}

async function exportData() {
  try {
    const data = await tracker.exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `civictag-complaints-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    showNotification("Export failed", "error");
  }
}

async function clearData() {
  if (!confirm("Clear all complaint data?")) return;
  try {
    await tracker.clearAllData();
    await chrome.storage.local.remove(["complaint_history", "community_complaints", "authority_tag_counts"]);
    await loadDashboard();
    await loadComplaints();
    showNotification("Data cleared", "success");
  } catch {
    showNotification("Clear failed", "error");
  }
}

function showNotification(message, type = "info") {
  const n = document.createElement("div");
  n.className = `notification ${type}`;
  n.textContent = message;
  n.style.position = "fixed";
  n.style.top = "12px";
  n.style.left = "50%";
  n.style.transform = "translateX(-50%)";
  n.style.zIndex = "9999";
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2500);
}

function formatTimeAgo(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
