import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

interface AuthResponse {
  accessToken?: string;
  refreshToken?: string;
  [key: string]: any;
}

@Injectable()
export class TokenCookieInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data: AuthResponse) => {
        const response = context.switchToHttp().getResponse<Response>();
        if (data?.accessToken || data?.refreshToken) {
          if (data.accessToken) {
            response.cookie('accessToken', data.accessToken, {
              httpOnly: true,
              path: '/',
              maxAge: 1000 * 60 * 15,
              sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
              secure: process.env.NODE_ENV === 'production',
              ...(process.env.NODE_ENV === 'production' && {
                domain: `.${process.env.DOMAIN_NAME_PROD}`,
              }),
            });
            delete data.accessToken;
          }

          if (data.refreshToken) {
            response.cookie('refreshToken', data.refreshToken, {
              httpOnly: true,
              path: '/auth/refresh',
              maxAge: 1000 * 60 * 60 * 24 * 7,
              sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
              secure: process.env.NODE_ENV === 'production',
              ...(process.env.NODE_ENV === 'production' && {
                domain: `.${process.env.DOMAIN_NAME_PROD}`,
              }),
            });
            delete data.refreshToken;
          }
        }

        return data;
      })
    );
  }
}
