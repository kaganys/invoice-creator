import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
    return false
  }
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility()
    : element.getClientRects().length > 0
}

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape?: () => void,
) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscapeRef.current?.()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isFocusable)

      if (nodes.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const current = document.activeElement

      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault()
        last.focus()
        return
      }

      if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, containerRef])
}
