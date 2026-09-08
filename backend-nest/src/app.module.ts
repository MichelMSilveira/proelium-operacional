import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, UsersModule],
})
export class AppModule {}
