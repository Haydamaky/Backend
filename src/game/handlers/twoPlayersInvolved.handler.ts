import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
import { WsException } from '@nestjs/websockets';
import { SecretService } from 'src/secret/secret.service';
export class TwoPlayersInvolvedHandler extends BaseHandler<SecretAnalyzer> {
  constructor(
    analyzer: SecretAnalyzer,
    private secretService: SecretService
  ) {
    super(analyzer);
  }
  canHandle() {
    return this.analyzer.isTwoPlayersInvolved();
  }

  handle(): void {
    const index = this.secretService.findIndexOfUserIdInSecretInfo(
      this.analyzer.secretInfo,
      this.analyzer.userId
    );
    if (this.analyzer.secretInfo.amounts[index] > 0) {
      throw new WsException(
        'You cant pay to bank two users and the one wants to pay dont have to'
      );
    }
  }
}
