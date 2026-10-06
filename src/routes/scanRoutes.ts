import { Router } from 'express';

import { confirmLabel, getScan, previewLabel, scanBarcode, scanHistory, scanLabel } from '../controllers/scanController';
import { authenticate } from '../middleware/authenticate';
import { barcodeScanSchema, idParamsSchema, labelConfirmSchema, labelScanSchema } from '../middleware/schemas';
import { normalizeOptionalImage, requireImage, requireImages, uploadLabel, uploadLabelImages } from '../middleware/upload';
import { validate } from '../middleware/validate';

export const scanRoutes = Router();

scanRoutes.use(authenticate);
scanRoutes.post('/barcode', validate({ body: barcodeScanSchema }), scanBarcode);
scanRoutes.post('/label', uploadLabel, requireImage, validate({ body: labelScanSchema }), scanLabel);
scanRoutes.post('/label/preview', uploadLabelImages, requireImages, previewLabel);
scanRoutes.post('/label/confirm', uploadLabel, normalizeOptionalImage, validate({ body: labelConfirmSchema }), confirmLabel);
scanRoutes.get('/history', scanHistory);
scanRoutes.get('/:id', validate({ params: idParamsSchema }), getScan);
