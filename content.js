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
let sidebarData = null;
let composeInputBound = false;
let runningAnalysisId = 0;
let isInsertingTweet = false;

async function initialize() {
  if (!isContextValid()) return;
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
    if (isContextValid()) {
      console.error("CivicTag: Initialization failed", error);
    }
  }
}

function observeComposeArea() {
  const watcher = setInterval(() => {
    if (!isContextValid()) {
      clearInterval(watcher);
      if (sidebar) removeSidebar();
      return;
    }
    const compose = getComposeBox();
    if (!compose) return;

    injectCivicTagButton(compose);
    bindComposeInput(compose);
  }, 1500);

  // Keep watcher running because Twitter is SPA and re-renders frequently.
  void watcher;
}

function getComposeBox() {
  // Try multiple selectors in order of reliability
  return (
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('[data-testid="tweetTextarea_0_label"]') ||
    document.querySelector('.public-DraftEditor-content') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    null
  );
}

function findComposeBox() {
  return getComposeBox();
}

/**
 * Enhanced getTweetText for Draft.js / Twitter
 */
function getTweetText() {
  const compose = getComposeBox();
  if (!compose) return "";
  
  // Method 1: Draft.js specific (spans with data-text)
  const spans = compose.querySelectorAll('span[data-text="true"]');
  if (spans.length > 0) {
    const text = Array.from(spans).map(s => s.innerText || "").join("");
    if (text.trim()) return text.trim();
  }

  // Method 2: innerText (usually best for contenteditable)
  let text = compose.innerText || "";
  if (text.trim()) return text.trim();

  // Method 3: textContent fallback
  return (compose.textContent || "").trim();
}

function injectCivicTagButton(compose) {
  if (document.getElementById("civictag-button")) return;

  const toolbar =
    compose.closest("[role='group']")?.querySelector('[data-testid="toolBar"]') ||
    document.querySelector('[data-testid="toolBar"]');
  const fallbackHost =
    compose.closest('[data-testid="tweetTextarea_0"]')?.parentElement ||
    compose.closest("[role='dialog']") ||
    compose.parentElement;

  const mountPoint = toolbar || fallbackHost;
  if (!mountPoint) return;

  const btn = document.createElement("button");
  btn.id = "civictag-button";
  btn.type = "button";
  btn.textContent = "CivicTag";
  btn.className = "civictag-inject-btn"; // Use a class for potential styling
  btn.style.marginLeft = "8px";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!isContextValid()) {
      alert("CivicTag extension has been updated. Please refresh the page to continue.");
      return;
    }
    const text = getTweetText();
    if (!text || text.length < 5) {
      showNotification("Please type your complaint first", "warning");
      return;
    }
    await runFullFlow(text);
  });

  if (toolbar) {
    toolbar.appendChild(btn);
    return;
  }

  let fallbackContainer = document.getElementById("civictag-button-fallback");
  if (!fallbackContainer) {
    fallbackContainer = document.createElement("div");
    fallbackContainer.id = "civictag-button-fallback";
    fallbackContainer.style.display = "flex";
    fallbackContainer.style.justifyContent = "flex-end";
    fallbackContainer.style.marginTop = "8px";
    fallbackContainer.style.marginBottom = "4px";
    mountPoint.appendChild(fallbackContainer);
  }

  btn.style.marginLeft = "0";
  fallbackContainer.appendChild(btn);
}

function bindComposeInput(compose) {
  if (composeInputBound) return;

  compose.addEventListener("input", () => {
    if (sidebar && sidebarData) {
      if (!isContextValid()) {
        removeSidebar();
        return;
      }
      updateCharCount(sidebarData);
    }
  });

  composeInputBound = true;
}

async function getSafeStorage(key) {
  const result = await safeStorageGet([key]);
  return result[key] || null;
}

