import mongoose from 'mongoose';

const scanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    scanType: { type: String, enum: ['barcode', 'label'], required: true },
    status: { type: String, enum: ['suitable', 'review', 'avoid'], required: true },
    analysis: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

scanSchema.index({ userId: 1, createdAt: -1 });
scanSchema.index({ userId: 1, profileId: 1, createdAt: -1 });

export const Scan = mongoose.model('Scan', scanSchema);
