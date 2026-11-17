const STORAGE_KEY = "onefaucet_state_v1";
const CLAIM_REWARD = 41; // sats per hour
const CLAIM_COOLDOWN_MS = 60 * 60 * 1000; // one hour
const MIN_WITHDRAW = 30000;
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mpwvkzpv";
const SPIN_REWARD_SATS = 20000; // 0.000200000 BTC
const SPIN_COOLDOWN_MS = 60 * 60 * 1000; // one hour
const SPIN_WIN_NUMBER = 9999;
const SPIN_RANGE = 10000;

const els = {
  address: document.getElementById("addressInput"),
  autoClaim: document.getElementById("autoClaimToggle"),
  claimButton: document.getElementById("claimButton"),
  cooldownLabel: document.getElementById("cooldownLabel"),
  rewardLabel: document.getElementById("claimReward"),
  balance: document.getElementById("balanceValue"),
  badge: document.getElementById("eligibilityBadge"),
  withdrawAmount: document.getElementById("withdrawAmount"),
  withdrawButton: document.getElementById("withdrawButton"),
  withdrawForm: document.getElementById("withdrawForm"),
  withdrawEmail: document.getElementById("withdrawEmail"),
  withdrawAddress: document.getElementById("withdrawAddress"),
  spinButton: document.getElementById("spinButton"),
  spinResult: document.getElementById("spinResult"),
  spinStatus: document.getElementById("spinStatus"),
  activity: document.getElementById("activityLog"),
  toast: document.getElementById("toast"),
  captchaQuestion: document.getElementById("captchaQuestion"),
  captchaAnswer: document.getElementById("captchaAnswer"),
  refreshCaptcha: document.getElementById("refreshCaptcha"),
  spinDie: document.getElementById("spinDie"),
  diceOne: document.getElementById("spinDieOne"),
  diceTwo: document.getElementById("spinDieTwo"),
};

const state = loadState();
let captchaSolution = null;
let timerId = null;
let withdrawing = false;
const defaultWithdrawLabel = "Submit withdraw request";
let lastConfettiTimeout = null;
let spinRollInterval = null;
let spinRevealTimeout = null;

init();

function init() {
  const addr = state.address || "";
  if (els.address) els.address.value = addr;
  if (els.withdrawAddress) els.withdrawAddress.value = addr;
  els.autoClaim.checked = state.autoClaim;
  els.rewardLabel.textContent = `${CLAIM_REWARD} sats`;
  if (els.withdrawEmail) els.withdrawEmail.value = state.email || "";
  generateCaptcha();
  updateUI();
  bindEvents();
  startTimerLoop();
  log("Ready", "Faucet loaded on this device");
}

function bindEvents() {
  els.claimButton.addEventListener("click", handleClaim);
  els.autoClaim.addEventListener("change", () => {
    state.autoClaim = els.autoClaim.checked;
    persist();
    showToast(state.autoClaim ? "Auto-claim enabled" : "Auto-claim disabled");
  });
  if (els.address) {
    els.address.addEventListener("input", (event) => setAddress(event.target.value));
  }
  if (els.withdrawAddress) {
    els.withdrawAddress.addEventListener("input", (event) => setAddress(event.target.value));
  }
  if (els.withdrawForm) {
    els.withdrawForm.addEventListener("submit", handleWithdraw);
  } else if (els.withdrawButton) {
    els.withdrawButton.addEventListener("click", handleWithdraw);
  }
  if (els.spinButton) {
    els.spinButton.addEventListener("click", handleSpin);
  }
  if (els.withdrawEmail) {
    els.withdrawEmail.addEventListener("input", (event) => {
      state.email = event.target.value.trim();
      persist();
    });
  }
  els.refreshCaptcha.addEventListener("click", generateCaptcha);
}

function loadState() {
  const base = {
    id: crypto.randomUUID(),
    address: "",
    email: "",
    balance: 0,
    lastClaimAt: 0,
    lastSpinAt: 0,
    lastSpinNumber: null,
    autoClaim: false,
    logs: [],
  };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...base, ...JSON.parse(stored) } : base;
  } catch (err) {
    console.warn("Failed to parse faucet state", err);
    return base;
  }
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      id: state.id,
      address: state.address,
      email: state.email,
      balance: state.balance,
      lastClaimAt: state.lastClaimAt,
      lastSpinAt: state.lastSpinAt,
      lastSpinNumber: state.lastSpinNumber,
      autoClaim: state.autoClaim,
      logs: state.logs.slice(-20),
    })
  );
}

