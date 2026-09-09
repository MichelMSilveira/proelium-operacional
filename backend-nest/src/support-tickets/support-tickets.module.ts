import { Module } from '@nestjs/common';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';

@Module({ controllers: [SupportTicketsController], providers: [SupportTicketsService] })
export class SupportTicketsModule {}
