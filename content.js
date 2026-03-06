/**
 * content.js
 * CivicTag v2 orchestration for Twitter/X compose flow
 */

let classifier;
let authorityResolver;
let locationDetector;
let spamGuard;
let tracker;
let tweetRewriter;

let sidebar = null;
let composeInputBound = false;
let runningAnalysisId = 0;

async function initialize() {
  try {
    classifier = new ComplaintClassifier();
    await classifier.initialize();

    authorityResolver = new AuthorityResolver();
    await authorityResolver.initialize();

    locationDetector = new LocationDetector();
    await locationDetector.initialize();

    spamGuard = new SpamGuard();

    tracker = new ComplaintTracker();
    await tracker.initialize();

    tweetRewriter = TweetRewriter;

    observeComposeArea();
  } catch (error) {
    console.error("CivicTag: Initialization failed", error);
  }
}

function observeComposeArea() {
  const watcher = setInterval(() => {
    const compose = findComposeBox();
    if (!compose) return;

    injectCivicTagButton(compose);
    bindComposeInput(compose);
  }, 1200);

  // Keep watcher running because Twitter is SPA and re-renders frequently.
  void watcher;
}

function findComposeBox() {
  return (
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  );
}

function injectCivicTagButton(compose) {
  if (document.getElementById("civictag-button")) return;

  const toolbar =
    compose.closest("[role='group']")?.querySelector('[data-testid="toolBar"]') ||
    document.querySelector('[data-testid="toolBar"]');

  const btn = document.createElement("button");
  btn.id = "civictag-button";
  btn.type = "button";
  btn.textContent = "CivicTag";
  btn.style.marginLeft = "8px";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    const text = getTweetText();
    if (!text.trim()) {
      showNotification("Write complaint text first", "warning");
      return;
    }
    await runFullFlow(text);
  });

  if (toolbar) {
    toolbar.appendChild(btn);
  }
}

function bindComposeInput() {
  if (composeInputBound) return;
  const compose = findComposeBox();
  if (!compose) return;

  compose.addEventListener("input", async () => {
    const text = getTweetText();
    if (!text || text.trim().length < 8) {
      removeSidebar();
      return;
    }
    await runFullFlow(text);
  });

  composeInputBound = true;
}

function getTweetText() {
  const compose = findComposeBox();
  return compose ? (compose.innerText || compose.textContent || "") : "";
}

async function runFullFlow(tweetText) {
  const analysisId = ++runningAnalysisId;

  // STEP 2: Debounced classifier (handled inside classifier.classify)
  const classification = await classifier.classify(tweetText);
  if (analysisId !== runningAnalysisId) return;

  if (!classification || !classification.isComplaint || Number(classification.confidence || 0) < 70) {
    removeSidebar();
    return;
  }

  // STEP 3: 4-tier location detection
  const storage = await chrome.storage.local.get(["groqApiKey", "enableTweetRewriter"]);
  const groqApiKey = storage.groqApiKey || null;

  const location = await locationDetector.detectLocation(tweetText, groqApiKey);
  if (analysisId !== runningAnalysisId) return;

  if (!location) {
    removeSidebar();
    return;
  }

  // STEP 4: Resolve authorities dynamically
  const authorities = await authorityResolver.resolveAuthorities(classification, location);

  // STEP 5 + STEP 6
  const [rateLimit, duplicate, consolidation, overload, rewrite] = await Promise.all([
    spamGuard.checkRateLimit(),
    spamGuard.checkDuplicate(classification.department, location),
    spamGuard.checkConsolidation(classification.department, location),
    spamGuard.checkAuthorityOverload(authorities, classification.department),
    storage.enableTweetRewriter === false
      ? Promise.resolve(null)
      : tweetRewriter.rewrite(tweetText, classification, location, groqApiKey)
  ]);

  if (analysisId !== runningAnalysisId) return;

  if (!rateLimit.allowed) {
    showNotification(rateLimit.message || "Rate limit reached", "warning");
  }

  const hashtags = buildHashtags(classification, location);

  renderSidebar({
    tweetText,
    classification,
    location,
    authorities,
    hashtags,
    duplicate,
    consolidation,
    overload,
    rewrite
  });
}

