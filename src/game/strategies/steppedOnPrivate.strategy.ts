import { BaseFieldStrategy } from './base.strategy';

export class SteppedOnPrivateStrategy extends BaseFieldStrategy {
  matches(): boolean {
    return this.fieldAnalyzer.isOwnedByOtherAndNotPledged();
  }
}
