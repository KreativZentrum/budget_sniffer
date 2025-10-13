// static/js/categories_fill.js
// Ultimate robust population for Category dropdown(s) in Budget Sniffer.
//
// Order of category sources (first non-empty wins):
// 1) GET /api/categories  -> { categories: [...] }
// 2) GET /api/rules       -> { rules: [ { category: "..." }, ... ] }
// 3) Chart.js donut labels (labels of #donutChart)
// 4) window.App?.categories (if your app exposes them)
// 5) Fallback defaults
//
// Also fills any selects that look like category pickers:
//   - #categoryFilter
//   - select.category-select
//   - select[data-categories]
//   - select[name*='category' i]
//
// Retries a few times in case the page needs time to render charts or load rules.

(function(){
  const MAX_RETRIES = 6;     // total tries
  const RETRY_DELAY = 600;   // ms between tries

  async function fetchJSON(url){
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function fromApiCategories(){
    try{
      const data = await fetchJSON("/api/categories");
      if (data && Array.isArray(data.categories) && data.categories.length){
        return [...new Set(data.categories.map(x => String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      }
    }catch(e){ /* ignore */ }
    return [];
  }

  async function fromApiRules(){
    try{
      const data = await fetchJSON("/api/rules");
      const rules = Array.isArray(data.rules) ? data.rules : [];
      const out = new Set();
      for (const r of rules){
        const v = r && (r.category ?? r.Category ?? r.cat ?? r.category_name ?? r.CategoryName);
        if (v && String(v).trim()) out.add(String(v).trim());
      }
      return Array.from(out).sort((a,b)=>a.localeCompare(b));
    }catch(e){ /* ignore */ }
    return [];
  }

  function fromChartLabels(){
    try{
      if (!window.Chart) return [];
      const el = document.getElementById("donutChart");
      if (!el) return [];
      const chart = Chart.getChart ? Chart.getChart(el) : (el._chart || null);
      if (!chart || !chart.data || !Array.isArray(chart.data.labels)) return [];
      const labels = chart.data.labels.map(x => String(x).trim()).filter(Boolean);
      return [...new Set(labels)].sort((a,b)=>a.localeCompare(b));
    }catch(e){ return []; }
  }

  function fromGlobalApp(){
    try{
      const arr = (window.App && Array.isArray(window.App.categories)) ? window.App.categories : [];
      return [...new Set(arr.map(x => String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    }catch(e){ return []; }
  }

  function fallbackDefaults(){
    return ["Groceries","Utilities","Transport","Dining","Housing","Health","Insurance","Education","Entertainment","Shopping","Travel","Other"];
  }

  function preserveFirst(sel){
    const opt = sel.querySelector("option[value='']") || sel.options?.[0];
    return opt ? opt.outerHTML : "<option value=''>All</option>";
  }

  function looksFilled(sel){
    const opts = Array.from(sel.options || []);
    const meaningful = opts.filter(o => (o.value || "").trim() && o.value.toLowerCase() !== "all");
    return meaningful.length > 0;
  }

  function populateOne(sel, cats){
    if (!sel) return;
    const first = preserveFirst(sel);
    const existing = new Set(Array.from(sel.options || []).map(o => (o.value || "").trim()));
    const rest = cats.filter(c => !existing.has(c)).map(c => `<option value="${c}">${c}</option>`).join("");
    sel.innerHTML = first + rest;
  }

  function findTargets(){
    const set = new Set();
    const push = el => { if (el && el.tagName === "SELECT") set.add(el); };
    push(document.getElementById("categoryFilter"));
    document.querySelectorAll("select.category-select, select[data-categories], select[name*='category' i]").forEach(push);
    return Array.from(set);
  }

  async function gatherCategories(){
    let cats = await fromApiCategories();
    if (cats.length) return cats;

    cats = await fromApiRules();
    if (cats.length) return cats;

    cats = fromChartLabels();
    if (cats.length) return cats;

    cats = fromGlobalApp();
    if (cats.length) return cats;

    return fallbackDefaults();
  }

  async function tryPopulate(attempt){
    const targets = findTargets();
    const need = targets.filter(t => !looksFilled(t));
    if (need.length === 0 && attempt > 0){
      return true; // already filled
    }
    const cats = await gatherCategories();
    need.forEach(sel => populateOne(sel, cats));
    return need.length > 0;
  }

  async function run(){
    for (let i=0; i<MAX_RETRIES; i++){
      const filled = await tryPopulate(i);
      if (filled) break;
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
    // Observe for dynamically-added rows
    const mo = new MutationObserver(() => { tryPopulate(MAX_RETRIES); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();