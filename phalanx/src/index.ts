import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  process.env.MCP_TRANSPORT_TYPE = 'http';
  process.env.PORT = '3000'; // Default port for the MCP backend HTTP server
  const app = await McpApplicationFactory.create(AppModule);
  await app.start();
}

bootstrap();
