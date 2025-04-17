import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { Field, FieldDocument } from 'src/schema/Field.schema';
import { FieldType } from 'src/utils/fields';

@Injectable()
export class FieldService {
  constructor(private fieldModel: Model<Field>) {}
  async getGameFields(gameId: string) {
    return await this.fieldModel.find({ gameId });
  }

  async createMany(gameFields: FieldType[]) {
    await this.fieldModel.insertMany(gameFields);
  }

  async updateFields<T extends FieldDocument>(
    fields: T[],
    propertiesToUpdate: string[]
  ): Promise<void> {
    const updates = fields.map((field) => {
      const updateFields: any = {};

      for (const property of propertiesToUpdate) {
        if (field[property] !== undefined) {
          updateFields[property] = field[property];
        }
      }

      return {
        updateOne: {
          filter: { _id: field._id },
          update: { $set: updateFields },
        },
      };
    });
    await this.fieldModel.bulkWrite(updates);
  }

  findPlayerFieldByIndex(fields: FieldDocument[], indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }
}
