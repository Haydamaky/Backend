import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);

    // Promise.resolve(super.canActivate(context))
    //   .then((res) => res)
    //   .catch((err) => {
    //     console.log('we got it');
    //     const client = context.switchToWs().getClient() as WebSocket;
    //     const contextType = context.getType();
    //     console.log(contextType);
    //     if (contextType === 'ws') {
    //       client.send(
    //         JSON.stringify({
    //           event: 'error',
    //           data: {
    //             id: (client as any).id,
    //           },
    //         })
    //       );
    //     }
    //   });
  }
}
