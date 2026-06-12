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
    game: { type: Schema.Types.ObjectId, ref: 'Game', index: true },
    title: { type: String, required: true, trim: true },
    titleNormalized: { type: String, trim: true, lowercase: true },
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

GamePostSchema.pre('validate', function syncNormalizedTitle(next) {
  this.titleNormalized = typeof this.title === 'string'
    ? this.title.trim().toLowerCase()
    : '';
  next();
});

GamePostSchema.index({ title: 'text', review: 'text', tags: 'text' });
GamePostSchema.index({ title: 1 });
GamePostSchema.index({ titleNormalized: 1 });
GamePostSchema.index({ createdAt: -1 });
GamePostSchema.index({ postType: 1, createdAt: -1 });
GamePostSchema.index({ game: 1, createdAt: -1 });
GamePostSchema.index({ postedBy: 1, createdAt: -1 });
GamePostSchema.index({ featured: 1, createdAt: -1 });
GamePostSchema.index({ genre: 1, platform: 1, createdAt: -1 });

export default mongoose.model('GamePost', GamePostSchema);
