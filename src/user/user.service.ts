import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { CreateUserDto } from './dtos/create-user.dto';
import * as argon2 from 'argon2';
import { UpdateUserDto } from './dtos/update-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findAll() {
    return this.userRepository.findMany();
  }

  findOne(id: string) {
    return this.userRepository.findById(id);
  }

  async update(id: string, body: UpdateUserDto) {
    const updateBody = { ...body };

    if (body.password) {
      delete updateBody['password'];
      updateBody['hash'] = await this.hash(body.password);
    }

    return this.userRepository.update({
      where: { id },
      data: { ...updateBody },
    });
  }

  async create(body: CreateUserDto) {
    const hash = await this.hash(body.password);

    body.password = undefined;
    return this.userRepository.create({ data: { ...body, hash } });
  }

  remove(id: string) {
    return this.userRepository.delete({ where: { id } });
  }

  hash(data: string) {
    return argon2.hash(data);
  }
}
