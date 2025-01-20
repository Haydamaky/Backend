import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetPlayer = createParamDecorator(
  (_: undefined, context: ExecutionContext): string => {
    const client = context.switchToWs().getClient();
    return client.player;
  }
);
