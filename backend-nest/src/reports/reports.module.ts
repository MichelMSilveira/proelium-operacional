import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { RoutinesModule } from '../routines/routines.module';

@Module({ imports: [RoutinesModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