async function runFullFlow(tweetText) {
  if (!isContextValid()) {
    alert("Extension updated. Please refresh the page.");
    return;
  }
  const analysisId = ++runningAnalysisId;
  const analysisInputText = tweetText;

  showNotification("Analyzing complaint...", "info");

  try {
    // STEP 2: Classifier
    const classification = await classifier.classify(tweetText);
    if (!isContextValid()) return;
    if (analysisId !== runningAnalysisId) return;

    if (!classification || !classification.isComplaint || Number(classification.confidence || 0) < 60) {
      showNotification("No civic complaint detected in your text.", "warning");
      removeSidebar();
      return;
    }

    // STEP 3: Location detection
    const groqApiKey = await getSafeStorage("groqApiKey");
    const enableTweetRewriter = await getSafeStorage("enableTweetRewriter");
    if (!isContextValid()) return;

    let location = { city: null, state: null, source: "none" };
    try {
      const detected = await locationDetector.detectLocation(tweetText, groqApiKey);
      if (!isContextValid()) return;
      if (detected) {
        location = {
          // Only use detected values if they look like real place names
          city: (detected.city && detected.city !== 'Unknown') ? detected.city : null,
          state: (detected.state && detected.state !== 'Unknown') ? detected.state : null,
          source: detected.source || "none",
          district: detected.district || null,
          suburb: detected.suburb || null
        };
      }
    } catch (locationError) {
      console.warn("CivicTag: Location detection failed", locationError);
    }

    if (analysisId !== runningAnalysisId) return;

    // STEP 4: Resolve authorities
    let authorities = [];
    try {
      authorities = await authorityResolver.resolveAuthorities(classification, location);
      if (!isContextValid()) return;
    } catch (authorityError) {
      console.warn("CivicTag: Authority resolution failed", authorityError);
      authorities = [];
    }

    if (analysisId !== runningAnalysisId) return;

    // STEP 5 + 6: Spam Guard and Rewriter
    const [rateLimit, duplicate, consolidation, overload, rewrite] = await Promise.all([
      spamGuard.checkRateLimit().catch(e => { console.error("SpamGuard checkRateLimit failed", e); return { allowed: true }; }),
      spamGuard.checkDuplicate(classification.department, location).catch(e => { console.error("SpamGuard checkDuplicate failed", e); return { isDuplicate: false }; }),
      spamGuard.checkConsolidation(classification.department, location).catch(e => { console.error("SpamGuard checkConsolidation failed", e); return { shouldConsolidate: false }; }),
      spamGuard.checkAuthorityOverload(authorities, classification.department).catch(e => { console.error("SpamGuard checkAuthorityOverload failed", e); return { hasOverload: false }; }),
      (enableTweetRewriter === false || !groqApiKey)
        ? Promise.resolve(null)
        : (async () => {
            const { preferredTweetLanguage } = await safeStorageGet(["preferredTweetLanguage"]).catch(() => ({}));
            return tweetRewriter.rewrite(tweetText, classification, location, groqApiKey, preferredTweetLanguage || 'auto')
              .catch(e => { console.error("TweetRewriter rewrite failed", e); return null; });
          })()
    ]);

    if (!isContextValid()) return;
    if (analysisId !== runningAnalysisId) return;

    if (!rateLimit.allowed) {
      showNotification(rateLimit.message || "Rate limit reached", "warning");
    }

    const hashtags = buildHashtags(classification, location || {});

    const { preferredTweetLanguage: savedLang } = await safeStorageGet(["preferredTweetLanguage"]).catch(() => ({}));
    renderSidebar({
      tweetText: analysisInputText, // Original text at start of flow
      classification,
      location,
      authorities: authorities || [],
      hashtags: hashtags || [],
      duplicate,
      consolidation,
      overload,
      rewrite,
      selectedLanguage: savedLang || 'auto'
    });
  } catch (error) {
    if (isContextValid()) {
      console.error("CivicTag: Analysis flow failed", error);
      showNotification("CivicTag analysis failed. Please try again.", "error");
    } else {
      console.warn("CivicTag: Flow interrupted by context invalidation");
    }
  }
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

  if (location && location.state) list.push(`#${location.state.replace(/\s+/g, "")}`);
  return Array.from(new Set(list)).slice(0, 6);
}

