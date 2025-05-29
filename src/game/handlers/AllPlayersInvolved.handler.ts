import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
export class AllPlayersInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  throw() {
    throw new WsException('You get money from all u dont have to pay');
  }
  canHandle() {
    return this.analyzer.isAllPlayersInvolved() || this.throw();
  }
}
