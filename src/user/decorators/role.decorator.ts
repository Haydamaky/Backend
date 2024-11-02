import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { RoleGuard } from 'src/auth/guard';

export const RestrictToRole = (role: $Enums.ROLE) => {
  return applyDecorators(SetMetadata('ROLE', role), UseGuards(RoleGuard));
};
