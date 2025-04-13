import { Injectable } from '@nestjs/common';
import { FieldDocument } from 'src/schema/Field.schema';

@Injectable()
export class FieldService {
  constructor() {}
  isOwnedByCurrentUser(field: FieldDocument, userId: string): boolean {
    return field.ownedBy === userId;
  }
}
