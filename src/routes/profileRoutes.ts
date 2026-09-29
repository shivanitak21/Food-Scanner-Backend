import { Router } from 'express';

import { clearHealthContext, createProfile, deleteProfile, extractHealthContext, listProfiles, saveHealthContext, updateProfile } from '../controllers/profileController';
import { authenticate } from '../middleware/authenticate';
import { healthContextSchema, idParamsSchema, profileSchema } from '../middleware/schemas';
import { requireImage, uploadLabel } from '../middleware/upload';
import { validate } from '../middleware/validate';

export const profileRoutes = Router();

profileRoutes.use(authenticate);
profileRoutes.get('/', listProfiles);
profileRoutes.post('/', validate({ body: profileSchema }), createProfile);
profileRoutes.put('/:id', validate({ params: idParamsSchema, body: profileSchema }), updateProfile);
profileRoutes.post('/:id/health/extract', uploadLabel, requireImage, validate({ params: idParamsSchema }), extractHealthContext);
profileRoutes.put('/:id/health', validate({ params: idParamsSchema, body: healthContextSchema }), saveHealthContext);
profileRoutes.delete('/:id/health', validate({ params: idParamsSchema }), clearHealthContext);
profileRoutes.delete('/:id', validate({ params: idParamsSchema }), deleteProfile);
