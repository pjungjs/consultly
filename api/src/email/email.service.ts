import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client?: Resend;

  /**
   * Sends through Resend when RESEND_API_KEY is set; otherwise prints the message to the
   * console so local development never blocks on email setup.
   */
  async send(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments?: { filename: string; content: string }[],
  ) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      this.logger.warn(
        `RESEND_API_KEY not set, email not sent. To: ${to} | ${subject}\n${text}`,
      );
      return;
    }
    this.client ??= new Resend(key);
    const { data, error } = await this.client.emails.send({
      from: process.env.EMAIL_FROM ?? 'Consultly <onboarding@resend.dev>',
      to,
      subject,
      text,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
      })),
    });
    if (error) throw new Error(`Email to ${to} failed: ${error.message}`);
    // Accepted by Resend; the id can be looked up under Emails in the Resend dashboard.
    this.logger.log(`Sent "${subject}" to ${to} (${data?.id})`);
  }
}
