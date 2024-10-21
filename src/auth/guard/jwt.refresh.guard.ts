import { AuthGuard } from '@nestjs/passport';

export class JwtRtGuard extends AuthGuard('jwt-refresh') {
  constructor() {
    super();
  }
}
