import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { $Enums } from '@prisma/client';
import { RestrictToRole } from './decorators';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('')
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @RestrictToRole($Enums.ROLE.ADMIN, $Enums.ROLE.USER)
  @Post('')
  create(@Body() body: CreateUserDto) {
    return this.userService.create(body);
  }

  @RestrictToRole($Enums.ROLE.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.userService.update(id, body);
  }

  @RestrictToRole($Enums.ROLE.ADMIN)
  @HttpCode(204)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
