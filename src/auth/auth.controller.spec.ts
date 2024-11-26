import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Partial<AuthService>;
  const signingUser = {
    email: 'test@gmail.com',
    password: '123456',
    nickname: 'test',
  };
  let res: any;

  beforeEach(async () => {
    mockAuthService = {
      signup: jest.fn(),
      signin: jest.fn().mockReturnValue({
        tokens: {
          access_token: 'accessToken',
          refresh_token: 'refreshToken',
        },
        user: {
          nickname: 'test',
          email: 'test@gmail.com',
        },
      }),
      logout: jest.fn(),
      refreshTokens: jest.fn().mockReturnValue({
        access_token: 'accessToken',
        refresh_token: 'refreshTokenNew',
      }),
      confirmEmail: jest.fn().mockReturnValue({
        tokens: {
          access_token: 'accessToken',
          refresh_token: 'refreshToken',
        },
        user: {
          nickname: 'test',
          email: 'test@gmail.com',
        },
      }),
      changePassword: jest.fn(),
      forgotPassword: jest.fn().mockReturnValue('forgotPasswordToken'),
      resetPassword: jest.fn(),
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        ConfigService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call res.cookie with given arguments', async () => {
    controller.setCookie(res, 'access_token', 'token', {
      httpOnly: true,
    });
    expect(res.cookie).toHaveBeenCalledWith('access_token', 'token', {
      httpOnly: true,
    });
  });

  it('should call setCookie with given arguments', async () => {
    controller.setCookie = jest.fn();
    controller.setTokens(res, 'accessToken', 'refreshToken');
    expect(controller.setCookie).toHaveBeenNthCalledWith(
      1,
      res,
      'access_token',
      'accessToken',
      AuthController.ACCESS_COOKIES_ATTRIBUTES
    );

    expect(controller.setCookie).toHaveBeenNthCalledWith(
      2,
      res,
      'refresh_token',
      'refreshToken',
      AuthController.REFRESH_COOKIES_ATTRIBUTES
    );
  });

  it('should call signup in auth.service', async () => {
    await controller.signup(signingUser);
    expect(mockAuthService.signup).toHaveBeenCalledWith(signingUser);
  });

  it('should return res with status success', async () => {
    const response = await controller.signup(signingUser);
    expect(response).toStrictEqual({
      status: 'success',
      message: 'Confirm you email',
    });
  });

  it('should call signin in auth.service', async () => {
    await controller.signin(signingUser, res);
    expect(mockAuthService.signin).toHaveBeenCalledWith(signingUser);
  });

  it('should call setTokens with tokens from signin service', async () => {
    controller.setTokens = jest.fn();
    await controller.signin(signingUser, res);

    expect(controller.setTokens).toHaveBeenCalledWith(
      res,
      'accessToken',
      'refreshToken'
    );
  });

  it('should call logout from service and return response', async () => {
    const response = await controller.logout('id');
    expect(mockAuthService.logout).toHaveBeenCalledWith('id');
    expect(response).toStrictEqual({
      status: 'success',
      message: 'Logout successfully',
    });
  });

  it('should call refreshTokens from auth service and call setTokens with this result', async () => {
    await controller.refreshTokens('id', 'newToken', res);
    expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
      'id',
      'newToken'
    );
    expect(res.send).toHaveBeenCalledWith({
      status: 'success',
      message: 'Refreshed token successfully',
    });
  });

  it('should call confirm email from auth.service with given token', async () => {
    await controller.confirmEmail('token', res);
    expect(mockAuthService.confirmEmail).toHaveBeenCalledWith('token');
  });

  it('should call setToken with tokens after calling confirm email service method', async () => {
    controller.setTokens = jest.fn();
    await controller.confirmEmail('token', res);
    expect(controller.setTokens).toHaveBeenCalledWith(
      res,
      'accessToken',
      'refreshToken'
    );
  });

  it('should send res with res object', async () => {
    await controller.confirmEmail('token', res);
    expect(res.send).toHaveBeenCalledWith({
      status: 'success',
      message: 'Confirmed email successfully',
      user: {
        email: 'test@gmail.com',
        nickname: 'test',
      },
    });
  });

  it('should call changePassword method from auth.service and return res obj', async () => {
    const response = await controller.changePassword('id', {
      oldPassword: '123456',
      newPassword: '654321',
      confirmNewPassword: '654321',
    });

    expect(mockAuthService.changePassword).toHaveBeenCalledWith(
      'id',
      '123456',
      '654321',
      '654321'
    );
    expect(response).toStrictEqual({
      status: 'success',
      message: 'Password changed successfully',
    });
  });

  it('should call forgotPassword method from auth.service and return res obj', async () => {
    const response = await controller.forgotPassword({
      email: 'test@gmail.com',
    });
    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(
      'test@gmail.com'
    );
    expect(response).toStrictEqual({
      status: 'success',
      token: 'forgotPasswordToken',
      message: 'Confirm your email to change your password',
    });
  });

  it('should call reset-password method from auth.service and return res obj', async () => {
    const response = await controller.resetPassword('forgotPasswordToken', {
      newPassword: '654321',
      confirmNewPassword: '654321',
    });
    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
      'forgotPasswordToken',
      '654321',
      '654321'
    );
    expect(response).toStrictEqual({
      status: 'success',
      message: 'Password reset successfully',
    });
  });
});
