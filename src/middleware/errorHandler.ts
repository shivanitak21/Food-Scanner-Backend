import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import mongoose from 'mongoose';

import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ message: 'That route was not found.', code: 'NOT_FOUND' });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;

  if (error instanceof Error && error.message === 'Origin is not allowed.') {
    res.status(403).json({ message: 'Origin is not allowed.', code: 'CORS', requestId });
    return;
  }

  if (error instanceof ZodError) {
    const errors: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = issue.path[issue.path.length - 1];
      const key = typeof field === 'string' ? field : 'request';
      if (!errors[key]) errors[key] = issue.message;
    }
    res.status(400).json({
      message: Object.values(errors)[0] ?? 'Check the highlighted fields and try again.',
      code: 'VALIDATION_ERROR',
      errors,
      requestId,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 8 MB or smaller.' : 'The image could not be uploaded.';
    res.status(400).json({ message, code: 'VALIDATION_ERROR', errors: { image: message }, requestId });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: 'That id is not valid.', code: 'VALIDATION_ERROR', requestId });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      errors: error.errors,
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId }, 'unhandled error');
  res.status(500).json({
    message: 'FoodLens had trouble completing that request. Please try again.',
    code: 'INTERNAL',
    requestId,
  });
}
