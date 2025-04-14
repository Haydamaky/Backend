import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { FieldStrategy } from './fieldStrategy.interface';

export abstract class BaseFieldStrategy implements FieldStrategy {
  constructor(
    protected fieldAnalyzer: FieldAnalyzer,
    private handler: () => void
  ) {}

  abstract matches(): boolean;
  execute() {
    this.handler();
  }
}
