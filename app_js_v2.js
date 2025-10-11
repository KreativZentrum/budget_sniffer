// Budget Sniffer v2.0.0 Frontend

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let ALL_CATEGORIES = [];
let CURRENT_RULES = null;

// Utility Functions
function fmtMoney(amt) {
    const abs = Math.abs(amt);
    const sign = amt < 0 ? '-' : '';
    return `${sign}$${abs.toFixed(2)}`;
}

function setWarning(msg) {
    const area = $('#warningArea');
    area.innerHTML = msg ? `<div class="warning">${msg}</div>` : '';
}

function showToast(msg, duration = 5000) {
    const area = $('#toastArea');
    const toast = document.createElement('div');
    toast.className = 'toast fade-in';
    toast.textContent = msg;
    area.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function setDebug(msg) {
    const area = $('#debugArea');
    area.innerHTML = msg ? `<div class="debug">${msg}</div>` : '';
}

// API Functions
async function checkHealth() {
    try {
        const resp = await fetch('/health');
        return await resp.json();
    } catch (e) {
        setWarning('Health check failed. Server may be down.');
        return null;
    }
}

async function fetchCategories() {
    try {
        const resp = await fetch('/api/categories');
        return await resp.json();
    } catch (e) {
        setWarning('Failed to fetch categories');
        return [];
    }
}

async function fetchSummary(start = '', end = '') {
    try {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const resp = await fetch(`/api/summary?${params}`);
        return await resp.json();
    } catch (e) {
        setWarning('Failed to fetch summary data');
        return null;
    }
}

async function fetchTransactions(start = '', end = '', category = '') {
    try {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        if (category) params.set('category', category);
        const resp = await fetch(`/api/transactions?${params}`);
        return await resp.json();
    } catch (e) {
        setWarning('Failed to fetch transactions');
        return [];
    }
}

async function fetchRules() {
    try {
        const resp = await fetch('/api/rules');
        return await resp.json();
    } catch (e) {
        setWarning('Failed to fetch rules');
        return { rules: [] };
    }
}

async function saveRules(rules) {
    try {
        const resp = await fetch('/api/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rules)
        });
        return await resp.json();
    } catch (e) {
        setWarning('Failed to save rules');
        return { error: 'Network error' };
    }
}

// Tab Management
function initTabs() {
    const tabBtns = $$('.tab-btn');
    const tabContents = $$('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // Update button states
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content visibility
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                }
            });
            
            // Load tab-specific content
            if (tabId === 'rules') {
                loadRulesTab();
            }
        });
    });
}

// Chart Rendering Functions
function renderDonut(categories) {
    const canvas = $('#donutChart');
    const ctx = canvas.getContext('2d');
    
    if (window.donutChart) {
        window.donutChart.destroy();
    }
    
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    
    const data = categories.map((cat, i) => ({
        label: cat.category,
        value: Math.abs(cat.amount),
        color: colors[i % colors.length]
    }));
    
    if (data.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    window.donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.label),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: data.map(d => d.color),
                borderWidth: 2,
                borderColor: '#2d2d2d'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const category = data[elements[0].index].label;
                    filterByCategory(category);
                }
            }
        }
    });
    
    renderDonutLegend(data);
}

function renderDonutLegend(data) {
    const legend = $('#donutLegend');
    legend.innerHTML = data.map(item => `
        <div class="legend-item" onclick="filterByCategory('${item.label}')">
            <div class="legend-color" style="background-color: ${item.color}"></div>
            <span>${item.label}: ${fmtMoney(-item.value)}</span>
        </div>
    `).join('');
}

function renderWeekly(points, stats) {
    const canvas = $('#weeklyChart');
    const ctx = canvas.getContext('2d');
    
    if (window.weeklyChart) {
        window.weeklyChart.destroy();
    }
    
    if (points.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    const spendData = points.map(p => p.amount < 0 ? -p.amount : 0);
    
    window.weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: points.map(p => new Date(p.week).toLocaleDateString()),
            datasets: [{
                label: 'Weekly Spend',
                data: spendData,
                backgroundColor: '#4ECDC4',
                borderColor: '#2d2d2d',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#404040' },
                    ticks: { color: '#b3b3b3' }
                },
                x: {
                    grid: { color: '#404040' },
                    ticks: { color: '#b3b3b3' }
                }
            }
        }
    });
}

