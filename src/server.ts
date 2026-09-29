import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';

async function main(): Promise<void> {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(env.port, env.host, () => {
    logger.info({ port: env.port, host: env.host }, 'FoodLens API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'startup failed');
  process.exit(1);
});
