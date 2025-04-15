import { BaseHandler } from './base.strategy';
export abstract class ProcessSpecialHandler extends BaseHandler {
  canHandle() {
    return this.fieldAnalyzer.isSpecialField();
  }
}
