import { describe, expect, it } from 'vitest'
import { insertionIndex, moveItem, reorderEmailBlocks } from './emailArrange.ts'
import { defaultEmailDocumentHtml, readEmailBlocks } from './emailDocument.ts'
import { prepareInvoiceEmail, SAMPLE_EMAIL_VARS } from './emailHtml.ts'

describe('email block arrangement', () => {
  it('moves an item to an insertion gap without duplicating it', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })

  it('picks the gap above the block whose midpoint the pointer has not reached', () => {
    expect(insertionIndex([10, 30, 50], 9)).toBe(0)
    expect(insertionIndex([10, 30, 50], 20)).toBe(1)
    expect(insertionIndex([10, 30, 50], 49)).toBe(2)
    expect(insertionIndex([10, 30, 50], 50)).toBe(3)
  })

  it('reorders letter blocks and sends them in that order', () => {
    const original = readEmailBlocks(defaultEmailDocumentHtml())
    const button = original.findIndex((block) => block.type === 'button')
    const amount = original.findIndex((block) => block.type === 'amount')
    const next = reorderEmailBlocks(defaultEmailDocumentHtml(), button, amount)
    const types = readEmailBlocks(next).map((block) => block.type)
    expect(types.indexOf('button')).toBeLessThan(types.indexOf('amount'))
    expect(types.filter((type) => type === 'button')).toHaveLength(1)
    expect(readEmailBlocks(next)).toHaveLength(original.length)

    const sent = prepareInvoiceEmail(next, SAMPLE_EMAIL_VARS).html
    expect(sent.indexOf('Pay Online')).toBeLessThan(sent.indexOf('Amount due'))
    expect(sent).not.toContain('data-email-chrome')
  })
})
