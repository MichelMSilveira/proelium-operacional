import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompanyModule } from './company/company.module';
import { DataModule } from './data/data.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ClientsModule } from './clients/clients.module';
import { ProductsModule } from './products/products.module';
import { QuotesModule } from './quotes/quotes.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { AgendaModule } from './agenda/agenda.module';
import { OperationsModule } from './operations/operations.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, UsersModule, CompanyModule, DataModule, OpportunitiesModule, ClientsModule, ProductsModule, QuotesModule, ProjectsModule, TasksModule, AgendaModule, OperationsModule, ReportsModule],
})
export class AppModule {}
