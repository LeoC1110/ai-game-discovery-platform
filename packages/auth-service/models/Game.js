import mongoose from 'mongoose';

const { Schema } = mongoose;

const SOURCE_TYPES = ['LocalMeta', 'ExternalLink', 'Embeddable'];

const GameSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    genre: { type: String, trim: true },
    platform: { type: String, trim: true },
    releaseYear: { type: Number, min: 0 },
    developer: { type: String, trim: true },
    rating: { type: Number, min: 0 },
    description: { type: String, trim: true },
    sourceType: {
      type: String,
      enum: SOURCE_TYPES,
      default: 'LocalMeta',
      index: true,
    },
    externalUrl: { type: String, trim: true },
    embedUrl: { type: String, trim: true },
    coverImage: { type: String, trim: true },
    tags: {
      type: [String],
      set: (tags) =>
        (tags || [])
          .map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
          .filter((tag) => Boolean(tag)),
      default: [],
    },
  },
  { timestamps: true },
);

GameSchema.index({ user: 1, title: 1 });
GameSchema.index({ tags: 1 });

export default mongoose.model('Game', GameSchema);
