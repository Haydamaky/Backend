import { CanActivate, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class TurnGuard implements CanActivate {
  constructor() {}

  async canActivate(context: any): Promise<boolean | any> {
    const client = context.switchToWs().getClient();
    const userId = client.jwtPayload.sub;
    try {
      if (
        client.game?.turnOfUserId !== userId &&
        client.game.status === 'ACTIVE'
      )
        throw new WsException('Wrong turn');
      return true;
    } catch (ex) {
      throw new WsException(ex.message);
    }
  }
}
