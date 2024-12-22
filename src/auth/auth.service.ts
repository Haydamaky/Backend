import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SignInDto, SignUpDto } from './dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Tokens } from './types';
import * as argon2 from 'argon2';
import { JwtRtGuard } from './guard';
import { MailService } from 'src/mail/mail.service';
import { JwtPayload } from './types/jwtPayloadType.type';
import { UserRepository } from 'src/user/user.repository';
import { JwtPayloadWithRt } from './types/jwtPayloadWithRt.type';

@Injectable()
export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: MailService
  ) {}

  async signup(dto: SignUpDto) {
    try {
      const hashPasswordPromise = this.hashData(dto.password);
      const emailConfirmationTokenPromise = this.jwtService.signAsync(
        { email: dto.email },
        {
          expiresIn: '1h',
          algorithm: 'HS256',
          secret: this.configService.get('EMAIL_CONFIRM_SECRET'),
        }
      );
      const [hash, emailConfirmationToken] = await Promise.all([
        hashPasswordPromise,
        emailConfirmationTokenPromise,
      ]);
      await this.userRepository.create({
        data: {
          email: dto.email,
          hash,
          nickname: dto.nickname,
          emailConfirmationToken,
        },
      });
      this.emailService.sendVerificationEmail(
        dto.email,
        emailConfirmationToken
      );
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Credentials Already Taken');
        }
      } else {
        throw error;
      }
    }
  }

  async signin(dto: SignInDto) {
    //check user
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user) {
      throw new ForbiddenException('Credentials are incorrect');
    }
    //check password
    const pwMatches = await argon2.verify(user.hash, dto.password);

    if (!pwMatches) {
      throw new ForbiddenException('Password is incorrect');
    }
    const tokens = await this.signTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);
    return {
      tokens,
      user: { nickname: user.nickname, email: user.email, id: user.id },
    };
  }

  async me(user: JwtPayloadWithRt) {
    const userFromDB = await this.userRepository.findByEmail(user.email);
    if (!userFromDB) throw new UnauthorizedException('User does not exist');
    const access_token = await this.jwtService.signAsync(
      { sub: userFromDB.id, email: userFromDB.email },
      {
        expiresIn: '1d',
        privateKey: this.configService.get('ACCESS_TOKEN_PRIV_KEY'),
        algorithm: 'RS256',
      }
    );
    return {
      access_token,
      nickname: userFromDB.nickname,
      email: userFromDB.email,
      id: userFromDB.id,
      isEmailConfirmed: userFromDB.isEmailConfirmed,
    };
  }

  async logout(id: string) {
    await this.userRepository.updateMany({
      where: {
        id,
        hashedRt: {
          not: null,
        },
      },
      data: {
        hashedRt: null,
      },
    });
  }
  @UseGuards(JwtRtGuard)
  async refreshTokens(id: string, rt: string) {
    const user = await this.userRepository.findById(id);

    if (!user) throw new ForbiddenException('Access Denied');
    if (!user.hashedRt) throw new ForbiddenException('Access Denied');

    const rtMatches = await argon2.verify(user.hashedRt, rt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.signTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);
    return tokens;
  }

  async signTokens(id: string, email: string): Promise<Tokens> {
    const payLoad = {
      sub: id,
      email,
    };
    const atPrivKey = this.configService.get<string>('ACCESS_TOKEN_PRIV_KEY');
    const rtPrivKey = this.configService.get<string>('REFRESH_TOKEN_PRIV_KEY');

    const [at_token, rt_token] = await Promise.all([
      this.jwtService.signAsync(payLoad, {
        expiresIn: '30d',
        privateKey: atPrivKey,
        algorithm: 'RS256',
      }),
      this.jwtService.signAsync(payLoad, {
        expiresIn: '30d',
        privateKey: rtPrivKey,
        algorithm: 'RS256',
      }),
    ]);

    return {
      access_token: at_token,
      refresh_token: rt_token,
    };
  }

  async confirmEmail(token: string) {
    const decodedToken = await this.jwtService.verify(token, {
      secret: this.configService.get('EMAIL_CONFIRM_SECRET'),
    });

    if (!decodedToken) {
      throw new BadRequestException('Invalid token');
    }

    const user = await this.userRepository.findByEmail(decodedToken.email);

    const tokens = await this.signTokens(user.id, user.email);
    await this.updateRtHash(user.id, tokens.refresh_token);
    return { tokens, user: { nickname: user.nickname, email: user.email } };
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ): Promise<void> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException(
        // prettier-ignore
        'New password and confirmation don\'t match'
      );
    }

    const isPasswordMatch = await argon2.verify(user.hash, oldPassword);
    if (!isPasswordMatch) {
      throw new BadRequestException('Incorrect current password');
    }
    const newHash = await this.hashData(newPassword);

    await this.userRepository.update({
      where: { id },
      data: { hash: newHash },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');
    const forgotPasswordToken = await this.jwtService.signAsync(
      { email: email, sub: user.id },
      {
        expiresIn: '1h',
        algorithm: 'HS256',
        secret: this.configService.get('RESET_PASSWORD_SECRET'),
      }
    );
    this.emailService.sendForgotPasswordEmail(email, forgotPasswordToken);
    return forgotPasswordToken;
  }

  async resetPassword(
    token: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException(
        // prettier-ignore
        'New password and confirmation don\'t match'
      );
    }

    const decodedToken = await this.verifyResetToken(token);

    const newHash = await this.hashData(newPassword);

    await this.userRepository.update({
      where: { email: decodedToken.email },
      data: { hash: newHash, hashedRt: null },
    });
  }

  async verifyResetToken(token: string): Promise<JwtPayload> {
    try {
      const decodedToken = await this.jwtService.verify(token, {
        secret: this.configService.get('RESET_PASSWORD_SECRET'),
      });
      return decodedToken;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Reset password token has expired.');
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid reset password token.');
      }
      throw new BadRequestException('Error verifying reset password token.');
    }
  }

  async updateRtHash(id: string, rt: string) {
    const hash = await argon2.hash(rt);

    await this.userRepository.update({
      where: {
        id,
      },
      data: {
        hashedRt: hash,
      },
    });
  }

  async hashData(data: string) {
    const hash = await argon2.hash(data);
    return hash;
  }
}