function updateUI() {
  els.balance.textContent = formatSats(state.balance);
  els.withdrawAmount.placeholder = formatSats(MIN_WITHDRAW);
  if (els.address) els.address.value = state.address;
  if (els.withdrawAddress) els.withdrawAddress.value = state.address;
  if (els.withdrawEmail) {
    els.withdrawEmail.value = state.email || "";
  }

  const eligible = state.balance >= MIN_WITHDRAW;
  if (els.withdrawButton) {
    els.withdrawButton.disabled = !eligible || withdrawing;
    if (!withdrawing && !els.withdrawButton.textContent) {
      els.withdrawButton.textContent = defaultWithdrawLabel;
    }
  }
  if (els.badge) {
    els.badge.textContent = eligible ? "Ready to withdraw" : `Below ${formatSats(MIN_WITHDRAW)} sats`;
    els.badge.classList.toggle("ready", eligible);
  }

  updateSpinUI();
  renderActivity();
}

function renderActivity() {
  els.activity.innerHTML = "";
  if (!state.logs.length) {
    const li = document.createElement("li");
    li.textContent = "No activity on this device yet.";
    els.activity.appendChild(li);
    return;
  }

  state.logs
    .slice()
    .reverse()
    .forEach((entry) => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.textContent = entry.message;
      const right = document.createElement("span");
      right.textContent = entry.amount ? `${entry.amount} sats` : "";
      li.appendChild(left);
      li.appendChild(right);
      els.activity.appendChild(li);
    });
}

function startTimerLoop() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    const remaining = CLAIM_COOLDOWN_MS - (Date.now() - state.lastClaimAt);
    const clamped = Math.max(0, remaining);
    els.cooldownLabel.textContent = formatDuration(clamped);

    const canClaimNow = remaining <= 0;
    els.claimButton.disabled = !canClaimNow;

    if (state.autoClaim && canClaimNow) {
      handleClaim({ auto: true });
    }
    updateSpinUI();
  }, 1000);
}

function handleClaim(options = {}) {
  const { auto = false } = options;
  const address = getAddress();
  if (!address || !isLikelyBtcAddress(address)) {
    showToast("Enter a valid Bitcoin address to claim.");
    return;
  }

  if (!captchaSolution || Number(els.captchaAnswer.value) !== captchaSolution) {
    if (!auto) showToast("Solve the captcha to claim.");
    return;
  }

  const now = Date.now();
  const delta = now - state.lastClaimAt;
  if (delta < CLAIM_COOLDOWN_MS) {
    if (!auto) showToast("You can claim once every hour.");
    return;
  }

  state.address = address;
  state.lastClaimAt = now;
  state.balance += CLAIM_REWARD;
  generateCaptcha(true);
  persist();
  updateUI();
  log("Claimed", `+${CLAIM_REWARD} sats`, CLAIM_REWARD);
  showToast(auto ? "Auto-claim success" : `Claimed +${CLAIM_REWARD} sats`);
}

async function handleSpin() {
  const now = Date.now();
  const since = now - state.lastSpinAt;
  if (since < SPIN_COOLDOWN_MS) {
    showToast("You can spin once every hour.");
    return;
  }

  setSpinPending(true);
  setSpinStatusText("Rolling...");
  startSpinAnimation();
  try {
    const hash = await sha256Hex(`${state.id}-${now}-${crypto.randomUUID()}`);
    const number = Number(BigInt(`0x${hash.slice(0, 12)}`) % BigInt(SPIN_RANGE));
    const isWin = number === SPIN_WIN_NUMBER;

    revealSpin(number, isWin, () => {
      state.lastSpinAt = now;
      state.lastSpinNumber = number;

      if (isWin) {
        state.balance += SPIN_REWARD_SATS;
        log("Lucky spin!", `Hit ${number}. +${SPIN_REWARD_SATS} sats`, SPIN_REWARD_SATS);
        showToast("Jackpot! +20,000 sats added.");
        launchConfetti();
      } else {
        log("Spin result", `Rolled ${number} (need ${SPIN_WIN_NUMBER} to win)`);
        showToast(`Rolled ${number}. Need ${SPIN_WIN_NUMBER} to win.`);
      }
      persist();
      updateUI();
    });
  } catch (err) {
    console.error("Spin failed", err);
    showToast("Spin failed. Try again soon.");
    stopSpinAnimation();
    setSpinStatusText("Ready to spin");
    setSpinPending(false);
  } finally {
    // spinner cleared in revealSpin or catch block
  }
}

