import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { parse } from 'cookie';

export const GetGameId = createParamDecorator(
  (_: undefined, context: ExecutionContext): string => {
    const client = context.switchToWs().getClient();
    const { gameId } = parse(client.handshake.headers.cookie);
    return gameId;
  }
);
