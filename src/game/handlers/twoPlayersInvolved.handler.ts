import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
import { SecretService } from 'src/secret/secret.service';
export class TwoPlayersInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  constructor(
    analyzer: SecretAnalyzer,
    handler: () => void,
    private secretService: SecretService
  ) {
    super(analyzer, handler);
  }
  throw() {
    throw new WsException(
      'You cant pay to bank two users and the one wants to pay dont have to'
    );
  }
  canHandle() {
    const index = this.secretService.findIndexOfUserIdInSecretInfo(
      this.analyzer.secretInfo,
      this.analyzer.userId
    );
    return (
      (this.analyzer.isTwoPlayersInvolved() &&
        this.analyzer.secretInfo.amounts[index] < 0) ||
      this.throw()
    );
  }
}
