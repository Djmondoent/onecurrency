import { createServer } from 'node:http'
import { createFundingHandler } from './funding.mjs'

const handle = createFundingHandler()
const server = createServer(async (req, res) => {
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 4096) {
        res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Connection: 'close' })
        res.end(JSON.stringify({ error: 'Request too large' }))
        return
      }
      chunks.push(chunk)
    }
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value)
    }
    const method = req.method || 'GET'
    const request = new Request(new URL(req.url || '/', 'http://127.0.0.1'), {
      method, headers,
      ...(method !== 'GET' && method !== 'HEAD' ? { body: Buffer.concat(chunks) } : {}),
    })
    // Only the loopback reverse proxy can reach this service. It must OVERWRITE
    // True-Client-IP with the verified client address; never forward user input.
    const response = await handle(request, { clientIp: headers.get('true-client-ip') })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'Funding service unavailable' }))
  }
})
server.on('error', error => {
  console.error(`Funding API failed to start: ${error.code || 'unknown error'}`)
  process.exitCode = 1
})
server.requestTimeout = 15000
server.headersTimeout = 10000
server.listen(Number(process.env.FUNDING_PORT || 3101), '127.0.0.1', () => {
  console.log('OneCurrency funding API listening on loopback')
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close())
