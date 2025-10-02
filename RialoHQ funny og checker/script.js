// Rialo OG Checker logic
// Config: update as needed
const CONFIG = {
  chainName: 'EVM',
  rpcUrl: 'https://rpc.ankr.com/eth', // change to your target chain RPC
  tokenContractAddress: '0x0000000000000000000000000000000000000000', // TODO: set real $RIALO contract
  demoMode: true, // when true, first two unique addresses are OG, others are not
};

const walletInput = document.getElementById('wallet');
const checkBtn = document.getElementById('check-btn');
const statusEl = document.getElementById('status');
const genBtn = document.getElementById('gen-btn');
const dlBtn = document.getElementById('dl-btn');
const shareBtn = document.getElementById('share-btn');

const certEl = document.getElementById('certificate');
const certWallet = document.getElementById('cert-wallet');
const certDate = document.getElementById('cert-date');
const certChain = document.getElementById('cert-chain');
const serialEl = document.getElementById('serial');

const previewWrap = document.getElementById('preview');
const previewImg = document.getElementById('cert-preview');

let lastResult = { isOG: false, serial: 'RIALO-OG-0001', short: '', dataUrl: '' };

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)'
];

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function isEvmAddress(addr) {
  if (typeof addr !== 'string') return false;
  // Prefer ethers if available
  if (typeof window !== 'undefined' && window.ethers && typeof window.ethers.isAddress === 'function') {
    try { return window.ethers.isAddress(addr); } catch { /* fallthrough */ }
  }
  // Basic 0x-prefixed 40-hex validation (no checksum enforcement)
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function setStatusOk(text) {
  statusEl.style.display = 'inline-flex';
  statusEl.classList.remove('warn');
  statusEl.classList.add('ok');
  statusEl.textContent = text;
}

function setStatusWarn(text) {
  statusEl.style.display = 'inline-flex';
  statusEl.classList.remove('ok');
  statusEl.classList.add('warn');
  statusEl.textContent = text;
}

// Demo mode state (persisted locally per browser)
const DEMO_KEY = 'rialo_demo_state_v1';
function loadDemoState() {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? JSON.parse(raw) : { seen: [], og: [] };
  } catch { return { seen: [], og: [] }; }
}
function saveDemoState(st) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(st)); } catch {} }

function demoEvaluate(addr) {
  const st = loadDemoState();
  const lower = addr.toLowerCase();
  if (st.og.includes(lower)) return true;
  if (!st.seen.includes(lower)) st.seen.push(lower);
  // First two unique addresses become OG
  if (st.og.length < 2 && !st.og.includes(lower)) {
    st.og.push(lower);
    saveDemoState(st);
    return true;
  }
  saveDemoState(st);
  return false;
}

async function checkHolder() {
  try {
    const addr = (walletInput.value || '').trim();
    if (!addr) {
      setStatusWarn('Enter a wallet address');
      genBtn.disabled = true; dlBtn.disabled = true; shareBtn.disabled = true;
      return;
    }

    if (!isEvmAddress(addr)) {
      setStatusWarn('Invalid address');
      genBtn.disabled = true; dlBtn.disabled = true; shareBtn.disabled = true;
      return;
    }

    // Demo mode short-circuit
    let isOG;
    if (CONFIG.demoMode) {
      isOG = demoEvaluate(addr);
    } else {
      setStatusWarn('Checking balance...');
      const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      const contract = new ethers.Contract(CONFIG.tokenContractAddress, ERC20_ABI, provider);
      const bal = await contract.balanceOf(addr);
      isOG = bal && bal > 0n;
    }

    lastResult.isOG = isOG;
    lastResult.short = shortAddr(addr);

    if (isOG) {
      setStatusOk('CERTIFIED OG ✓');
      genBtn.disabled = false;
    } else {
      setStatusWarn('NOT YET, BUT SOON');
      genBtn.disabled = true; // Only OG can generate
    }

    dlBtn.disabled = !previewImg.src;
    shareBtn.disabled = !previewImg.src;
  } catch (err) {
    console.error(err);
    setStatusWarn('Error checking balance');
    genBtn.disabled = true; dlBtn.disabled = true; shareBtn.disabled = true;
  }
}

function makeSerial() {
  // Simple timestamp-based serial for demo
  const ts = Date.now();
  return `RIALO-OG-${String(ts)}`;
}

async function generateCertificate() {
  // Populate certificate fields
  const now = new Date();
  serialEl.textContent = makeSerial();
  certWallet.textContent = lastResult.short;
  certDate.textContent = now.toLocaleString();
  certChain.textContent = CONFIG.chainName;

  certEl.classList.remove('hidden');
  certEl.setAttribute('aria-hidden', 'false');

  // Wait a frame for layout
  await new Promise(r => requestAnimationFrame(r));

  const canvas = await html2canvas(certEl, { backgroundColor: '#ffffff', scale: window.devicePixelRatio || 2 });
  const dataUrl = canvas.toDataURL('image/png');
  lastResult.dataUrl = dataUrl;
  lastResult.serial = serialEl.textContent;

  previewImg.src = dataUrl;
  previewWrap.style.display = 'block';
  dlBtn.disabled = false;
  shareBtn.disabled = false;
}

function downloadPNG() {
  if (!lastResult.dataUrl) return;
  const a = document.createElement('a');
  a.href = lastResult.dataUrl;
  a.download = `${lastResult.serial}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareCert() {
  const text = `I'm RialoOG #${lastResult.serial.replace('RIALO-OG-','')} — wallet: ${lastResult.short} #RialoOG #SentientAGI`;

  // Try Web Share API with file if available
  try {
    if (navigator.canShare && window.fetch && lastResult.dataUrl) {
      const res = await fetch(lastResult.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${lastResult.serial}.png`, { type: 'image/png' });
      if (navigator.canShare({ files: [file], text })) {
        await navigator.share({ files: [file], text });
        return;
      }
    }
  } catch (e) {
    // fallthrough
  }

  // Fallback: share text only or copy to clipboard
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch {}
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatusOk('Share text copied to clipboard');
  } catch {
    alert(text);
  }
}

checkBtn.addEventListener('click', checkHolder);
walletInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkHolder(); });
genBtn.addEventListener('click', generateCertificate);
dlBtn.addEventListener('click', downloadPNG);
shareBtn.addEventListener('click', shareCert);

