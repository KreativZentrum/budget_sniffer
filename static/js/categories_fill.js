// static/js/categories_fill.js
(function () {
  async function loadCategories() {
    const sel = document.getElementById("categoryFilter");
    if (!sel) return;
    try {
      const res = await fetch("/api/rules", { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rules = Array.isArray(data.rules) ? data.rules : [];
      const set = new Set();
      for (const r of rules) {
        const c = (r && (r.category || r.Category || r.cat)) ? String(r.category || r.Category || r.cat).trim() : "";
        if (c) set.add(c);
      }
      let cats = Array.from(set).sort();
      if (cats.length === 0) {
        cats = ["Groceries","Utilities","Transport","Dining","Housing","Health","Insurance","Education","Entertainment","Shopping","Travel","Other"];
      }
      const first = sel.querySelector("option[value='']")?.outerHTML || "<option value=''>All</option>";
      sel.innerHTML = first + cats.map(c => `<option value="${c}">${c}</option>`).join("");
    } catch (e) {
      console.error("Failed to load categories", e);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCategories);
  } else {
    loadCategories();
  }
})();