(() => {
  const connectBtn = document.getElementById('connect');
  const addrEl = document.getElementById('address');
  const copyBtn = document.getElementById('copy');
  const qrImg = document.getElementById('qr');
  const netEl = document.getElementById('network');
  const balCardEl = document.getElementById('balance-cc');
  const toggleBalBtn = document.getElementById('toggle-balance');
  const privacyToggleBtn = document.getElementById('privacy-toggle');
  const supportSubjectEl = document.getElementById('support-subject');
  const supportBodyEl = document.getElementById('support-body');
  const supportSendBtn = document.getElementById('support-send');
  const tabButtons = Array.from(document.querySelectorAll('.tab'));
  const msgEl = document.getElementById('message');
  const signBtn = document.getElementById('sign');
  const sigEl = document.getElementById('sig');
  const toEl = document.getElementById('to');
  const amountEl = document.getElementById('amount');
  const sendBtn = document.getElementById('send');
  const txEl = document.getElementById('tx');

  let tabId = null;
  let currentAddr = null;

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id || null;
  }

  function getProvider() { return 'onecurrency'; }

  async function rpc(type, params = {}) {
    if (!tabId) tabId = await getActiveTabId();
    if (!tabId) throw new Error('No active tab');
    const res = await chrome.tabs.sendMessage(tabId, { source: 'popup-req', type, params: { ...params, provider: getProvider() } });
    if (!res) throw new Error('No response from content script');
    if (!res.ok) throw new Error(res.error || 'Request failed');
    return res.data;
  }

  function satsToBtcStr(satsVal) {
    const n = Number(satsVal || 0);
    const btc = n / 1e8;
    let s = btc.toFixed(8);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s || '0';
  }

  function formatAsCardDigits(numStr) {
    if (!numStr) return '';
    const parts = String(numStr).split('.');
    const intPart = parts[0] || '0';
    const fracPart = parts[1] || '';
    // Group integer part in chunks of 4 from the left (like CC left-justified)
    const intGroups = [];
    for (let i = 0; i < intPart.length; i += 4) {
      intGroups.push(intPart.slice(i, i + 4));
    }
    // Group decimal part in chunks of 4 from the left
    const fracGroups = [];
    for (let i = 0; i < fracPart.length; i += 4) {
      fracGroups.push(fracPart.slice(i, i + 4));
    }
    const left = intGroups.join(' ');
    const right = fracGroups.length ? fracGroups.join(' ') : '';
    return right ? `${left}.${right}` : left;
  }

  async function ensureProvider() {
    try {
      const ok = await rpc('provider-available');
      if (!ok) throw new Error();
      return true;
    } catch {
      if (confirm('OneCurrency not detected. Make sure your active tab is https://onecurrency.net/dist/ (fully loaded), then open the extension popup again. Open onecurrency.net/dist/ now?')) {
        chrome.tabs.create({ url: 'https://onecurrency.net/dist/' });
      }
      return false;
    }
  }

  async function refreshBasics() {
    await refreshAddress();
    await refreshNetwork();
    await refreshBalance();
  }

  async function refreshAddress() {
    try {
      const accs = await rpc('getAccounts');
      currentAddr = accs?.[0] || null;
      addrEl.textContent = currentAddr || 'Not connected';
      updateQr();
    } catch (e) {
      addrEl.textContent = 'Not connected';
      updateQr();
    }
  }

  function labelNetwork(net) {
    const s = String(net || '').toLowerCase();
    if (!s) return '-';
    if (['livenet', 'mainnet', 'main'].includes(s)) return 'Mainnet';
    if (['testnet', 'test'].includes(s)) return 'Testnet';
    return net;
  }

  async function refreshNetwork() {
    try {
      const net = await rpc('getNetwork');
      netEl.textContent = labelNetwork(net);
    } catch (_) {
      netEl.textContent = '-';
    }
  }

  async function refreshBalance() {
    if (!currentAddr) { if (balCardEl) balCardEl.textContent = '-'; return; }
    try {
      const bal = await rpc('getBalance');
      // UniSat returns either a number (sats) or an object { total, confirmed, unconfirmed }
      const sats = (typeof bal === 'number') ? bal : (bal?.total ?? bal?.confirmed ?? 0);
      if (balCardEl) {
        const plain = satsToBtcStr(sats);
        balCardEl.textContent = `${formatAsCardDigits(plain)} BTC`;
      }
    } catch (e) {
      if (balCardEl) balCardEl.textContent = 'Error';
    }
  }

  async function connect() {
    if (!(await ensureProvider())) return;
    try {
      const accs = await rpc('connect');
      currentAddr = accs?.[0] || null;
      addrEl.textContent = currentAddr || 'Not connected';
      updateQr();
      await refreshNetwork();
      await refreshBalance();
    } catch (e) {
      alert(e.message || 'Connect failed');
    }
  }

  async function signMessage() {
    if (!currentAddr) return alert('Connect a wallet first.');
    const message = msgEl.value || 'Hello from Bitcoin Wallet popup';
    try {
      const sig = await rpc('signMessage', { message });
      sigEl.textContent = sig;
    } catch (e) {
      sigEl.textContent = e.message || 'Signing failed';
    }
  }

  function isValidBtcAddress(a) {
    return typeof a === 'string' && a.length >= 26 && a.length <= 62;
  }

  async function sendBtc() {
    if (!currentAddr) return alert('Connect a wallet first.');
    const to = toEl.value.trim();
    const amountBtc = Number(amountEl.value);
    if (!isValidBtcAddress(to)) return alert('Enter a valid BTC address');
    if (!Number.isFinite(amountBtc) || amountBtc <= 0) return alert('Enter a valid amount');

    const satoshis = Math.round(amountBtc * 1e8);
    try {
      const txid = await rpc('sendBitcoin', { to, satoshis });
      txEl.textContent = `Sent: ${txid}`;
      await refreshBalance();
    } catch (e) {
      txEl.textContent = e.message || 'Transaction failed';
    }
  }

  function updateQr() {
    const addr = currentAddr;
    if (!addr) {
      if (qrImg) qrImg.removeAttribute('src');
      return;
    }
    // Use a lightweight web QR service to render the code.
    // Data follows the BIP21 URI scheme: bitcoin:<address>
    const uri = `bitcoin:${addr}`;
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(uri)}`;
    if (qrImg) qrImg.src = src;
  }

  // Events from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.source !== 'content') return;
    if (msg.type === 'accountsChanged') {
      currentAddr = msg.data?.[0] || null;
      addrEl.textContent = currentAddr || 'Not connected';
      refreshBalance();
      updateQr();
    } else if (msg.type === 'networkChanged') {
      netEl.textContent = labelNetwork(msg.data || '-');
      refreshBalance();
    }
  });

  // UI bindings
  connectBtn.addEventListener('click', connect);
  signBtn.addEventListener('click', signMessage);
  sendBtn.addEventListener('click', sendBtc);
  copyBtn.addEventListener('click', async () => {
    if (!currentAddr) return;
    try {
      await navigator.clipboard.writeText(currentAddr);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1000);
    } catch (_) {}
  });

  // No provider selector: OneCurrency only

  // Tabs switching
  function activateTab(name) {
    const sections = {
      wallet: document.getElementById('section-wallet'),
      privacy: document.getElementById('section-privacy'),
      support: document.getElementById('section-support'),
    };
    Object.entries(sections).forEach(([key, el]) => {
      if (!el) return;
      if (key === name) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
    tabButtons.forEach((b) => {
      if (b.dataset.tab === name) b.classList.add('active'); else b.classList.remove('active');
    });
  }
  tabButtons.forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));

  // Privacy toggle (balance blur)
  function toggleBalanceVisibility() {
    if (!balCardEl) return;
    const hidden = balCardEl.classList.toggle('blurred');
    if (toggleBalBtn) toggleBalBtn.textContent = hidden ? 'Show' : 'Hide';
  }
  toggleBalBtn?.addEventListener('click', toggleBalanceVisibility);
  privacyToggleBtn?.addEventListener('click', toggleBalanceVisibility);

  // Buy Bitcoin button removed from popup

  // Support email (Gmail compose)
  supportSendBtn?.addEventListener('click', async () => {
    const subject = (supportSubjectEl?.value || 'Support Request').trim();
    const bodyUser = (supportBodyEl?.value || '').trim();
    const details = [];
    if (currentAddr) details.push(`Address: ${currentAddr}`);
    if (netEl?.textContent) details.push(`Network: ${netEl.textContent}`);
    const body = `${bodyUser}\n\n---\n${details.join('\n')}`.trim();
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent('info@onecurrency.net')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url });
  });

  // Init
  (async () => {
    // Try to populate without forcing a connect
    await refreshBasics();
    // Default: keep balance hidden (blurred); ensure toggle text reflects it
    if (balCardEl) {
      balCardEl.classList.add('blurred');
      if (toggleBalBtn) toggleBalBtn.textContent = 'Show';
    }
  })();
})();
