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

  createMany(gameFields: FieldType[]) {
    return this.fieldModel.insertMany(gameFields);
  }

  updateFields<T extends FieldDocument>(
    fields: T[],
    propertiesToUpdate: string[]
  ) {
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
    return this.fieldModel.bulkWrite(updates);
  }

  findPlayerFieldByIndex(fields: FieldDocument[], indexOfField: number) {
    return fields.find((field) => field.index === indexOfField);
  }

  async updateById(id: unknown, field: Partial<FieldDocument>) {
    return await this.fieldModel.updateOne({ _id: id }, { $set: field });
  }
}
