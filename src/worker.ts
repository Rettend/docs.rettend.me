/// <reference types="@cloudflare/workers-types" />
// from: https://github.com/osteele/subdomain-router/blob/main/src/worker.ts

interface RouteConfig {
  [path: string]: string
}

interface RouteMatch {
  targetUrl: URL
  type: 'proxy' | 'redirect'
}

export function computeRedirectTarget(
  url: URL,
  routes: RouteConfig,
): RouteMatch | null {
  const matchingRoute = Object.entries(routes).find(([path]) => {
    const pathPattern = path.endsWith('/*') ? path.slice(0, -2) : path

    if (path.endsWith('/*')) {
      return (
        url.pathname === pathPattern
        || url.pathname === `${pathPattern}/`
        || url.pathname.startsWith(`${pathPattern}/`)
      )
    }
    return url.pathname === path
  })

  if (!matchingRoute) {
    return null
  }

  const [routePath, targetUrl] = matchingRoute
  const isProxy = targetUrl.startsWith('proxy:')
  const finalTargetUrl = isProxy
    ? targetUrl.slice(6)
    : targetUrl.startsWith('302:')
      ? targetUrl.slice(4)
      : targetUrl

  let targetURL: URL
  if (finalTargetUrl.includes('/*')) {
    const baseTargetUrl = finalTargetUrl.replace('/*', '')
    targetURL = new URL(baseTargetUrl)

    const pathPattern = routePath.endsWith('/*')
      ? routePath.slice(0, -2)
      : routePath
    const remainingPath
      = url.pathname === pathPattern
        ? '/'
        : url.pathname === `${pathPattern}/`
          ? '/'
          : url.pathname.slice(pathPattern.length)

    const finalPath
      = targetURL.pathname === '/'
        ? remainingPath
        : targetURL.pathname + remainingPath
    targetURL = new URL(finalPath, targetURL.origin)
  }
  else {
    targetURL = new URL(finalTargetUrl)
  }

  targetURL.search = url.search

  return {
    targetUrl: targetURL,
    type: isProxy ? 'proxy' : 'redirect',
  }
}

class AttributeRewriter {
  constructor(
    private sourcePath: string,
    private sourceUrl: URL,
    private targetUrl: URL,
  ) {}

  private rewriteAbsoluteUrl(url: string): string {
    if (url.startsWith(this.targetUrl.origin)) {
      const path = url.slice(this.targetUrl.origin.length)
      return `${this.sourceUrl.origin}${this.sourcePath}${path}`
    }
    return url
  }

  private rewriteRelativeUrl(url: string): string {
    if (url.startsWith('/')) {
      return `${this.sourcePath}${url}`
    }
    return url
  }

  element(element: Element) {
    const href = element.getAttribute('href')
    if (href) {
      try {
        element.setAttribute('href', this.rewriteAbsoluteUrl(href))
      }
      catch {
        element.setAttribute('href', this.rewriteRelativeUrl(href))
      }
    }

    const src = element.getAttribute('src')
    if (src) {
      try {
        element.setAttribute('src', this.rewriteAbsoluteUrl(src))
      }
      catch {
        element.setAttribute('src', this.rewriteRelativeUrl(src))
      }
    }

    if (element.tagName === 'meta') {
      const content = element.getAttribute('content')
      if (content) {
        try {
          element.setAttribute('content', this.rewriteAbsoluteUrl(content))
        }
        catch {
        }
      }
    }
  }
}

class BaseTagInjector {
  constructor(private basePath: string) {}

  element(element: Element) {
    if (element.tagName === 'head') {
      const baseTag = `<base href="${this.basePath}${
        this.basePath.endsWith('/') ? '' : '/'
      }">`

      element.prepend(baseTag, { html: true })
    }
  }
}

export async function handleRequest(
  request: Request,
  routes: RouteConfig,
): Promise<Response | null> {
  try {
    const url = new URL(request.url)
    const match = computeRedirectTarget(url, routes)

    if (!match) {
      return null
    }

    if (match.type === 'redirect') {
      return Response.redirect(match.targetUrl.toString(), 302)
    }

    const routePath
      = Object.entries(routes).find(([path]) => {
        const pathPattern = path.endsWith('/*') ? path.slice(0, -2) : path
        return url.pathname.startsWith(pathPattern)
      })?.[0] || ''

    const transformPath = routePath.endsWith('/*')
      ? routePath.slice(0, -2)
      : routePath

    const modifiedRequest = new Request(match.targetUrl.toString(), {
      method: request.method,
      headers: new Headers(request.headers),
      body: request.body,
    })

    modifiedRequest.headers.delete('host')

    const response = await fetch(modifiedRequest)
    const newHeaders = new Headers(response.headers)

    const contentType = response.headers.get('content-type') || ''
    const isHtml
      = contentType.toLowerCase().includes('text/html')
        || contentType.toLowerCase().includes('application/xhtml+xml')
        || url.pathname.toLowerCase().endsWith('.html')

    if (!response.headers.has('Cache-Control')) {
      if (isHtml) {
        newHeaders.set('Cache-Control', 'no-cache')
      }
      else {
        newHeaders.set('Cache-Control', 'public, max-age=31536000')
      }
    }

    if (isHtml) {
      const rewriter = new HTMLRewriter()
        .on('*', new AttributeRewriter(transformPath, url, match.targetUrl))
        .on('head', new BaseTagInjector(transformPath))

      const transformedResponse = rewriter.transform(
        new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        }),
      )

      return transformedResponse
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }
  catch (error) {
    return new Response(
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 },
    )
  }
}

export function createRouter(routes: RouteConfig) {
  return {
    async fetch(request: Request): Promise<Response> {
      const response = await handleRequest(request, routes)
      return response || new Response('Not found', { status: 404 })
    },
  }
}
