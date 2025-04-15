import { BaseHandler } from './base.strategy';
export class PutUpForAuctionHandler extends BaseHandler {
  canHandle() {
    return (
      this.fieldAnalyzer.isNotOwned() &&
      this.fieldAnalyzer.isAffordableForSomeone()
    );
  }
}
