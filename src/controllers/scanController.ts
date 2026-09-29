import type { Request, Response } from 'express';

import { normalizeCountryCode } from '../rules/countries';
import { scanService } from '../services/scanService';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, UnauthorizedError } from '../utils/errors';

function userId(req: Request): string {
  if (!req.userId) throw new UnauthorizedError('Your session has ended. Sign in again.');
  return req.userId;
}

function countryOrUndefined(country?: string): string | undefined {
  if (!country) return undefined;
  const code = normalizeCountryCode(country);
  if (!code) {
    throw new AppError('Use a country name or ISO code such as IN, US, GB, or CA.', 400, 'VALIDATION_ERROR', {
      country: 'Use a country name or ISO code such as IN, US, GB, or CA.',
    });
  }
  return code;
}

export const scanBarcode = asyncHandler(async (req: Request, res: Response) => {
  const analysis = await scanService.barcode(userId(req), {
    barcode: req.body.barcode,
    country: countryOrUndefined(req.body.country),
  });
  res.status(201).json(analysis);
});

export const previewLabel = asyncHandler(async (req: Request, res: Response) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const draft = await scanService.previewLabel(files.map((file) => ({ buffer: file.buffer, mimeType: file.mimetype })));
  res.json(draft);
});

export const confirmLabel = asyncHandler(async (req: Request, res: Response) => {
  const analysis = await scanService.confirmLabel(userId(req), {
    productName: req.body.productName,
    brand: req.body.brand,
    ingredientsText: req.body.ingredientsText,
    contains: req.body.contains ?? [],
    mayContain: req.body.mayContain ?? [],
    nutrition: req.body.nutrition ?? [],
    country: countryOrUndefined(req.body.country),
  });
  res.status(201).json(analysis);
});

export const scanLabel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Add a label image.', 400, 'VALIDATION_ERROR', { image: 'Add a label image.' });
  }
  const analysis = await scanService.label(userId(req), {
    country: countryOrUndefined(req.body.country),
    image: req.file.buffer,
    mimeType: req.file.mimetype,
  });
  res.status(201).json(analysis);
});

export const scanHistory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await scanService.history(userId(req)));
});

export const getScan = asyncHandler(async (req: Request, res: Response) => {
  res.json(await scanService.get(userId(req), req.params.id));
});
