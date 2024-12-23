import { IsString, IsUUID } from 'class-validator';
import { FieldsType } from 'src/utils/fields';

export class CreatePlayerDto {
  @IsUUID()
  gameId: string;
  @IsUUID()
  userId: string;
  @IsString()
  color: string;
}
