export type FundingCurrency = 'auto' | 'usd' | 'gbp' | 'eur'
export type FundingMethod = 'bank' | 'card' | 'any'
export type FundingConfig = { enabled: boolean; provider: 'moonpay'; environment: 'sandbox' | 'production' }
export type FundingPurchase = { address: string; network: 'mainnet'; currency: FundingCurrency; amount: number | null; method: FundingMethod; consent: true }

async function fundingRequest(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/funding/${path}`, { ...init, credentials: 'omit', cache: 'no-store' })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Bank and card purchases are not available yet.')
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to prepare checkout. Please try again.')
  return data
}

export async function getFundingConfig(signal: AbortSignal): Promise<FundingConfig> {
  const data = await fundingRequest('config', { signal }) as Partial<FundingConfig>
  if (typeof data.enabled !== 'boolean' || data.provider !== 'moonpay' || !['sandbox', 'production'].includes(data.environment || '')) {
    throw new Error('Bank and card purchases are not available yet.')
  }
  return data as FundingConfig
}

export async function createFundingCheckout(purchase: FundingPurchase, environment: FundingConfig['environment'], signal: AbortSignal): Promise<string> {
  const data = await fundingRequest('checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(purchase), signal,
  }) as { url?: unknown; environment?: unknown }
  if (typeof data.url !== 'string' || data.environment !== environment) throw new Error('Invalid checkout response. Please try again.')
  const url = new URL(data.url)
  const expectedHost = environment === 'production' ? 'buy.moonpay.com' : 'buy-sandbox.moonpay.com'
  const destination = purchase.address.startsWith('BC1') ? purchase.address.toLowerCase() : purchase.address
  if (url.protocol !== 'https:' || url.host !== expectedHost || url.username || url.password || url.pathname !== '/' ||
      url.searchParams.get('currencyCode') !== 'btc' || url.searchParams.get('walletAddress') !== destination || !url.searchParams.get('signature')) {
    throw new Error('Checkout does not match this wallet. Please try again.')
  }
  return url.href
}
