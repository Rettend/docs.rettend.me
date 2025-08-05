import { createRouter } from './worker'

const ROUTES = {
  '/starlight-plugin-icons/*': 'proxy:https://starlight-plugin-icons.hegyi-aron101.workers.dev//*',
}

export default createRouter(ROUTES)
