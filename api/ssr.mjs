import server from '../dist/server/server.js'

export default async function handler(req, res) {
  // Convert Vercel's req/res to a Fetch API Request
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
  
  // Build request headers
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  // Build request body if present
  const body = req.method !== 'GET' && req.method !== 'HEAD' 
    ? await new Promise((resolve) => {
        let data = ''
        req.on('data', chunk => data += chunk)
        req.on('end', () => resolve(data))
      })
    : undefined

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
  })

  // Handle via TanStack Start server
  const response = await server.fetch(request)

  // Convert Fetch Response back to Vercel's response
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  // Send response body
  const text = await response.text()
  res.end(text)
}