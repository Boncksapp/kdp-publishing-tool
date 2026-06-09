import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
import server from './dist/server/server.js'

const PORT = process.env.PORT || 3000
const CLIENT_DIR = new URL('./dist/client/', import.meta.url).pathname

const MIME_TYPES = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.html': 'text/html',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    // Try to serve static files from dist/client/
    if (pathname.startsWith('/assets/') || pathname === '/favicon.ico') {
      const filePath = join(CLIENT_DIR, pathname)
      if (existsSync(filePath)) {
        const ext = extname(filePath)
        const contentType = MIME_TYPES[ext] || 'application/octet-stream'
        const content = readFileSync(filePath)
        res.statusCode = 200
        res.setHeader('Content-Type', contentType)
        if (ext === '.css') res.setHeader('Content-Type', 'text/css')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(content)
        return
      }
    }

    // All other requests go to the SSR handler
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