import mongoose from 'mongoose';

const { Schema } = mongoose;

const CommentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

const GamePostSchema = new Schema(
  {
    postType: { type: String, enum: ['GAME', 'IDEA'], default: 'GAME', index: true },
    title: { type: String, required: true, trim: true },
    genre: { type: String, trim: true },
    platform: { type: String, trim: true },
    developer: { type: String, trim: true },
    releaseYear: { type: Number },
    gameType: { type: String, trim: true },
    rating: { type: Number, min: 1, max: 10 },
    coverImageUrl: { type: String, trim: true },
    gameLink: { type: String, trim: true },
    tags: {
      type: [String],
      set: (tags) =>
        (tags || [])
          .map((t) => (typeof t === 'string' ? t.trim() : t))
          .filter(Boolean),
      default: [],
    },
    review: { type: String, trim: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    bookmarkedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    comments: [CommentSchema],
    featured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

GamePostSchema.index({ title: 'text', review: 'text', tags: 'text' });

export default mongoose.model('GamePost', GamePostSchema);
