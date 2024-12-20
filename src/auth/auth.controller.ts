import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SignInDto,
  SignUpDto,
} from './dto';
import { AuthGuard } from '@nestjs/passport';
import { GetCurrentUser } from './decorator/get-current-user.decorator';
import { GetCurrentUserId } from './decorator/get-current-user-id.decorator';
import { Public } from './decorator/public.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AccessCookieAttributes, RefreshCookieAttributes } from './types';
import { JwtRtGuard } from './guard';
import { GetUser } from './decorator';
import { JwtPayloadWithRt } from './types/jwtPayloadWithRt.type';

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
    path: '/',
    domain: 'localhost',
  };

  get NODE_ENV(): string {
    return this.configService.get<string>('NODE_ENV');
  }

  get FRONTEND_URL(): string {
    return this.configService.get<string>('FRONTEND_URL');
  }

  setCookie(
    res: Response,
    name: string,
    value: string,
    options: Record<string, any>
  ) {
    const cookieOptions = {
      ...options,
      secure: false,
    };
    res.cookie(name, value, cookieOptions);
  }

  setTokens(res: Response, accessToken: string, refreshToken: string) {
    this.setCookie(
      res,
      'access_token',
      accessToken,
      AuthController.ACCESS_COOKIES_ATTRIBUTES
    );
    this.setCookie(
      res,
      'refresh_token',
      refreshToken,
      AuthController.REFRESH_COOKIES_ATTRIBUTES
    );
  }

  @Public()
  @Post('/local/signup')
  @ApiOperation({ summary: 'signup' })
  async signup(@Body() dto: SignUpDto) {
    await this.authService.signup(dto);

    return { status: 'success', message: 'Confirm you email' };
  }

  @Public()
  @Post('/local/signin')
  @ApiOperation({ summary: 'signin' })
  async signin(@Body() dto: SignInDto, @Res() res: Response) {
    const { tokens, user } = await this.authService.signin(dto);
    const { access_token: accessToken, refresh_token: refreshToken } = tokens;
    this.setTokens(res, accessToken, refreshToken);
    return res
      .status(HttpStatus.OK)
      .send({ status: 'success', message: 'Logged in successfully', user });
  }

  @Public()
  @UseGuards(JwtRtGuard)
  @Get('local/me')
  async me(@GetUser() user: JwtPayloadWithRt, @Res() res: Response) {
    const result = await this.authService.me(user);

    this.setCookie(
      res,
      'access_token',
      result.access_token,
      AuthController.ACCESS_COOKIES_ATTRIBUTES
    );
    delete result.access_token;

    return res.status(HttpStatus.OK).send(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'logout' })
  async logout(@GetCurrentUserId() userId: string) {
    await this.authService.logout(userId);
    return { status: 'success', message: 'Logout successfully' };
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @ApiOperation({ summary: 'refreshTokens' })
  async refreshTokens(
    @GetCurrentUserId() userId: string,
    @GetCurrentUser('refreshToken') refreshToken: string,
    @Res() res: Response
  ) {
    const { access_token: accessToken, refresh_token: refreshTokenNew } =
      await this.authService.refreshTokens(userId, refreshToken);

    this.setTokens(res, accessToken, refreshTokenNew);

    return res
      .status(HttpStatus.OK)
      .send({ status: 'success', message: 'Refreshed token successfully' });
  }

  @Public()
  @Get('confirm-email/:token')
  @ApiOperation({ summary: 'confirm-email' })
  async confirmEmail(@Param('token') token: string, @Res() res: Response) {
    const { tokens, user } = await this.authService.confirmEmail(token);
    const { access_token: accessToken, refresh_token: refreshToken } = tokens;
    this.setTokens(res, accessToken, refreshToken);

    return res.status(HttpStatus.OK).send({
      status: 'success',
      message: 'Confirmed email successfully',
      user,
    });
  }

  @Patch('change-password')
  @ApiOperation({ summary: 'change-password' })
  async changePassword(
    @GetCurrentUserId() userId: string,
    @Body() dto: ChangePasswordDto
  ) {
    await this.authService.changePassword(
      userId,
      dto.oldPassword,
      dto.newPassword,
      dto.confirmNewPassword
    );

    return { status: 'success', message: 'Password changed successfully' };
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'forgot-password' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const token = await this.authService.forgotPassword(dto.email);

    return {
      status: 'success',
      token,
      message: 'Confirm your email to change your password',
    };
  }

  @Post('reset-password/:token')
  @ApiOperation({ summary: 'reset-password' })
  async resetPassword(
    @Param('token') token: string,
    @Body() dto: ResetPasswordDto
  ) {
    await this.authService.resetPassword(
      token,
      dto.newPassword,
      dto.confirmNewPassword
    );
    return { status: 'success', message: 'Password reset successfully' };
  }
}
