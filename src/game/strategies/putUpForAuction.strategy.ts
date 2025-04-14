import { BaseFieldStrategy } from './base.strategy';

export class PutUpForAuctionStrategy extends BaseFieldStrategy {
  matches(): boolean {
    return (
      this.fieldAnalyzer.isNotOwned() &&
      this.fieldAnalyzer.isAffordableForSomeone()
    );
  }
}
