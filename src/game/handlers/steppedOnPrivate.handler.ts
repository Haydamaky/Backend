import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { BaseHandler } from '../../common/base.handler';
export class SteppedOnPrivateHandler extends BaseHandler<FieldAnalyzer> {
  canHandle() {
    return this.analyzer.isOwnedByOtherAndNotPledged();
  }
}
