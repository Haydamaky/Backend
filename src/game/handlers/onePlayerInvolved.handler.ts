import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
export class onePlayerInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  throw() {
    throw new WsException(
      'You cant pay to bank because one user and he doesnt have to pay'
    );
  }
  canHandle() {
    return (
      (this.analyzer.inOnePlayerInvolved() &&
        this.analyzer.secretInfo.amounts[0] > 0) ||
      this.throw()
    );
  }
}
