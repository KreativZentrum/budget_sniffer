// static/js/add_repo_ref.js
// Inserts a small repo reference under the first H1 on the page (non-destructive, CSS-safe).
(function(){
  const ref = (window.BS_REPO_REF || 'github.com/KreativZentrum/budget_sniffer');
  function run(){
    const h1 = document.querySelector('h1, .page-title');
    if (!h1) return;
    if (document.getElementById('bs-repo-ref')) return;
    const a = document.createElement('a');
    a.href = 'https://' + ref.replace(/^https?:\/\//,'').replace(/\/+$/,'');
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = ref;

    const small = document.createElement('div');
    small.id = 'bs-repo-ref';
    small.style.fontSize = '12px';
    small.style.opacity = '0.75';
    small.style.margin = '8px 0 16px';
    small.appendChild(document.createTextNode('Repo: '));
    small.appendChild(a);

    h1.insertAdjacentElement('afterend', small);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();