function accuracyBadge(location) {
  const source = location.source || "manual";
  if (source === "browser_gps") return "GPS 🟢";
  if (source === "twitter_profile") return "Profile 🟡";
  if (source === "user_settings") return "Settings 🟠";
  if (source === "tweet_text") return "AI Extracted 🔵";
  return "Manual 🔴";
}

function groupAuthorities(authorities) {
  const grouped = { local: [], state: [], central: [], other: [] };
  const validTiers = ['local', 'state', 'central', 'other'];
  
  (authorities || []).forEach((a) => {
    if (!a) return;
    const level = (a.level || a.tier || "other").toLowerCase();
    if (validTiers.includes(level)) {
      grouped[level].push(a);
    } else {
      grouped.other.push(a);
    }
  });
  return grouped;
}

function renderSidebar(data) {
  if (!isContextValid()) return;
  removeSidebar();
  sidebarData = data; // Store globally for live updates

  const groups = groupAuthorities(data.authorities);
  const locationLabel = [data.location.city, data.location.state].filter(Boolean).join(", ") || "Location unknown";
  const urgencyClass = `civictag-badge-${data.classification.urgency || "medium"}`;

  sidebar = document.createElement("div");
  sidebar.id = "civictag-sidebar";
  sidebar.innerHTML = `
    <div class="civictag-sidebar-header">
      <h3>CivicTag</h3>
      <button id="civictag-close" class="civictag-close" type="button">×</button>
    </div>

    <div class="civictag-sidebar-content">
      <div class="civictag-section">
        <h4>📍 Location Info</h4>
        <div class="civictag-summary">
          <strong>${locationLabel}</strong>
          <div style="margin-top:4px;"><small>${accuracyBadge(data.location)}</small></div>
        </div>
      </div>

      <div class="civictag-section">
        <h4>🏷️ Issue Detection</h4>
        <div class="civictag-summary">
          <span class="civictag-badge ${urgencyClass}">${(data.classification.urgency || "medium").toUpperCase()}</span>
          <div><strong>Category:</strong> ${escapeHtml(data.classification.department || "General")}</div>
        </div>
      </div>

      ${renderAuthorityGroup("Local", groups.local)}
      ${renderAuthorityGroup("State", groups.state)}
      ${renderAuthorityGroup("Central", groups.central)}
      ${renderAuthorityGroup("Other", groups.other)}

      <div class="civictag-section">
        <h4># Hashtags</h4>
        <div class="civictag-hashtags">
          ${data.hashtags.map((h) => `
            <label class="civictag-hashtag-item">
              <input type="checkbox" data-hashtag="${h}" checked>
              <span>${h}</span>
            </label>
          `).join("")}
        </div>
      </div>

      <!-- Language picker is always shown when rewriter is available -->
      <div class="civictag-section" id="civictag-lang-section">
        <h4>🌐 Tweet Language</h4>
        <div class="civictag-lang-row">
          <select id="civictag-lang-select" class="civictag-lang-select">
            ${(typeof TweetRewriter !== 'undefined' ? TweetRewriter.SUPPORTED_LANGUAGES : [
              {key:'auto',label:'🔄 Same as original'},
              {key:'english',label:'🇬🇧 English'},
              {key:'hindi',label:'🇮🇳 हिंदी (Hindi)'},
              {key:'hinglish',label:'🇮🇳 Hinglish'},
              {key:'tamil',label:'🇮🇳 தமிழ் (Tamil)'},
              {key:'telugu',label:'🇮🇳 తెలుగు (Telugu)'},
              {key:'kannada',label:'🇮🇳 ಕನ್ನಡ (Kannada)'},
              {key:'malayalam',label:'🇮🇳 മലയാളം (Malayalam)'},
              {key:'marathi',label:'🇮🇳 मराठी (Marathi)'},
              {key:'gujarati',label:'🇮🇳 ગુજરાતી (Gujarati)'},
              {key:'bengali',label:'🇮🇳 বাংলা (Bengali)'},
              {key:'punjabi',label:'🇮🇳 ਪੰਜਾਬੀ (Punjabi)'},
              {key:'odia',label:'🇮🇳 ଓଡ଼ିଆ (Odia)'},
              {key:'assamese',label:'🇮🇳 অসমীয়া (Assamese)'},
              {key:'urdu',label:'🇮🇳 اردو (Urdu)'},
            ]).map(l => `<option value="${l.key}" ${data.selectedLanguage === l.key ? 'selected' : ''}>${l.label}</option>`).join('')}
          </select>
          <button type="button" id="civictag-regenerate-btn" class="civictag-regenerate-btn" title="Re-generate tweet in selected language">
            ✨ Regenerate
          </button>
        </div>
        ${data.rewrite && data.rewrite.targetLanguageLabel ? `<small style="color:#536471; font-size:11px; margin-top:4px; display:block;">Currently shown in: ${escapeHtml(data.rewrite.targetLanguageLabel)}</small>` : ''}
      </div>

      ${data.rewrite && data.rewrite.rewrittenTweet ? `
        <div class="civictag-section">
          <h4>✨ AI Improved Wording</h4>
          <div style="margin-bottom:12px; display:flex; gap:8px;">
            <button type="button" id="civictag-tab-original" class="civictag-btn civictag-btn-secondary" style="padding:6px 12px; font-size:12px; opacity:0.6;">Original</button>
            <button type="button" id="civictag-tab-improved" class="civictag-btn civictag-btn-primary" style="padding:6px 12px; font-size:12px;">✨ Improved</button>
          </div>
          <div id="civictag-text-original" class="civictag-summary" style="display:none; background:#f7f9f9; padding:10px; border-radius:8px; font-style:italic; white-space: pre-wrap; opacity:0.7;">${escapeHtml(data.tweetText)}</div>
          <div id="civictag-text-improved" class="civictag-summary" style="background:#f0f7f0; padding:10px; border-radius:8px; white-space: pre-wrap; border: 2px solid #138808;">${escapeHtml(data.rewrite.rewrittenTweet)}</div>
          <div style="margin-top:12px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px;">
              <input type="checkbox" id="civictag-use-improved" style="width:18px; height:18px; accent-color:#138808;" checked>
              ✨ Use AI improved version (recommended)
            </label>
          </div>
        </div>
      ` : data.rewrite === null ? `
        <div class="civictag-section" style="opacity:0.7;">
          <small style="color:#536471;">💡 Add your Groq API key in settings to enable AI-improved wording.</small>
        </div>
      ` : `
        <div class="civictag-section">
          <div id="civictag-rewrite-loading" style="display:flex; align-items:center; gap:8px; color:#536471; font-size:13px;">
            <span class="civictag-spinning">↻</span> Generating improved wording…
          </div>
        </div>
      `}

      <div class="civictag-section" style="background: #f8fafc;">
        <h4>📝 Full Tweet Preview</h4>
        <div id="civictag-full-preview" style="background: white; border: 1px solid #e1e8ed; padding: 12px; border-radius: 12px; font-size: 14px; white-space: pre-wrap; line-height: 1.5; color: #0f1419;"></div>
      </div>

      <div class="civictag-section" style="border-bottom:none; padding-bottom:40px;">
        <div id="civictag-char" style="font-weight:700; font-size:16px; margin-bottom:16px; text-align:center;"></div>
        <button id="civictag-insert" class="civictag-btn civictag-btn-primary" style="width:100%; margin-bottom:10px;" type="button">📋 Copy &amp; Paste into Tweet</button>
        <button id="civictag-copy" class="civictag-btn civictag-btn-secondary" style="width:100%; font-size:13px;" type="button">💾 Copy without tracking</button>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);

  document.getElementById("civictag-close")?.addEventListener("click", removeSidebar);
  document.getElementById("civictag-insert")?.addEventListener("click", () => insertAndTrack(data));
  document.getElementById("civictag-copy")?.addEventListener("click", () => copyAndTrack(data));

  // Wire up Refresh buttons on dynamic/stale handles
  sidebar.querySelectorAll(".civictag-refresh-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const roleKey = btn.dataset.roleKey;
      const stateName = btn.dataset.stateName;
      if (!roleKey || !stateName || typeof DynamicResolver === 'undefined') return;

      const iconSpan = btn;
      iconSpan.disabled = true;
      iconSpan.textContent = "↻ Refreshing…";

      try {
        const result = await DynamicResolver.forceRefresh(roleKey, stateName);
        if (result) {
          showNotification(`Updated: ${result.handle} (${result.isDynamic ? "Live" : "Static"})`, "success");
          // Re-run the full analysis to refresh the sidebar
          const text = getTweetText();
          if (text) await runFullFlow(text);
        } else {
          showNotification("Could not fetch a fresh handle. Try again later.", "warning");
          iconSpan.disabled = false;
          iconSpan.textContent = "↻ Retry";
        }
      } catch (err) {
        showNotification("Refresh failed: " + err.message, "error");
        iconSpan.disabled = false;
        iconSpan.textContent = "↻ Retry";
      }
    });
  });

  // ── Language picker: Regenerate button ──────────────────────────────────
  const regenBtn = document.getElementById("civictag-regenerate-btn");
  const langSelect = document.getElementById("civictag-lang-select");
  if (regenBtn && langSelect) {
    regenBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const selectedLang = langSelect.value;

      // Persist the user's language choice so reopening the sidebar remembers it
      try { await chrome.storage.local.set({ preferredTweetLanguage: selectedLang }); } catch {}

      regenBtn.disabled = true;
      regenBtn.textContent = "↻ Generating…";

      try {
        const { groqApiKey } = await safeStorageGet(["groqApiKey"]);
        if (!groqApiKey) {
          showNotification("Add your Groq API key in settings first.", "warning");
          regenBtn.disabled = false;
          regenBtn.textContent = "✨ Regenerate";
          return;
        }

        const newRewrite = await tweetRewriter.rewrite(
          data.tweetText,
          data.classification,
          data.location,
          groqApiKey,
          selectedLang
        );

        // Re-render sidebar with updated rewrite and remember language choice
        renderSidebar(Object.assign({}, data, { rewrite: newRewrite, selectedLanguage: selectedLang }));
      } catch (err) {
        showNotification("Regeneration failed: " + err.message, "error");
        regenBtn.disabled = false;
        regenBtn.textContent = "✨ Regenerate";
      }
    });
  }

  const tabOriginal = document.getElementById("civictag-tab-original");
  const tabImproved = document.getElementById("civictag-tab-improved");
  const textOriginal = document.getElementById("civictag-text-original");
  const textImproved = document.getElementById("civictag-text-improved");
  const checkImproved = document.getElementById("civictag-use-improved");

  tabOriginal?.addEventListener("click", () => {
    if (textOriginal) textOriginal.style.display = "block";
    if (textImproved) textImproved.style.display = "none";
    if (checkImproved) checkImproved.checked = false;
    // Style: original active, improved inactive
    if (tabOriginal) { tabOriginal.className = "civictag-btn civictag-btn-primary"; tabOriginal.style.opacity = "1"; tabOriginal.style.fontSize = "12px"; tabOriginal.style.padding = "6px 12px"; }
    if (tabImproved) { tabImproved.className = "civictag-btn civictag-btn-secondary"; tabImproved.style.opacity = "0.6"; tabImproved.style.fontSize = "12px"; tabImproved.style.padding = "6px 12px"; tabImproved.textContent = "✨ Improved"; }
    updateCharCount(data);
  });

  tabImproved?.addEventListener("click", () => {
    if (textOriginal) textOriginal.style.display = "none";
    if (textImproved) textImproved.style.display = "block";
    if (checkImproved) checkImproved.checked = true;
    // Style: improved active, original inactive
    if (tabImproved) { tabImproved.className = "civictag-btn civictag-btn-primary"; tabImproved.style.opacity = "1"; tabImproved.style.fontSize = "12px"; tabImproved.style.padding = "6px 12px"; tabImproved.textContent = "✨ Improved"; }
    if (tabOriginal) { tabOriginal.className = "civictag-btn civictag-btn-secondary"; tabOriginal.style.opacity = "0.6"; tabOriginal.style.fontSize = "12px"; tabOriginal.style.padding = "6px 12px"; tabOriginal.textContent = "Original"; }
    updateCharCount(data);
  });

  sidebar.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.addEventListener("change", () => updateCharCount(data));
  });

  // Set improved as default active tab on first render
  if (data.rewrite && data.rewrite.rewrittenTweet) {
    const checkImprovedInit = document.getElementById("civictag-use-improved");
    if (checkImprovedInit) checkImprovedInit.checked = true;
  }

  updateCharCount(data);
}

function renderAuthorityGroup(title, items) {
  if (!items?.length) return "";
  return `
    <div class="civictag-section">
      <h4>🏛️ ${title} Authorities</h4>
      <div class="civictag-authorities">
        ${items.map((a) => {
          let metaBadge = '';
          if (a.isDynamic) {
            metaBadge = `
              <div class="civictag-handle-meta">
                <span class="civictag-badge-dynamic" title="Resolved in real-time via AI (confidence: ${a.dynamicConfidence || 'N/A'}%)">🔄 Live</span>
                <button type="button" class="civictag-refresh-btn"
                  data-role-key="${a.roleKey || ''}"
                  data-state-name="${escapeHtml(a.stateName || '')}"
                  title="Force a fresh lookup">↻ Refresh</button>
              </div>`;
          } else if (a.isStale) {
            metaBadge = `
              <div class="civictag-handle-meta">
                <span class="civictag-badge-stale" title="Could not verify — may be outdated">⚠️ May be outdated</span>
                <button type="button" class="civictag-refresh-btn"
                  data-role-key="${a.roleKey || ''}"
                  data-state-name="${escapeHtml(a.stateName || '')}"
                  title="Try live lookup now">↻ Try now</button>
              </div>`;
          }
          return `
            <label class="civictag-authority-item">
              <input type="checkbox" data-handle="${a.handle}" checked>
              <div>
                <strong>${a.handle}</strong>
                <small>${escapeHtml(a.name || "")}</small>
                ${a.note ? `<small class="civictag-note">${escapeHtml(a.note)}</small>` : ""}
                ${metaBadge}
              </div>
            </label>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function updateCharCount(data) {
  if (!sidebar) return;
  if (!isContextValid()) {
    removeSidebar();
    return;
  }
  const useImproved = !!document.getElementById("civictag-use-improved")?.checked;
  const liveText = getTweetText();
  
  // Update the original text preview if user has typed something new
  const textOriginal = document.getElementById("civictag-text-original");
  if (textOriginal && !useImproved) {
    textOriginal.textContent = liveText || data.tweetText || "";
  }

  const tweetText = (useImproved && data.rewrite?.rewrittenTweet) ? data.rewrite.rewrittenTweet : (liveText || data.tweetText || "");
  
  const selectedHandles = Array.from(sidebar.querySelectorAll("input[data-handle]:checked")).map((n) => n.getAttribute("data-handle"));
  const selectedHashtags = Array.from(sidebar.querySelectorAll("input[data-hashtag]:checked")).map((n) => n.getAttribute("data-hashtag"));
  
  const full = buildAndInsertTweet_string(tweetText, selectedHandles, selectedHashtags);
  const remaining = 280 - full.length;
  
  const previewEl = document.getElementById("civictag-full-preview");
  if (previewEl) {
    previewEl.textContent = full;
  }

  const charEl = document.getElementById("civictag-char");
  if (charEl) {
    charEl.textContent = `${full.length}/280 (${remaining} left)`;
    charEl.style.color = remaining < 0 ? "#c62828" : remaining < 20 ? "#f9a825" : "#2e7d32";
  }
}

function removeSidebar() {
  if (sidebar) {
    sidebar.remove();
    sidebar = null;
    sidebarData = null;
  }
}

function showPasteReminder() {
  // Remove any existing reminder
  document.getElementById("civictag-paste-reminder")?.remove();

  const banner = document.createElement("div");
  banner.id = "civictag-paste-reminder";
  banner.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: #1d9bf0;
    color: white;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    z-index: 999999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    max-width: 280px;
    line-height: 1.5;
    cursor: pointer;
    animation: civictag-slideup 0.3s ease;
  `;
  banner.innerHTML = `
    <div style="font-size:20px; margin-bottom:6px;">📋 Text Copied!</div>
    <div>Click in the tweet box, then press</div>
    <div style="background:rgba(255,255,255,0.2); border-radius:6px; padding:4px 8px; margin-top:6px; font-family:monospace; font-size:16px; text-align:center;">Ctrl + V</div>
    <div style="margin-top:6px; font-size:12px; opacity:0.8;">Click this banner to dismiss</div>
  `;
  banner.addEventListener("click", () => banner.remove());
  document.body.appendChild(banner);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.opacity = "0";
      banner.style.transition = "opacity 0.4s";
      setTimeout(() => banner.remove(), 400);
    }
  }, 10000);
}

