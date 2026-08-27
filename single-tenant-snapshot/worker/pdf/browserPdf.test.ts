import { describe, expect, it } from 'vitest'
import { createBrowserPdfRenderer } from './browserPdf.ts'

describe('browser PDF renderer', () => {
  it('fails when Browser Rendering is not bound', async () => {
    const renderer = createBrowserPdfRenderer(undefined)
    await expect(renderer.renderHtml('<html></html>')).rejects.toThrow(
      /Browser Rendering is not configured/,
    )
  })
})
