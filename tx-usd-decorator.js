(() => {
  const AMOUNT_RE = /([0-9]+(?:\.[0-9]{1,8})?)\s*BTC\b/i;

  function parseAmountBtc(text) {
    const m = String(text || '').match(AMOUNT_RE);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function parseTimestamp(el) {
    try {
      // time[datetime]
      const t = el.querySelector('time[datetime]');
      if (t && t.getAttribute('datetime')) {
        const d = Date.parse(t.getAttribute('datetime'));
        if (Number.isFinite(d)) return Math.floor(d / 1000);
      }
      // data-ts or data-time in seconds/ms
      const cand = el.closest('[data-ts], [data-time]') || el.querySelector('[data-ts], [data-time]');
      if (cand) {
        const raw = cand.getAttribute('data-ts') || cand.getAttribute('data-time');
        const n = Number(raw);
        if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n / 1000) : n; // ms vs sec
      }
      // Fallback: parse a date-like string in the row
      const text = el.textContent || '';
      const d = Date.parse(text);
      if (Number.isFinite(d)) return Math.floor(d / 1000);
    } catch(_) {}
    return null;
  }

  function buildUsdNode() {
    const wrap = document.createElement('div');
    wrap.className = 'kv';
    wrap.setAttribute('data-oc-usd', '1');
    // Two lines: then and now; color delta
    wrap.innerHTML = '<div class="oc-then"></div><div class="oc-now"></div>';
    return wrap;
  }

  async function computeAndRender(row, amountBtc, tsSec) {
    try {
      const p = window.OneCurrencyPrice;
      if (!p) return;
      const ccy = await p.getCurrency();
      const [nowPer, thenPer] = await Promise.all([
        p.getNow(ccy),
        tsSec ? p.getAt(tsSec, ccy) : Promise.resolve(0),
      ]);
      const nowVal = amountBtc * nowPer;
      const thenVal = thenPer ? amountBtc * thenPer : null;
      let deltaStr = '';
      if (thenVal && thenPer) {
        const deltaPct = thenPer ? ((nowPer - thenPer) / thenPer) * 100 : 0;
        const sign = deltaPct >= 0 ? '+' : '';
        const color = deltaPct >= 0 ? '#86efac' : '#fca5a5';
        deltaStr = ` <span style="color:${color}">(${sign}${deltaPct.toFixed(2)}%)</span>`;
      }
      let holder = row.querySelector('[data-oc-usd="1"]');
      if (!holder) {
        holder = buildUsdNode();
        // Insert right under the row content
        row.appendChild(holder);
      }
      const thenEl = holder.querySelector('.oc-then');
      const nowEl = holder.querySelector('.oc-now');
      if (thenVal != null) thenEl.innerHTML = `Worth then: ${p.fmt(thenVal, ccy)}`; else thenEl.innerHTML = '';
      nowEl.innerHTML = `Now: ${p.fmt(nowVal, ccy)}${deltaStr}`;
    } catch(_) {}
  }

  function findRowFor(el) {
    // Prefer closest .row; else a direct parent card section
    const r = el.closest('.row');
    if (r) return r;
    const c = el.closest('.card') || el.parentElement;
    return c || el;
  }

  function scanOnce(root) {
    const nodes = Array.from(root.querySelectorAll('*, .row'));
    for (const n of nodes) {
      if (n.getAttribute && n.getAttribute('data-oc-usd-skip') === '1') continue;
      const amt = parseAmountBtc(n.textContent || '');
      if (amt == null) continue;
      const row = findRowFor(n);
      if (!row || row.querySelector('[data-oc-usd="1"]')) continue;
      const ts = parseTimestamp(row);
      computeAndRender(row, amt, ts);
      row.setAttribute('data-oc-usd-skip', '1');
    }
  }

  function setupObserver() {
    const ro = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') {
          m.addedNodes && m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) scanOnce(n);
          });
        } else if (m.type === 'characterData') {
          const el = m.target && m.target.parentElement;
          if (el) scanOnce(el);
        }
      }
    });
    ro.observe(document.body, { subtree: true, childList: true, characterData: true });
    // First pass
    scanOnce(document);
    // Recompute when fiat currency changes
    try {
      document.addEventListener('oc:fiat-change', () => scanOnce(document));
      window.OneCurrencyPrice?.onChange?.(() => scanOnce(document));
    } catch(_) {}
  }

  function init() {
    if (!window.OneCurrencyPrice) {
      // Wait a moment for price helper to load
      setTimeout(init, 300);
      return;
    }
    setupObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
