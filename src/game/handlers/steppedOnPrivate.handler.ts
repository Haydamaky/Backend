import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { BaseHandler } from './base.handler';
export class SteppedOnPrivateHandler extends BaseHandler<FieldAnalyzer> {
  canHandle() {
    return this.analyzer.isOwnedByOtherAndNotPledged();
  }
}
