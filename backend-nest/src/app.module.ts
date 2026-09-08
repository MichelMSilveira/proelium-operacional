import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompanyModule } from './company/company.module';
import { DataModule } from './data/data.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, UsersModule, CompanyModule, DataModule],
})
export class AppModule {}
