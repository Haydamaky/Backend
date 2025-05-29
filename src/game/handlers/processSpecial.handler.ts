import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { BaseHandler } from '../../common/base.handler';
export class ProcessSpecialHandler extends BaseHandler<FieldAnalyzer> {
  canHandle() {
    return this.analyzer.isSpecialField();
  }
}
