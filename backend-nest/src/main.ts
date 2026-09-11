import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '6mb' });
  app.setGlobalPrefix('api');
  await app.listen(Number(process.env.PORT || 4174));
}

void bootstrap();
