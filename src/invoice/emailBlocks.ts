export type EmailBlockId =
  | 'hero'
  | 'heading'
  | 'text'
  | 'greeting'
  | 'amount'
  | 'details'
  | 'payment'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'note'

export type EmailBlock = {
  id: EmailBlockId
  label: string
  hint: string
  html: string
  palette?: boolean
}

const PARAGRAPH =
  'margin:0 0 16px;font-size:16px;line-height:1.55;color:#111111;'

function token(id: string): string {
  return `<span style="display:inline-block;background:#ecfdf5;color:#0f766e;border:1px solid #99f6e4;border-radius:999px;padding:1px 8px;font-size:13px;font-weight:700;line-height:1.6;">{{${id}}}</span>`
}

export function emailVariableChip(id: string): string {
  return token(id)
}

export const EMAIL_BLOCKS: EmailBlock[] = [
  {
    id: 'heading',
    label: 'Heading',
    hint: 'Section title',
    html: `<h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#111111;">Heading</h2>`,
  },
  {
    id: 'text',
    label: 'Text',
    hint: 'A paragraph',
    html: `<p style="${PARAGRAPH}">Write a sentence…</p>`,
  },
  {
    id: 'hero',
    label: 'Header',
    hint: 'Invoice number banner',
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:#111111;color:#ffffff;padding:22px 20px;border-radius:12px;">
<p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#5eead4;font-weight:700;">Invoice</p>
<p style="margin:8px 0 0;font-size:26px;line-height:1.2;font-weight:700;">${token('invoice_number')}</p>
<p style="margin:8px 0 0;font-size:14px;color:#d1d5db;">from ${token('business_name')}</p>
</td></tr></table>`,
  },
  {
    id: 'greeting',
    label: 'Greeting',
    hint: 'Hello customer',
    palette: false,
    html: `<p style="${PARAGRAPH}">Hello ${token('customer_name')},</p>
<p style="${PARAGRAPH}">Please find invoice ${token('invoice_number')} attached as a PDF.</p>`,
  },
  {
    id: 'amount',
    label: 'Amount due',
    hint: 'Large total card',
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:18px 20px;">
<p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;">Amount due</p>
<p style="margin:6px 0 0;font-size:28px;line-height:1.2;font-weight:700;color:#111111;">${token('amount')}</p>
<p style="margin:6px 0 0;font-size:14px;color:#4b5563;">Due ${token('due_date')}</p>
</td></tr></table>`,
  },
  {
    id: 'details',
    label: 'Details',
    hint: 'Invoice facts row',
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
<td width="50%" valign="top" style="padding:12px 12px 12px 0;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:700;">Invoice</p>
<p style="margin:6px 0 0;font-size:15px;color:#111111;font-weight:700;">${token('invoice_number')}</p>
</td>
<td width="50%" valign="top" style="padding:12px 0 12px 12px;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:700;">Due date</p>
<p style="margin:6px 0 0;font-size:15px;color:#111111;font-weight:700;">${token('due_date')}</p>
</td>
</tr></table>`,
  },
  {
    id: 'payment',
    label: 'Payment',
    hint: 'Zelle and memo',
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:#f8fafc;border-radius:12px;padding:16px 18px;border:1px solid #e5e7eb;">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">Payment</p>
<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#111111;">${token('payment_memo')}</p>
<p style="margin:0;font-size:14px;color:#4b5563;">Zelle: <strong style="color:#111111;">${token('zelle_email')}</strong></p>
</td></tr></table>`,
  },
  {
    id: 'button',
    label: 'Button',
    hint: 'Pay online CTA',
    html: `<!--payment-url:start--><div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td align="center" style="padding:4px 0 8px;">
<a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:700;letter-spacing:0.01em;text-decoration:none;">Pay Online</a>
</td></tr></table>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#4b5563;text-align:center;">If the button above doesn&#39;t work, use this secure payment link:<br><a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="color:#0f766e;word-break:break-all;">{{payment_url}}</a></p></div><!--payment-url:end-->`,
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Horizontal rule',
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr></table>`,
  },
  {
    id: 'spacer',
    label: 'Spacer',
    hint: 'Vertical gap',
    html: `<div style="height:18px;line-height:18px;font-size:1px;">&nbsp;</div>`,
  },
  {
    id: 'note',
    label: 'Note',
    hint: 'Closing thanks',
    html: `<p style="${PARAGRAPH}">Thank you,<br>${token('business_name')}</p>`,
  },
]

export const PALETTE_BLOCKS: EmailBlock[] = EMAIL_BLOCKS.filter(
  (block) => block.palette !== false,
)

export function emailBlockHtml(id: EmailBlockId): string {
  return EMAIL_BLOCKS.find((block) => block.id === id)?.html ?? ''
}

export function splitTopLevelParagraphs(html: string): string[] {
  const matches = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)
  if (matches && matches.length > 1) {
    return matches.map((part) => part.trim())
  }
  return []
}

export function defaultGraphicalEmailBody(): string {
  const greeting = splitTopLevelParagraphs(emailBlockHtml('greeting'))
  const layout: Array<{ type: EmailBlockId; html: string }> = [
    { type: 'hero', html: emailBlockHtml('hero') },
    ...greeting.map((html) => ({ type: 'text' as const, html })),
    { type: 'amount', html: emailBlockHtml('amount') },
    { type: 'payment', html: emailBlockHtml('payment') },
    { type: 'button', html: emailBlockHtml('button') },
    { type: 'note', html: emailBlockHtml('note') },
  ]
  return layout
    .map(
      (item) =>
        `<!--email-block:${item.type}-->\n${item.html}\n<!--/email-block-->`,
    )
    .join('\n')
}
