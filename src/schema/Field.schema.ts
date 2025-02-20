import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Color, FieldGroup, LinePosition } from './field.enum';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Field {
  @Prop({ required: true, index: true })
  gameId: string;

  @Prop({ required: true, index: true })
  positionForGrid: number;

  @Prop({ required: true, index: true })
  index: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  price?: number;

  @Prop()
  pledgePrice?: number;

  @Prop()
  redemptionPrice?: number;

  @Prop()
  branchPrice?: number;

  @Prop()
  sellBranchPrice?: number;

  @Prop({ default: 0 })
  amountOfBranches?: number;

  @Prop({ type: String, enum: FieldGroup, index: true })
  group?: FieldGroup;

  @Prop({ required: true })
  specialField: boolean;

  @Prop()
  secret?: boolean;

  @Prop()
  large?: boolean;

  @Prop({ type: String, enum: LinePosition, required: true })
  line: LinePosition;

  @Prop({ default: null, index: true })
  ownedBy?: string;

  @Prop({ type: String, enum: Color })
  color?: Color;

  @Prop({
    type: [Number],
    validate: {
      validator: function (array: number[]) {
        return array.length <= 6;
      },
      message: 'Income array cannot have more than 6 values',
    },
  })
  income?: number[];

  @Prop({ default: false })
  isPledged?: boolean;

  @Prop({ default: null })
  turnsToUnpledge?: number;

  @Prop()
  toPay?: number;

  @Prop({ required: true })
  imageUrl: string;
}
export type FieldDocument = Field & Document;
export const FieldSchema = SchemaFactory.createForClass(Field);
