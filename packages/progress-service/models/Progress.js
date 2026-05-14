import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const progressSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    gameId: { type: String, required: true },
    gameTitle: { type: String },
    experience: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    score: { type: Number, default: 0, min: 0 },
    achievements: { type: [String], default: [] },
    lastPlayedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'progress_records',
  }
);

progressSchema.index({ userId: 1, gameId: 1 }, { unique: true });
progressSchema.index({ gameId: 1, score: -1 });

export default model('Progress', progressSchema);
