import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  authenticate(req, res, next);
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Your session has ended. Sign in again.'));
    return;
  }

  try {
    const payload = jwt.verify(header.slice('Bearer '.length).trim(), env.jwtSecret);
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || !payload.sub) {
      next(new UnauthorizedError('Your session has ended. Sign in again.'));
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    next(new UnauthorizedError('Your session has ended. Sign in again.'));
  }
}