// Table Functions
function renderTable(rows, categoryLabel = '') {
    const tbody = $('#transactionTable tbody');
    tbody.innerHTML = '';
    
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No transactions found</td></tr>';
        return;
    }
    
    rows.forEach(row => {
        const tr = document.createElement('tr');
        const amountClass = row.amount < 0 ? 'negative' : 'positive';
        const hiddenStyle = row.hidden ? 'opacity: 0.5;' : '';
        
        tr.innerHTML = `
            <td style="${hiddenStyle}">${row.tx_date}</td>
            <td style="${hiddenStyle}">${row.description}</td>
            <td class="amount ${amountClass}" style="${hiddenStyle}">${fmtMoney(row.amount)}</td>
            <td style="${hiddenStyle}">${row.account}</td>
            <td style="${hiddenStyle}">
                <select class="category-select" data-hash="${row.hash}" ${row.hidden ? 'disabled' : ''}>
                    ${ALL_CATEGORIES.map(cat => 
                        `<option value="${cat}" ${cat === row.category ? 'selected' : ''}>${cat}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                <button class="btn-small ${row.hidden ? 'btn-success' : ''}" onclick="toggleHidden('${row.hash}')">
                    ${row.hidden ? 'Show' : 'Hide'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add event listeners for category changes
    $('.category-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const hash = e.target.dataset.hash;
            const category = e.target.value;
            
            try {
                const resp = await fetch('/api/update_category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hash, category })
                });
                const result = await resp.json();
                
                if (result.status === 'ok') {
                    let message = `Category updated to "${category}"`;
                    if (result.learned_phrase) {
                        message += ` | Learned: "${result.learned_phrase}"`;
                        if (result.affected_like > 0) {
                            message += ` | Quick updates: ${result.affected_like}`;
                        }
                        if (result.relabelled_total > 0) {
                            message += ` | Total updates: ${result.relabelled_total}`;
                        }
                    }
                    showToast(message);
                    refreshAll();
                } else {
                    setWarning(result.error || 'Failed to update category');
                }
            } catch (error) {
                setWarning('Failed to update category: ' + error.message);
            }
        });
    });
}

// Rules Management Functions
async function loadRulesTab() {
    try {
        CURRENT_RULES = await fetchRules();
        renderRules();
    } catch (error) {
        setWarning('Failed to load rules: ' + error.message);
    }
}

