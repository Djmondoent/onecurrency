(() => {
  const frame = document.getElementById('app-frame');
  if (!frame) return;

  function injectStyles(doc) {
    try {
      const style = doc.createElement('style');
      style.textContent = `
        /* Hide install-extension overlay inside the bundled app when running as an extension */
        #install-ext-overlay { display: none !important; }
        /* Mobile-friendly + compact layout when embedded in the narrow popup */
        html, body, #root { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
        [data-oc-compact="1"] body { font-size: 13px; line-height: 1.35; }
        [data-oc-compact="1"] .container { width: 100% !important; max-width: 100% !important; padding: 8px 10px !important; }
        [data-oc-compact="1"] .heading { font-size: 16px !important; margin: 6px 0 !important; }
        [data-oc-compact="1"] .subtle { font-size: 12px !important; }
        [data-oc-compact="1"] .card { border-radius: 10px !important; padding: 10px !important; }
        [data-oc-compact="1"] .row, [data-oc-compact="1"] .section { margin: 6px 0 !important; }
        [data-oc-compact="1"] .inline, [data-oc-compact="1"] .flex { flex-direction: column !important; align-items: stretch !important; gap: 6px !important; }
        [data-oc-compact="1"] .grid, [data-oc-compact="1"] .cols, [data-oc-compact="1"] .columns, [data-oc-compact="1"] .row-flex { display: block !important; }
        [data-oc-compact="1"] input, [data-oc-compact="1"] select, [data-oc-compact="1"] textarea { width: 100% !important; padding: 6px 8px !important; }
        [data-oc-compact="1"] .btn, [data-oc-compact="1"] button { width: 100% !important; padding: 6px 10px !important; }
        [data-oc-compact="1"] img.brand-logo { width: 28px !important; height: 28px !important; }
        [data-oc-compact="1"] img[alt*="QR"], [data-oc-compact="1"] #qr { width: 120px !important; height: 120px !important; }
        /* Tabs stack vertically so all are visible */
        [data-oc-compact="1"] .tabs { display:block !important; width:100% !important; padding: 4px 0 !important; border: 0 !important; background: transparent !important; }
        [data-oc-compact="1"] .tab { display:block !important; width:100% !important; margin: 6px 0 !important; text-align:left !important; }
        @media (max-width: 440px) {
          [data-oc-compact="1"] .btn { padding: 6px 10px !important; }
        }
      `;
      doc.head && doc.head.appendChild(style);
    } catch (_) {}
  }

  function markAsExtension(doc) {
    try {
      doc.documentElement.setAttribute('data-onecurrency', '1');
      doc.documentElement.setAttribute('data-oc-compact', '1');
    } catch (_) {}
  }

  function onLoad() {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;
      injectStyles(doc);
      markAsExtension(doc);
      // Inject price helper into the iframe so the app can query USD prices
      try {
        const s = doc.createElement('script');
        s.src = chrome.runtime.getURL('price-helper.js');
        s.async = false;
        doc.documentElement.appendChild(s);
      } catch (_) {}
      // Add a compact fiat currency selector overlay inside the iframe
      try {
        const css = doc.createElement('style');
        css.textContent = `
          .oc-fiat { position: fixed; top: 8px; right: 8px; z-index: 99999; }
          .oc-fiat-btn { border:1px solid rgba(148,163,184,0.18); background:#0b1220aa; color:#e2e8f0; padding:6px 10px; border-radius:8px; cursor:pointer; font: inherit; }
          .oc-fiat-panel { position:absolute; right:0; margin-top:6px; background:#0b1220; border:1px solid rgba(148,163,184,0.18); border-radius:10px; box-shadow:0 10px 30px rgba(2,8,23,0.6); padding:8px; display:none; }
          .oc-fiat.open .oc-fiat-panel { display:block; }
          .oc-fiat-select { width: 180px; background:#02061799; color:#e2e8f0; border:1px solid rgba(148,163,184,0.18); border-radius:8px; padding:6px 8px; }
        `;
        doc.head.appendChild(css);
        const wrap = doc.createElement('div');
        wrap.className = 'oc-fiat';
        wrap.innerHTML = `<button class="oc-fiat-btn" type="button">Fiat: --</button><div class="oc-fiat-panel"><select class="oc-fiat-select"></select></div>`;
        doc.body.appendChild(wrap);

        const btn = wrap.querySelector('.oc-fiat-btn');
        const panel = wrap.querySelector('.oc-fiat-panel');
        const sel = wrap.querySelector('.oc-fiat-select');
        const P = frame.contentWindow?.OneCurrencyPrice;
        const list = (P?.SUPPORTED || ['USD']).slice();
        sel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');

        async function refreshLabel() {
          try { const cur = await P.getCurrency(); btn.textContent = 'Fiat: ' + cur; sel.value = cur; } catch(_) {}
        }
        refreshLabel();
        btn.addEventListener('click', () => { wrap.classList.toggle('open'); });
        sel.addEventListener('change', async () => {
          try { await P.setCurrency(sel.value); refreshLabel(); doc.dispatchEvent(new Event('oc:fiat-change')); } catch(_) {}
          wrap.classList.remove('open');
        });
        doc.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
      } catch (_) {}
      // Inject a decorator that augments transaction rows with USD then/now
      try {
        const s2 = doc.createElement('script');
        s2.src = chrome.runtime.getURL('tx-usd-decorator.js');
        s2.async = false;
        doc.documentElement.appendChild(s2);
      } catch (_) {}
      // Inject Currency tab into the app tabs
      try {
        const s3 = doc.createElement('script');
        s3.src = chrome.runtime.getURL('currency-tab.js');
        s3.async = false;
        doc.documentElement.appendChild(s3);
      } catch (_) {}
      // Auto-size iframe to its content height
      try {
        const update = () => {
          const el = doc.documentElement;
          const body = doc.body;
          const full = (el?.scrollHeight || 0) || (body?.scrollHeight || 0) || 820;
          const h = Math.max(700, Math.min(1600, full));
          frame.style.height = h + 'px';
        };
        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(doc.documentElement);
        ro.observe(doc.body);
      } catch (_) {}
    } catch (_) {}
  }

  frame.addEventListener('load', onLoad);

  // Adjust height if popup is resized by the browser
  function resize() {
    try {
      // Keep width fully fluid; height will be managed by content ResizeObserver
      frame.style.width = '100%';
    } catch (_) {}
  }
  window.addEventListener('resize', resize);
  resize();
})();
