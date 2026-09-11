import { Module } from '@nestjs/common';
import { AdminCompaniesController } from './admin-companies.controller';

@Module({ controllers: [AdminCompaniesController] })
export class AdminModule {}