function buildHashtags(classification, location) {
  const list = ["#CivicIssue", "#India"];
  const d = (classification.department || "").toLowerCase();

  if (d.includes("water")) list.push("#WaterSupply");
  if (d.includes("electric")) list.push("#PowerCut");
  if (d.includes("road") || d.includes("pothole")) list.push("#RoadSafety");
  if (d.includes("sanitation") || d.includes("garbage")) list.push("#CleanCity");
  if (d.includes("traffic")) list.push("#TrafficAlert");
  if (d.includes("crime")) list.push("#PublicSafety");

  if (location.state) list.push(`#${location.state.replace(/\s+/g, "")}`);
  return Array.from(new Set(list)).slice(0, 6);
}

function accuracyBadge(location) {
  const source = location.source || "manual";
  if (source === "browser_gps") return "GPS 🟢";
  if (source === "twitter_profile") return "Profile 🟡";
  if (source === "user_settings") return "Settings 🟠";
  return "Manual 🔴";
}

function groupAuthorities(authorities) {
  const grouped = { local: [], state: [], central: [], other: [] };
  (authorities || []).forEach((a) => {
    const level = (a.level || a.tier || "other").toLowerCase();
    if (grouped[level]) grouped[level].push(a);
    else grouped.other.push(a);
  });
  return grouped;
}

function renderSidebar(data) {
  removeSidebar();

  const groups = groupAuthorities(data.authorities);
  const locationLabel = [data.location.city, data.location.state].filter(Boolean).join(", ") || "Location unavailable";

  sidebar = document.createElement("div");
  sidebar.id = "civictag-sidebar";
  sidebar.innerHTML = `
    <div class="civictag-sidebar-header">
      <h3>CivicTag</h3>
      <button id="civictag-close" class="civictag-close" type="button">x</button>
    </div>

    <div class="civictag-section">
      <strong>📍 ${locationLabel}</strong>
      <div><small>${accuracyBadge(data.location)}</small></div>
    </div>

    <div class="civictag-section">
      <strong>🏷️ Issue:</strong> ${escapeHtml(data.classification.department || "General")}
      <div><small>Urgency: ${escapeHtml(data.classification.urgency || "medium")}</small></div>
    </div>

    ${renderAuthorityGroup("Local", groups.local)}
    ${renderAuthorityGroup("State", groups.state)}
    ${renderAuthorityGroup("Central", groups.central)}
    ${renderAuthorityGroup("Other", groups.other)}

    <div class="civictag-section">
      <strong>Hashtags</strong>
      <div>${data.hashtags.map((h) => `<label><input type="checkbox" data-hashtag="${h}" checked> ${h}</label>`).join("<br>")}</div>
    </div>

    ${data.rewrite && data.rewrite.rewrittenTweet && data.rewrite.rewrittenTweet.trim() !== data.tweetText.trim() ? `
      <div class="civictag-section">
        <strong>✨ AI Suggested Tweet Wording</strong>
        <div style="margin-top:8px;">
          <button type="button" id="civictag-tab-original">Original</button>
          <button type="button" id="civictag-tab-improved">Improved</button>
        </div>
        <div id="civictag-text-original" style="margin-top:8px; display:none;">${escapeHtml(data.tweetText)}</div>
        <div id="civictag-text-improved" style="margin-top:8px;">${escapeHtml(data.rewrite.rewrittenTweet)}</div>
        <div style="margin-top:8px;"><label><input type="checkbox" id="civictag-use-improved" checked> Use improved wording</label></div>
      </div>
    ` : ""}

    <div class="civictag-section">
      <div id="civictag-char"></div>
      <button id="civictag-insert" type="button">Insert into Tweet</button>
    </div>
  `;

  document.body.appendChild(sidebar);

  document.getElementById("civictag-close")?.addEventListener("click", removeSidebar);
  document.getElementById("civictag-insert")?.addEventListener("click", () => insertIntoTweet(data));

  document.getElementById("civictag-tab-original")?.addEventListener("click", () => {
    document.getElementById("civictag-text-original").style.display = "block";
    document.getElementById("civictag-text-improved").style.display = "none";
    const c = document.getElementById("civictag-use-improved");
    if (c) c.checked = false;
    updateCharCount(data);
  });

  document.getElementById("civictag-tab-improved")?.addEventListener("click", () => {
    document.getElementById("civictag-text-original").style.display = "none";
    document.getElementById("civictag-text-improved").style.display = "block";
    const c = document.getElementById("civictag-use-improved");
    if (c) c.checked = true;
    updateCharCount(data);
  });

  sidebar.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.addEventListener("change", () => updateCharCount(data));
  });

  updateCharCount(data);
}

