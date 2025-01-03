import { IsArray, IsInt, IsNumber, Min, IsUUID } from 'class-validator';

export class OfferTradeDto {
  @IsArray()
  @IsInt({ each: true })
  offerFieldsIndexes: number[];

  @IsArray()
  @IsInt({ each: true })
  wantedFieldsIndexes: number[];

  @IsNumber()
  @Min(0)
  offeredMoney: number;

  @IsNumber()
  @Min(0)
  wantedMoney: number;

  @IsUUID()
  toUserId: string;
}
