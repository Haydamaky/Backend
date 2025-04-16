import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { BaseHandler } from './base.handler';
export class PassTurnHandler extends BaseHandler<FieldAnalyzer> {
  canHandle() {
    return (
      this.analyzer.isOwnedByCurrentUser() ||
      (this.analyzer.isNotOwned() && !this.analyzer.isAffordableForSomeone()) ||
      this.analyzer.isSkipable()
    );
  }
}
