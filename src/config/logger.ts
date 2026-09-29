import pino from 'pino';

import { env } from './env';

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      '*.password',
      'healthContext',
      '*.healthContext',
      'biomarkers',
      '*.biomarkers',
      'req.body.healthContext',
      'req.body.biomarkers',
    ],
    remove: true,
  },
  base: { service: 'foodlens-api' },
});
