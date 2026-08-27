import type { Ref } from 'react'
import { useInvoiceDraft } from '../invoice/InvoiceDraftContext.tsx'
import { useSettings } from '../settings/SettingsContext.tsx'
import { InvoiceDocument } from './InvoiceDocument.tsx'

type InvoicePreviewProps = {
  documentRef?: Ref<HTMLElement>
}

export function InvoicePreview({ documentRef }: InvoicePreviewProps) {
  const { invoice } = useInvoiceDraft()
  const { format } = useSettings()
  return <InvoiceDocument ref={documentRef} invoice={invoice} format={format} />
}
