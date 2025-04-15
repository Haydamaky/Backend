import { BaseHandler } from './base.strategy';
export abstract class PutUpForAuctionHanlder extends BaseHandler {
  canHandle() {
    return (
      this.fieldAnalyzer.isNotOwned() &&
      this.fieldAnalyzer.isAffordableForSomeone()
    );
  }
}
