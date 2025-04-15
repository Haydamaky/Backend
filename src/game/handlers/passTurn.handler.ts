import { BaseHandler } from './base.strategy';
export abstract class PassTurnHandler extends BaseHandler {
  canHandle() {
    return (
      this.fieldAnalyzer.isOwnedByCurrentUser() ||
      (this.fieldAnalyzer.isNotOwned() &&
        !this.fieldAnalyzer.isAffordableForSomeone()) ||
      this.fieldAnalyzer.isSkipable()
    );
  }
}
