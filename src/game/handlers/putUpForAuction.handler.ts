import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { BaseHandler } from '../../common/base.handler';
export class PutUpForAuctionHandler extends BaseHandler<FieldAnalyzer> {
  canHandle() {
    return this.analyzer.isNotOwned() && this.analyzer.isAffordableForSomeone();
  }
}
