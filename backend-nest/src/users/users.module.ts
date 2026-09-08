import { Module } from '@nestjs/common';
import { CompanyUsersController, UsersController } from './users.controller';

@Module({ controllers: [UsersController, CompanyUsersController] })
export class UsersModule {}
