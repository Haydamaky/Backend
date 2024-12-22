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
  let refreshToken: string;

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

      const accessTokenCookie = cookie.parse(res.headers['set-cookie']?.[0]);
      const refreshTokenCookie = cookie.parse(res.headers['set-cookie']?.[1]);

      if (
        !accessTokenCookie?.access_token ||
        !refreshTokenCookie?.refresh_token
      )
        throw new Error('Tokens are not present in response object!');

      refreshToken = refreshTokenCookie.refresh_token;

      return res;
    });
  });
});
