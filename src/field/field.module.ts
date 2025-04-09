import { Module } from '@nestjs/common';
import { FieldService } from './field.service';

@Module({
  providers: [FieldService]
})
export class FieldModule {}
