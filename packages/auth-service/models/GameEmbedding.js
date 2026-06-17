// packages/auth-service/models/GameEmbedding.js
// Stores embeddings for semantic search

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const gameEmbeddingSchema = new Schema(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
      unique: true,
      index: true,
    },
    gameTitle: {
      type: String,
      required: true,
    },
    // Content that was embedded (for reference/debugging)
    content: {
      type: String,
      required: true,
    },
    // Vector embedding (768 dimensions for Gemini embedding-001)
    embedding: {
      type: [Number],
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'game_embeddings',
  }
);

export default model('GameEmbedding', gameEmbeddingSchema);
