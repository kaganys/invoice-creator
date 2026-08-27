import type { ReactNode } from 'react'
import './InvoiceSection.css'

type InvoiceSectionProps = {
  title: string
  description?: string
  children: ReactNode
}

export function InvoiceSection({
  title,
  description,
  children,
}: InvoiceSectionProps) {
  return (
    <section className="invoice-section">
      <header className="invoice-section__header">
        <h2 className="invoice-section__title">{title}</h2>
        {description ? (
          <p className="invoice-section__description">{description}</p>
        ) : null}
      </header>
      <div className="invoice-section__body">{children}</div>
    </section>
  )
}
