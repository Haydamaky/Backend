import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class NewMessagePayloadDto {
  @IsString()
  @IsNotEmpty()
  text: string;
  @IsUUID()
  chatId: string;
}

export class NewGameMessageDto {
  @IsString()
  @IsNotEmpty()
  text: string;
  @IsUUID()
  chatId: string;
  @IsUUID()
  gameId: string;
}

export class ChatDataDto {
  @IsUUID()
  chatId: string;
}
