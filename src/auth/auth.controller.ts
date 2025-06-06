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
  UseInterceptors,
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
import { GetUser } from './decorator';
import { JwtPayloadWithRt } from './types/jwtPayloadWithRt.type';
import { TokenCookieInterceptor } from './interceptor/authCookies.interceptor';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @Public()
  @Post('/local/signup')
  @ApiOperation({ summary: 'signup' })
  async signup(@Body() dto: SignUpDto) {
    await this.authService.signup(dto);

    return { status: 'success', message: 'Confirm you email' };
  }

  @Public()
  @Post('/local/signin')
  @UseInterceptors(TokenCookieInterceptor)
  @ApiOperation({ summary: 'signin' })
  async signin(@Body() dto: SignInDto) {
    const { tokens, user } = await this.authService.signin(dto);
    return {
      status: 'success',
      message: 'Logged in successfully',
      user,
      ...tokens,
    };
  }

  @Get('local/me')
  async me(@GetUser() user: JwtPayloadWithRt, @Res() res: Response) {
    const result = await this.authService.me(user);
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
  @UseInterceptors(TokenCookieInterceptor)
  async refreshTokens(
    @GetCurrentUserId() userId: string,
    @GetCurrentUser('refreshToken') refreshTokenOld: string
  ) {
    const tokens = await this.authService.refreshTokens(
      userId,
      refreshTokenOld
    );
    return {
      status: 'success',
      message: 'Refreshed token successfully',
      ...tokens,
    };
  }

  @Public()
  @Get('confirm-email/:token')
  @ApiOperation({ summary: 'confirm-email' })
  @UseInterceptors(TokenCookieInterceptor)
  async confirmEmail(@Param('token') token: string) {
    const { tokens, user } = await this.authService.confirmEmail(token);
    return {
      status: 'success',
      message: 'Confirmed email successfully',
      user,
      ...tokens,
    };
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
