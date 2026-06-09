import { createServer } from 'http'
import server from './dist/server/server.js'

const PORT = process.env.PORT || 3000

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined
      : await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)) })
    const request = new Request(url.toString(), { method: req.method, headers, body })
    const response = await server.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(await response.text())
  } catch (e) {
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})