import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { JwtAtStrategy, JwtRtStrategy } from './strategy';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from 'src/mail/mail.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [JwtModule.register({}), ConfigModule, MailModule, UserModule],
  controllers: [AuthController],
  providers: [AuthService, JwtRtStrategy, JwtAtStrategy],
})
export class AuthModule {}
