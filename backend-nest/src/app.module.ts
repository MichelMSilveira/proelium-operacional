import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule],
})
export class AppModule {}
