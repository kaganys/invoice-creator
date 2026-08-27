import { describe, expect, it } from 'vitest'
import { defaultGraphicalEmailBody, emailBlockHtml } from './emailBlocks.ts'
import {
  defaultCanvasBlocks,
  insertCanvasBlock,
  moveCanvasBlock,
  parseEmailHtmlToBlocks,
  serializeEmailBlocks,
} from './emailCanvas.ts'

describe('email canvas blocks', () => {
  it('round-trips the default graphical layout as separate draggable blocks', () => {
    const blocks = parseEmailHtmlToBlocks(defaultGraphicalEmailBody())
    expect(blocks.map((block) => block.type)).toEqual([
      'hero',
      'text',
      'text',
      'amount',
      'payment',
      'button',
      'note',
    ])
    const html = serializeEmailBlocks(blocks)
    expect(html).toContain('<!--email-block:hero-->')
    expect(parseEmailHtmlToBlocks(html).map((block) => block.type)).toEqual(
      blocks.map((block) => block.type),
    )
  })

  it('recovers unmarked concatenated blocks', () => {
    const unmarked = [
      emailBlockHtml('hero'),
      emailBlockHtml('greeting'),
    ].join('\n')
    const blocks = parseEmailHtmlToBlocks(unmarked)
    expect(blocks.map((block) => block.type)).toEqual(['hero', 'text', 'text'])
  })

  it('splits a greeting box into draggable paragraphs', () => {
    const html = `<!--email-block:greeting-->\n${emailBlockHtml('greeting')}\n<!--/email-block-->`
    expect(parseEmailHtmlToBlocks(html).map((block) => block.type)).toEqual([
      'text',
      'text',
    ])
  })

  it('moves and inserts blocks', () => {
    const start = defaultCanvasBlocks()
    const moved = moveCanvasBlock(start, 0, 2)
    expect(moved[0]?.type).toBe('text')
    expect(moved[1]?.type).toBe('hero')
    const inserted = insertCanvasBlock(moved, 0, {
      id: 'new',
      type: 'divider',
      html: emailBlockHtml('divider'),
    })
    expect(inserted[0]?.type).toBe('divider')
  })
})
