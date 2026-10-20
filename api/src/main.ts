import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { webUrl } from './web-url.js';

async function bootstrap() {
  // rawBody: the Stripe webhook signature is checked against the unparsed request bytes.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // Deployed behind proxies (Vercel's /api forwarding, Render's load balancer): read the visitor's address from
  // X-Forwarded-For so per-visitor rate limits apply per visitor, not to the proxy.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', true);
  // credentials: true lets the browser send the session cookie from the web app's origin.
  app.enableCors({
    origin: webUrl(),
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
