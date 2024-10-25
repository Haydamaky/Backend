import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findAll() {
    return this.userRepository.findMany();
  }

  findOne(email: string) {
    return this.userRepository.findUnique({ where: { email } });
  }

  update(id: string, updateUserDto) {
    return this.userRepository.update({
      where: { userId: id },
      data: updateUserDto,
    });
  }

  remove(id: string) {
    return this.userRepository.delete({ where: { userId: id } });
  }
}