function renderRules() {
    const container = $('#rulesContainer');
    const rules = CURRENT_RULES?.rules || [];
    
    container.innerHTML = rules.map((rule, index) => `
        <div class="rule-card" data-index="${index}">
            <div class="rule-header">
                <div class="rule-title">
                    <input type="text" class="rule-name" value="${rule.name || ''}" placeholder="Rule name">
                    <select class="rule-category">
                        ${ALL_CATEGORIES.map(cat => 
                            `<option value="${cat}" ${cat === rule.category ? 'selected' : ''}>${cat}</option>`
                        ).join('')}
                    </select>
                    <div class="category-badge">${rule.category}</div>
                </div>
                <div class="rule-actions">
                    <button class="btn-small btn-danger" onclick="deleteRule(${index})">Delete</button>
                </div>
            </div>
            <div class="rule-content">
                <div class="rule-section">
                    <h4>Contains Keywords</h4>
                    <div class="keywords-list" id="contains-${index}">
                        ${(rule.match?.contains_any || []).map((keyword, kidx) => `
                            <div class="keyword-tag">
                                <span>${keyword}</span>
                                <button class="keyword-remove" onclick="removeKeyword(${index}, 'contains_any', ${kidx})">×</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="keyword-input">
                        <input type="text" placeholder="Add keyword..." class="keyword-input-field" data-rule="${index}" data-type="contains_any">
                        <button class="btn-small btn-primary" onclick="addKeyword(${index}, 'contains_any')">Add</button>
                    </div>
                </div>
                <div class="rule-section">
                    <h4>Regex Patterns (Advanced)</h4>
                    <div class="keywords-list" id="regex-${index}">
                        ${(rule.match?.regex_any || []).map((pattern, pidx) => `
                            <div class="keyword-tag">
                                <span>${pattern}</span>
                                <button class="keyword-remove" onclick="removeKeyword(${index}, 'regex_any', ${pidx})">×</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="keyword-input">
                        <input type="text" placeholder="Add regex pattern..." class="keyword-input-field" data-rule="${index}" data-type="regex_any">
                        <button class="btn-small btn-primary" onclick="addKeyword(${index}, 'regex_any')">Add</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners for category changes
    $('.rule-category').forEach((select, index) => {
        select.addEventListener('change', (e) => {
            const badge = select.parentElement.querySelector('.category-badge');
            badge.textContent = e.target.value;
            updateRuleInMemory(index, 'category', e.target.value);
        });
    });
    
    // Add event listeners for name changes
    $('.rule-name').forEach((input, index) => {
        input.addEventListener('change', (e) => {
            updateRuleInMemory(index, 'name', e.target.value);
        });
    });
    
    // Add event listeners for keyword inputs
    $('.keyword-input-field').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const ruleIndex = parseInt(input.dataset.rule);
                const type = input.dataset.type;
                addKeyword(ruleIndex, type);
            }
        });
    });
}

function updateRuleInMemory(ruleIndex, field, value) {
    if (!CURRENT_RULES?.rules?.[ruleIndex]) return;
    CURRENT_RULES.rules[ruleIndex][field] = value;
}

function addKeyword(ruleIndex, type) {
    const input = $(`input[data-rule="${ruleIndex}"][data-type="${type}"]`);
    const keyword = input.value.trim();
    
    if (!keyword) return;
    
    if (!CURRENT_RULES?.rules?.[ruleIndex]) return;
    
    const rule = CURRENT_RULES.rules[ruleIndex];
    if (!rule.match) rule.match = {};
    if (!rule.match[type]) rule.match[type] = [];
    
    if (!rule.match[type].includes(keyword)) {
        rule.match[type].push(keyword);
        input.value = '';
        renderRules(); // Re-render to show new keyword
    }
}

function removeKeyword(ruleIndex, type, keywordIndex) {
    if (!CURRENT_RULES?.rules?.[ruleIndex]?.match?.[type]) return;
    
    CURRENT_RULES.rules[ruleIndex].match[type].splice(keywordIndex, 1);
    renderRules(); // Re-render to remove keyword
}

function deleteRule(ruleIndex) {
    if (!CURRENT_RULES?.rules) return;
    
    if (confirm('Are you sure you want to delete this rule?')) {
        CURRENT_RULES.rules.splice(ruleIndex, 1);
        renderRules();
    }
}

function addNewRule() {
    if (!CURRENT_RULES) CURRENT_RULES = { rules: [] };
    if (!CURRENT_RULES.rules) CURRENT_RULES.rules = [];
    
    const newRule = {
        name: "New Rule",
        category: "Uncategorised",
        match: {
            contains_any: [],
            regex_any: []
        }
    };
    
    CURRENT_RULES.rules.push(newRule);
    renderRules();
    
    // Scroll to bottom to show new rule
    setTimeout(() => {
        const container = $('#rulesContainer');
        container.scrollTop = container.scrollHeight;
    }, 100);
}

async function saveAllRules() {
    if (!CURRENT_RULES) {
        setWarning('No rules to save');
        return;
    }
    
    try {
        const result = await saveRules(CURRENT_RULES);
        if (result.status === 'ok') {
            showToast(`Rules saved successfully! ${result.relabelled || 0} transactions updated.`);
        } else {
            setWarning(result.error || 'Failed to save rules');
        }
    } catch (error) {
        setWarning('Failed to save rules: ' + error.message);
    }
}

// Global functions for onclick handlers
window.addKeyword = addKeyword;
window.removeKeyword = removeKeyword;
window.deleteRule = deleteRule;

// Utility Functions
function filterByCategory(category) {
    const select = $('#categoryFilter');
    select.value = category;
    applyFilter();
}

async function toggleHidden(hash) {
    try {
        const resp = await fetch('/api/toggle_hidden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash })
        });
        const result = await resp.json();
        if (result.status === 'ok') {
            showToast(`Transaction ${result.hidden ? 'hidden' : 'shown'}`);
            refreshAll();
        }
    } catch (error) {
        setWarning('Failed to toggle hidden status');
    }
}

function populateFilters(categories) {
    const select = $('#categoryFilter');
    select.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
}

async function applyFilter() {
    const start = $('#startDate').value;
    const end = $('#endDate').value;
    const category = $('#categoryFilter').value;
    
    const transactions = await fetchTransactions(start, end, category);
    const categoryLabel = category || 'All Categories';
    renderTable(transactions, categoryLabel);
}

async function refreshAll() {
    const start = $('#startDate').value;
    const end = $('#endDate').value;
    
    const data = await fetchSummary(start, end);
    if (!data) return;
    
    renderDonut(data.categories_breakdown || []);
    renderWeekly(data.weekly?.points || [], data.weekly?.stats || {});
    renderHist(data.hist || []);
    renderTable(data.transactions || []);
    populateFilters(data.filters?.categories || []);
}

// Table Sorting
(function initTableSorting() {
    let sortColumn = null;
    let sortAsc = true;
    
    $('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            sortAsc = sortColumn === column ? !sortAsc : true;
            sortColumn = column;
            
            const tbody = th.closest('table').querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            rows.sort((a, b) => {
                let aVal, bVal;
                
                if (column === 'amount') {
                    aVal = parseFloat(a.cells[2].textContent.replace(/[$,]/g, ''));
                    bVal = parseFloat(b.cells[2].textContent.replace(/[$,]/g, ''));
                } else if (column === 'tx_date') {
                    aVal = new Date(a.cells[0].textContent);
                    bVal = new Date(b.cells[0].textContent);
                } else {
                    const colIndex = ['tx_date', 'description', 'amount', 'account', 'category'].indexOf(column);
                    aVal = a.cells[colIndex].textContent.toLowerCase();
                    bVal = b.cells[colIndex].textContent.toLowerCase();
                }
                
                if (aVal < bVal) return sortAsc ? -1 : 1;
                if (aVal > bVal) return sortAsc ? 1 : -1;
                return 0;
            });
            
            tbody.innerHTML = '';
            rows.forEach(row => tbody.appendChild(row));
            
            // Update header indicators
            $('th[data-sort]').forEach(h => h.textContent = h.textContent.replace(' ↑', '').replace(' ↓', ''));
            th.textContent += sortAsc ? ' ↑' : ' ↓';
        });
    });
})();

// Event Wiring
function wireEvents() {
    // Upload form
    $('#uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        try {
            const resp = await fetch('/upload', { method: 'POST', body: formData });
            const result = await resp.json();
            
            if (result.status === 'ok') {
                showToast(`Uploaded successfully! ${result.inserted} transactions added.`);
                refreshAll();
                $('#fileInput').value = '';
            } else {
                setWarning(result.error || 'Upload failed');
            }
        } catch (error) {
            setWarning('Upload failed: ' + error.message);
        }
    });
    
    // Filter controls
    $('#applyFilter').addEventListener('click', applyFilter);
    $('#categoryFilter').addEventListener('change', applyFilter);
    
    // Action buttons
    $('#reloadRules').addEventListener('click', async () => {
        try {
            const resp = await fetch('/api/reload_rules', { method: 'POST' });
            const result = await resp.json();
            if (result.status === 'ok') {
                showToast(`Rules reloaded! ${result.relabelled || 0} transactions updated.`);
                refreshAll();
            } else {
                setWarning(result.error || 'Failed to reload rules');
            }
        } catch (error) {
            setWarning('Failed to reload rules: ' + error.message);
        }
    });
    
    $('#purgeTransfers').addEventListener('click', async () => {
        if (confirm('Delete all Transfer transactions? This cannot be undone.')) {
            try {
                const resp = await fetch('/api/purge_transfers', { method: 'POST' });
                const result = await resp.json();
                if (result.status === 'ok') {
                    showToast(`${result.deleted} transfer transactions deleted.`);
                    refreshAll();
                } else {
                    setWarning(result.error || 'Failed to purge transfers');
                }
            } catch (error) {
                setWarning('Failed to purge transfers: ' + error.message);
            }
        }
    });
    
    // Rules tab buttons
    $('#addRule').addEventListener('click', addNewRule);
    $('#saveRules').addEventListener('click', saveAllRules);
}

// Application Initialization
(async function start() {
    initTabs();
    wireEvents();
    
    const health = await checkHealth();
    if (!health) return;
    
    ALL_CATEGORIES = await fetchCategories();
    await refreshAll();
})();ero: true,
                    grid: { color: '#404040' },
                    ticks: { color: '#b3b3b3' }
                },
                x: {
                    grid: { color: '#404040' },
                    ticks: { color: '#b3b3b3' }
                }
            }
        }
    });
    
    const statsContainer = $('#weeklyStats');
    statsContainer.innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${fmtMoney(stats.avg)}</div>
            <div class="stat-label">Average</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${fmtMoney(stats.min)}</div>
            <div class="stat-label">Minimum</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${fmtMoney(stats.max)}</div>
            <div class="stat-label">Maximum</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${fmtMoney(stats.mode_nearest_thousand)}</div>
            <div class="stat-label">Mode (~1k)</div>
        </div>
    `;
}

function renderHist(bins) {
    const canvas = $('#histChart');
    const ctx = canvas.getContext('2d');
    
    if (window.histChart) {
        window.histChart.destroy();
    }
    
    if (bins.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    window.histChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.map(b => `$${b.bin_from}-${b.bin_to}`),
            datasets: [{
                label: 'Frequency',
                data: bins.map(b => b.count),
                backgroundColor: '#6b73ff',
                borderColor: '#2d2d2d',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZