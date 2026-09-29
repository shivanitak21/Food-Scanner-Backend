import type { Request, Response } from 'express';

import { authService } from '../services/authService';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const session = await authService.register(req.body);
  res.status(201).json(session);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const session = await authService.login(req.body);
  res.json(session);
});

export const currentUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.userId) throw new UnauthorizedError('Your session has ended. Sign in again.');
  const user = await authService.currentUser(req.userId);
  res.json(user);
});
