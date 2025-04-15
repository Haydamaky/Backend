import { BaseHandler } from './base.strategy';
export class ProcessSpecialHandler extends BaseHandler {
  canHandle() {
    return this.fieldAnalyzer.isSpecialField();
  }
}
