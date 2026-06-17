// packages/auth-service/services/vectorEmbedService.js
// Vector embedding and semantic search service for RAG
// Uses Google Gemini embeddings + MongoDB storage

import { GoogleGenerativeAI } from '@google/generative-ai';
import GameEmbedding from '../models/GameEmbedding.js';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const isProduction = process.env.NODE_ENV === 'production';

function logDebug(label, data) {
  if (!isProduction) {
    console.log(`[vectorEmbed] ${label}:`, data);
  }
}

/**
 * Generate embedding vector for text using Gemini
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding response');
    }

    return embedding;
  } catch (err) {
    console.error('[vectorEmbed] Embedding generation failed:', err?.message);
    throw err;
  }
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Store embedding for a game
 * @param {string} gameId - MongoDB game ID
 * @param {string} gameTitle - Game title
 * @param {string} content - Text content to embed (title + genre + tags, etc.)
 * @returns {Promise<object>} Stored embedding record
 */
export async function storeGameEmbedding(gameId, gameTitle, content) {
  try {
    const embedding = await generateEmbedding(content);

    const record = await GameEmbedding.findOneAndUpdate(
      { gameId },
      {
        gameId,
        gameTitle,
        content,
        embedding,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logDebug('storeGameEmbedding', {
      gameId,
      gameTitle,
      embeddingDim: embedding.length,
    });

    return record;
  } catch (err) {
    console.error('[vectorEmbed] Store embedding failed:', err?.message);
    throw err;
  }
}

/**
 * Semantic search: find similar games based on query
 * @param {string} query - User query text
 * @param {number} topK - Number of results to return (default: 10)
 * @returns {Promise<Array>} Top K similar games with scores
 */
export async function semanticSearchGames(query, topK = 10) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Fetch all stored embeddings from MongoDB
    const allRecords = await GameEmbedding.find({}).lean();

    if (allRecords.length === 0) {
      logDebug('semanticSearchGames', {
        query,
        result: 'no embeddings found',
      });
      return [];
    }

    // Compute similarity with all records
    const scored = allRecords
      .map((record) => {
        const similarity = cosineSimilarity(
          queryEmbedding,
          record.embedding || []
        );
        return {
          gameId: record.gameId,
          gameTitle: record.gameTitle,
          similarity,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    logDebug('semanticSearchGames', {
      query: query.substring(0, 50),
      totalRecords: allRecords.length,
      resultsReturned: scored.length,
      topSimilarity: scored[0]?.similarity,
    });

    return scored;
  } catch (err) {
    console.error('[vectorEmbed] Semantic search failed:', err?.message);
    throw err;
  }
}

/**
 * Hybrid search: combine keyword matching + semantic search
 * @param {string} query - User query
 * @param {Array<string>} keywords - Optional keyword filters
 * @param {number} topK - Number of results
 * @returns {Promise<Array>} Ranked results
 */
export async function hybridSearchGames(query, keywords = [], topK = 10) {
  try {
    // Get semantic results
    const semanticResults = await semanticSearchGames(query, topK * 2);

    if (keywords.length === 0) {
      return semanticResults.slice(0, topK);
    }

    // Bonus score for keyword matches
    const keywordRegex = new RegExp(keywords.join('|'), 'i');
    const boosted = semanticResults.map((result) => {
      const hasKeyword =
        keywordRegex.test(result.gameTitle) ||
        keywordRegex.test(result.gameId);
      return {
        ...result,
        similarity: hasKeyword ? result.similarity * 1.2 : result.similarity,
      };
    });

    return boosted.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  } catch (err) {
    console.error('[vectorEmbed] Hybrid search failed:', err?.message);
    throw err;
  }
}

/**
 * Check if embeddings are initialized
 * @returns {Promise<number>} Count of stored embeddings
 */
export async function getEmbeddingCount() {
  try {
    const count = await GameEmbedding.countDocuments();
    return count;
  } catch (err) {
    console.error('[vectorEmbed] Count query failed:', err?.message);
    return 0;
  }
}
