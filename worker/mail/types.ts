export type MailAttachment = {
  filename: string
  contentBase64: string
  mimeType: string
}

export type MailMessage = {
  fromName: string
  fromEmail: string
  replyTo?: string
  to: string
  subject: string
  text: string
  html?: string
  attachments?: MailAttachment[]
}

export type MailResult = {
  messageId?: string
}

export interface MailTransport {
  send(message: MailMessage): Promise<MailResult>
}
