import {
  IsEmail,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsStrongPassword({ minLength: 6, minNumbers: 1 })
  password: string;

  @IsString()
  @MinLength(4)
  @MaxLength(16)
  nickname: string;
}
