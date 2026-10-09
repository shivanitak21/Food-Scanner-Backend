import { Router } from 'express';

import {
  confirmLabel,
  getScan,
  previewLabel,
  quickBarcode,
  quickConfirmLabel,
  quickRefine,
  scanBarcode,
  scanHistory,
  scanLabel,
} from '../controllers/scanController';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate';
import { barcodeScanSchema, idParamsSchema, labelConfirmSchema, labelScanSchema, quickBarcodeSchema, quickRefineSchema } from '../middleware/schemas';
import { normalizeOptionalImage, requireImage, requireImages, uploadLabel, uploadLabelImages } from '../middleware/upload';
import { validate } from '../middleware/validate';

export const scanRoutes = Router();

scanRoutes.post('/label/preview', optionalAuthenticate, uploadLabelImages, requireImages, previewLabel);
scanRoutes.post('/quick/barcode', optionalAuthenticate, validate({ body: quickBarcodeSchema }), quickBarcode);
scanRoutes.post('/quick/label/confirm', optionalAuthenticate, uploadLabel, normalizeOptionalImage, validate({ body: labelConfirmSchema }), quickConfirmLabel);
scanRoutes.post('/quick/refine', optionalAuthenticate, validate({ body: quickRefineSchema }), quickRefine);

scanRoutes.use(authenticate);
scanRoutes.post('/barcode', validate({ body: barcodeScanSchema }), scanBarcode);
scanRoutes.post('/label', uploadLabel, requireImage, validate({ body: labelScanSchema }), scanLabel);
scanRoutes.post('/label/confirm', uploadLabel, normalizeOptionalImage, validate({ body: labelConfirmSchema }), confirmLabel);
scanRoutes.get('/history', scanHistory);
scanRoutes.get('/:id', validate({ params: idParamsSchema }), getScan);
