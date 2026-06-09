import server from '../../dist/server/server.js'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(request) {
  const url = new URL(request.url, `https://${request.headers.get('host') || 'localhost'}`)
  const req = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
  })
  return server.fetch(req)
}