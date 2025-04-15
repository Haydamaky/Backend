import { BaseHandler } from './base.strategy';
export class SteppedOnPrivateHandler extends BaseHandler {
  canHandle() {
    return this.fieldAnalyzer.isOwnedByOtherAndNotPledged();
  }
}
