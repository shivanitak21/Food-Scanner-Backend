import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  HOST: z.string().min(1).default('0.0.0.0'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BODY_LIMIT: z.string().min(1).default('1mb'),
  OPEN_FOOD_FACTS_BASE_URL: z.string().url().default('https://world.openfoodfacts.org'),
  OPEN_FOOD_FACTS_USER_AGENT: z.string().min(1).default('FoodLens/1.0 (contact@example.com)'),
  PRODUCT_CACHE_TTL_HOURS: z.coerce.number().positive().default(168),
  AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_API_KEY: z.string().default(''),
  AI_VISION_MODEL: z.string().min(1).default('gpt-4o-mini'),
  AI_EXPLANATION_MODEL: z.string().min(1).default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration. ${details}`);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.CORS_ORIGINS.trim() === '*') {
  throw new Error('CORS_ORIGINS cannot be * in production.');
}

const origins = parsed.data.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  host: parsed.data.HOST,
  trustProxy: parsed.data.TRUST_PROXY,
  mongodbUri: parsed.data.MONGODB_URI,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  bcryptRounds: parsed.data.BCRYPT_ROUNDS,
  corsOrigins: origins,
  allowAnyOrigin: origins.includes('*'),
  logLevel: parsed.data.LOG_LEVEL,
  bodyLimit: parsed.data.BODY_LIMIT,
  openFoodFactsBaseUrl: parsed.data.OPEN_FOOD_FACTS_BASE_URL.replace(/\/$/, ''),
  openFoodFactsUserAgent: parsed.data.OPEN_FOOD_FACTS_USER_AGENT,
  productCacheTtlMs: parsed.data.PRODUCT_CACHE_TTL_HOURS * 60 * 60 * 1000,
  aiBaseUrl: parsed.data.AI_BASE_URL.replace(/\/$/, ''),
  aiApiKey: parsed.data.AI_API_KEY.trim(),
  aiVisionModel: parsed.data.AI_VISION_MODEL,
  aiExplanationModel: parsed.data.AI_EXPLANATION_MODEL,
  aiTimeoutMs: parsed.data.AI_TIMEOUT_MS,
  rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: parsed.data.RATE_LIMIT_MAX,
  authRateLimitMax: parsed.data.AUTH_RATE_LIMIT_MAX,
};

export type AppEnv = typeof env;
