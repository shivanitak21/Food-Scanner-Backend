import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../config/env';
import { login, register } from '../controllers/authController';
import { loginSchema, registerSchema } from '../middleware/schemas';
import { validate } from '../middleware/validate';

export const authRoutes = Router();

const authLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Try again later.', code: 'RATE_LIMIT' },
});

authRoutes.post('/register', authLimiter, validate({ body: registerSchema }), register);
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), login);
