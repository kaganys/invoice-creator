import { useEffect, useRef, useState, type ReactNode } from 'react'

const SHEET_WIDTH = 816
const SHEET_HEIGHT = 1040

export function ScaledSheet({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.42)

  useEffect(() => {
    const node = frame.current
    if (!node) {
      return
    }
    const update = () => {
      const width = node.clientWidth
      setScale(Math.min(1, Math.max(0.28, (width - 8) / SHEET_WIDTH)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frame} className="settings-preview__frame">
      <div style={{ height: SHEET_HEIGHT * scale }}>
        <div
          className="settings-preview__scaler"
          style={{
            width: SHEET_WIDTH,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
