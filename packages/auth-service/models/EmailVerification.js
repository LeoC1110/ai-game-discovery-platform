import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const emailVerificationSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'email_verifications',
  },
);

emailVerificationSchema.index({ email: 1, purpose: 1, createdAt: -1 });

export default model('EmailVerification', emailVerificationSchema);
