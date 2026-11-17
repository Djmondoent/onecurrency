// Lightweight BTC->USD price helper for both extension and web contexts
(() => {
  const CACHE_MS = 20 * 60 * 1000;
  let inflight = null;
  let lastFail = 0;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_CCY = 'USD';
  const SUPPORTED = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','CNY','HKD','SGD','INR','BRL','MXN','NGN','ZAR','SEK','NOK','DKK'];

  function hasChromeStorage() {
    try { return !!(chrome && chrome.storage && chrome.storage.local); } catch(_) { return false; }
  }

  // Storage wrapper: chrome.storage.local when available, else localStorage
  const store = (() => {
    if (hasChromeStorage()) {
      return {
        async get(key) { try { const obj = await chrome.storage.local.get(key); return obj?.[key] ?? null; } catch(_) { return null } },
        async set(key, val) { try { await chrome.storage.local.set({ [key]: val }); } catch(_) {} },
      };
    }
    return {
      async get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch(_) { return null } },
      async set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(_) {} },
    };
  })();

  const listeners = new Set();
  function emitChange() { listeners.forEach(fn => { try { fn(); } catch(_) {} }); }

  async function getCurrency() {
    const pref = await store.get('oc.currency');
    const code = String(pref || '').toUpperCase();
    return SUPPORTED.includes(code) ? code : DEFAULT_CCY;
  }
  async function setCurrency(code) {
    const v = String(code || '').toUpperCase();
    const c = SUPPORTED.includes(v) ? v : DEFAULT_CCY;
    await store.set('oc.currency', c);
    emitChange();
    return c;
  }

  const Price = {
    SUPPORTED,
    onChange(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
    async getCurrency() { return await getCurrency(); },
    async setCurrency(code) { return await setCurrency(code); },
    async getNow(vs) {
      const ccy = String(vs || await getCurrency() || DEFAULT_CCY).toLowerCase();
      const key = 'oc.price.now.' + ccy;
      const now = Date.now();
      const cached = await store.get(key);
      if (cached && now - cached.t < CACHE_MS) return cached.v;
      if (inflight) return inflight;
      if (lastFail && now - lastFail < CACHE_MS) return cached?.v ?? 0;
      inflight = (async () => {
        try {
          const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=' + encodeURIComponent(ccy);
          const r = await fetch(url);
          if (!r.ok) { lastFail = Date.now(); return cached?.v ?? 0; }
          const j = await r.json();
          const v = Number(j?.bitcoin?.[ccy] || 0);
          if (v > 0) { await store.set(key, { t: Date.now(), v }); return v; }
          lastFail = Date.now();
          return cached?.v ?? 0;
        } finally { inflight = null; }
      })();
      return inflight;
    },
    async getAt(tsSec, vs) {
      if (!Number.isFinite(tsSec) || tsSec <= 0) return 0;
      const ccy = String(vs || await getCurrency() || DEFAULT_CCY).toLowerCase();
      // Round to day key for caching
      const day = new Date(tsSec * 1000).toISOString().slice(0,10);
      const key = 'oc.price.hist.' + ccy + '.' + day;
      const now = Date.now();
      const cached = await store.get(key);
      let series;
      if (cached && (now - cached.t) < DAY_MS) {
        series = cached.series || [];
      } else {
        const from = Math.floor(new Date(day + 'T00:00:00Z').getTime() / 1000);
        const to = from + 24 * 60 * 60;
        const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=${encodeURIComponent(ccy)}&from=${from}&to=${to}`;
        const r = await fetch(url);
        const j = await r.json();
        series = Array.isArray(j?.prices) ? j.prices : [];
        await store.set(key, { t: now, series });
      }
      if (!series.length) return 0;
      // Nearest price point
      const target = tsSec;
      let best = series[0][1];
      let bestDiff = Math.abs(series[0][0] / 1000 - target);
      for (const [ms, price] of series) {
        const diff = Math.abs(ms / 1000 - target);
        if (diff < bestDiff) { bestDiff = diff; best = price; }
      }
      return Number(best || 0);
    },
    satsToBtc(sats) { return Number(sats || 0) / 1e8 },
    fmt(x, code) {
      const n = Number(x || 0);
      const cur = (String(code || DEFAULT_CCY) || DEFAULT_CCY).toUpperCase();
      const opts = n >= 1000 ? { style: 'currency', currency: cur, maximumFractionDigits: 0 }
                              : { style: 'currency', currency: cur, maximumFractionDigits: 2 };
      try { return n.toLocaleString(undefined, opts); } catch(_) { return `${cur} ${n.toFixed(2)}` }
    },
  };

  try { window.OneCurrencyPrice = Price; } catch(_) {}
})();
