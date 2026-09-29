import { Router } from 'express';

import { currentUser } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

export const userRoutes = Router();

userRoutes.get('/me', authenticate, currentUser);
