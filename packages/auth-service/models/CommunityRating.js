import mongoose from 'mongoose';

const { Schema } = mongoose;

const CommunityRatingSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'GamePost', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, required: true, min: 1, max: 10 },
  },
  { timestamps: true },
);

CommunityRatingSchema.index({ postId: 1, userId: 1 }, { unique: true });
CommunityRatingSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('CommunityRating', CommunityRatingSchema);