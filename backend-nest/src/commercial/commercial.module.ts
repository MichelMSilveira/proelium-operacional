import { Module } from '@nestjs/common';
import { CommercialController } from './commercial.controller';

@Module({ controllers: [CommercialController] })
export class CommercialModule {}
