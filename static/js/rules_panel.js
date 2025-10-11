// Fetch and render rules from /api/rules into the right-hand sidebar.
(function initRulesSidebar(){
  const summaryEl = document.getElementById("rules-summary");
  const listEl = document.getElementById("rules-list");
  if (!summaryEl || !listEl) return;

  fetch("/api/rules", { headers: { "Accept": "application/json" }})
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const rules = Array.isArray(data.rules) ? data.rules : [];
      const enabledCount = rules.filter(r => r.enabled === 1 || r.enabled === true).length;
      summaryEl.textContent = `${rules.length} rule${rules.length===1?"":"s"} (${enabledCount} enabled)`;

      listEl.innerHTML = "";
      if (rules.length === 0) {
        const p = document.createElement("p");
        p.className = "bsr-muted";
        p.textContent = "No rules found.";
        listEl.appendChild(p);
        return;
      }
      const frag = document.createDocumentFragment();
      for (const r of rules) {
        const item = document.createElement("div");
        item.className = "bsr-rule " + ((r.enabled===1 || r.enabled===true) ? "bsr-on" : "bsr-off");

        const left = document.createElement("div");
        left.style.gridColumn = "1 / 2";
        left.innerHTML = `<div class="bsr-badge">${(r.priority ?? 100)}</div>`;

        const right = document.createElement("div");
        right.style.gridColumn = "2 / 3";

        const title = document.createElement("div");
        title.style.fontWeight = "600";
        title.textContent = r.name ?? `Rule #${r.id ?? "?"}`;

        const meta = document.createElement("div");
        meta.className = "bsr-muted";
        const cat = r.category ? ` • ${r.category}` : "";
        const action = r.action ? ` → ${r.action}` : "";
        meta.textContent = `${(r.pattern ?? "").toString()}${cat}${action}`;

        const sub = document.createElement("div");
        sub.className = "bsr-muted";
        if (r.updated_at) sub.textContent = `Updated: ${r.updated_at}`;

        right.appendChild(title);
        right.appendChild(meta);
        if (r.updated_at) right.appendChild(sub);

        item.appendChild(left);
        item.appendChild(right);
        frag.appendChild(item);
      }
      listEl.appendChild(frag);
    })
    .catch(err => {
      summaryEl.textContent = "Failed to load rules.";
      const p = document.createElement("p");
      p.className = "bsr-muted";
      p.textContent = String(err);
      listEl.appendChild(p);
      console.error(err);
    });
})();
