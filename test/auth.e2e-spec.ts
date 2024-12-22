import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import * as crypto from 'crypto';
import * as cookieParser from 'cookie-parser';
import * as cookie from 'cookie';

describe('AuthController E2E Test', () => {
  let app: INestApplication;
  const name = crypto.randomBytes(10).toString('hex');
  const credentials = {
    email: `${name}@gmail.com`,
    password: name,
  };

  const accessTokenObj: { accessToken?: string; cookie?: string } = {};
  const refreshTokenObj: { refreshToken?: string; cookie?: string } = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  describe('Authentication ( /local/signup : /local/signin)', () => {
    it('Should create new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/local/signup')
        .send({ ...credentials, nickname: name })
        .expect(201, { status: 'success', message: 'Confirm you email' });

      return res;
    });

    it('Should successfully login', async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/auth/local/signin')
          .send(credentials)
          .expect(200);

        expect(res.body).toMatchObject({
          status: 'success',
          message: 'Logged in successfully',
          user: {
            nickname: name,
            email: credentials.email,
          },
        });
        const [accessCookie, refreshCookie] = res.headers['set-cookie'];
        const accessTokenCookie = cookie.parse(accessCookie);
        const refreshTokenCookie = cookie.parse(refreshCookie);

        if (
          !accessTokenCookie?.access_token ||
          !refreshTokenCookie?.refresh_token
        )
          throw new Error('Tokens are not present in response object!');

        accessTokenObj.accessToken = accessTokenCookie.access_token;
        accessTokenObj.cookie = accessCookie;
        refreshTokenObj.refreshToken = refreshTokenCookie.refresh_token;
        refreshTokenObj.cookie = refreshCookie;

        return res;
      } catch (err) {
        console.log('ERROR', err);
      }
    });
  });

  describe('Retrieve user by refresh token ( /local/me )', () => {
    it('Should automatically relogin', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/local/me')
        .set('Cookie', refreshTokenObj.cookie)
        .expect(200);

      if (!res.headers['set-cookie'].length)
        throw new Error('/auth/local/me does not return new access token!');

      expect(res.body).toMatchObject({
        nickname: name,
        email: credentials.email,
      });
      return res;
    });
  });

  describe('Operations', () => {
    it('Should change password', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Cookie', accessTokenObj.cookie)
        .send({
          oldPassword: name,
          newPassword: 'AbsoluteNewPass123',
          confirmNewPassword: 'AbsoluteNewPass123',
        })
        .expect(200, {
          status: 'success',
          message: 'Password changed successfully',
        });

      return res;
    });
  });
});
