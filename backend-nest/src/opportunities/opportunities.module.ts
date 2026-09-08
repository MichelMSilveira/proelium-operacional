import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';

@Module({ controllers: [OpportunitiesController] })
export class OpportunitiesModule {}
