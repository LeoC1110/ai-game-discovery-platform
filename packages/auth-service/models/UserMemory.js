// packages/auth-service/models/UserMemory.js
// Stores per-user AI pipeline context between sessions.
//
// Fields:
//   conversationSummary — rolling plain-text summary, regenerated every 5 turns.
//                         Injected at the top of the conversation context so
//                         Gemini retains long-range context without reading the
//                         full history every time.
//   trackedTopics       — genre / keyword terms extracted from recent messages.
//                         Surfaced to future pipeline steps for topic-aware fetching.
//   totalTurnCount      — lifetime counter across all sessions (not reset on clear).
//
// Relationship to UserPreference:
//   UserPreference stores explicit user preferences (liked/avoided genres, tone).
//   UserMemory stores ephemeral pipeline state (summaries, topics, turn count).
//   They are intentionally separate models with different update patterns.
import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserMemorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    // Rolling summary regenerated every 5 turns (see conversationManager.buildSimpleSummary)
    conversationSummary: { type: String, default: '' },

    // Genre / keyword terms recently mentioned in the conversation
    trackedTopics: { type: [String], default: [] },

    // Lifetime user turn counter (survives history clears)
    totalTurnCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model('UserMemory', UserMemorySchema);
