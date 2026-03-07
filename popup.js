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

  byId("save-api-key")?.addEventListener("click", saveApiKey);
  byId("test-connection")?.addEventListener("click", testGroqConnection);
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
    "groqApiKey",
    "userState",
    "userCity",
    "userDistrict",
    "enableTweetRewriter",
    "enable48hReminder",
    "enable7dReminder"
  ]);

  if (result.groqApiKey && byId("api-key")) {
    byId("api-key").placeholder = "••••••••••••••••";
  }

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

async function saveApiKey() {
  const apiKey = byId("api-key")?.value.trim();
  if (!apiKey) {
    showNotification("Please enter Groq API key", "warning");
    return;
  }
  await chrome.storage.local.set({ groqApiKey: apiKey });
  byId("api-key").value = "";
  byId("api-key").placeholder = "••••••••••••••••";
  showNotification("Groq API key saved", "success");
}

async function testGroqConnection() {
  const apiKey = byId("api-key")?.value.trim();
  if (!apiKey) {
    showNotification("Enter key first", "warning");
    return;
  }
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 6,
        messages: [{ role: "user", content: "Reply OK" }]
      })
    });
    showNotification(response.ok ? "Connection OK" : "Connection failed", response.ok ? "success" : "error");
  } catch {
    showNotification("Connection failed", "error");
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
