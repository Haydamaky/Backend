import { FieldAnalyzer } from 'src/field/FieldAnalyzer';
import { IHandler } from './IHandler';

export abstract class BaseHandler implements IHandler {
  constructor(
    protected fieldAnalyzer: FieldAnalyzer,
    private handler: () => void
  ) {}

  abstract canHandle(): boolean;
  handle() {
    this.handler();
  }
}
