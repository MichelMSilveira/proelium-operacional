import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';

@Module({ controllers: [PresenceController] })
export class PresenceModule {}
