let donut, weekly, hist;
const $ = sel => document.querySelector(sel);

let ALL_CATEGORIES = [];

// ---- helpers ----
function on(el, type, handler, opts) {
  if (el && typeof el.addEventListener === "function") {
    el.addEventListener(type, handler, opts);
  }
}

function fmtMoney(n) {
  if (typeof n !== "number" || isNaN(n)) return "$0.00";
  return (n<0?"-":"") + "$" + Math.abs(n).toFixed(2);
}

function setWarning(msg) {
  const w = $("#warning");
  if (!w) return;
  if (!msg) { w.style.display="none"; w.textContent=""; return; }
  w.textContent = msg;
  w.style.display = "block";
}

function setDebug(err) {
  const d = $("#debug");
  if (!d) return;
  if (!err) { d.style.display="none"; d.textContent=""; return; }
  d.textContent = String((err && err.stack) || err);
  d.style.display = "block";
}

async function checkHealth() {
  try {
    const r = await fetch("/health");
    const j = await r.json();
    const hb = $("#healthBadge");
    if (hb) hb.textContent = (j && j.ok) ? `healthy${j.version ? " ("+j.version+")" : ""}` : "unhealthy";
  } catch {
    const hb = $("#healthBadge");
    if (hb) hb.textContent = "no response";
  }
}

// ---- categories ----
async function fetchCategories() {
  // 1) Try /api/categories (supports {categories:[...]} or plain [...])
  try {
    const r = await fetch("/api/categories", { headers: { "Accept":"application/json" } });
    const j = await r.json();
    if (Array.isArray(j)) {
      ALL_CATEGORIES = j.slice();
    } else if (j && Array.isArray(j.categories)) {
      ALL_CATEGORIES = j.categories.slice();
    }
  } catch (_) { /* ignore and fall through */ }

  // 2) Fallback to /api/rules
  if (!Array.isArray(ALL_CATEGORIES) || ALL_CATEGORIES.length === 0) {
    try {
      const r = await fetch("/api/rules", { headers: { "Accept":"application/json" } });
      const j = await r.json();
      const rules = Array.isArray(j && j.rules) ? j.rules : [];
      const set = new Set();
      for (const it of rules) {
        const c = it && (it.category ?? it.Category ?? it.cat);
        if (c && String(c).trim()) set.add(String(c).trim());
      }
      ALL_CATEGORIES = Array.from(set).sort((a,b)=>a.localeCompare(b));
    } catch (_) { /* ignore and fall through */ }
  }

  // 3) Sensible defaults
  if (!Array.isArray(ALL_CATEGORIES) || ALL_CATEGORIES.length === 0) {
    ALL_CATEGORIES = [
      "Groceries","Utilities","Transport","Dining","Housing","Entertainment",
      "Healthcare","Insurance","Education","Fees","Gifts","Travel",
      "Savings","Transfer","Income","Uncategorised"
    ];
  }
}

