import { Module } from '@nestjs/common';
import { FieldService } from './field.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Field, FieldSchema } from 'src/schema/Field.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Field.name,
        schema: FieldSchema,
      },
    ]),
  ],
  providers: [FieldService],
  exports: [
    FieldService,
    MongooseModule.forFeature([{ name: Field.name, schema: FieldSchema }]),
  ],
})
export class FieldModule {}
