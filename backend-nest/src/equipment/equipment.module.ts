import { Module } from '@nestjs/common';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';

@Module({ controllers: [EquipmentController], providers: [EquipmentService] })
export class EquipmentModule {}
