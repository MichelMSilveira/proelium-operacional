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
import { InstallationsModule } from './installations/installations.module';
import { QualityModule } from './quality/quality.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { FinanceModule } from './finance/finance.module';
import { PurchasesModule } from './purchases/purchases.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { SurveyModule } from './survey/survey.module';
import { EquipmentModule } from './equipment/equipment.module';
import { RoutinesModule } from './routines/routines.module';
import { ProductLibraryModule } from './product-library/product-library.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { ExecutionModule } from './execution/execution.module';
import { DiagramModule } from './diagram/diagram.module';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { CommercialModule } from './commercial/commercial.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PresenceModule } from './presence/presence.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, AccountModule, AdminModule, CommercialModule, RealtimeModule, PresenceModule, UsersModule, CompanyModule, DataModule, OpportunitiesModule, ClientsModule, ProductsModule, QuotesModule, ProjectsModule, TasksModule, AgendaModule, OperationsModule, SupportTicketsModule, ReportsModule, InstallationsModule, QualityModule, CollaboratorsModule, FinanceModule, ExecutionModule, DiagramModule, PurchasesModule, KnowledgeModule, SurveyModule, EquipmentModule, RoutinesModule, ProductLibraryModule],
})
export class AppModule {}
