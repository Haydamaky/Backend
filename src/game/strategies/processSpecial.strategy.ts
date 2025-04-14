import { BaseFieldStrategy } from './base.strategy';

export class ProcessSpecialStrategy extends BaseFieldStrategy {
  matches(): boolean {
    return this.fieldAnalyzer.isSpecialField();
  }
}
