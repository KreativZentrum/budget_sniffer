// static/js/doughnut_tooltips.js
// GLOBAL tooltip tweak for Chart.js: adds "$ + % of total" ONLY for doughnut charts.
// Safe for CSS: no HTML or CSS edits required. Just include this script.
(function(){
  if (!window.Chart) return;
  function formatNZD(x){
    try {
      return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(x);
    } catch(e){
      return "$" + (Math.round(x)).toLocaleString();
    }
  }
  const original = (Chart.defaults.plugins.tooltip && Chart.defaults.plugins.tooltip.callbacks && Chart.defaults.plugins.tooltip.callbacks.label) || null;
  if (!Chart.defaults.plugins.tooltip) Chart.defaults.plugins.tooltip = { callbacks: {} };
  const prev = Chart.defaults.plugins.tooltip.callbacks.label || original;
  Chart.defaults.plugins.tooltip.callbacks.label = function(context){
    try{
      const type = context.chart && context.chart.config && context.chart.config.type;
      if (type === 'doughnut' || type === 'pie'){
        const dataset = context.dataset || {};
        const arr = Array.isArray(dataset.data) ? dataset.data : [];
        const total = arr.reduce((a,b)=>a + (typeof b==='number'?b:parseFloat(b)||0), 0);
        const val = context.parsed;
        const pct = total > 0 ? (val/total)*100 : 0;
        const name = context.label || dataset.label || '';
        return `${name}: ${formatNZD(val)} (${pct.toFixed(1)}%)`;
      }
    }catch(e){/* fall through to original */}
    if (typeof prev === 'function') return prev(context);
    // basic fallback
    const name = context.label || (context.dataset && context.dataset.label) || '';
    return `${name}: ${context.formattedValue}`;
  };
})();