const te = new TextEncoder()
const td = new TextDecoder()

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const pw = te.encode(passphrase)
  const pwAB = new ArrayBuffer(pw.length)
  new Uint8Array(pwAB).set(pw)
  const keyMaterial = await crypto.subtle.importKey('raw', pwAB, 'PBKDF2', false, ['deriveKey'])
  const saltAB = new ArrayBuffer(salt.length)
  new Uint8Array(saltAB).set(salt)
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltAB, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptMnemonic(mnemonic: string, passphrase: string): Promise<string> {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < 1) {
    throw new Error('Passphrase required')
  }
  if (!mnemonic || typeof mnemonic !== 'string') {
    throw new Error('Invalid mnemonic input')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ivAB = new ArrayBuffer(iv.length)
  new Uint8Array(ivAB).set(iv)
  const pt = te.encode(mnemonic)
  const ptAB = new ArrayBuffer(pt.length)
  new Uint8Array(ptAB).set(pt)
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivAB }, key, ptAB)
  const payload = {
    v: 1,
    kdf: 'pbkdf2-sha256-150k',
    algo: 'AES-GCM-256',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(enc)),
  }
  return JSON.stringify(payload)
}

export async function decryptMnemonic(json: string, passphrase: string): Promise<string> {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < 1) {
    throw new Error('Passphrase required')
  }
  let payload: any
  try {
    payload = JSON.parse(json)
  } catch {
    throw new Error('Invalid backup JSON')
  }
  if (!payload || typeof payload !== 'object') throw new Error('Invalid backup format')
  if (payload.v !== 1) throw new Error('Unsupported backup version')
  if (payload.kdf !== 'pbkdf2-sha256-150k' || payload.algo !== 'AES-GCM-256') {
    throw new Error('Unexpected backup parameters')
  }
  if (!payload.salt || !payload.iv || !payload.ct) throw new Error('Missing backup fields')
  const salt = fromBase64(String(payload.salt))
  const iv = fromBase64(String(payload.iv))
  const ct = fromBase64(String(payload.ct))
  if (iv.length !== 12) throw new Error('Invalid IV length')
  if (salt.length < 8) throw new Error('Invalid salt')
  const key = await deriveKey(passphrase, salt)
  try {
    const ivAB = new ArrayBuffer(iv.length)
    new Uint8Array(ivAB).set(iv)
    const ctAB = new ArrayBuffer(ct.length)
    new Uint8Array(ctAB).set(ct)
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivAB }, key, ctAB)
    const text = td.decode(dec)
    if (!text || typeof text !== 'string') throw new Error('Decrypted value empty')
    return text
  } catch (e: any) {
    // Map WebCrypto errors to a user-friendly message
    const msg = (e && (e.name === 'OperationError' || e.name === 'DataError')) ? 'Incorrect passphrase' : (e?.message || 'Decryption failed')
    throw new Error(msg)
  }
}
