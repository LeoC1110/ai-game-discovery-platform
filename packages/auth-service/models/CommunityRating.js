import mongoose from 'mongoose';

const { Schema } = mongoose;

const CommunityRatingSchema = new Schema(
  {
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', index: true },
    postId: { type: Schema.Types.ObjectId, ref: 'GamePost', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, required: true, min: 1, max: 10 },
  },
  { timestamps: true },
);

CommunityRatingSchema.index(
  { gameId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { gameId: { $type: 'objectId' } },
  },
);
CommunityRatingSchema.index(
  { postId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { gameId: { $exists: false } },
  },
);
CommunityRatingSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('CommunityRating', CommunityRatingSchema);