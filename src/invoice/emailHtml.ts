import {
  applyEmailTemplate,
  applyEmailTemplateHtml,
  looksLikeHtml,
  type TemplateVars,
} from './emailTemplates.ts'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function looksLikeHtmlFragment(value: string): boolean {
  return looksLikeHtml(value)
}

export function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  if (blocks.length === 0) {
    return '<p></p>'
  }
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function normalizePaymentUrlBlocks(html: string, paymentUrl: string): string {
  if (!paymentUrl.trim()) {
    return html.replace(/<!--payment-url:start-->[\s\S]*?<!--payment-url:end-->/g, '')
  }
  return html.replace(/<!--payment-url:(start|end)-->/g, '')
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/<form[\s\S]*?>[\s\S]*?<\/form>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type EmailWrapOptions = {
  preheader?: string
  businessName?: string
  logoUrl?: string
  wordmarkUrl?: string
}

export type EmailBrandAssets = {
  logoUrl?: string
  wordmarkUrl?: string
}

/** Build an absolute URL for email images (email clients need https://…). */
export function absolutePublicAssetUrl(baseOrigin: string, path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  const origin = baseOrigin.trim().replace(/\/$/, '')
  if (!origin) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }
  try {
    return new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, `${origin}/`)
      .href
  } catch {
    return trimmed
  }
}

function brandHeaderHtml(options: EmailWrapOptions): string {
  const logo = options.logoUrl?.trim() ?? ''
  const wordmark = options.wordmarkUrl?.trim() ?? ''
  const business = escapeHtml(options.businessName ?? 'Bitz Designs')
  const nameCell = `<td valign="middle" style="padding:0;background:#111111;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;font-weight:700;color:#f7f3ec;">${business}</td>`
  if (!logo && !wordmark) {
    return `<tr>
            <td class="email-pad" align="center" bgcolor="#111111" style="background:#111111;padding:22px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>${nameCell}</tr>
              </table>
            </td>
          </tr>`
  }
  const logoCell = logo
    ? `<td valign="middle" bgcolor="#111111" style="padding:0 16px 0 0;background:#111111;font-size:0;line-height:0;">
<img class="email-logo" src="${escapeHtml(logo)}" width="56" height="56" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:56px;height:56px;background:#111111;" />
</td>`
    : ''
  const wordmarkCell = wordmark
    ? `<td valign="middle" bgcolor="#111111" style="padding:0;background:#111111;font-size:0;line-height:0;">
<img class="email-wordmark" src="${escapeHtml(wordmark)}" alt="${business}" height="42" style="display:block;border:0;outline:none;text-decoration:none;height:42px;width:auto;max-width:280px;background:#111111;" />
</td>`
    : ''
  return `<tr>
            <td class="email-pad" align="center" bgcolor="#111111" style="background:#111111;padding:26px 28px 22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111" style="margin:0 auto;background:#111111;">
                <tr>
                  ${logoCell}
                  ${wordmarkCell}
                </tr>
                <tr>
                  <td colspan="2" align="center" bgcolor="#111111" style="padding:12px 0 0;background:#111111;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.3;letter-spacing:0.04em;color:#f7f3ec;">${business}</td>
                </tr>
              </table>
            </td>
          </tr>`
}

export function wrapInvoiceEmailHtml(
  innerHtml: string,
  options: EmailWrapOptions = {},
): string {
  if (/<html[\s>]/i.test(innerHtml)) {
    return sanitizeEmailHtml(innerHtml)
  }
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(innerHtml)
  const inner = sanitizeEmailHtml(bodyMatch?.[1] ?? innerHtml)
  const preheader = escapeHtml(options.preheader ?? '')
  const business = escapeHtml(options.businessName ?? 'Bitz Designs')
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
<title>${business}</title>
<style type="text/css">
  html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
  * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; display: block; }
  img.email-logo { width: 56px !important; height: 56px !important; max-width: 56px !important; background: #111111; }
  img.email-wordmark { height: 42px !important; width: auto !important; max-width: 280px !important; max-height: 42px !important; background: #111111; }
  a { text-decoration: underline; }
  .email-root { width: 100% !important; }
  .email-content p { margin: 0 0 16px; }
  .email-content p:last-child { margin-bottom: 0; }
  .email-content h2, .email-content h3 { margin: 0 0 12px; line-height: 1.3; color: #111111; }
  .email-content ul, .email-content ol { margin: 0 0 16px; padding-left: 22px; }
  @media only screen and (max-width: 620px) {
    .email-shell { width: 100% !important; }
    .email-card { width: 100% !important; border-radius: 0 !important; }
    .email-pad { padding: 20px 16px !important; }
    .email-content { font-size: 16px !important; line-height: 1.55 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3efe6;width:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
  <table class="email-root" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f3efe6;">
    <tr>
      <td align="center" style="padding:16px 8px;">
        <table class="email-shell" role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
          ${brandHeaderHtml(options)}
          <tr>
            <td class="email-card" style="background:#fffcf8;border:1px solid #e4ddd2;overflow:hidden;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="email-pad email-content" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#111111;">
                    ${inner}
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:8px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#4b5563;">
                    A PDF copy of this invoice is attached to this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:18px 12px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6b7280;text-align:center;">
              Sent by ${business}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function prepareInvoiceEmail(
  bodyTemplate: string,
  vars: TemplateVars,
  brand: EmailBrandAssets = {},
): { html: string; text: string } {
  const source = bodyTemplate.trim()
    ? bodyTemplate
    : '<p></p>'
  const fragment = looksLikeHtml(source) ? source : plainTextToHtml(source)
  const applied = applyEmailTemplateHtml(fragment, vars)
  const normalized = normalizePaymentUrlBlocks(applied, vars.payment_url)
  const clean = sanitizeEmailHtml(normalized)
  const textSource = looksLikeHtml(source)
    ? htmlToPlainText(normalized)
    : applyEmailTemplate(source, vars)
  return {
    html: wrapInvoiceEmailHtml(clean, {
      preheader: `Invoice ${vars.invoice_number} from ${vars.business_name}`,
      businessName: vars.business_name,
      logoUrl: brand.logoUrl,
      wordmarkUrl: brand.wordmarkUrl,
    }),
    text: textSource.trim() || htmlToPlainText(clean),
  }
}

export const SAMPLE_EMAIL_VARS: TemplateVars = {
  invoice_number: 'BD2026-0051',
  customer_name: 'Ada Lovelace',
  business_name: 'Bitz Designs',
  amount: '$50.00 USD',
  due_date: 'September 24, 2026',
  zelle_email: 'billing@bitzdesigns.co',
  payment_memo:
    'Please pay by Zelle using your invoice number as the memo.',
  payment_url:
    'https://pay.example.com/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
}

export const SAMPLE_EMAIL_BRAND: EmailBrandAssets = {
  logoUrl: '/branding/bitz-designs-icon.png',
  wordmarkUrl: '/branding/bitz-designs-wordmark.png',
}
