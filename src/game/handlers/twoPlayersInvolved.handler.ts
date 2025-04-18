import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
export class twoPlayersInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  throw() {
    throw new WsException(
      'You cant pay to bank two users and the one wants to pay dont have to'
    );
  }
  canHandle() {
    const index = this.findIndexOfUserIdInSecretInfo();
    return (
      (this.analyzer.isTwoPlayersInvolved() &&
        this.analyzer.secretInfo.amounts[index] < 0) ||
      this.throw()
    );
  }

  private findIndexOfUserIdInSecretInfo() {
    return this.analyzer.secretInfo.users.findIndex(
      (userId) => userId === this.analyzer.userId
    );
  }
}
