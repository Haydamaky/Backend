import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private configService: ConfigService
  ) {}

  async sendVerificationEmail(email: string, token: string) {
    const confirmationUrl = `${this.configService.get('DOMAIN_NAME')}/auth/confirm-email/${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Confirm Your Email',
      text: `Please confirm your email by clicking the following link: ${confirmationUrl}`,
      html: `<a href="${confirmationUrl}">Click here to confirm your email</a>`,
    });
  }

  async sendForgotPasswordEmail(email: string, token: string) {
    const forgotPasswordUrl = `${this.configService.get('DOMAIN_NAME')}/auth/reset-password/${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Reset Your password',
      text: `Reset your password by clicking the following link: ${forgotPasswordUrl}`,
      html: `<a href="${forgotPasswordUrl}">Click here to reset your password</a>`,
    });
  }
}