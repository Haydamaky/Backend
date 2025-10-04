import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
export class OnePlayerInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  canHandle() {
    return this.analyzer.inOnePlayerInvolved();
  }

  handle() {
    if (this.analyzer.secretInfo.amounts[0] > 0) {
      throw new WsException({
        message:
          'You cant pay to bank because one user and he doesnt have to pay',
        requestId: this.analyzer.requestId,
      });
    }
  }
}
