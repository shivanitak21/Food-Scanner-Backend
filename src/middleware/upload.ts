import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { AppError } from '../utils/errors';

const storage = multer.memoryStorage();

export const uploadLabelImages = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, callback) => {
    const mime = file.mimetype.toLowerCase();
    if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
      callback(new AppError('Use a JPEG, PNG, or WebP image.', 400, 'VALIDATION_ERROR'));
      return;
    }
    callback(null, true);
  },
}).array('images', 3);

export function requireImages(req: Request, _res: Response, next: NextFunction): void {
  const files = req.files;
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) {
    next(new AppError('Add at least one label photo.', 400, 'VALIDATION_ERROR'));
    return;
  }
  for (const file of list) {
    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      next(new AppError('Use a JPEG, PNG, or WebP image.', 400, 'VALIDATION_ERROR'));
      return;
    }
    file.mimetype = sniffed;
  }
  next();
}

export const uploadLabel = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const mime = file.mimetype.toLowerCase();
    if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
      callback(new AppError('Use a JPEG, PNG, or WebP image.', 400, 'VALIDATION_ERROR', { image: 'Use a JPEG, PNG, or WebP image.' }));
      return;
    }
    callback(null, true);
  },
}).single('image');

export function normalizeOptionalImage(req: Request, _res: Response, next: NextFunction): void {
  if (!req.file?.buffer?.length) {
    next();
    return;
  }
  const sniffed = sniffImage(req.file.buffer);
  if (!sniffed) {
    next(new AppError('Use a JPEG, PNG, or WebP image.', 400, 'VALIDATION_ERROR', { image: 'Use a JPEG, PNG, or WebP image.' }));
    return;
  }
  req.file.mimetype = sniffed;
  next();
}

export function requireImage(req: Request, _res: Response, next: NextFunction): void {
  if (!req.file?.buffer?.length) {
    next(new AppError('Add a label image.', 400, 'VALIDATION_ERROR', { image: 'Add a label image.' }));
    return;
  }
  const sniffed = sniffImage(req.file.buffer);
  if (!sniffed) {
    next(new AppError('Use a JPEG, PNG, or WebP image.', 400, 'VALIDATION_ERROR', { image: 'Use a JPEG, PNG, or WebP image.' }));
    return;
  }
  req.file.mimetype = sniffed;
  next();
}

function sniffImage(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
