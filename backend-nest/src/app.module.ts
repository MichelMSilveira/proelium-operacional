import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompanyModule } from './company/company.module';
import { DataModule } from './data/data.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ClientsModule } from './clients/clients.module';
import { ProductsModule } from './products/products.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, UsersModule, CompanyModule, DataModule, OpportunitiesModule, ClientsModule, ProductsModule],
})
export class AppModule {}
