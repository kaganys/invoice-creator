/** Canonical invoice stylesheet. Used by InvoiceDocument and PDF HTML. */
export const INVOICE_DOCUMENT_CSS = `
.invoice-sheet {
  color-scheme: light;
  display: flex;
  flex-direction: column;
  width: min(800px, 100%);
  min-height: 1030px;
  margin: 0 auto;
  padding: 3rem 3.25rem 1.5rem;
  background: #ffffff;
  color: var(--inv-primary, #111111);
  font-family: var(--inv-font-primary, Inter, system-ui, sans-serif);
  font-size: var(--inv-base-size, 14px);
  line-height: 1.45;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.14);
}
.invoice-sheet__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  margin-bottom: 1.75rem;
}
.invoice-sheet__title {
  margin: 0;
  font-family: var(--inv-headerTitle-font);
  font-size: var(--inv-headerTitle-size);
  font-weight: var(--inv-headerTitle-weight);
  color: var(--inv-headerTitle-color);
  letter-spacing: var(--inv-headerTitle-tracking);
  text-transform: var(--inv-headerTitle-transform);
  text-align: var(--inv-headerTitle-align);
  line-height: 1.15;
}
.invoice-sheet__icon-wrap {
  width: 48px;
  height: 48px;
  background: #000;
  overflow: hidden;
  line-height: 0;
  flex-shrink: 0;
}
.invoice-sheet__icon-wrap img {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.invoice-sheet__meta {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 1.75rem;
  row-gap: 0.2rem;
  width: fit-content;
  margin: 0 0 1.85rem;
}
.invoice-sheet__meta dt {
  margin: 0;
  font-family: var(--inv-metaLabel-font);
  font-size: var(--inv-metaLabel-size);
  font-weight: var(--inv-metaLabel-weight);
  color: var(--inv-metaLabel-color);
  letter-spacing: var(--inv-metaLabel-tracking);
  text-transform: var(--inv-metaLabel-transform);
}
.invoice-sheet__meta dd {
  margin: 0;
  font-family: var(--inv-metaValue-font);
  font-size: var(--inv-metaValue-size);
  font-weight: var(--inv-metaValue-weight);
  color: var(--inv-metaValue-color);
}
.invoice-sheet__parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
  margin-bottom: 1.85rem;
}
.invoice-sheet__parties--single {
  grid-template-columns: 1fr;
  max-width: 18rem;
}
.invoice-sheet__party p {
  margin: 0;
  font-family: var(--inv-fromDetails-font);
  font-size: var(--inv-fromDetails-size);
  font-weight: var(--inv-fromDetails-weight);
  color: var(--inv-fromDetails-color);
}
.invoice-sheet__party--bill p {
  font-family: var(--inv-billDetails-font);
  font-size: var(--inv-billDetails-size);
  font-weight: var(--inv-billDetails-weight);
  color: var(--inv-billDetails-color);
}
.invoice-sheet__label {
  font-family: var(--inv-fromLabel-font);
  font-size: var(--inv-fromLabel-size);
  font-weight: var(--inv-fromLabel-weight);
  color: var(--inv-fromLabel-color);
  letter-spacing: var(--inv-fromLabel-tracking);
  text-transform: var(--inv-fromLabel-transform);
}
.invoice-sheet__party--bill .invoice-sheet__label {
  font-family: var(--inv-billLabel-font);
  font-size: var(--inv-billLabel-size);
  font-weight: var(--inv-billLabel-weight);
  color: var(--inv-billLabel-color);
  letter-spacing: var(--inv-billLabel-tracking);
  text-transform: var(--inv-billLabel-transform);
}
.invoice-sheet__name {
  font-family: var(--inv-fromName-font);
  font-size: var(--inv-fromName-size);
  font-weight: var(--inv-fromName-weight);
  color: var(--inv-fromName-color);
}
.invoice-sheet__party--bill .invoice-sheet__name {
  font-family: var(--inv-billName-font);
  font-size: var(--inv-billName-size);
  font-weight: var(--inv-billName-weight);
  color: var(--inv-billName-color);
}
.invoice-sheet__due-line {
  margin: 0 0 0.85rem;
  font-family: var(--inv-amountDueMain-font);
  font-size: var(--inv-amountDueMain-size);
  font-weight: var(--inv-amountDueMain-weight);
  color: var(--inv-amountDueMain-color);
  letter-spacing: -0.03em;
  line-height: 1.3;
}
.invoice-sheet__pay { margin: 0 0 1.35rem; }
.invoice-sheet__pay-link {
  font-family: var(--inv-payLink-font);
  font-size: var(--inv-payLink-size);
  font-weight: var(--inv-payLink-weight);
  color: var(--inv-payLink-color);
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
.invoice-sheet__memo {
  display: grid;
  gap: 1rem;
  margin: 0 0 2rem;
  font-family: var(--inv-memo-font);
  font-size: var(--inv-memo-size);
  font-weight: var(--inv-memo-weight);
  color: var(--inv-memo-color);
}
.invoice-sheet__memo p { margin: 0; }
.invoice-sheet__table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0;
}
.invoice-sheet__table th,
.invoice-sheet__table td {
  padding: 0.55rem 0;
  text-align: left;
  vertical-align: top;
}
.invoice-sheet__table th {
  font-family: var(--inv-tableHeading-font);
  font-size: var(--inv-tableHeading-size);
  font-weight: var(--inv-tableHeading-weight);
  color: var(--inv-tableHeading-color);
  border-bottom: 1px solid var(--inv-border, #111111);
}
.invoice-sheet__table td {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}
.invoice-sheet__table td:first-child {
  overflow-wrap: anywhere;
  padding-right: 1rem;
  font-family: var(--inv-lineDescription-font);
  font-size: var(--inv-lineDescription-size);
  font-weight: var(--inv-lineDescription-weight);
  color: var(--inv-lineDescription-color);
}
.invoice-sheet__table td:nth-child(2) {
  font-family: var(--inv-lineQty-font);
  font-size: var(--inv-lineQty-size);
  font-weight: var(--inv-lineQty-weight);
  color: var(--inv-lineQty-color);
  text-align: right;
}
.invoice-sheet__table td:nth-child(3) {
  font-family: var(--inv-lineUnit-font);
  font-size: var(--inv-lineUnit-size);
  font-weight: var(--inv-lineUnit-weight);
  color: var(--inv-lineUnit-color);
  text-align: right;
}
.invoice-sheet__table td:nth-child(4) {
  font-family: var(--inv-lineAmount-font);
  font-size: var(--inv-lineAmount-size);
  font-weight: var(--inv-lineAmount-weight);
  color: var(--inv-lineAmount-color);
  text-align: right;
}
.invoice-sheet__table th:nth-child(2),
.invoice-sheet__table td:nth-child(2) { width: 3.5rem; padding-left: 1rem; text-align: right; }
.invoice-sheet__table th:nth-child(3),
.invoice-sheet__table td:nth-child(3) { width: 6.5rem; padding-left: 1.25rem; text-align: right; }
.invoice-sheet__table th:nth-child(4),
.invoice-sheet__table td:nth-child(4) { width: 6.5rem; padding-left: 1.25rem; text-align: right; }
.invoice-sheet__totals {
  margin-left: auto;
  width: min(22rem, 100%);
  display: grid;
}
.invoice-sheet__totals-row {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.7rem 0;
  border-top: 1px solid #ececec;
}
.invoice-sheet__totals-row span:first-child {
  font-family: var(--inv-totalsLabel-font);
  font-size: var(--inv-totalsLabel-size);
  font-weight: var(--inv-totalsLabel-weight);
  color: var(--inv-totalsLabel-color);
}
.invoice-sheet__totals-row span:last-child {
  font-family: var(--inv-totalsValue-font);
  font-size: var(--inv-totalsValue-size);
  font-weight: var(--inv-totalsValue-weight);
  color: var(--inv-totalsValue-color);
}
.invoice-sheet__totals-row--due span:first-child {
  font-family: var(--inv-amountDueLabel-font);
  font-size: var(--inv-amountDueLabel-size);
  font-weight: var(--inv-amountDueLabel-weight);
  color: var(--inv-amountDueLabel-color);
}
.invoice-sheet__totals-row--due span:last-child {
  font-family: var(--inv-amountDueValue-font);
  font-size: var(--inv-amountDueValue-size);
  font-weight: var(--inv-amountDueValue-weight);
  color: var(--inv-amountDueValue-color);
}
.invoice-sheet__notes { margin-top: 2rem; }
.invoice-sheet__notes-title {
  font-family: var(--inv-notesHeading-font);
  font-size: var(--inv-notesHeading-size);
  font-weight: var(--inv-notesHeading-weight);
  color: var(--inv-notesHeading-color);
  margin: 0;
}
.invoice-sheet__notes-body {
  font-family: var(--inv-notesText-font);
  font-size: var(--inv-notesText-size);
  font-weight: var(--inv-notesText-weight);
  color: var(--inv-notesText-color);
  margin: 0.35rem 0 0;
  white-space: pre-wrap;
}
.invoice-sheet__page {
  margin-top: auto;
  padding-top: 2.5rem;
  border-top: 1px solid #e8e8e8;
  font-family: var(--inv-pageFooter-font);
  font-size: var(--inv-pageFooter-size);
  font-weight: var(--inv-pageFooter-weight);
  color: var(--inv-pageFooter-color);
  text-align: var(--inv-pageFooter-align);
}
@media print {
  @page { size: letter; margin: 0.5in; }
  .invoice-sheet {
    width: 100%;
    min-height: 0;
    margin: 0;
    padding: 0;
    box-shadow: none;
    break-inside: auto;
  }
  .invoice-sheet__table tr { break-inside: avoid; page-break-inside: avoid; }
}
`
