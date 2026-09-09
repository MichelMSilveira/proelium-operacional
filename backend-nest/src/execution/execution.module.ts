import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { FinanceModule } from '../finance/finance.module';

@Module({ imports: [FinanceModule], controllers: [ExecutionController], providers: [ExecutionService] })
export class ExecutionModule {}
