import type { Request, Response } from 'express';

import { prepareIngredients } from '../services/ingredientService';
import { productService } from '../services/productService';
import { asyncHandler } from '../utils/asyncHandler';

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.findByIdOrBarcode(req.params.barcode);
  const prepared = prepareIngredients(product.ingredientsText, { source: product.source });
  const seenTraces = new Set(prepared.declarations.map((item) => item.label.toLowerCase()));
  const traces = [
    ...prepared.declarations,
    ...product.declarations.filter((item) => item.presence === 'may_contain' && !seenTraces.has(item.label.toLowerCase())),
  ];
  res.json({
    id: product.barcode || product.id,
    name: product.name,
    brand: product.brand,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    ingredientsText: product.ingredientsText || undefined,
    ingredients: [
      ...prepared.ingredients.map((ingredient, index) => ({
        id: `ingredient-${index}`,
        name: ingredient.name,
        flagged: false,
      })),
      ...traces.map((item, index) => ({
        id: `trace-${index}`,
        name: `May contain ${item.label}`,
        flagged: false,
        details: item.source,
      })),
    ],
    nutrition: product.nutritionItems,
    countryCodes: product.countryCodes,
    source: product.source,
    sourceUpdatedAt: product.sourceUpdatedAt,
  });
});
