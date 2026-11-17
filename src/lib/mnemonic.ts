import * as bip39 from 'bip39'

export async function generateMnemonic(wordCount: 12 | 20 | 24 = 12): Promise<string> {
  if (wordCount === 20) {
    const words = bip39.generateMnemonic(256).split(' ')
    return words.slice(0, 20).join(' ')
  }
  const strength = wordCount === 24 ? 256 : 128
  return bip39.generateMnemonic(strength)
}

export function validateMnemonic(m: string): boolean {
  return bip39.validateMnemonic(m)
}
