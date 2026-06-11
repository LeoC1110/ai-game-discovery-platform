import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { GraphQLError } from 'graphql';
import User from '../models/User.js';
import EmailVerification from '../models/EmailVerification.js';
import Game from '../models/Game.js';
import GamePost from '../models/GamePost.js';
import CommunityRating from '../models/CommunityRating.js';
import Player from '../models/Player.js';
import Tournament from '../models/Tournament.js';
import TournamentResult from '../models/TournamentResult.js';
import { askAIAgent, clearAIHistory, getAIHistory, geminiHealthTest } from '../services/aiAgentService.js';
import {
  attachCommunityRatingData,
  attachCommunityRatingDataToPost,
  calculateTrendScore,
  getCommunityRatingSnapshot,
  getWeightedCommunityRating,
} from '../services/communityRatingService.js';
import { loadStoredPreferences, upsertUserPreferences, clearUserPreferences } from '../services/userMemoryService.js';
import { sendResetPasswordCodeEmail } from '../services/emailService.js';
import { checkRateLimit, getClientIp } from '../middleware/rateLimit.js';
import {
  signAuthToken,
  setAuthCookie,
  clearAuthCookie,
} from '@shared/jwt';

const safeUser = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id?.toString() || obj.id,
    username: obj.username,
    email: obj.email,
    role: obj.role,
    createdAt: obj.createdAt ? obj.createdAt.toISOString?.() || String(obj.createdAt) : null,
    updatedAt: obj.updatedAt ? obj.updatedAt.toISOString?.() || String(obj.updatedAt) : null,
  };
};

const normalizeName = (name = '') => name.trim();

const authSuccess = (user, res, message) => {
  const token = signAuthToken(user);
  setAuthCookie(res, token);
  return { ok: true, message, token, user: safeUser(user) };
};

