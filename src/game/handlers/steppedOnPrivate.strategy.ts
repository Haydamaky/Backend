import { BaseHandler } from './base.strategy';
export abstract class SteppedOnPrivateHanlder extends BaseHandler {
  canHandle() {
    return this.fieldAnalyzer.isOwnedByOtherAndNotPledged();
  }
}
