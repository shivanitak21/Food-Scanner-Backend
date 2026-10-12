import mongoose, { type InferSchemaType } from 'mongoose';

const profileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    role: { type: String, enum: ['self', 'adult', 'child', 'baby', 'other'], required: true },
    ageGroup: { type: String, default: null },
    age: { type: Number, min: 0, max: 120, default: null },
    dateOfBirth: { type: String, default: null, maxlength: 10 },
    sex: { type: String, enum: ['female', 'male', null], default: null },
    diet: { type: String, enum: ['none', 'vegetarian', 'vegan'], required: true, default: 'none' },
    dietaryPreferences: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    limits: { type: [String], default: [] },
    notes: { type: String, default: null, maxlength: 280 },
    goals: { type: [String], default: [] },
    lifeStage: {
      type: String,
      enum: ['me', 'adult', 'child', 'teen', 'baby', 'pregnancy', 'breastfeeding', 'senior', 'other'],
    },
    isPrimary: { type: Boolean, required: true, default: false },
    healthContext: {
      enabled: { type: Boolean, default: false },
      paused: { type: Boolean, default: false },
      biomarkers: {
        type: [
          {
            name: { type: String, required: true, maxlength: 80 },
            value: { type: Number, default: null },
            unit: { type: String, default: null, maxlength: 24 },
            interpretation: { type: String, enum: ['elevated', 'low', 'normal', 'borderline', null], default: null },
            date: { type: String, default: null, maxlength: 40 },
            confirmedByUser: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
      dietaryRecommendations: {
        type: [
          {
            recommendation: { type: String, required: true, maxlength: 180 },
            source: { type: String, default: null, maxlength: 80 },
            confirmedByUser: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
      reports: {
        type: [
          {
            id: { type: String, required: true },
            type: { type: String, default: 'lab' },
            uploadedAt: { type: Date, default: Date.now },
            status: { type: String, default: 'confirmed' },
          },
        ],
        default: [],
      },
    },
  },
  { timestamps: true },
);

profileSchema.index({ userId: 1, createdAt: -1 });
profileSchema.index({ userId: 1, isPrimary: 1 });

export type ProfileDocument = InferSchemaType<typeof profileSchema> & { _id: mongoose.Types.ObjectId };

export const Profile = mongoose.model('Profile', profileSchema);
