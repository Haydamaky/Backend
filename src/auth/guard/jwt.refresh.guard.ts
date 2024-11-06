import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRtGuard extends AuthGuard('jwt-refresh') {
  constructor() {
    super();
  }
}
