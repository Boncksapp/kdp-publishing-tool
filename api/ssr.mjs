import server from '../../dist/server/server.js'

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)) })
      : undefined
    const request = new Request(url.toString(), { method: req.method, headers, body })
    const response = await server.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(await response.text())
  } catch (e) {
    res.statusCode = 500
    res.end(e.message || 'Error')
  }
}