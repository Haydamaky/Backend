import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
export class AllPlayersInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  throw() {
    throw new WsException({
      message: 'You get money from all u dont have to pay',
      requestId: this.analyzer.requestId,
    });
  }
  canHandle() {
    return this.analyzer.isAllPlayersInvolved() || this.throw();
  }
}
