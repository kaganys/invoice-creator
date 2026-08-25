import type { PdfRenderer } from './types.ts'

type BrowserBinding = {
  // Cloudflare Browser Rendering binding
  fetch?: unknown
}

export function createBrowserPdfRenderer(
  browser: BrowserBinding | undefined,
): PdfRenderer {
  return {
    async renderHtml(html: string) {
      if (!browser) {
        throw new Error(
          'Browser Rendering is not configured. Add a browser binding named BROWSER in wrangler.jsonc.',
        )
      }
      const puppeteer = await import('@cloudflare/puppeteer')
      const instance = await puppeteer.default.launch(
        browser as Parameters<typeof puppeteer.default.launch>[0],
      )
      try {
        const page = await instance.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 })
        await page.evaluate(`
          Promise.all([
            document.fonts.ready,
            Promise.all(
              [...document.images].map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise((resolve) => {
                      img.addEventListener('load', resolve, { once: true })
                      img.addEventListener('error', resolve, { once: true })
                    }),
              ),
            ),
          ])
        `)
        const pdf = await page.pdf({
          format: 'letter',
          printBackground: true,
          margin: {
            top: '0.5in',
            right: '0.5in',
            bottom: '0.5in',
            left: '0.5in',
          },
          preferCSSPageSize: true,
        })
        return new Uint8Array(pdf)
      } finally {
        await instance.close()
      }
    },
  }
}
