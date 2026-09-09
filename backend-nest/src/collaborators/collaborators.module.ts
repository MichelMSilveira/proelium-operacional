import { Module } from '@nestjs/common';
import { CollaboratorsController } from './collaborators.controller';
import { CollaboratorsService } from './collaborators.service';

@Module({ controllers: [CollaboratorsController], providers: [CollaboratorsService] })
export class CollaboratorsModule {}
