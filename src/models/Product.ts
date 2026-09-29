import mongoose from 'mongoose';

const evidenceShape = {
  allergenId: { type: String, required: true },
  label: { type: String, required: true },
  presence: { type: String, enum: ['detected', 'may_contain'], required: true },
  source: { type: String, required: true },
};

const productSchema = new mongoose.Schema(
  {
    barcode: { type: String, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    brand: { type: String, trim: true, maxlength: 120 },
    countryCodes: { type: [String], default: [] },
    ingredientsText: { type: String, default: '', maxlength: 20000 },
    declarations: { type: [evidenceShape], default: [] },
    nutrition: { type: mongoose.Schema.Types.Mixed, default: null },
    nutritionItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    imageUrl: { type: String },
    organicClaim: { type: Boolean, default: null },
    source: { type: String, enum: ['open_food_facts', 'label_ocr'], required: true },
    sourceUpdatedAt: { type: Date },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

productSchema.index({ barcode: 1 }, { unique: true, sparse: true });
productSchema.index({ source: 1, fetchedAt: -1 });

export const Product = mongoose.model('Product', productSchema);
