import { z } from 'zod';

const textList = z.array(z.string().trim().min(1).max(80)).max(40);

function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

const optionalCountry = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(60).optional(),
);

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  email: z.string().trim().email('Enter a valid email').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use 72 characters or fewer'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email').transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter a password').max(72),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  role: z.enum(['self', 'adult', 'child', 'baby', 'other']),
  ageGroup: z.enum(['baby', 'child', 'teen', 'adult', 'older_adult']).nullable(),
  age: z.number().int().min(0).max(120).nullable(),
  diet: z.enum(['none', 'vegetarian', 'vegan']),
  dietaryPreferences: textList,
  allergies: textList,
  limits: textList,
  notes: z.string().trim().max(280).nullable(),
  goals: z.array(z.string().trim().min(1).max(60)).max(3).optional().default([]),
  lifeStage: z
    .enum(['me', 'adult', 'child', 'teen', 'baby', 'pregnancy', 'breastfeeding', 'senior', 'other'])
    .nullable()
    .optional()
    .default(null),
  isPrimary: z.boolean(),
});

export const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const barcodeParamsSchema = z.object({
  barcode: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((value) => /^[0-9A-Za-z]{4,32}$/.test(value), 'Enter a valid barcode'),
});

export const barcodeScanSchema = z.object({
  barcode: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((value) => /^[0-9A-Za-z]{4,32}$/.test(value), 'Enter a valid barcode'),
  profileId: z.string().trim().min(1).optional(),
  country: optionalCountry,
});

export const labelScanSchema = z.object({
  profileId: z.string().trim().min(1).optional(),
  country: optionalCountry,
});

const interpretation = z.enum(['elevated', 'low', 'normal', 'borderline']).nullable();

export const healthContextSchema = z.object({
  enabled: z.boolean(),
  paused: z.boolean(),
  biomarkers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        value: z.number().nullable(),
        unit: z.string().trim().max(24).nullable(),
        interpretation,
        date: z.string().trim().max(40).nullable(),
        confirmedByUser: z.literal(true),
      }),
    )
    .max(12),
  dietaryRecommendations: z
    .array(
      z.object({
        recommendation: z.string().trim().min(1).max(180),
        source: z.string().trim().max(80).nullable(),
        confirmedByUser: z.literal(true),
      }),
    )
    .max(8),
});

export const labelConfirmSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).optional().default(''),
  ingredientsText: z.string().trim().max(20000).optional().default(''),
  variant: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  claims: z.preprocess(parsedJson, z.array(z.string().trim().min(1).max(80)).max(12).optional().default([])),
  contains: z.preprocess(parsedJson, z.array(z.string().trim().min(1).max(80)).max(40).optional().default([])),
  mayContain: z.preprocess(parsedJson, z.array(z.string().trim().min(1).max(80)).max(40).optional().default([])),
  nutrition: z.preprocess(
    parsedJson,
    z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        amount: z.string().trim().min(1).max(24),
        unit: z.string().trim().max(16).optional(),
        basis: z.enum(['per_100g', 'per_serving', 'unknown']).optional(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  ),
  barcode: z.string().trim().max(40).optional().default(''),
  country: optionalCountry,
});
