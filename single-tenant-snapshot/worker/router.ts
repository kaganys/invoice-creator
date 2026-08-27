type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type WorkerHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  params: Record<string, string>,
) => Response | Promise<Response>

type Route = {
  method: Method
  keys: string[]
  pattern: RegExp
  handler: WorkerHandler
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function compilePath(path: string): { keys: string[]; pattern: RegExp } {
  const keys: string[] = []
  const parts = normalizePath(path)
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
  return {
    keys,
    pattern: new RegExp(`^${parts.join('/')}$`),
  }
}

export type RouteMatch =
  | { type: 'hit'; handler: WorkerHandler; params: Record<string, string> }
  | { type: 'method' }
  | { type: 'none' }

export class Router {
  private routes: Route[] = []

  get(path: string, handler: WorkerHandler): this {
    return this.add('GET', path, handler)
  }

  post(path: string, handler: WorkerHandler): this {
    return this.add('POST', path, handler)
  }

  put(path: string, handler: WorkerHandler): this {
    return this.add('PUT', path, handler)
  }

  patch(path: string, handler: WorkerHandler): this {
    return this.add('PATCH', path, handler)
  }

  delete(path: string, handler: WorkerHandler): this {
    return this.add('DELETE', path, handler)
  }

  private add(method: Method, path: string, handler: WorkerHandler): this {
    const compiled = compilePath(path)
    this.routes.push({
      method,
      keys: compiled.keys,
      pattern: compiled.pattern,
      handler,
    })
    return this
  }

  match(request: Request): RouteMatch {
    const url = new URL(request.url)
    const pathname = normalizePath(url.pathname)
    const method = request.method.toUpperCase()

    const pathHits = this.routes
      .map((route) => {
        const matched = route.pattern.exec(pathname)
        if (!matched) {
          return null
        }
        const params: Record<string, string> = {}
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(matched[index + 1] ?? '')
        })
        return { route, params }
      })
      .filter((hit) => hit !== null)

    if (pathHits.length === 0) {
      return { type: 'none' }
    }

    const methodHit = pathHits
      .filter((hit) => hit.route.method === method)
      .sort((a, b) => a.route.keys.length - b.route.keys.length)[0]

    if (!methodHit) {
      return { type: 'method' }
    }

    return {
      type: 'hit',
      handler: methodHit.route.handler,
      params: methodHit.params,
    }
  }
}
