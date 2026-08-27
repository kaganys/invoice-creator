function cleanupPrintRoot(root: HTMLElement): void {
  document.documentElement.classList.remove('is-printing-invoice')
  root.remove()
}

/**
 * Print only the invoice document. Admin chrome is hidden via print CSS.
 */
export function printInvoiceElement(element: HTMLElement): void {
  const existing = document.querySelector('.invoice-print-root')
  existing?.remove()

  const root = document.createElement('div')
  root.className = 'invoice-print-root'
  const clone = element.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  root.appendChild(clone)
  document.body.appendChild(root)
  document.documentElement.classList.add('is-printing-invoice')

  let cleaned = false
  const cleanup = () => {
    if (cleaned) {
      return
    }
    cleaned = true
    window.removeEventListener('afterprint', cleanup)
    cleanupPrintRoot(root)
  }

  window.addEventListener('afterprint', cleanup)
  window.print()
  window.setTimeout(cleanup, 60_000)
}
