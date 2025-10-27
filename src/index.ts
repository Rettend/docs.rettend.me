import { createRouter } from './worker'

const ROUTES = {
  '/starlight-plugin-icons/*': 'proxy:https://starlight-plugin-icons.rettend.workers.dev/*',
}

export default createRouter(ROUTES)
