import type { Request, Response } from 'express';

import { aiService } from '../services/analysisService';
import { profileService } from '../services/profileService';
import { scanService } from '../services/scanService';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';

function userId(req: Request): string {
  if (!req.userId) throw new UnauthorizedError('Your session has ended. Sign in again.');
  return req.userId;
}

export const listProfiles = asyncHandler(async (req: Request, res: Response) => {
  res.json(await profileService.list(userId(req)));
});

export const createProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await profileService.create(userId(req), req.body);
  await scanService.refreshMember(userId(req), profile.id);
  res.status(201).json(profile);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await profileService.update(userId(req), req.params.id, req.body);
  await scanService.refreshMember(userId(req), profile.id);
  res.json(profile);
});

export const deleteProfile = asyncHandler(async (req: Request, res: Response) => {
  await profileService.remove(userId(req), req.params.id);
  res.status(204).send();
});

export const extractHealthContext = asyncHandler(async (req: Request, res: Response) => {
  await profileService.require(userId(req), req.params.id);
  if (!req.file) {
    res.status(400).json({ message: 'Add a photo of the report page.', code: 'VALIDATION_ERROR' });
    return;
  }
  const draft = await aiService.extractHealthContext(req.file.buffer, req.file.mimetype);
  res.json({ ...draft, confirmedByUser: false });
});

export const saveHealthContext = asyncHandler(async (req: Request, res: Response) => {
  const saved = await profileService.saveHealthContext(userId(req), req.params.id, {
    ...req.body,
    reportCount: 0,
  });
  await scanService.refreshMember(userId(req), saved.id);
  res.json(saved);
});

export const clearHealthContext = asyncHandler(async (req: Request, res: Response) => {
  const cleared = await profileService.clearHealthContext(userId(req), req.params.id);
  await scanService.refreshMember(userId(req), cleared.id);
  res.json(cleared);
});
