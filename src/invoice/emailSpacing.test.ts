import { describe, expect, it } from 'vitest'
import {
  EMPTY_METRICS,
  PARAGRAPH_STYLE,
  emailSpacingFromHtml,
  listDeclaration,
  paintProseSpacing,
  paragraphDeclaration,
  proseForEditor,
} from './emailSpacing.ts'

describe('email spacing', () => {
  it('keeps the built-in paragraph style byte for byte', () => {
    expect(paragraphDeclaration(null, EMPTY_METRICS)).toBe(PARAGRAPH_STYLE)
    expect(listDeclaration(null, EMPTY_METRICS)).toBe('margin:0 0 16px;padding-left:22px;')
    expect(listDeclaration('center', EMPTY_METRICS)).toBe(
      'margin:0 0 16px;padding-left:22px;text-align:center;',
    )
  })

  it('lets the editor show email defaults through unset paragraphs', () => {
    const stored = `<p style="${PARAGRAPH_STYLE}">Hello</p>`
    expect(proseForEditor(stored)).toBe('<p style="font-size:16px;color:#111111;">Hello</p>')
    const explicit =
      '<p data-line-height="2" data-space-before="large" style="margin:28px 0 16px;font-size:16px;line-height:2;color:#111111;">Wide</p>'
    expect(proseForEditor(explicit)).toContain('data-line-height="2"')
    expect(proseForEditor(explicit)).toContain('data-space-before="large"')
    expect(proseForEditor(explicit)).toContain('line-height:2')
    expect(proseForEditor(explicit)).toContain('margin-top:28px')
    expect(proseForEditor(explicit)).not.toContain('margin:28px')
  })

  it('inlines an email default without freezing it onto an explicit line height', () => {
    const html = [
      '<p data-line-height="2" style="margin:0 0 16px;font-size:16px;line-height:2;color:#111111;">Tight</p>',
      `<p style="${PARAGRAPH_STYLE}">Hello</p>`,
    ].join('')
    const painted = paintProseSpacing(html, {
      lineHeight: '1.15',
      before: 'small',
      after: 'large',
    })
    expect(painted).toContain(
      '<p data-line-height="2" style="margin:8px 0 28px;font-size:16px;line-height:2;color:#111111;">Tight</p>',
    )
    expect(painted).toContain(
      '<p style="margin:8px 0 28px;font-size:16px;line-height:1.15;color:#111111;">Hello</p>',
    )
    expect(emailSpacingFromHtml(
      '<div data-email-part="spacing" data-line-height="1.5" data-space-before="none"></div>',
    )).toEqual({
      lineHeight: '1.5',
      before: 'none',
      after: null,
    })
  })
})