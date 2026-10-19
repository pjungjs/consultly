import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: the Stripe webhook signature is checked against the unparsed request bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // credentials: true lets the browser send the session cookie from the web app's origin.
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
