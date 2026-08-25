import type { SmtpConfig } from '../settings/types.ts'
import type { MailTransport } from './types.ts'

export function createSmtpTransport(
  config: SmtpConfig,
  password: string,
): MailTransport {
  return {
    async send(message) {
      const { WorkerMailer } = await import('worker-mailer')
      const secure = config.security === 'ssl'
      const startTls = config.security === 'starttls'
      await WorkerMailer.send(
        {
          host: config.host,
          port: config.port,
          secure,
          startTls,
          credentials: {
            username: config.username || config.fromEmail,
            password,
          },
          authType: ['plain', 'login'],
          socketTimeoutMs: 20000,
          responseTimeoutMs: 20000,
        },
        {
          from: { name: message.fromName, email: message.fromEmail },
          to: message.to,
          reply: message.replyTo || undefined,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments?.map((file) => ({
            filename: file.filename,
            content: file.contentBase64,
            mimeType: file.mimeType,
          })),
        },
      )
      return {}
    },
  }
}
