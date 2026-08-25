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
<body style="margin:0;padding:0;background:#f3f5f7;width:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
  <table class="email-root" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f3f5f7;">
    <tr>
      <td align="center" style="padding:16px 8px;">
        <table class="email-shell" role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
          <tr>
            <td class="email-pad" style="padding:8px 12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6b7280;text-align:center;">
              Invoice from ${business}
            </td>
          </tr>
          <tr>
            <td class="email-card" style="background:#ffffff;border-radius:12px;overflow:hidden;">
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
