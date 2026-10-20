import { readEmailBlocks, writeEmailBlocks } from './emailDocument.ts'

/** Move `from` so it lands at insertion gap `to` (0..length). A no-op gap is the item's own edges. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to > items.length) {
    return [...items]
  }
  if (to === from || to === from + 1) {
    return [...items]
  }
  const next = items.slice()
  const [item] = next.splice(from, 1)
  const index = to > from ? to - 1 : to
  next.splice(index, 0, item)
  return next
}

/** Index of the gap whose midpoint the pointer has passed. `midpoints` are block centers, top to bottom. */
export function insertionIndex(midpoints: readonly number[], clientY: number): number {
  for (let index = 0; index < midpoints.length; index += 1) {
    if (clientY < midpoints[index]) {
      return index
    }
  }
  return midpoints.length
}

/** Reorder saved letter blocks. Disabled blocks stay in the list and move with their neighbors. */
export function reorderEmailBlocks(source: string, from: number, to: number): string {
  return writeEmailBlocks(moveItem(readEmailBlocks(source), from, to))
}
