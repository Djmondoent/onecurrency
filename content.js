(() => {
  function respond(sendResponse, data, ok = true, error = null) {
    try {
      sendResponse({ ok, data, error });
    } catch (_) {}
  }

  // OneCurrency bridge via postMessage
  function makeOneCurrencyProvider() {
    const ask = (type, params = {}) => new Promise((resolve, reject) => {
      try {
        const id = Math.random().toString(36).slice(2)
        const to = { source: 'onecurrency-ext', id, type, params }
        const onMsg = (evt) => {
          const d = evt?.data
          if (!d || d.source !== 'onecurrency-app' || d.id !== id) return
          window.removeEventListener('message', onMsg)
          if (d.ok) resolve(d.data); else reject(new Error(d.error || 'Request failed'))
        }
        window.addEventListener('message', onMsg)
        window.postMessage(to, '*')
        setTimeout(() => { try { window.removeEventListener('message', onMsg) } catch(_){}; reject(new Error('OneCurrency timeout')) }, 10000)
      } catch (e) { reject(e) }
    })
    return {
      getAccounts: async () => await ask('getAccounts'),
      requestAccounts: async () => await ask('getAccounts'),
      connect: async () => await ask('getAccounts'),
      getNetwork: async () => await ask('getNetwork'),
      getBalance: async () => await ask('getBalance'),
      signMessage: async (_msg) => { throw new Error('signMessage not supported') },
      sendBitcoin: async () => { throw new Error('sendBitcoin not supported') },
      __available: async () => {
        try {
          // Fast DOM hint set by the app
          if (document?.documentElement?.getAttribute('data-onecurrency') === '1') return true;
        } catch {}
        // Fallback: try pinging a few times quickly
        const tries = 8;
        for (let i = 0; i < tries; i++) {
          try { const ok = await ask('ping'); if (ok) return true } catch {}
          await new Promise(r => setTimeout(r, 250));
        }
        return false;
      },
    }
  }

  function pickProvider(_kind) {
    // OneCurrency only
    return makeOneCurrencyProvider();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.source !== 'popup-req') return;
    (async () => {
      try {
        const provider = pickProvider(message.params?.provider);
        switch (message.type) {
          case 'provider-available': {
            if (provider && typeof provider.__available === 'function') {
              const ok = await provider.__available();
              respond(sendResponse, !!ok);
            } else {
              respond(sendResponse, !!provider);
            }
            break;
          }
          case 'getAccounts': {
            if (!provider) throw new Error('Wallet not available');
            const fn = provider.getAccounts || provider.requestAccounts;
            const accs = await (typeof fn === 'function' ? fn.call(provider) : provider.getAccounts());
            respond(sendResponse, accs);
            break;
          }
          case 'connect': {
            if (!provider) throw new Error('Wallet not available');
            const fn = provider.requestAccounts || provider.connect || provider.getAccounts;
            const accs = await (typeof fn === 'function' ? fn.call(provider) : provider.requestAccounts());
            respond(sendResponse, accs);
            break;
          }
          case 'getNetwork': {
            if (!provider) throw new Error('Wallet not available');
            const net = await (provider.getNetwork ? provider.getNetwork() : '');
            respond(sendResponse, net);
            break;
          }
          case 'getBalance': {
            if (!provider) throw new Error('Wallet not available');
            const bal = await (provider.getBalance ? provider.getBalance() : 0);
            respond(sendResponse, bal);
            break;
          }
          case 'signMessage': {
            if (!provider) throw new Error('Wallet not available');
            const sig = await (provider.signMessage ? provider.signMessage(message.params?.message || '') : Promise.reject(new Error('signMessage not supported')));
            respond(sendResponse, sig);
            break;
          }
          case 'sendBitcoin': {
            if (!provider) throw new Error('Wallet not available');
            const { to, satoshis } = message.params || {};
            if (!provider.sendBitcoin) throw new Error('sendBitcoin not supported by selected wallet');
            const txid = await provider.sendBitcoin(to, satoshis);
            respond(sendResponse, txid);
            break;
          }
          default:
            respond(sendResponse, null, false, 'Unknown request type');
        }
      } catch (e) {
        respond(sendResponse, null, false, e?.message || String(e));
      }
    })();
    return true; // keep channel open for async
  });

  try {
    const attach = (prov) => {
      if (prov && typeof prov.on === 'function') {
        prov.on('accountsChanged', (accounts) => {
          chrome.runtime.sendMessage({ source: 'content', type: 'accountsChanged', data: accounts });
        });
        prov.on('networkChanged', (network) => {
          chrome.runtime.sendMessage({ source: 'content', type: 'networkChanged', data: network });
        });
      }
    };
    // No external wallet event wiring; OneCurrency uses page bridge
  } catch (_) {}
})();
