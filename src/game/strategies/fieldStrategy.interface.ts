export interface FieldStrategy {
  matches(): boolean;
  execute(): void;
}
