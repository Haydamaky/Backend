import { ValidationPipe, Injectable, ArgumentMetadata } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
    });
  }

  async transform(value: any, metadata: ArgumentMetadata) {
    try {
      return await super.transform(value, metadata);
    } catch (errors) {
      const messages = errors.response.message || errors;
      throw new WsException(messages[0]);
    }
  }
}
