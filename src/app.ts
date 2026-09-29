import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { authRoutes } from './routes/authRoutes';
import { productRoutes } from './routes/productRoutes';
import { profileRoutes } from './routes/profileRoutes';
import { scanRoutes } from './routes/scanRoutes';
import { userRoutes } from './routes/userRoutes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy ? 1 : false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: req.requestId }),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.allowAnyOrigin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed.'));
      },
    }),
  );
  app.use(express.json({ limit: env.bodyLimit }));
  app.use(mongoSanitize());
  app.use(hpp());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'foodlens-api' });
  });

  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });

  const apiLimiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Try again later.', code: 'RATE_LIMIT' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/profiles', profileRoutes);
  app.use('/api/scans', scanRoutes);
  app.use('/api/products', productRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
