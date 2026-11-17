(() => {
  function ensureTabs(doc) {
    let tabs = doc.querySelector('.tabs');
    if (!tabs) {
      tabs = doc.createElement('div');
      tabs.className = 'tabs';
      (doc.querySelector('.container') || doc.body).insertBefore(tabs, (doc.querySelector('.container') || doc.body).firstChild);
    }
    return tabs;
  }

  function makeStyles(doc) {
    const css = doc.createElement('style');
    css.textContent = `
      .oc-currency-panel.section { display: none; }
      .oc-currency-panel.section.active { display: block; }
      .oc-field { margin: 8px 0; }
      .oc-select { width: 100%; background:#02061799; color:#e2e8f0; border:1px solid rgba(148,163,184,0.18); border-radius:10px; padding:10px 12px; }
      .oc-info { color:#94a3b8; font-size: 12px; margin-top: 6px; }
    `;
    doc.head.appendChild(css);
  }

  function activateTab(doc, name) {
    const sections = doc.querySelectorAll('.section');
    sections.forEach(s => s.classList.remove('active'));
    const tabs = doc.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    const my = doc.getElementById('section-currency');
    if (my) my.classList.add('active');
    const btn = doc.querySelector('.tab[data-oc="currency"]');
    if (btn) btn.classList.add('active');
  }

  async function build(doc) {
    try {
      const P = doc.defaultView?.OneCurrencyPrice || window.OneCurrencyPrice;
      if (!P) return;
      makeStyles(doc);
      const tabs = ensureTabs(doc);

      // Add Currency tab button
      if (!doc.querySelector('.tab[data-oc="currency"]')) {
        const btn = doc.createElement('button');
        btn.className = 'tab';
        btn.setAttribute('data-oc', 'currency');
        btn.type = 'button';
        btn.textContent = 'Currency';
        tabs.appendChild(btn);
        btn.addEventListener('click', () => activateTab(doc, 'currency'));
      }

      // Add panel
      if (!doc.getElementById('section-currency')) {
        const panel = doc.createElement('div');
        panel.className = 'section oc-currency-panel';
        panel.id = 'section-currency';
        panel.innerHTML = `
          <h4 class="heading">Display Currency</h4>
          <div class="oc-field">
            <label class="kv" for="oc-currency-select">Choose your currency</label>
            <select id="oc-currency-select" class="oc-select"></select>
          </div>
          <div class="oc-info">Prices shown in history and UI will use your selection. This setting is saved in the extension.</div>
        `;
        const container = doc.querySelector('.container') || doc.body;
        container.appendChild(panel);

        const sel = panel.querySelector('#oc-currency-select');
        const list = (P.SUPPORTED || ['USD']).slice();
        sel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
        try { sel.value = await P.getCurrency(); } catch(_) {}
        sel.addEventListener('change', async () => {
          try { await P.setCurrency(sel.value); doc.dispatchEvent(new Event('oc:fiat-change')); } catch(_) {}
        });
      }
    } catch(_) {}
  }

  function init(doc) {
    // Wait for OneCurrencyPrice
    const d = doc || document;
    const P = d.defaultView?.OneCurrencyPrice || window.OneCurrencyPrice;
    if (!P) { setTimeout(() => init(d), 250); return; }
    build(d);
  }

  if (document.currentScript && document.currentScript.ownerDocument) {
    init(document.currentScript.ownerDocument);
  } else {
    init(document);
  }
})();

