import { SecretAnalyzer } from 'src/secret/secretAnalyzer';
import { BaseHandler } from '../../common/base.handler';
export class PassTurnHandler extends BaseHandler<SecretAnalyzer> {
  canHandle() {
    return (
      this.analyzer.isOwnedByCurrentUser() ||
      (this.analyzer.isNotOwned() && !this.analyzer.isAffordableForSomeone()) ||
      this.analyzer.isSkipable()
    );
  }
}
