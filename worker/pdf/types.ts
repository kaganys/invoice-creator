export interface PdfRenderer {
  renderHtml(html: string): Promise<Uint8Array>
}