const requireUser = (user) => {
  if (!user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return user;
};

const GAME_SOURCE_TYPES = new Set(['LocalMeta', 'ExternalLink', 'Embeddable']);
const TOURNAMENT_STATUSES = new Set(['Upcoming', 'Ongoing', 'Completed']);
const TOURNAMENT_LAUNCH_TYPES = new Set(['Local', 'ExternalLink', 'Embeddable']);
const POST_TYPES = new Set(['GAME', 'IDEA']);
const IDEA_TEXT_REGEX = /^[\p{L}\p{N}\p{P}\p{S}\p{Z}\r\n\t]+$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_PASSWORD_PURPOSE = 'RESET_PASSWORD';
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_COOLDOWN_MS = 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 50;
const AI_MESSAGE_MAX_LENGTH = 1000;

const LIMITS = {
  register: { limit: 5, windowMs: 10 * 60 * 1000 },
  login: { limit: 10, windowMs: 10 * 60 * 1000 },
  sendPasswordResetCode: { limit: 5, windowMs: 10 * 60 * 1000 },
  resetPasswordWithCode: { limit: 10, windowMs: 10 * 60 * 1000 },
  askAI: { limit: 20, windowMs: 60 * 1000 },
};

const requireAdmin = (user) => {
  if (user?.role !== 'Admin') {
    throw new GraphQLError('Admin privileges required', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const isValidEmail = (email = '') => EMAIL_REGEX.test(email);

const requireRateLimit = ({ req, bucket, key, limit, windowMs, message }) => {
  const ip = getClientIp(req);
  const composedKey = key ? `${ip}:${key}` : ip;
  const result = checkRateLimit({ bucket, key: composedKey, limit, windowMs });
  if (!result.allowed) {
    throw new GraphQLError(message || 'Too many requests. Please try again later.', {
      extensions: {
        code: 'RATE_LIMITED',
        retryAfterMs: result.retryAfterMs,
      },
    });
  }
};

const toObjectIdString = (value) => (value?._id || value)?.toString?.() || String(value);

const buildPagination = ({ limit = DEFAULT_PAGE_LIMIT, offset = 0 } = {}) => {
  const safeLimit = Number(limit);
  const safeOffset = Number(offset);
  return {
    cap: Number.isFinite(safeLimit)
      ? Math.min(Math.max(1, Math.floor(safeLimit)), MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT,
    skip: Number.isFinite(safeOffset) ? Math.max(0, Math.floor(safeOffset)) : 0,
  };
};

const buildPostFilter = ({ search, genre, platform, tag, postType } = {}) => {
  const filter = {};
  if (POST_TYPES.has(postType)) filter.postType = postType;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { review: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }
  if (genre) filter.genre = { $regex: genre, $options: 'i' };
  if (platform) filter.platform = { $regex: platform, $options: 'i' };
  if (tag) filter.tags = tag;
  return filter;
};

const buildPostSort = (sort = 'newest') => {
  if (sort === 'rating') return { communityRatingSort: -1, ratingCountSort: -1, rating: -1, createdAt: -1 };
  if (sort === 'likes') return { likesCountSort: -1, createdAt: -1 };
  if (sort === 'comments') return { commentsCountSort: -1, createdAt: -1 };
  if (sort === 'engagement') {
    return { engagementScoreSort: -1, communityRatingSort: -1, ratingCountSort: -1, createdAt: -1 };
  }
  return { createdAt: -1 };
};

// Only pull the User fields that the GraphQL schema exposes; passwordHash etc. are never sent.
const USER_SELECT = '_id username email role createdAt updatedAt';

const populatePostQuery = (query) =>
  query
    .populate({ path: 'postedBy', select: USER_SELECT })
    .populate({ path: 'comments.author', select: USER_SELECT })
    .populate('likedBy', '_id')
    .populate('bookmarkedBy', '_id');

const buildAggregateCommunitySortStages = () => ([
  {
    $lookup: {
      from: CommunityRating.collection.name,
      localField: '_id',
      foreignField: 'postId',
      as: 'communityRatings',
    },
  },
  {
    $addFields: {
      likesCountSort: { $size: { $ifNull: ['$likedBy', []] } },
      commentsCountSort: { $size: { $ifNull: ['$comments', []] } },
      bookmarksCountSort: { $size: { $ifNull: ['$bookmarkedBy', []] } },
      ratingCountSort: { $size: { $ifNull: ['$communityRatings', []] } },
      communityRatingAverage: { $avg: '$communityRatings.score' },
    },
  },
  {
    $addFields: {
      communityRatingSort: {
        $ifNull: ['$communityRatingAverage', 0],
      },
      weightedCommunityRatingSort: {
        $cond: [
          { $gt: ['$ratingCountSort', 0] },
          {
            $multiply: [
              { $ifNull: ['$communityRatingAverage', 0] },
              {
                $divide: [
                  '$ratingCountSort',
                  { $add: ['$ratingCountSort', 4] },
                ],
              },
            ],
          },
          0,
        ],
      },
    },
  },
  {
    $addFields: {
      engagementScoreSort: {
        $add: [
          { $multiply: ['$weightedCommunityRatingSort', 2] },
          '$likesCountSort',
          { $multiply: ['$commentsCountSort', 2] },
          { $multiply: ['$bookmarksCountSort', 2] },
          { $multiply: ['$ratingCountSort', 1.5] },
        ],
      },
    },
  },
]);

const fetchPostsPage = async ({ filter, sort, skip, cap, currentUserId }) => {
  if (sort === 'rating' || sort === 'likes' || sort === 'comments' || sort === 'engagement') {
    const ids = await GamePost.aggregate([
      { $match: filter },
      ...buildAggregateCommunitySortStages(),
      { $sort: buildPostSort(sort) },
      { $skip: skip },
      { $limit: cap },
      { $project: { _id: 1 } },
    ]);

    if (!ids.length) return [];
    const orderedIds = ids.map((entry) => toObjectIdString(entry._id));
    const posts = await populatePostQuery(GamePost.find({ _id: { $in: orderedIds } }));
    const ratedPosts = await attachCommunityRatingData(posts, currentUserId);
    const map = new Map(ratedPosts.map((post) => [toObjectIdString(post._id), post]));
    return orderedIds.map((id) => map.get(id)).filter(Boolean);
  }

  const query = GamePost.find(filter).sort(buildPostSort(sort)).skip(skip).limit(cap);
  const posts = await populatePostQuery(query);
  return attachCommunityRatingData(posts, currentUserId);
};

const ensurePlayerForUser = async (userId) => {
  if (!userId) return null;
  return Player.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true },
  );
};

const getPlayerForUser = async (userId) => {
  if (!userId) return null;
  const player = await ensurePlayerForUser(userId);
  return player;
};

const populateTournament = (doc) =>
  doc.populate([
    { path: 'players', populate: { path: 'user', select: USER_SELECT } },
    { path: 'gameRef' },
  ]);

const populateResult = (doc) =>
  doc.populate([
    {
      path: 'tournament',
      populate: [
        { path: 'players', populate: { path: 'user', select: USER_SELECT } },
        { path: 'gameRef' },
      ],
    },
    { path: 'user', select: USER_SELECT },
    { path: 'game' },
    { path: 'submittedBy', select: USER_SELECT },
  ]);

const sanitizeGameInput = (input = {}) => {
  const payload = {
    title: (input.title || '').trim(),
    genre: input.genre?.trim() || undefined,
    platform: input.platform?.trim() || undefined,
    developer: input.developer?.trim() || undefined,
    description: input.description?.trim() || undefined,
    coverImage: input.coverImage?.trim() || undefined,
  };
  if (!payload.title) {
    throw new GraphQLError('Game title is required', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const sourceType = input.sourceType && GAME_SOURCE_TYPES.has(input.sourceType)
    ? input.sourceType
    : 'LocalMeta';
  const externalUrl = input.externalUrl?.trim() || undefined;
  const embedUrl = input.embedUrl?.trim() || undefined;

  if (sourceType === 'ExternalLink' && !externalUrl) {
    throw new GraphQLError('External link is required for ExternalLink games', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  if (sourceType === 'Embeddable' && !embedUrl) {
    throw new GraphQLError('Embed URL is required for Embeddable games', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  if (input.releaseYear !== undefined && input.releaseYear !== null) {
    const releaseYear = Number(input.releaseYear);
    if (Number.isNaN(releaseYear)) {
      throw new GraphQLError('Release year must be a number', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    payload.releaseYear = releaseYear;
  }

  if (input.rating !== undefined && input.rating !== null) {
    const rating = Number(input.rating);
    if (Number.isNaN(rating)) {
      throw new GraphQLError('Rating must be a number', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    payload.rating = rating;
  }

  let tags = input.tags;
  if (typeof tags === 'string') {
    tags = tags.split(',');
  }
  if (Array.isArray(tags)) {
    payload.tags = tags
      .map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
      .filter((tag) => Boolean(tag));
  }

  payload.sourceType = sourceType;
  payload.externalUrl = externalUrl;
  payload.embedUrl = embedUrl;

  return payload;
};

const sanitizeTournamentInput = async (input = {}) => {
  const name = (input.name || '').trim();
  const gameName = (input.game || '').trim();
  if (!name || !gameName) {
    throw new GraphQLError('Tournament name and game are required', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const rawStatus = (input.status || 'Upcoming').trim() || 'Upcoming';
  const status = TOURNAMENT_STATUSES.has(rawStatus) ? rawStatus : 'Upcoming';

  const launchType = input.launchType && TOURNAMENT_LAUNCH_TYPES.has(input.launchType)
    ? input.launchType
    : 'Local';
  const launchUrl = input.launchUrl?.trim() || undefined;
  const embedUrl = input.embedUrl?.trim() || undefined;

  if (launchType === 'ExternalLink' && !launchUrl) {
    throw new GraphQLError('Launch URL is required for external tournaments', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (launchType === 'Embeddable' && !embedUrl) {
    throw new GraphQLError('Embed URL is required for embeddable tournaments', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const dateValue = input.date ? new Date(input.date) : null;
  if (dateValue && Number.isNaN(dateValue.getTime())) {
    throw new GraphQLError('Invalid tournament date', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  let gameRef;
  if (input.gameId) {
    const gameDocument = await Game.findById(input.gameId);
    if (!gameDocument) {
      throw new GraphQLError('Linked game not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    gameRef = gameDocument._id;
  }

  return {
    name,
    game: gameName,
    status,
    date: dateValue,
    launchType,
    launchUrl,
    embedUrl,
    rules: input.rules?.trim() || undefined,
    scoreRules: input.scoreRules?.trim() || undefined,
    prizePool: input.prizePool?.trim() || undefined,
    gameRef,
  };
};

const sanitizeResultInput = async (input = {}, currentUser) => {
  const tournamentId = (input.tournamentId || '').trim();
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    throw new GraphQLError('Tournament not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  let targetUserId = input.userId ? input.userId.toString() : currentUser._id.toString();
  if (targetUserId !== currentUser._id.toString() && currentUser.role !== 'Admin') {
    throw new GraphQLError('You can only submit results for yourself', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw new GraphQLError('Target user not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const score = Number(input.score);
  if (Number.isNaN(score)) {
    throw new GraphQLError('Score must be a number', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  let position;
  if (input.position !== undefined && input.position !== null) {
    position = Number(input.position);
    if (Number.isNaN(position)) {
      throw new GraphQLError('Position must be a number', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
  }

  let gameRef = null;
  if (input.gameId) {
    const gameDocument = await Game.findById(input.gameId);
    if (!gameDocument) {
      throw new GraphQLError('Linked game not found for result', {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    gameRef = gameDocument._id;
  } else if (tournament.gameRef) {
    gameRef = tournament.gameRef;
  }

  return {
    tournament,
    user: targetUser,
    update: {
      tournament: tournament._id,
      user: targetUser._id,
      game: gameRef || undefined,
      score,
      position,
      notes: input.notes?.trim() || undefined,
      submittedBy: currentUser._id,
      submittedAt: new Date(),
    },
  };
};

export const resolvers = {
  Query: {
    _health: () => 'ok',
    me: async (_parent, _args, { user }) => (user ? safeUser(user) : null),
    myPreferences: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      const pref = await loadStoredPreferences(current._id);
      if (!pref) return null;
      return {
        id: pref._id?.toString(),
        likedGenres: pref.likedGenres ?? [],
        avoidedGenres: pref.avoidedGenres ?? [],
        preferredPlatforms: pref.preferredPlatforms ?? [],
        recommendationTone: pref.recommendationTone ?? 'balanced',
        explicitNotes: pref.explicitNotes ?? [],
        updatedAt: pref.updatedAt ? pref.updatedAt.toISOString?.() ?? String(pref.updatedAt) : null,
      };
    },
    myAIHistory: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      const history = await getAIHistory(current._id);
      return history.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt ? m.createdAt.toISOString?.() ?? String(m.createdAt) : null,
      }));
    },
    myGames: async (_parent, { limit, offset } = {}, { user }) => {
      const current = requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const games = await Game.find({ user: current._id }).sort({ createdAt: -1 }).skip(skip).limit(cap);
      return games;
    },
    getAllGames: async (_parent, {
      search,
      sourceType,
      platform,
      tag,
      limit,
      offset,
    } = {}, { user }) => {
      requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const filter = {};
      if (sourceType && GAME_SOURCE_TYPES.has(sourceType)) filter.sourceType = sourceType;
      if (platform) filter.platform = { $regex: platform, $options: 'i' };
      if (tag) filter.tags = tag;
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { genre: { $regex: search, $options: 'i' } },
          { developer: { $regex: search, $options: 'i' } },
        ];
      }

      const games = await Game.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(cap)
        .populate({ path: 'user', select: USER_SELECT });
      return games;
    },
    players: async (_parent, { limit, offset } = {}, { user }) => {
      const current = requireUser(user);
      await ensurePlayerForUser(current._id);
      const { cap, skip } = buildPagination({ limit, offset });
      const list = await Player.find()
        .populate({ path: 'user', select: USER_SELECT })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cap);
      return list;
    },
    tournaments: async (_parent, { limit, offset } = {}, { user }) => {
      requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const list = await Tournament.find()
        .sort({ date: 1, createdAt: -1 })
        .skip(skip)
        .limit(cap)
        .populate([
          { path: 'players', populate: { path: 'user' } },
          { path: 'gameRef' },
        ]);
      return list;
    },
    myRecentTournaments: async (_parent, { limit = 5 }, { user }) => {
      const current = requireUser(user);
      const player = await getPlayerForUser(current._id);
      if (!player) return [];
      const list = await Tournament.find({ players: player._id })
        .sort({ date: -1, updatedAt: -1 })
        .limit(Math.min(limit, 20))
        .populate([
          { path: 'players', populate: { path: 'user' } },
          { path: 'gameRef' },
        ]);
      return list;
    },
    tournamentLeaderboard: async (_parent, { tournamentId, limit, offset } = {}, { user }) => {
      requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const results = await TournamentResult.find({ tournament: tournamentId })
        .sort({ position: 1, score: -1, updatedAt: 1 })
        .skip(skip)
        .limit(cap)
        .populate([
          {
            path: 'tournament',
            populate: [{ path: 'gameRef' }],
          },
          { path: 'user', select: USER_SELECT },
          { path: 'game' },
          { path: 'submittedBy', select: USER_SELECT },
        ]);
      return results;
    },
    gameLeaderboard: async (_parent, { gameId, limit, offset } = {}, { user }) => {
      requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const results = await TournamentResult.find({ game: gameId })
        .sort({ position: 1, score: -1, updatedAt: 1 })
        .skip(skip)
        .limit(cap)
        .populate([
          {
            path: 'tournament',
            populate: [{ path: 'gameRef' }],
          },
          { path: 'user', select: USER_SELECT },
          { path: 'game' },
          { path: 'submittedBy', select: USER_SELECT },
        ]);
      return results;
    },
    allPosts: async (_parent, {
      search,
      genre,
      platform,
      tag,
      sort,
      postType,
      limit,
      offset,
    } = {}, { user }) => {
      requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const filter = buildPostFilter({ search, genre, platform, tag, postType });
      const posts = await fetchPostsPage({ filter, sort, skip, cap, currentUserId: user._id });
      return posts;
    },
    pagedPosts: async (_parent, {
      search,
      genre,
      platform,
      tag,
      sort,
      postType,
      limit,
      offset,
    } = {}, { user }) => {
      requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const filter = buildPostFilter({ search, genre, platform, tag, postType });
      const totalCount = await GamePost.countDocuments(filter);
      const posts = await fetchPostsPage({ filter, sort, skip, cap, currentUserId: user._id });
      return { posts, totalCount };
    },
    myPosts: async (_parent, { limit, offset } = {}, { user }) => {
      const current = requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const posts = await GamePost.find({ postedBy: current._id })
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cap);
      return attachCommunityRatingData(posts, current._id);
    },
    bookmarkedPosts: async (_parent, { limit, offset } = {}, { user }) => {
      const current = requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const posts = await GamePost.find({ bookmarkedBy: current._id })
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cap);
      return attachCommunityRatingData(posts, current._id);
    },
    pagedBookmarks: async (_parent, { limit, offset } = {}, { user }) => {
      const current = requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const filter = { bookmarkedBy: current._id };
      const totalCount = await GamePost.countDocuments(filter);
      const posts = await GamePost.find(filter)
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cap);
      return { posts: await attachCommunityRatingData(posts, current._id), totalCount };
    },
    getPost: async (_parent, { id }, { user }) => {
      requireUser(user);
      const post = await GamePost.findById(id)
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id');
      return attachCommunityRatingDataToPost(post, user._id);
    },

    // ── User search & public profiles ────────────────────────────────────────
    searchUsers: async (_parent, { query }, { user }) => {
      requireUser(user);
      const q = (query || '').trim();
      if (!q) return [];

      const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
      let users;
      if (OBJECT_ID_REGEX.test(q)) {
        const found = await User.findById(q);
        users = found ? [found] : [];
      } else {
        users = await User.find({ username: { $regex: q, $options: 'i' } }).limit(20);
      }

      // Batch: 2 queries total regardless of how many users matched, replacing the previous N*2 pattern.
      const userIds = users.map((u) => u._id);
      const [allUserPosts, bookmarkAgg] = await Promise.all([
        GamePost.find({ postedBy: { $in: userIds } }).select('postedBy likedBy comments').lean(),
        GamePost.aggregate([
          { $match: { bookmarkedBy: { $in: userIds } } },
          { $unwind: '$bookmarkedBy' },
          { $match: { bookmarkedBy: { $in: userIds } } },
          { $group: { _id: '$bookmarkedBy', count: { $sum: 1 } } },
        ]),
      ]);

      const postsByUserId = {};
      for (const post of allUserPosts) {
        const uid = String(post.postedBy);
        if (!postsByUserId[uid]) postsByUserId[uid] = [];
        postsByUserId[uid].push(post);
      }
      const bookmarkCountByUserId = {};
      for (const entry of bookmarkAgg) {
        bookmarkCountByUserId[String(entry._id)] = entry.count;
      }

      return users.map((u) => {
        const uid = String(u._id);
        const userPosts = postsByUserId[uid] || [];
        const postCount = userPosts.length;
        const likesReceived = userPosts.reduce((acc, p) => acc + (p.likedBy?.length || 0), 0);
        const commentCount = userPosts.reduce((acc, p) => acc + (p.comments?.length || 0), 0);
        const bookmarkCount = bookmarkCountByUserId[uid] || 0;
        return {
          id: uid,
          username: u.username,
          postCount,
          bookmarkCount,
          likesReceived,
          commentCount,
          posts: null,
          bookmarkedPosts: null,
        };
      });
    },

    publicUserProfile: async (_parent, { id }, { user }) => {
      requireUser(user);
      const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
      if (!OBJECT_ID_REGEX.test(id)) {
        throw new GraphQLError('Invalid user ID', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      const u = await User.findById(id);
      if (!u) return null;

      const populateOpts = [
        { path: 'postedBy' },
        { path: 'comments.author' },
        { path: 'likedBy', select: '_id' },
        { path: 'bookmarkedBy', select: '_id' },
      ];

      const [userPosts, bookmarkedByUser] = await Promise.all([
        GamePost.find({ postedBy: id }).populate(populateOpts).sort({ createdAt: -1 }),
        GamePost.find({ bookmarkedBy: id }).populate(populateOpts).sort({ createdAt: -1 }),
      ]);

      const [ratedUserPosts, ratedBookmarks] = await Promise.all([
        attachCommunityRatingData(userPosts, user._id),
        attachCommunityRatingData(bookmarkedByUser, user._id),
      ]);

      const postCount = ratedUserPosts.length;
      const bookmarkCount = ratedBookmarks.length;
      const likesReceived = ratedUserPosts.reduce((acc, p) => acc + (p.likedBy?.length || 0), 0);
      const commentCount = ratedUserPosts.reduce((acc, p) => acc + (p.comments?.length || 0), 0);

      return {
        id: u._id.toString(),
        username: u.username,
        postCount,
        bookmarkCount,
        likesReceived,
        commentCount,
        posts: ratedUserPosts,
        bookmarkedPosts: ratedBookmarks,
      };
    },
    myRecentResults: async (_parent, { limit, offset } = {}, { user }) => {
      const current = requireUser(user);
      const { cap, skip } = buildPagination({ limit, offset });
      const results = await TournamentResult.find({ user: current._id })
        .sort({ submittedAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(cap)
        .populate([
          {
            path: 'tournament',
            populate: [{ path: 'gameRef' }],
          },
          { path: 'user', select: USER_SELECT },
          { path: 'game' },
          { path: 'submittedBy', select: USER_SELECT },
        ]);
      return results;
    },
  },
  Game: {
    owner: async (game) => {
      if (!game?.user) return null;
      if (game.user.username) {
        return safeUser(game.user);
      }
      const record = await User.findById(game.user);
      return safeUser(record);
    },
  },
  Mutation: {
    register: async (_parent, { input }, { res, req } = {}) => {
      const { username, email, password, role } = input;
      const usernameNorm = normalizeName(username);
      const emailNorm = normalizeEmail(email);

      requireRateLimit({
        req,
        bucket: 'mutation-register',
        key: emailNorm || usernameNorm || 'anonymous',
        ...LIMITS.register,
        message: 'Too many registration attempts. Please wait and try again.',
      });

      if (!usernameNorm || !emailNorm || !password) {
        return { ok: false, message: 'Missing required fields', token: null, user: null };
      }

      const existing = await User.findOne({
        $or: [{ username: usernameNorm }, { email: emailNorm }],
      });
      if (existing) {
        return { ok: false, message: 'Username or email already registered', token: null, user: null };
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        username: usernameNorm,
        email: emailNorm,
        passwordHash,
        role: 'Player',
      });

      await ensurePlayerForUser(user._id);

      return authSuccess(user, res, 'Registration successful');
    },
    login: async (_parent, { identifier, password }, { res, req } = {}) => {
      const lookup = (identifier || '').trim();
      const lookupEmail = normalizeEmail(lookup);

      requireRateLimit({
        req,
        bucket: 'mutation-login',
        key: lookupEmail || lookup || 'anonymous',
        ...LIMITS.login,
        message: 'Too many login attempts. Please wait and try again.',
      });

      if (!lookup || !password) {
        return { ok: false, message: 'Invalid credentials', token: null, user: null };
      }

      const user = await User.findOne({
        $or: [{ username: lookup }, { email: lookup }, { email: lookupEmail }],
      });
      if (!user) {
        return { ok: false, message: 'Invalid credentials', token: null, user: null };
      }

      const passOk = await bcrypt.compare(password, user.passwordHash);
      if (!passOk) {
        return { ok: false, message: 'Invalid credentials', token: null, user: null };
      }

      await ensurePlayerForUser(user._id);

      return authSuccess(user, res, 'Login successful');
    },
    logout: async (_parent, _args, { res }) => {
      clearAuthCookie(res);
      return true;
    },
    askAI: async (_parent, { message }, { user, req } = {}) => {
      const current = requireUser(user);
      const trimmed = (message || '').trim();

      requireRateLimit({
        req,
        bucket: 'mutation-ask-ai',
        key: current._id?.toString() || 'anonymous',
        ...LIMITS.askAI,
        message: 'Too many AI requests. Please wait and try again.',
      });

      if (!trimmed) {
        throw new GraphQLError('Message cannot be empty', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      if (trimmed.length > AI_MESSAGE_MAX_LENGTH) {
        throw new GraphQLError(`Message is too long (max ${AI_MESSAGE_MAX_LENGTH} characters).`, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      try {
        return await askAIAgent({
          userId: current._id,
          username: current.username,
          message: trimmed,
        });
      } catch (err) {
        if (err instanceof GraphQLError) {
          throw err;
        }
        if (err?.code === 'BAD_USER_INPUT') {
          throw new GraphQLError(err.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        // Log the real error on the server before sending a safe message to the client
        console.error('[Resolver] askAI error — name:', err?.name, '| message:', err?.message);
        const msg = err?.message ?? 'AI Agent is unavailable. Please try again later.';
        throw new GraphQLError(msg, { extensions: { code: 'AI_AGENT_ERROR' } });
      }
    },
    clearAIHistory: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      return clearAIHistory(current._id);
    },
    updatePreference: async (_parent, { input }, { user }) => {
      const current = requireUser(user);
      const pref = await upsertUserPreferences(current._id, input);
      return {
        id: pref._id?.toString(),
        likedGenres: pref.likedGenres ?? [],
        avoidedGenres: pref.avoidedGenres ?? [],
        preferredPlatforms: pref.preferredPlatforms ?? [],
        recommendationTone: pref.recommendationTone ?? 'balanced',
        explicitNotes: pref.explicitNotes ?? [],
        updatedAt: pref.updatedAt ? pref.updatedAt.toISOString?.() ?? String(pref.updatedAt) : null,
      };
    },
    clearPreferences: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      return clearUserPreferences(current._id);
    },
    changePassword: async (_parent, { identifier, oldPassword, newPassword }, { res }) => {
      const lookup = (identifier || '').trim();
      const lookupEmail = normalizeEmail(lookup);
      if (!lookup || !oldPassword || !newPassword) {
        return { ok: false, message: 'All fields are required.', token: null, user: null };
      }
      if (newPassword.length < 6) {
        return { ok: false, message: 'New password must be at least 6 characters.', token: null, user: null };
      }
      const user = await User.findOne({
        $or: [{ username: lookup }, { email: lookup }, { email: lookupEmail }],
      });
      if (!user) {
        return { ok: false, message: 'Invalid username/email or password.', token: null, user: null };
      }
      const passOk = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!passOk) {
        return { ok: false, message: 'Invalid username/email or password.', token: null, user: null };
      }
      if (oldPassword === newPassword) {
        return { ok: false, message: 'New password must be different from old password.', token: null, user: null };
      }
      user.passwordHash = await bcrypt.hash(newPassword, 12);
      await user.save();
      return authSuccess(user, res, 'Password changed successfully.');
    },
    sendPasswordResetCode: async (_parent, { email }, { req } = {}) => {
      const normalizedEmail = normalizeEmail(email);

      requireRateLimit({
        req,
        bucket: 'mutation-send-reset-code',
        key: normalizedEmail || 'anonymous',
        ...LIMITS.sendPasswordResetCode,
        message: 'Too many reset code requests. Please wait and try again.',
      });

      if (!isValidEmail(normalizedEmail)) {
        throw new GraphQLError('Please provide a valid email address.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      // Never reveal whether this email is registered.
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return { ok: true };
      }

      const latest = await EmailVerification.findOne(
        { email: normalizedEmail, purpose: RESET_PASSWORD_PURPOSE },
        null,
        { sort: { createdAt: -1 } },
      );

      if (latest?.createdAt) {
        const elapsed = Date.now() - new Date(latest.createdAt).getTime();
        if (elapsed < RESET_CODE_COOLDOWN_MS) {
          return { ok: true };
        }
      }

      const code = String(randomInt(100000, 1000000));
      const codeHash = await bcrypt.hash(code, 12);

      await EmailVerification.updateMany(
        {
          email: normalizedEmail,
          purpose: RESET_PASSWORD_PURPOSE,
          used: false,
        },
        { $set: { used: true } },
      );

      const verification = await EmailVerification.create({
        email: normalizedEmail,
        codeHash,
        purpose: RESET_PASSWORD_PURPOSE,
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
        attempts: 0,
        used: false,
      });

      // EMAIL_DEMO_MODE: skip SMTP entirely and return code directly in response.
      // Set EMAIL_DEMO_MODE=true in Railway env vars when SMTP is unavailable.
      if (process.env.EMAIL_DEMO_MODE === 'true') {
        return { ok: true, demoCode: code };
      }

      try {
        await sendResetPasswordCodeEmail({
          to: normalizedEmail,
          code,
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'test') {
          return { ok: true };
        }
        verification.used = true;
        await verification.save();
        console.error('[Auth] Failed to send reset email:', err?.message || err);
        throw new GraphQLError('Unable to send verification email right now. Please try again later.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }

      return { ok: true };
    },
    resetPasswordWithCode: async (
      _parent,
      { email, code, newPassword, confirmPassword },
      { req } = {},
    ) => {
      const normalizedEmail = normalizeEmail(email);
      const sanitizedCode = (code || '').trim();
      const nextPassword = (newPassword || '').trim();
      const nextConfirmPassword = (confirmPassword || '').trim();

      requireRateLimit({
        req,
        bucket: 'mutation-reset-password-with-code',
        key: normalizedEmail || 'anonymous',
        ...LIMITS.resetPasswordWithCode,
        message: 'Too many password reset attempts. Please wait and try again.',
      });

      if (!isValidEmail(normalizedEmail)) {
        throw new GraphQLError('Please provide a valid email address.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (!/^\d{6}$/.test(sanitizedCode)) {
        throw new GraphQLError('Verification code must be a 6-digit number.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (!nextPassword || nextPassword.length < 6) {
        throw new GraphQLError('Password must be at least 6 characters.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (nextPassword !== nextConfirmPassword) {
        throw new GraphQLError('Passwords do not match.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        throw new GraphQLError('Invalid or expired verification code.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const verification = await EmailVerification.findOne(
        {
          email: normalizedEmail,
          purpose: RESET_PASSWORD_PURPOSE,
          used: false,
        },
        null,
        { sort: { createdAt: -1 } },
      );

      if (!verification) {
        throw new GraphQLError('Invalid or expired verification code.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (new Date(verification.expiresAt).getTime() <= Date.now()) {
        verification.used = true;
        await verification.save();
        throw new GraphQLError('Verification code has expired. Please request a new code.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (verification.attempts >= RESET_CODE_MAX_ATTEMPTS) {
        verification.used = true;
        await verification.save();
        throw new GraphQLError('Too many incorrect attempts. Please request a new code.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const matched = await bcrypt.compare(sanitizedCode, verification.codeHash);
      if (!matched) {
        verification.attempts += 1;
        if (verification.attempts >= RESET_CODE_MAX_ATTEMPTS) {
          verification.used = true;
        }
        await verification.save();
        throw new GraphQLError('Invalid verification code.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      user.passwordHash = await bcrypt.hash(nextPassword, 12);
      await user.save();

      verification.used = true;
      await verification.save();

      await EmailVerification.updateMany(
        {
          email: normalizedEmail,
          purpose: RESET_PASSWORD_PURPOSE,
          used: false,
        },
        { $set: { used: true } },
      );

      return true;
    },
    geminiHealthTest: async () => {
      // No auth required — safe to call from Apollo Sandbox to verify API connectivity.
      // Returns a plain string describing pass/fail with model name.
      return geminiHealthTest();
    },
    addGame: async (_parent, { input }, { user }) => {
      const current = requireUser(user);
      const payload = sanitizeGameInput(input);
      const game = await Game.create({ ...payload, user: current._id });
      return game;
    },
    removeGameFromUser: async (_parent, { gameId }, { user }) => {
      const current = requireUser(user);
      const deleted = await Game.findOneAndDelete({ _id: gameId, user: current._id });
      return Boolean(deleted);
    },
    createTournament: async (_parent, { input }, { user }) => {
      const current = requireUser(user);
      requireAdmin(current);
      const payload = await sanitizeTournamentInput(input);
      const tournament = await Tournament.create({
        ...payload,
        createdBy: current._id,
      });
      await populateTournament(tournament);
      return tournament;
    },
    deleteTournament: async (_parent, { id }, { user }) => {
      const current = requireUser(user);
      requireAdmin(current);
      const result = await Tournament.findByIdAndDelete(id);
      return Boolean(result);
    },
    addPlayerToTournament: async (_parent, { tournamentId, playerId }, { user }) => {
      const current = requireUser(user);
      const tournament = await Tournament.findById(tournamentId);
      if (!tournament) {
        throw new GraphQLError('Tournament not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const player = await Player.findById(playerId).populate('user');
      if (!player) {
        throw new GraphQLError('Player not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const isSelf = player.user?._id?.toString() === current._id.toString();
      if (!isSelf && current.role !== 'Admin') {
        throw new GraphQLError('You are not allowed to assign this player', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const alreadyIncluded = tournament.players.some((entry) =>
        entry.toString() === player._id.toString(),
      );
      if (!alreadyIncluded) {
        tournament.players.push(player._id);
        await tournament.save();
      }

      await populateTournament(tournament);
      return tournament;
    },
    createPost: async (_parent, { input }, { user }) => {
      const current = requireUser(user);
      const postType = POST_TYPES.has(input.postType) ? input.postType : 'GAME';
      if (!input.review?.trim()) throw new GraphQLError('Content is required', { extensions: { code: 'BAD_USER_INPUT' } });

      if (postType === 'GAME' && !input.title?.trim()) {
        throw new GraphQLError('Title is required', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      if (postType === 'IDEA') {
        const ideaText = input.review.trim();
        if (!ideaText) {
          throw new GraphQLError('Idea content cannot be empty', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (ideaText.length > 500) {
          throw new GraphQLError('Idea content must be 500 characters or less', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (!IDEA_TEXT_REGEX.test(ideaText)) {
          throw new GraphQLError('Idea content can contain text and emoji only', { extensions: { code: 'BAD_USER_INPUT' } });
        }
      }

      let tags = input.tags || [];
      if (typeof tags === 'string') tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const isFeatured = input.featured === true && current.role === 'Admin';
      const post = await GamePost.create({
        postType,
        title: postType === 'IDEA' ? 'Share Your Idea' : input.title.trim(),
        genre: postType === 'IDEA' ? undefined : input.genre?.trim() || undefined,
        platform: postType === 'IDEA' ? undefined : input.platform?.trim() || undefined,
        developer: postType === 'IDEA' ? undefined : input.developer?.trim() || undefined,
        releaseYear: postType === 'IDEA' ? undefined : input.releaseYear || undefined,
        gameType: postType === 'IDEA' ? undefined : input.gameType?.trim() || undefined,
        rating: postType === 'IDEA' ? undefined : input.rating || undefined,
        coverImageUrl: postType === 'IDEA' ? undefined : input.coverImageUrl?.trim() || undefined,
        gameLink: postType === 'IDEA' ? undefined : input.gameLink?.trim() || undefined,
        tags: postType === 'IDEA' ? [] : tags,
        review: input.review.trim(),
        postedBy: current._id,
        featured: isFeatured,
        likedBy: [],
        bookmarkedBy: [],
        comments: [],
      });
      await post.populate('postedBy');
      await post.populate({ path: 'comments.author' });
      await post.populate('likedBy', '_id');
      await post.populate('bookmarkedBy', '_id');
      return attachCommunityRatingDataToPost(post, current._id);
    },
    deletePost: async (_parent, { id }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(id);
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      if (post.postedBy.toString() !== current._id.toString() && current.role !== 'Admin') {
        throw new GraphQLError('Not authorized', { extensions: { code: 'FORBIDDEN' } });
      }
      await GamePost.findByIdAndDelete(id);
      await CommunityRating.deleteMany({ postId: id });
      return true;
    },
    editPost: async (_parent, { id, input }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(id);
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      if (post.postedBy.toString() !== current._id.toString() && current.role !== 'Admin') {
        throw new GraphQLError('Not authorized', { extensions: { code: 'FORBIDDEN' } });
      }
      const isIdeaPost = post.postType === 'IDEA';
      if (!isIdeaPost && input.title !== undefined) post.title = input.title.trim();
      if (!isIdeaPost && input.genre !== undefined) post.genre = input.genre?.trim() || undefined;
      if (!isIdeaPost && input.platform !== undefined) post.platform = input.platform?.trim() || undefined;
      if (!isIdeaPost && input.developer !== undefined) post.developer = input.developer?.trim() || undefined;
      if (!isIdeaPost && input.releaseYear !== undefined) post.releaseYear = input.releaseYear || undefined;
      if (!isIdeaPost && input.gameType !== undefined) post.gameType = input.gameType?.trim() || undefined;
      if (!isIdeaPost && input.rating !== undefined) post.rating = input.rating || undefined;
      if (!isIdeaPost && input.coverImageUrl !== undefined) post.coverImageUrl = input.coverImageUrl?.trim() || undefined;
      if (!isIdeaPost && input.gameLink !== undefined) post.gameLink = input.gameLink?.trim() || undefined;
      if (input.review !== undefined) {
        const nextReview = input.review.trim();
        if (!nextReview) throw new GraphQLError('Content is required', { extensions: { code: 'BAD_USER_INPUT' } });
        if (isIdeaPost) {
          if (nextReview.length > 500) throw new GraphQLError('Idea content must be 500 characters or less', { extensions: { code: 'BAD_USER_INPUT' } });
          if (!IDEA_TEXT_REGEX.test(nextReview)) throw new GraphQLError('Idea content can contain text and emoji only', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        post.review = nextReview;
      }
      if (!isIdeaPost && input.tags !== undefined) {
        let tags = input.tags || [];
        if (typeof tags === 'string') tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
        post.tags = tags;
      }
      await post.save();
      await post.populate('postedBy');
      await post.populate({ path: 'comments.author' });
      await post.populate('likedBy', '_id');
      await post.populate('bookmarkedBy', '_id');
      return attachCommunityRatingDataToPost(post, current._id);
    },
    ratePost: async (_parent, { postId, score }, { user }) => {
      const current = requireUser(user);
      const normalizedScore = Number(score);
      if (!Number.isInteger(normalizedScore) || normalizedScore < 1 || normalizedScore > 10) {
        throw new GraphQLError('Community rating score must be an integer from 1 to 10', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const post = await GamePost.findById(postId);
      if (!post || post.postType !== 'GAME') {
        throw new GraphQLError('Game post not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (post.postedBy?.toString() === current._id.toString()) {
        throw new GraphQLError('You cannot rate your own post', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      await CommunityRating.findOneAndUpdate(
        { postId: post._id, userId: current._id },
        { $set: { score: normalizedScore } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
      );

      const populatedPost = await GamePost.findById(postId)
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id');
      return attachCommunityRatingDataToPost(populatedPost, current._id);
    },
    likePost: async (_parent, { id }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(id);
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      const alreadyLiked = post.likedBy.some((uid) => uid.toString() === current._id.toString());
      if (alreadyLiked) {
        post.likedBy = post.likedBy.filter((uid) => uid.toString() !== current._id.toString());
      } else {
        post.likedBy.push(current._id);
      }
      await post.save();
      await post.populate('postedBy');
      await post.populate({ path: 'comments.author' });
      await post.populate('likedBy', '_id');
      await post.populate('bookmarkedBy', '_id');
      return attachCommunityRatingDataToPost(post, current._id);
    },
    addComment: async (_parent, { postId, text }, { user }) => {
      const current = requireUser(user);
      if (!text?.trim()) throw new GraphQLError('Comment text required', { extensions: { code: 'BAD_USER_INPUT' } });
      const post = await GamePost.findByIdAndUpdate(
        postId,
        { $push: { comments: { author: current._id, text: text.trim() } } },
        { new: true },
      ).populate('postedBy').populate({ path: 'comments.author' }).populate('likedBy', '_id').populate('bookmarkedBy', '_id');
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      return attachCommunityRatingDataToPost(post, current._id);
    },
    toggleBookmark: async (_parent, { postId }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(postId);
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      const isBookmarked = post.bookmarkedBy.some((uid) => uid.toString() === current._id.toString());
      if (isBookmarked) {
        post.bookmarkedBy = post.bookmarkedBy.filter((uid) => uid.toString() !== current._id.toString());
      } else {
        post.bookmarkedBy.push(current._id);
      }
      await post.save();
      await post.populate('postedBy');
      await post.populate({ path: 'comments.author' });
      await post.populate('likedBy', '_id');
      await post.populate('bookmarkedBy', '_id');
      return attachCommunityRatingDataToPost(post, current._id);
    },
    deleteComment: async (_parent, { postId, commentId }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(postId)
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id');
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      const comment = post.comments.id(commentId);
      if (!comment) throw new GraphQLError('Comment not found', { extensions: { code: 'NOT_FOUND' } });
      const isAuthor = comment.author?._id?.toString() === current._id.toString() ||
                       comment.author?.toString() === current._id.toString();
      if (!isAuthor && current.role !== 'Admin') {
        throw new GraphQLError('Not authorized', { extensions: { code: 'FORBIDDEN' } });
      }
      post.comments.pull(commentId);
      await post.save();
      await post.populate({ path: 'comments.author' });
      return attachCommunityRatingDataToPost(post, current._id);
    },
    featurePost: async (_parent, { id, featured }, { user }) => {
      const current = requireUser(user);
      if (current.role !== 'Admin') {
        throw new GraphQLError('Admin privileges required', { extensions: { code: 'FORBIDDEN' } });
      }
      const post = await GamePost.findByIdAndUpdate(
        id,
        { $set: { featured } },
        { new: true },
      ).populate('postedBy').populate({ path: 'comments.author' }).populate('likedBy', '_id').populate('bookmarkedBy', '_id');
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      return attachCommunityRatingDataToPost(post, current._id);
    },
    toggleCommentLike: async (_parent, { postId, commentId }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(postId)
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id');
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      const comment = post.comments.id(commentId);
      if (!comment) throw new GraphQLError('Comment not found', { extensions: { code: 'NOT_FOUND' } });
      const alreadyLiked = comment.likedBy.some(
        (uid) => uid.toString() === current._id.toString(),
      );
      if (alreadyLiked) {
        comment.likedBy = comment.likedBy.filter(
          (uid) => uid.toString() !== current._id.toString(),
        );
      } else {
        comment.likedBy.push(current._id);
      }
      await post.save();
      await post.populate({ path: 'comments.author' });
      return attachCommunityRatingDataToPost(post, current._id);
    },
    recordTournamentResult: async (_parent, { input }, { user }) => {
      const current = requireUser(user);
      const { tournament, user: targetUser, update } = await sanitizeResultInput(input, current);

      const result = await TournamentResult.findOneAndUpdate(
        { tournament: tournament._id, user: targetUser._id },
        { $set: update },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      await populateResult(result);
      return result;
    },

    // ── Password reset ──────────────────────────────────────────────────────
    requestPasswordReset: async (_parent, { email }) => {
      await resolvers.Mutation.sendPasswordResetCode(_parent, { email });
      return {
        ok: true,
        message: 'If this email exists, a verification code has been sent.',
        resetToken: null,
      };
    },

    resetPassword: async () => {
      return {
        ok: false,
        message: 'This endpoint is deprecated. Use resetPasswordWithCode instead.',
        token: null,
        user: null,
      };
    },
  },
  Game: {
    id: (parent) => parent.id || parent._id?.toString(),
    createdAt: (parent) => parent.createdAt?.toISOString?.() || null,
    updatedAt: (parent) => parent.updatedAt?.toISOString?.() || null,
    tags: (parent) => Array.isArray(parent.tags) ? parent.tags : [],
  },
  Player: {
    id: (parent) => parent.id || parent._id?.toString(),
    user: async (parent) => {
      if (parent.user?.username) return safeUser(parent.user);
      const populated = await Player.findById(parent._id).populate('user');
      return safeUser(populated?.user);
    },
    createdAt: (parent) => parent.createdAt?.toISOString?.() || null,
    updatedAt: (parent) => parent.updatedAt?.toISOString?.() || null,
  },
  Tournament: {
    id: (parent) => parent.id || parent._id?.toString(),
    date: (parent) => parent.date?.toISOString?.() || null,
    createdAt: (parent) => parent.createdAt?.toISOString?.() || null,
    updatedAt: (parent) => parent.updatedAt?.toISOString?.() || null,
    linkedGame: async (parent) => {
      if (parent.gameRef?.title) return parent.gameRef;
      if (!parent.gameRef) return null;
      const populated = await Tournament.findById(parent._id).populate('gameRef');
      return populated?.gameRef || null;
    },
    players: async (parent) => {
      if (Array.isArray(parent.players) && parent.players.every((p) => p?.user?.username)) {
        return parent.players;
      }
      const populated = await Tournament.findById(parent._id).populate({
        path: 'players',
        populate: { path: 'user' },
      });
      return populated?.players || [];
    },
  },
  GamePost: {
    id: (parent) => parent.id || parent._id?.toString(),
    postType: (parent) => parent.postType || 'GAME',
    rating: (parent) => parent.rating ?? parent.authorRating ?? null,
    authorRating: (parent) => parent.authorRating ?? parent.rating ?? null,
    communityRating: async (parent, _args, { user }) => {
      if (parent.communityRating !== undefined) return parent.communityRating;
      const snapshot = await getCommunityRatingSnapshot(parent._id || parent.id, user?._id);
      return snapshot.communityRating;
    },
    ratingCount: async (parent, _args, { user }) => {
      if (parent.ratingCount !== undefined) return parent.ratingCount;
      const snapshot = await getCommunityRatingSnapshot(parent._id || parent.id, user?._id);
      return snapshot.ratingCount;
    },
    myCommunityRating: async (parent, _args, { user }) => {
      if (!user) return null;
      if (parent.myCommunityRating !== undefined) return parent.myCommunityRating;
      const snapshot = await getCommunityRatingSnapshot(parent._id || parent.id, user._id);
      return snapshot.myCommunityRating;
    },
    postedBy: async (parent) => {
      if (parent.postedBy?.username) return safeUser(parent.postedBy);
      const populated = await GamePost.findById(parent._id).populate('postedBy');
      return safeUser(populated?.postedBy);
    },
    likedBy: (parent) => (Array.isArray(parent.likedBy) ? parent.likedBy : []),
    bookmarkedBy: (parent) => (Array.isArray(parent.bookmarkedBy) ? parent.bookmarkedBy : []),
    comments: (parent) => (Array.isArray(parent.comments) ? parent.comments : []),
    tags: (parent) => (Array.isArray(parent.tags) ? parent.tags : []),
    likesCount: (parent) => (Array.isArray(parent.likedBy) ? parent.likedBy.length : 0),
    commentsCount: (parent) => (Array.isArray(parent.comments) ? parent.comments.length : 0),
    bookmarksCount: (parent) => (Array.isArray(parent.bookmarkedBy) ? parent.bookmarkedBy.length : 0),
    isLikedByMe: (parent, _args, { user }) => {
      if (!user || !Array.isArray(parent.likedBy)) return false;
      return parent.likedBy.some((uid) => (uid._id || uid).toString() === user._id.toString());
    },
    isBookmarkedByMe: (parent, _args, { user }) => {
      if (!user || !Array.isArray(parent.bookmarkedBy)) return false;
      return parent.bookmarkedBy.some((uid) => (uid._id || uid).toString() === user._id.toString());
    },
    featured: (parent) => Boolean(parent.featured),
    createdAt: (parent) => parent.createdAt?.toISOString?.() || null,
    updatedAt: (parent) => parent.updatedAt?.toISOString?.() || null,
  },
  PostComment: {
    id: (parent) => parent.id || parent._id?.toString(),
    author: async (parent) => {
      if (parent.author?.username) return safeUser(parent.author);
      const record = await User.findById(parent.author);
      return safeUser(record);
    },
    createdAt: (parent) => parent.createdAt?.toISOString?.() || null,
    likedBy: (parent) => (Array.isArray(parent.likedBy) ? parent.likedBy.map((uid) => (uid._id || uid).toString()) : []),
    likeCount: (parent) => (Array.isArray(parent.likedBy) ? parent.likedBy.length : 0),
  },
  TournamentResult: {
    id: (parent) => parent.id || parent._id?.toString(),
    tournament: async (parent) => {
      if (parent.tournament?.name) return parent.tournament;
      const populated = await TournamentResult.findById(parent._id).populate({
        path: 'tournament',
        populate: [{ path: 'gameRef' }],
      });
      return populated?.tournament || null;
    },
    user: async (parent) => {
      if (parent.user?.username) return safeUser(parent.user);
      const populated = await TournamentResult.findById(parent._id).populate('user');
      return safeUser(populated?.user);
    },
    game: async (parent) => {
      if (parent.game?.title) return parent.game;
      if (!parent.game) return null;
      const populated = await TournamentResult.findById(parent._id).populate('game');
      return populated?.game || null;
    },
    submittedBy: async (parent) => {
      if (parent.submittedBy?.username) return safeUser(parent.submittedBy);
      if (!parent.submittedBy) return null;
      const populated = await TournamentResult.findById(parent._id).populate('submittedBy');
      return safeUser(populated?.submittedBy);
    },
    submittedAt: (parent) => parent.submittedAt?.toISOString?.() || null,
    createdAt: (parent) => parent.createdAt?.toISOString?.() || null,
    updatedAt: (parent) => parent.updatedAt?.toISOString?.() || null,
  },
};
