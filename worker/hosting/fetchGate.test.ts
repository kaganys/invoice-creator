import { describe, expect, it } from 'vitest'

/**
 * Integration-style checks against the Worker fetch entrypoint with a fake ASSETS binding.
 * Stripe payment handlers are not exercised here — only hostname gating.
 */
async function loadWorker() {
  return import('../index.ts')
}

function assetsEnv() {
  return {
    ASSETS: {
      async fetch(input: RequestInfo | URL) {
        const url =
          typeof input === 'string'
            ? new URL(input)
            : input instanceof URL
              ? input
              : new URL(input.url)
        if (url.pathname === '/index.html' || url.pathname === '/') {
          return new Response('<html><body>SPA</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        }
        return new Response('asset', { status: 200 })
      },
    },
  } as unknown as Env
}

describe('Worker hostname gate', () => {
  it('pay.vrfnw.com allows /i/token and blocks admin pages/APIs', async () => {
    const worker = await loadWorker()
    const env = assetsEnv()

    const payPage = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/i/tok_test_value'),
      env,
      {} as ExecutionContext,
    )
    expect(payPage.status).toBe(200)
    expect(await payPage.text()).toContain('SPA')

    const landing = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/'),
      env,
      {} as ExecutionContext,
    )
    expect(landing.status).toBe(200)
    expect(await landing.text()).toContain('customer invoice payments')

    const settings = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/settings'),
      env,
      {} as ExecutionContext,
    )
    expect(settings.status).toBe(404)
    expect(await settings.text()).not.toContain('SPA')

    const invoicesPage = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/invoices'),
      env,
      {} as ExecutionContext,
    )
    expect(invoicesPage.status).toBe(404)

    const invoicesApi = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/api/invoices'),
      env,
      {} as ExecutionContext,
    )
    expect(invoicesApi.status).toBe(404)

    const settingsApi = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/api/settings'),
      env,
      {} as ExecutionContext,
    )
    expect(settingsApi.status).toBe(404)

    const peopleApi = await worker.default.fetch(
      new Request('https://pay.vrfnw.com/api/people'),
      env,
      {} as ExecutionContext,
    )
    expect(peopleApi.status).toBe(404)
  })

  it('invoice.vrfnw.com still serves the admin SPA shell', async () => {
    const worker = await loadWorker()
    const env = assetsEnv()
    const home = await worker.default.fetch(
      new Request('https://invoice.vrfnw.com/'),
      env,
      {} as ExecutionContext,
    )
    expect(home.status).toBe(200)
    expect(await home.text()).toContain('SPA')
  })

  it('workers.dev cannot serve the admin SPA', async () => {
    const worker = await loadWorker()
    const env = assetsEnv()
    const home = await worker.default.fetch(
      new Request('https://invoice-creator.saulk.workers.dev/'),
      env,
      {} as ExecutionContext,
    )
    expect(home.status).toBe(404)
    const body = await home.text()
    expect(body).toContain('workers.dev')
    expect(body).not.toContain('SPA')

    const api = await worker.default.fetch(
      new Request('https://invoice-creator.saulk.workers.dev/api/invoices'),
      env,
      {} as ExecutionContext,
    )
    expect(api.status).toBe(404)
  })

  it('localhost remains fully usable for development', async () => {
    const worker = await loadWorker()
    const env = assetsEnv()
    const home = await worker.default.fetch(
      new Request('http://localhost:5173/'),
      env,
      {} as ExecutionContext,
    )
    expect(home.status).toBe(200)
    expect(await home.text()).toContain('SPA')
  })
})
