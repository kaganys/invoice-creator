export const BUNDLED_FONT_FILES: Array<{
  family: string
  weight: number
  file: string
}> = [
  { family: 'Inter', weight: 400, file: 'inter-400.woff2' },
  { family: 'Inter', weight: 600, file: 'inter-600.woff2' },
  { family: 'Inter', weight: 700, file: 'inter-700.woff2' },
  { family: 'IBM Plex Sans', weight: 400, file: 'ibm-plex-sans-400.woff2' },
  { family: 'IBM Plex Sans', weight: 600, file: 'ibm-plex-sans-600.woff2' },
  { family: 'IBM Plex Sans', weight: 700, file: 'ibm-plex-sans-700.woff2' },
  { family: 'Source Sans 3', weight: 400, file: 'source-sans-3-400.woff2' },
  { family: 'Source Sans 3', weight: 600, file: 'source-sans-3-600.woff2' },
  { family: 'Source Sans 3', weight: 700, file: 'source-sans-3-700.woff2' },
  { family: 'Source Serif 4', weight: 400, file: 'source-serif-4-400.woff2' },
  { family: 'Source Serif 4', weight: 700, file: 'source-serif-4-700.woff2' },
  { family: 'Lora', weight: 400, file: 'lora-400.woff2' },
  { family: 'Lora', weight: 700, file: 'lora-700.woff2' },
  { family: 'Libre Baskerville', weight: 400, file: 'libre-baskerville-400.woff2' },
  { family: 'Libre Baskerville', weight: 700, file: 'libre-baskerville-700.woff2' },
]

export function invoiceFontFaceCss(origin: string): string {
  const base = origin.replace(/\/$/, '')
  return BUNDLED_FONT_FILES.map(
    (font) =>
      `@font-face { font-family: ${JSON.stringify(font.family)}; font-style: normal; font-weight: ${font.weight}; font-display: swap; src: url('${base}/fonts/${font.file}') format('woff2'); }`,
  ).join('\n')
}
