// packages/auth-service/models/UserPreference.js
// Stores the AI memory profile for each user.
//
// Memory layers:
//   explicit  — things the user directly stated ("I like RPG")
//   behavioral — inferred from likes / bookmarks (computed on-the-fly, not stored here)
//   long-term  — persisted genre/platform preferences and avoidances

import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    // Long-term preferences (editable via GraphQL or auto-updated from explicit statements)
    likedGenres:        { type: [String], default: [] },   // e.g. ['RPG', 'strategy', 'co-op']
    avoidedGenres:      { type: [String], default: [] },   // e.g. ['horror', 'pay-to-win']
    preferredPlatforms: { type: [String], default: [] },   // e.g. ['PC', 'Switch']
    recommendationTone: { type: String,   default: 'balanced' }, // 'short' | 'detailed' | 'balanced'

    // Explicit notes — raw statements from user ("I like story-rich games")
    explicitNotes: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model('UserPreference', UserPreferenceSchema);
