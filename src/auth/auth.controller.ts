import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto';
import { AuthGuard } from '@nestjs/passport';
import { GetCurrentUser } from './decorator/get-current-user.decorator';
import { GetCurrentUserId } from './decorator/get-current-user-id.decorator';
import { Public } from './decorator/public.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AccessCookieAttributes, RefreshCookieAttributes } from './types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService
  ) {}
  static readonly ACCESS_COOKIES_ATTRIBUTES: AccessCookieAttributes = {
    httpOnly: true,
    sameSite: 'lax',
  };

  static readonly REFRESH_COOKIES_ATTRIBUTES: RefreshCookieAttributes = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/auth/refresh',
    domain: 'localhost',
  };

  get NODE_ENV(): string {
    return this.configService.get<string>('NODE_ENV');
  }

  @Public()
  @Post('/local/signup')
  @ApiOperation({ summary: 'signup' })
  async signup(@Body() dto: SignUpDto, @Res() res: Response) {
    const { access_token: accessToken, refresh_token: refreshToken } =
      await this.authService.signup(dto);
    res.cookie('access_token', accessToken, {
      ...AuthController.ACCESS_COOKIES_ATTRIBUTES,
      ...(this.NODE_ENV === 'production' ? { secure: true } : null),
    });

    res.cookie('refresh_token', refreshToken, {
      ...AuthController.REFRESH_COOKIES_ATTRIBUTES,
      ...(this.NODE_ENV === 'production' ? { secure: true } : null),
    });
    return res
      .status(HttpStatus.CREATED)
      .send({ status: 'success', message: 'Signed up successfully' });
  }

  @Public()
  @Post('/local/signin')
  @ApiOperation({ summary: 'signin' })
  async signin(@Body() dto: SignInDto, @Res() res: Response) {
    const { access_token: accessToken, refresh_token: refreshToken } =
      await this.authService.signin(dto);

    res.cookie('access_token', accessToken, {
      ...AuthController.ACCESS_COOKIES_ATTRIBUTES,
      ...(this.NODE_ENV === 'production' ? { secure: true } : null),
    });

    res.cookie('refresh_token', refreshToken, {
      ...AuthController.REFRESH_COOKIES_ATTRIBUTES,
      ...(this.NODE_ENV === 'production' ? { secure: true } : null),
    });
    return res
      .status(HttpStatus.OK)
      .send({ status: 'success', message: 'Logged in successfully' });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'logout' })
  logout(@GetCurrentUserId() userId: number) {
    return this.authService.logout(userId);
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @ApiOperation({ summary: 'refreshTokens' })
  async refreshTokens(
    @GetCurrentUserId() userId: number,
    @GetCurrentUser('refreshToken') refreshToken: string,
    @Res() res: Response
  ) {
    const { access_token: accessToken, refresh_token: refreshTokenNew } =
      await this.authService.refreshTokens(userId, refreshToken);

    res.cookie('access_token', accessToken, {
      ...AuthController.ACCESS_COOKIES_ATTRIBUTES,
      ...(this.NODE_ENV === 'production' ? { secure: true } : null),
    });

    res.cookie('refresh_token', refreshTokenNew, {
      ...AuthController.REFRESH_COOKIES_ATTRIBUTES,
      ...(this.NODE_ENV === 'production' ? { secure: true } : null),
    });
    return res
      .status(HttpStatus.OK)
      .send({ status: 'success', message: 'Refreshed token successfully' });
  }
}
