(() => {
  const BRIDGE_REQ = 'onecurrency-inpage';
  const BRIDGE_RES = 'onecurrency-content';

  const ensureWritableProp = (name) => {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, name);
      if (!desc) return true; // nothing defined yet
      if (desc.writable || desc.set) return true;
      if (desc.configurable !== false) {
        Object.defineProperty(window, name, { value: window[name], writable: true, configurable: true });
        return true;
      }
    } catch (_) {}
    return false;
  };

  const safeExpose = (name, value) => {
    try {
      if (window[name]) return true;
      const desc = Object.getOwnPropertyDescriptor(window, name);
      if (desc && desc.get && !desc.set && desc.configurable === false) return false;
      if (desc && desc.writable === false && desc.configurable === false) return false;
      Object.defineProperty(window, name, { value, configurable: true, writable: false });
      return true;
    } catch (_) {}
    return false;
  };

  function post(type, params) {
    return new Promise((resolve, reject) => {
      try {
        const id = Math.random().toString(36).slice(2);
        const onMsg = (evt) => {
          const d = evt?.data;
          if (!d || d.source !== BRIDGE_RES || d.id !== id) return;
          window.removeEventListener('message', onMsg);
          if (d.ok) resolve(d.data); else reject(new Error(d.error || 'Request failed'));
        };
        window.addEventListener('message', onMsg);
        window.postMessage({ source: BRIDGE_REQ, id, type, params: params || {} }, '*');
        setTimeout(() => { try { window.removeEventListener('message', onMsg); } catch(_){}; reject(new Error('OneCurrency timeout')); }, 10000);
      } catch (e) { reject(e); }
    });
  }

  function createEventEmitter() {
    const listeners = new Map();
    return {
      on(event, cb) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(cb); },
      off(event, cb) { listeners.get(event)?.delete(cb); },
      emit(event, ...args) { listeners.get(event)?.forEach((cb) => { try { cb(...args); } catch(_){} }); },
      _listeners: listeners,
    };
  }

  class OneCurrencyProvider {
    constructor() {
      this.emitter = createEventEmitter();
      this.isOneCurrency = true;
      this.isBitcoin = true;
      // Event passthrough from content script
      window.addEventListener('message', (evt) => {
        const d = evt?.data;
        if (!d || d.source !== BRIDGE_RES || d.type !== 'event') return;
        const { event, data } = d;
        this.emitter.emit(event, data);
      });
    }
    on(ev, cb) { this.emitter.on(ev, cb); }
    off(ev, cb) { this.emitter.off(ev, cb); }

    async requestAccounts() { return await post('connect', {}); }
    async getAccounts() { return await post('getAccounts', {}); }
    async connect() { return await this.requestAccounts(); }
    async getNetwork() { return await post('getNetwork', {}); }
    async getBalance() { return await post('getBalance', {}); }
    async signMessage(message) { return await post('signMessage', { message }); }
    async sendBitcoin(to, satoshis) { return await post('sendBitcoin', { to, satoshis }); }

    // EIP-1193 style request method mapping (some sites expect provider.request)
    async request({ method, params }) {
      const p = params || {};
      switch ((method || '').toLowerCase()) {
        case 'requestaccounts':
        case 'eth_requestaccounts':
        case 'wallet_requestpermissions':
          return await this.requestAccounts();
        case 'getaccounts':
        case 'eth_accounts':
          return await this.getAccounts();
        case 'getnetwork':
          return await this.getNetwork();
        case 'getbalance':
          return await this.getBalance();
        case 'signmessage':
          return await this.signMessage(p.message || '');
        case 'sendbitcoin':
          return await this.sendBitcoin(p.to, p.satoshis);
        default:
          throw new Error('Unsupported method: ' + method);
      }
    }
  }

  const provider = new OneCurrencyProvider();
  // Some sites/extensions define getter-only properties (e.g., window.ethereum); make them writable so later assignments don't throw.
  ensureWritableProp('ethereum');
  // Expose as window.onecurrency
  try { safeExpose('onecurrency', provider); } catch(_) {}
  // Provide a minimal UniSat-compatible surface for ordinals sites if not present
  try {
    if (!window.unisat) {
      const unisat = {
        requestAccounts: () => provider.requestAccounts(),
        getAccounts: () => provider.getAccounts(),
        getNetwork: () => provider.getNetwork(),
        getBalance: () => provider.getBalance(),
        signMessage: (msg) => provider.signMessage(msg),
        sendBitcoin: (to, satoshis) => provider.sendBitcoin(to, satoshis),
        on: (...a) => provider.on(...a),
        removeListener: (...a) => provider.off(...a),
      };
      safeExpose('unisat', unisat);
    }
  } catch(_) {}
})();