async function handleWithdraw(event) {
  event?.preventDefault();
  if (withdrawing) return;

  const address = getAddress();
  const email = (els.withdrawEmail?.value || state.email || "").trim();
  const amountInput = Number(els.withdrawAmount.value || state.balance);
  const requestedAmount = Math.floor(Number.isFinite(amountInput) ? amountInput : 0);
  const amount = Math.min(state.balance, requestedAmount > 0 ? requestedAmount : state.balance);

  if (!address || !isLikelyBtcAddress(address)) {
    showToast("Enter a valid Bitcoin address first.");
    return;
  }
  if (!isLikelyEmail(email)) {
    showToast("Enter a valid email so we can confirm your payout.");
    return;
  }
  if (amount < MIN_WITHDRAW) {
    showToast(`Need at least ${formatSats(MIN_WITHDRAW)} sats to withdraw.`);
    return;
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const formData = new FormData();
  formData.append("requestId", requestId);
  formData.append("email", email);
  formData.append("address", address);
  formData.append("amount", `${amount}`);
  formData.append("deviceId", state.id);
  formData.append("message", `OneCurrency faucet withdrawal request ${requestId}`);

  try {
    setWithdrawPending(true);

    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed with status ${response.status}`);
    }

    state.address = address;
    state.email = email;
    state.balance = 0;
    persist();
    updateUI();

    log("Withdraw submitted", `#${requestId} -${amount} sats (balance reset)`, -amount);
    showToast(`Withdrawal sent (#${requestId}). Balance reset to 0.`);
  } catch (err) {
    console.error("Withdraw submission failed", err);
    showToast("Could not submit withdrawal right now.");
  } finally {
    setWithdrawPending(false);
  }
}

function setWithdrawPending(active) {
  withdrawing = active;
  if (els.withdrawButton) {
    els.withdrawButton.disabled = active || state.balance < MIN_WITHDRAW;
    els.withdrawButton.textContent = active ? "Submitting..." : defaultWithdrawLabel;
  }
}

function setSpinPending(active) {
  if (els.spinButton) {
    els.spinButton.disabled = active || !canSpin();
    els.spinButton.textContent = active ? "Spinning..." : "Spin for 0.0002 BTC";
  }
}

function canSpin() {
  return Date.now() - state.lastSpinAt >= SPIN_COOLDOWN_MS;
}

function setAddress(value) {
  const trimmed = normalizeAddress(value);
  state.address = trimmed;
  if (els.address && document.activeElement !== els.address) {
    els.address.value = trimmed;
  }
  if (els.withdrawAddress && document.activeElement !== els.withdrawAddress) {
    els.withdrawAddress.value = trimmed;
  }
  persist();
}

function getAddress() {
  const fromWithdraw = (els.withdrawAddress?.value || "").trim();
  const fromPrimary = (els.address?.value || "").trim();
  return normalizeAddress(fromWithdraw || fromPrimary || state.address || "");
}

function updateSpinUI() {
  if (!els.spinButton || !els.spinResult || !els.spinStatus) return;
  if (isSpinAnimating()) {
    setSpinStatusText("Rolling...");
    return;
  }
  const remaining = Math.max(0, SPIN_COOLDOWN_MS - (Date.now() - state.lastSpinAt));
  const ready = remaining === 0;
  els.spinButton.disabled = !ready;
  els.spinButton.textContent = "Spin for 0.0002 BTC";
  els.spinStatus.textContent = ready ? "Ready to spin" : `Next spin in ${formatDuration(remaining)}`;
  els.spinResult.textContent =
    state.lastSpinNumber === null
      ? "No spins yet"
      : `Last roll: ${formatSpinNumber(state.lastSpinNumber)} (need ${SPIN_WIN_NUMBER})`;
  setSpinDie(state.lastSpinNumber);
}

function generateCaptcha(clearAnswer = false) {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  captchaSolution = a + b;
  els.captchaQuestion.textContent = `${a} + ${b}`;
  if (clearAnswer) els.captchaAnswer.value = "";
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatSats(val) {
  return Number(val || 0).toLocaleString("en-US");
}

function formatSpinNumber(val) {
  if (val === null || val === undefined) return "----";
  return String(val).padStart(4, "0");
}

function isLikelyBtcAddress(value) {
  const trimmed = normalizeAddress(value);
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (trimmed !== lower && trimmed !== upper) return false;

  const bech32Prefixes = ["bc1", "tb1", "bcrt1"];
  for (const prefix of bech32Prefixes) {
    if (lower.startsWith(prefix)) {
      const data = lower.slice(prefix.length);
      if (data.length < 11 || data.length > 90) return false;
      return /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(data);
    }
  }

  return /^[123mn][A-HJ-NP-Za-km-z1-9]{20,100}$/.test(trimmed);
}

function normalizeAddress(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("bitcoin:")) {
    const withoutPrefix = raw.slice(8).trim();
    const cut = withoutPrefix.split("?")[0].split("#")[0].trim();
    return cut;
  }
  return raw;
}

function isLikelyEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function log(title, message, amount = 0) {
  const entry = {
    title,
    message,
    amount,
    at: Date.now(),
  };
  state.logs.push(entry);
  if (state.logs.length > 30) state.logs.shift();
  persist();
  renderActivity();
}

function setSpinDie(value) {
  if (els.spinDie) {
    els.spinDie.textContent = typeof value === "number" ? formatSpinNumber(value) : "----";
  }
  setDiceFaces(typeof value === "number" ? value : null);
}

function startSpinAnimation() {
  stopSpinAnimation();
  setDiceRolling(true);
  setSpinDie(Math.floor(Math.random() * SPIN_RANGE));
  if (els.spinDie) els.spinDie.classList.add("spinning-number");
  spinRollInterval = setInterval(() => {
    setSpinDie(Math.floor(Math.random() * SPIN_RANGE));
  }, 90);
}

function stopSpinAnimation() {
  if (spinRollInterval) {
    clearInterval(spinRollInterval);
    spinRollInterval = null;
  }
  if (spinRevealTimeout) {
    clearTimeout(spinRevealTimeout);
    spinRevealTimeout = null;
  }
  setDiceRolling(false);
  if (els.spinDie) els.spinDie.classList.remove("spinning-number");
}

function revealSpin(finalNumber, isWin, onDone) {
  stopSpinAnimation();
  startSpinAnimation();
  spinRevealTimeout = setTimeout(() => {
    stopSpinAnimation();
    setSpinDie(finalNumber);
    setSpinStatusText(isWin ? "Winner!" : "Result shown");
    setSpinPending(false);
    onDone?.();
  }, 1100);
}

function setDiceFaces(value) {
  const hasValue = typeof value === "number" && !Number.isNaN(value);
  const faces = hasValue ? mapSpinToDice(value) : { dieOne: null, dieTwo: null };
  applyDieFace(els.diceOne, faces.dieOne);
  applyDieFace(els.diceTwo, faces.dieTwo);
}

function applyDieFace(el, value) {
  if (!el) return;
  if (typeof value === "number") {
    el.textContent = value;
    el.dataset.value = String(value);
  } else {
    el.textContent = "•";
    delete el.dataset.value;
  }
}

function mapSpinToDice(val) {
  const safe = Math.abs(Number(val)) % SPIN_RANGE;
  return {
    dieOne: (safe % 6) + 1,
    dieTwo: ((Math.floor(safe / 6) % 6) + 1),
  };
}

function setDiceRolling(active) {
  [els.diceOne, els.diceTwo].forEach((die) => {
    if (!die) return;
    die.classList.toggle("rolling", active);
  });
}

function isSpinAnimating() {
  return Boolean(spinRollInterval || spinRevealTimeout);
}

function setSpinStatusText(text) {
  if (els.spinStatus) els.spinStatus.textContent = text;
}

async function sha256Hex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function launchConfetti() {
  const colors = ["#34d399", "#22d3ee", "#f59e0b", "#f87171"];
  const pieces = 80;
  const container = document.createElement("div");
  container.className = "confetti-container";
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.background = colors[i % colors.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  clearTimeout(lastConfettiTimeout);
  lastConfettiTimeout = setTimeout(() => container.remove(), 2000);
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2400);
}
