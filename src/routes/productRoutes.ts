import { Router } from 'express';

import { getProduct } from '../controllers/productController';
import { authenticate } from '../middleware/authenticate';
import { barcodeParamsSchema } from '../middleware/schemas';
import { validate } from '../middleware/validate';

export const productRoutes = Router();

productRoutes.get('/:barcode', authenticate, validate({ params: barcodeParamsSchema }), getProduct);