function renderAuthorityGroup(title, items) {
  if (!items?.length) return "";
  return `
    <div class="civictag-section">
      <strong>${title} Authorities</strong>
      <div>
        ${items
          .map((a) => `<label><input type="checkbox" data-handle="${a.handle}" checked> ${a.handle} <small>${escapeHtml(a.name || "")}</small></label>`)
          .join("<br>")}
      </div>
    </div>
  `;
}

function selectedHandles() {
  if (!sidebar) return [];
  return Array.from(sidebar.querySelectorAll("input[data-handle]:checked")).map((n) => n.getAttribute("data-handle"));
}

function selectedHashtags() {
  if (!sidebar) return [];
  return Array.from(sidebar.querySelectorAll("input[data-hashtag]:checked")).map((n) => n.getAttribute("data-hashtag"));
}

function updateCharCount(data) {
  if (!sidebar) return;
  const useImproved = !!document.getElementById("civictag-use-improved")?.checked;
  const base = useImproved && data.rewrite?.rewrittenTweet ? data.rewrite.rewrittenTweet : data.tweetText;
  const extra = [...selectedHandles(), ...selectedHashtags()].join(" ");
  const full = `${base}\n\n${extra}`.trim();
  const remaining = 280 - full.length;
  const el = document.getElementById("civictag-char");
  if (el) {
    el.textContent = `${full.length}/280 (${remaining} left)`;
    el.style.color = remaining < 0 ? "#c62828" : remaining < 20 ? "#f9a825" : "#2e7d32";
  }
}

async function insertIntoTweet(data) {
  const compose = findComposeBox();
  if (!compose) return;

  const handles = selectedHandles();
  if (!handles.length) {
    showNotification("Select at least one authority handle", "warning");
    return;
  }

  const tags = [...handles, ...selectedHashtags()].join(" ");
  
  // Get current text from compose box
  const currentText = getTweetText().trim();
  
  // Check if user wants to use improved version
  const useImproved = !!document.getElementById("civictag-use-improved")?.checked;
  
  // Decide which base text to use
  let baseText = currentText;
  if (useImproved && data.rewrite?.rewrittenTweet) {
    baseText = data.rewrite.rewrittenTweet.trim();
  }
  
  // Build final text with tags appended
  const finalText = baseText + "\n\n" + tags;

  // Set the text in the compose box
  compose.focus();
  compose.textContent = finalText;
  
  // Trigger input event so Twitter recognizes the change
  compose.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Move cursor to end
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(compose);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  const complaintData = {
    tweetText: baseMessage,
    category: data.classification.department || "General",
    urgency: data.classification.urgency || "medium",
    location: data.location,
    authorities: handles.map((h) => ({ handle: h })),
    hashtags: selectedHashtags()
  };

  await tracker.saveComplaint(complaintData);
  await spamGuard.recordComplaint(complaintData);
  showNotification("Complaint logged. We will remind you to follow up in 48hrs", "success");
  removeSidebar();
}

function removeSidebar() {
  if (sidebar) {
    sidebar.remove();
    sidebar = null;
  }
}

function showNotification(message, type = "info") {
  console.log(`CivicTag [${type}]:`, message);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

initialize();
