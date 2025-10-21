import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class TurnGuard implements CanActivate {
  constructor() {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const userId = client.data.jwtPayload.sub;
    try {
      console.log('Condition: ');
      console.log({ turnOfUserId: client.game?.turnOfUserId, userId });
      console.log(client.game?.turnOfUserId !== userId);
      if (
        client.game?.turnOfUserId !== userId &&
        client.game.status === 'ACTIVE'
      ) {
        throw new WsException({
          code: 'WRONG_TURN',
          message: 'You can perform this action only on your turn',
          details: {
            action: 'TurnGuard',
          },
          requestId: data.requestId,
        });
      }
      return true;
    } catch (ex) {
      throw new WsException({
        code: 'WRONG_TURN',
        message: ex.message,
        details: {
          action: 'TurnGuard',
        },
        requestId: data.requestId,
      });
    }
  }
}