function showNotification(message, type = "info") {
  const existing = document.querySelector(".civictag-notification");
  if (existing) existing.remove();

  const n = document.createElement("div");
  n.className = `civictag-notification civictag-notification-${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "warning") icon = "⚠️";
  if (type === "error") icon = "❌";

  n.innerHTML = `<span style="margin-right:8px;">${icon}</span><span>${message}</span>`;
  document.body.appendChild(n);

  setTimeout(() => {
    n.style.opacity = "0";
    setTimeout(() => n.remove(), 300);
  }, 4000);
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

function buildAndInsertTweet_string(tweetText, selectedHandles, selectedHashtags) {
  if (!tweetText) return "";
  
  // USER TEXT FIRST
  let full = tweetText.trim();
  
  // Add mentions AFTER text
  if (selectedHandles && selectedHandles.length > 0) {
    full += "\n\n" + selectedHandles.join(" ");
  }
  
  // Add hashtags LAST
  if (selectedHashtags && selectedHashtags.length > 0) {
    full += "\n\n" + selectedHashtags.join(" ");
  }
  
  return full.trim();
}

/**
 * THE CORE FIX: Insert text into Twitter's React-controlled compose box.
 * Twitter uses a Draft.js / React contenteditable div.
 * You CANNOT set .innerText or .value directly — React will overwrite it.
 * You MUST use document.execCommand('insertText') to fire React's synthetic events.
 */
async function insertIntoTwitterComposeBox(fullText) {
  // Twitter/X uses React + Draft.js.
  // execCommand("insertText") causes an input event loop — hashtags repeat endlessly.
  // The ONLY safe method: write to clipboard, then paste.
  // paste fires React's onPaste which correctly updates Draft.js state ONCE.

  const composeBox =
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('.public-DraftEditor-content') ||
    document.querySelector('[contenteditable="true"][role="textbox"]');

  if (!composeBox) {
    console.error("CivicTag: Compose box not found for insertion");
    return false;
  }

  try {
    // Step 1: Write full tweet to clipboard
    await navigator.clipboard.writeText(fullText);

    // Step 2: Focus compose box
    composeBox.focus();

    // Step 3: Wait for React to register focus
    await new Promise(resolve => setTimeout(resolve, 80));

    // Step 4: Select all existing text in the compose box only
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composeBox);
    selection.removeAllRanges();
    selection.addRange(range);

    // Step 5: Paste — replaces selection with clipboard content
    // This fires React onPaste exactly once — no loop
    document.execCommand("paste", false, null);

    return true;
  } catch (err) {
    console.warn("CivicTag: Clipboard insert failed", err);
    return false;
  }
}

async function insertAndTrack(data) {
  if (!isContextValid()) {
    alert("Extension updated. Please refresh the page.");
    return;
  }

  const useImproved = !!document.getElementById("civictag-use-improved")?.checked;

  // Get tweet text — prefer improved if selected, else use original captured text
  let tweetText = "";
  if (useImproved && data.rewrite?.rewrittenTweet) {
    tweetText = data.rewrite.rewrittenTweet.trim();
  } else {
    // Use the text that was captured at analysis time (most reliable)
    // Fall back to live compose box text only if needed
    const liveText = getTweetText();
    tweetText = (data.tweetText && data.tweetText.length > 3) ? data.tweetText : liveText;
    tweetText = tweetText.trim();
  }

  if (!tweetText || tweetText.length < 3) {
    showNotification("Could not find your complaint text. Please try again.", "error");
    return;
  }

  // Collect only CHECKED handles and hashtags
  const handles = Array.from(
    sidebar.querySelectorAll("input[data-handle]:checked")
  ).map((n) => n.getAttribute("data-handle"));

  const hashtags = Array.from(
    sidebar.querySelectorAll("input[data-hashtag]:checked")
  ).map((n) => n.getAttribute("data-hashtag"));

  // Build ONE complete string — never insert in multiple steps
  const fullTweetString = buildAndInsertTweet_string(tweetText, handles, hashtags);

  // Insert into compose box using the React-safe method (async — clipboard based)
  const inserted = await insertIntoTwitterComposeBox(fullTweetString);

  if (inserted) {
    // Track the complaint
    const complaintData = {
      tweetText: tweetText,
      category: data.classification.department || "General",
      urgency: data.classification.urgency || "medium",
      location: data.location,
      authorities: handles.map((h) => ({ handle: h })),
      hashtags: hashtags
    };

    if (isContextValid()) {
      await tracker.saveComplaint(complaintData).catch(() => {});
      await spamGuard.recordComplaint(complaintData).catch(() => {});
      showNotification("📋 Copied! Now click in the tweet box and press Ctrl+V (or ⌘V on Mac) to paste.", "success");
      // Show a persistent paste reminder banner
      showPasteReminder();
      removeSidebar();
    }
  } else {
    // Fallback: copy to clipboard if insert failed
    const copied = await copyToClipboard(fullTweetString);
    if (copied) {
      showNotification("Direct insert failed. Text copied — paste it with Ctrl+V.", "warning");
    } else {
      showNotification("Insert failed. Please copy the text from the preview above.", "error");
    }
  }
}

async function copyAndTrack(data) {
  if (!isContextValid()) {
    alert("Extension updated. Please refresh the page.");
    return;
  }
  const useImproved = !!document.getElementById("civictag-use-improved")?.checked;
  const liveText = getTweetText();
  const analysisText = data.tweetText || "";
  
  let tweetText = "";
  if (useImproved && data.rewrite?.rewrittenTweet) {
    tweetText = data.rewrite.rewrittenTweet.trim();
  } else {
    tweetText = (liveText && liveText.length > 5) ? liveText : analysisText;
  }

  if (!tweetText || tweetText.length < 3) {
    showNotification("Could not find complaint text to copy.", "error");
    return;
  }

  const handles = Array.from(sidebar.querySelectorAll("input[data-handle]:checked")).map((n) => n.getAttribute("data-handle"));
  const hashtags = Array.from(sidebar.querySelectorAll("input[data-hashtag]:checked")).map((n) => n.getAttribute("data-hashtag"));

  const fullTweetString = buildAndInsertTweet_string(tweetText, handles, hashtags);
  
  const success = await copyToClipboard(fullTweetString);

  if (success) {
    const complaintData = {
      tweetText: tweetText,
      category: data.classification.department || "General",
      urgency: data.classification.urgency || "medium",
      location: data.location,
      authorities: handles.map((h) => ({ handle: h })),
      hashtags: hashtags
    };

    if (isContextValid()) {
      await tracker.saveComplaint(complaintData).catch(() => {});
      await spamGuard.recordComplaint(complaintData).catch(() => {});
      showNotification("Copied! Now paste (Ctrl+V) it into the tweet box.", "success");
      removeSidebar();
    }
  } else {
    showNotification("Failed to copy text to clipboard.", "error");
  }
}

async function copyToClipboard(text) {
  try {
    // Fallback for older browsers or non-secure contexts
    if (!navigator.clipboard) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("CivicTag: Clipboard failed", err);
    return false;
  }
}