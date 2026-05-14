// packages/auth-service/models/ConversationHistory.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true },
    messages: [messageSchema],
  },
  { timestamps: true },
);

// One document per user — upsert on first message
const ConversationHistory = mongoose.model('ConversationHistory', conversationHistorySchema);
export default ConversationHistory;
