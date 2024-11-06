import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtPayload } from '../types/jwtPayloadType.type';
import { UserService } from 'src/user/user.service';
import { Reflector } from '@nestjs/core';
import { $Enums } from '@prisma/client';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext) {
    const userJWT = context.switchToHttp().getRequest().user as JwtPayload;
    const role = this.reflector.getAllAndOverride('ROLE', [
      context.getHandler(),
      context.getClass(),
    ]) as $Enums.ROLE[];

    const user = await this.userService.findOne(userJWT.sub);

    if (role.includes(user.role)) return true;

    return false;
  }
}
