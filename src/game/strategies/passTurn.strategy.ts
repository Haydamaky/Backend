import { BaseFieldStrategy } from './base.strategy';

export class PassTurnStrategy extends BaseFieldStrategy {
  matches(): boolean {
    return (
      this.fieldAnalyzer.isOwnedByCurrentUser() ||
      (this.fieldAnalyzer.isNotOwned() &&
        !this.fieldAnalyzer.isAffordableForSomeone()) ||
      this.fieldAnalyzer.isSkipable()
    );
  }
}
