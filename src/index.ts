import type { Env } from 'cf-path-router'
import { handleRequest } from 'cf-path-router'

const ROUTES = {
  // '/starlight-plugin-icons/*': 'proxy:https://starlight-plugin-icons.hegyi-aron101.workers.dev/*',
  '/starlight-plugin-icons/*': 'proxy:http://localhost:4321/*',
} as const

export default {
  async fetch(request: Request): Promise<Response> {
    const env: Env = { ROUTES: JSON.stringify(ROUTES) }
    const response = await handleRequest(request, env)
    return response || new Response('Not found', { status: 404 })
  },
}