function fillCategoryFilter(list) {
  const sel = $("#categoryFilter");
  if (!sel) return;
  const current = sel.value;
  const source = (Array.isArray(list) && list.length) ? list : ALL_CATEGORIES;
  sel.innerHTML = '<option value="">All</option>';
  (source || []).forEach(function(c) {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function catOptionsHtml(selected) {
  const opts = (ALL_CATEGORIES || [])
    .map(function(c){ return `<option value="${c}" ${c===selected?'selected':''}>${c}</option>`; })
    .join("");
  return `<select class="cat-select">${opts}</select>`;
}

// ---- charts ----
function renderDonut(categories) {
  if (typeof Chart === "undefined") {
    const l = $("#donutLegend");
    if (l) l.innerHTML = "<em>Charts unavailable (Chart.js blocked)</em>";
    return;
  }
  const labels = (categories || []).map(function(x){ return x.category; });
  const data = (categories || []).map(function(x){ return Math.abs(x.amount); });
  const canvas = $("#donutChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (donut) donut.destroy();
  donut = new Chart(ctx, {
    type: "doughnut",
    data: { labels: labels, datasets: [{ data: data }]},
    options: {
      onClick: async function(_e, els) {
        if (!els.length) return;
        const idx = els[0].index;
        const cat = labels[idx];
        const filterSel = $("#categoryFilter");
        if (filterSel) filterSel.value = cat;
        const tx = await fetchTransactions(cat);
        renderTable(tx, cat);
      },
      plugins: { legend: { display: false } }
    }
  });
  const legend = $("#donutLegend");
  if (legend) {
    legend.innerHTML = labels.map(function(l,i){ return `<span class="pill">${l}: <strong>${fmtMoney(data[i])}</strong></span>`; }).join(" ");
  }
}

function renderWeekly(points, stats) {
  if (typeof Chart === "undefined") { return; }
  points = points || [];
  stats = stats || {avg:0,min:0,max:0,mode_nearest_thousand:0};
  const labels = points.map(function(p){ return p.week; });
  const data = points.map(function(p){ return p.amount; });
  const canvas = $("#weeklyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (weekly) weekly.destroy();
  weekly = new Chart(ctx, { type: "bar", data: { labels: labels, datasets: [{ data: data }]}, options: { plugins: { legend: { display: false } } } });
  const statsEl = $("#weeklyStats");
  if (statsEl) {
    statsEl.innerHTML = `Avg: <strong>${fmtMoney(stats.avg)}</strong> &nbsp; Min: <strong>${fmtMoney(stats.min)}</strong> &nbsp; Max: <strong>${fmtMoney(stats.max)}</strong> &nbsp; Mode(~$1k): <strong>${fmtMoney(stats.mode_nearest_thousand)}</strong>`;
  }
}

function renderHist(bins) {
  if (typeof Chart === "undefined") { return; }
  bins = bins || [];
  const labels = bins.map(function(b){ return `${b.bin_from}-${b.bin_to}`; });
  const data = bins.map(function(b){ return b.count; });
  const canvas = $("#histChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (hist) hist.destroy();
  hist = new Chart(ctx, { type: "bar", data: { labels: labels, datasets: [{ data: data }]}, options: { plugins: { legend: { display: false } } } });
}

// ---- table ----
function renderTable(rows, catLabel) {
  rows = rows || [];
  const tb = $("#txTable tbody");
  if (!tb) return;
  tb.innerHTML = rows.map(function(r){ 
    const hidden = r.hidden || false;
    const hiddenClass = hidden ? "hidden-row" : "";
    const toggleText = hidden ? "Unhide" : "Hide";
    return `<tr data-hash="${r.hash}" class="${hiddenClass}">
      <td>${r.tx_date}</td>
      <td>${r.description}</td>
      <td class="num">${fmtMoney(r.amount)}</td>
      <td>${r.account||""}</td>
      <td>${catOptionsHtml(r.category||"")}</td>
      <td><button class="toggle-hidden-btn" data-hash="${r.hash}">${toggleText}</button></td>
    </tr>`; 
  }).join("");
  const sub = $("#txSubtitle");
  if (sub) sub.textContent = catLabel ? `— filtered by "${catLabel}"` : "";

  // Wire change handlers
  tb.querySelectorAll("tr").forEach(function(tr){
    const h = tr.getAttribute("data-hash");
    const sel = tr.querySelector(".cat-select");
    const toggleBtn = tr.querySelector(".toggle-hidden-btn");
    
    if (sel) on(sel, "change", async function(){
      const newCat = sel.value;
      try {
        sel.disabled = true;
        const r = await fetch("/api/update_category", {
          method:"POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({hash: h, category: newCat})
        });
        const j = await r.json();
        if (!r.ok || j.error) { throw new Error(j.error || "Update failed"); }
        setWarning(`Saved category → ${newCat}`);
        await refreshChartsOnly();
      } catch (err) {
        setWarning("Could not save category.");
        setDebug(err);
      } finally {
        sel.disabled = false;
      }
    });
    
    if (toggleBtn) on(toggleBtn, "click", async function(){
      try {
        toggleBtn.disabled = true;
        const r = await fetch("/api/toggle_hidden", {
          method:"POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({hash: h})
        });
        const j = await r.json();
        if (!r.ok || j.error) { throw new Error(j.error || "Toggle failed"); }
        setWarning(`Transaction ${j.hidden ? 'hidden' : 'unhidden'}`);
        await refreshAll();
      } catch (err) {
        setWarning("Could not toggle visibility.");
        setDebug(err);
      } finally {
        toggleBtn.disabled = false;
      }
    });
  });
}

// ---- data loaders ----
async function fetchSummary() {
  const startEl = $("#startDate");
  const endEl = $("#endDate");
  const start = startEl ? startEl.value : "";
  const end = endEl ? endEl.value : "";
  const r = await fetch(`/api/summary?${new URLSearchParams({start, end})}`);
  return await r.json();
}

async function fetchTransactions(category) {
  const startEl = $("#startDate");
  const endEl = $("#endDate");
  const showHiddenEl = $("#showHidden");
  const start = startEl ? startEl.value : "";
  const end = endEl ? endEl.value : "";
  const showHidden = showHiddenEl ? showHiddenEl.checked : false;
  const params = new URLSearchParams({start, end});
  if (category) params.set("category", category);
  if (showHidden) params.set("show_hidden", "true");
  const r = await fetch(`/api/transactions?${params}`);
  return await r.json();
}

// ---- refresh flows ----
async function refreshChartsOnly() {
  try {
    const data = await fetchSummary();
    setWarning(""); setDebug("");

    // Prefer backend-provided categories, else use ALL_CATEGORIES
    const filterCats = (data.filters && Array.isArray(data.filters.categories) && data.filters.categories.length)
      ? data.filters.categories
      : ALL_CATEGORIES;
    fillCategoryFilter(filterCats);

    renderDonut(data.categories_breakdown || []);
    const weeklyPoints = (data.weekly && data.weekly.points) ? data.weekly.points : [];
    const weeklyStats = (data.weekly && data.weekly.stats) ? data.weekly.stats : {avg:0,min:0,max:0,mode_nearest_thousand:0};
    renderWeekly(weeklyPoints, weeklyStats);
    renderHist(data.hist || []);
  } catch (err) {
    setWarning("Refresh failed.");
    setDebug(err);
  }
}

async function refreshAll() {
  try {
    const data = await fetchSummary();
    if (!data || !data.meta) { setWarning("No data yet. Upload a CSV/XLS to get started."); return; }
    setWarning(""); setDebug("");

    const filterCats = (data.filters && Array.isArray(data.filters.categories) && data.filters.categories.length)
      ? data.filters.categories
      : ALL_CATEGORIES;
    fillCategoryFilter(filterCats);

    renderDonut(data.categories_breakdown || []);
    const weeklyPoints = (data.weekly && data.weekly.points) ? data.weekly.points : [];
    const weeklyStats = (data.weekly && data.weekly.stats) ? data.weekly.stats : {avg:0,min:0,max:0,mode_nearest_thousand:0};
    renderWeekly(weeklyPoints, weeklyStats);
    renderHist(data.hist || []);
    renderTable(data.transactions || []);
    if (data.meta.start) { const s = $("#startDate"); if (s) s.value = data.meta.start; }
    if (data.meta.end) { const e = $("#endDate"); if (e) e.value = data.meta.end; }
  } catch (err) {
    setWarning("Something went wrong on the page. See debug below.");
    setDebug(err);
  }
}

// ---- events ----
function wireEvents() {
  on($("#uploadForm"), "submit", async function(e) {
    e.preventDefault();
    try {
      const form = new FormData();
      const fileInput = $("#fileInput");
      const files = fileInput ? fileInput.files : [];
      if (!files || !files.length) { setWarning("Please choose at least one file."); return; }
      for (let i=0; i<files.length; i++) form.append("files", files[i]);
      const r = await fetch("/upload", { method:"POST", body: form });
      const j = await r.json();
      if (j.error) { setWarning(j.error); } else { setWarning(`Uploaded: ${j.inserted} rows`); await refreshAll(); }
    } catch (err) { setWarning("Upload failed."); setDebug(err); }
  });

  on($("#applyFilters"), "click", async function() {
    try {
      const sel = $("#categoryFilter");
      const cat = sel ? sel.value : "";
      if (cat) { const tx = await fetchTransactions(cat); renderTable(tx, cat); }
      else { await refreshAll(); }
    } catch (err) { setWarning("Filter failed."); setDebug(err); }
  });

  on($("#reloadRules"), "click", async function() {
    try { await fetch("/api/reload_rules", { method:"POST" }); await refreshAll(); }
    catch (err) { setWarning("Reload rules failed."); setDebug(err); }
  });

  on($("#toggleRec"), "click", function() {
    const p = $("#recPanel");
    if (!p) return;
    p.style.display = (p.style.display === "none") ? "block" : "none";
  });

  // Removed: #seedData handler and any /dev/seed calls

  on($("#hideAllTransfers"), "click", async function() {
    try {
      const r = await fetch("/api/bulk_hide_transfers", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({action: "hide"})
      });
      const j = await r.json();
      if (j.error) { setWarning(j.error); } else { setWarning(`Hidden ${j.affected} transfer transactions`); await refreshAll(); }
    } catch (err) {
      setWarning("Hide transfers failed.");
      setDebug(err);
    }
  });

  on($("#unhideAllTransfers"), "click", async function() {
    try {
      const r = await fetch("/api/bulk_hide_transfers", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({action: "unhide"})
      });
      const j = await r.json();
      if (j.error) { setWarning(j.error); } else { setWarning(`Unhidden ${j.affected} transfer transactions`); await refreshAll(); }
    } catch (err) {
      setWarning("Unhide transfers failed.");
      setDebug(err);
    }
  });

  on($("#showHidden"), "change", async function() {
    try {
      const sel = $("#categoryFilter");
      const cat = sel ? sel.value : "";
      if (cat) { const tx = await fetchTransactions(cat); renderTable(tx, cat); }
      else { await refreshAll(); }
    } catch (err) { setWarning("Filter failed."); setDebug(err); }
  });
}

// ---- global error ----
window.addEventListener("error", function(e) {
  setWarning("Frontend error occurred. See debug below.");
  setDebug(e.error || e.message);
});

// ---- boot ----
(async function start() {
  wireEvents();
  await checkHealth();
  await fetchCategories();   // fills ALL_CATEGORIES using /api/categories -> /api/rules -> defaults
  await refreshAll();
})();
