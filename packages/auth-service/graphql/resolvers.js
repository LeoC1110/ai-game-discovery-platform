import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { GraphQLError } from 'graphql';
import User from '../models/User.js';
import Game from '../models/Game.js';
import GamePost from '../models/GamePost.js';
import Player from '../models/Player.js';
import Tournament from '../models/Tournament.js';
import TournamentResult from '../models/TournamentResult.js';
import { askAIAgent, clearAIHistory, getAIHistory, geminiHealthTest } from '../services/aiAgentService.js';
import { loadStoredPreferences, upsertUserPreferences, clearUserPreferences } from '../services/userMemoryService.js';
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

const requireAdmin = (user) => {
  if (user?.role !== 'Admin') {
    throw new GraphQLError('Admin privileges required', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
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
    { path: 'players', populate: { path: 'user' } },
    { path: 'gameRef' },
  ]);

const populateResult = (doc) =>
  doc.populate([
    {
      path: 'tournament',
      populate: [
        { path: 'players', populate: { path: 'user' } },
        { path: 'gameRef' },
      ],
    },
    { path: 'user' },
    { path: 'game' },
    { path: 'submittedBy' },
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
    myGames: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      const games = await Game.find({ user: current._id }).sort({ createdAt: -1 });
      return games;
    },
    getAllGames: async (_parent, _args, { user }) => {
      requireUser(user);
      const games = await Game.find()
        .sort({ updatedAt: -1, createdAt: -1 })
        .populate('user');
      return games;
    },
    players: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      await ensurePlayerForUser(current._id);
      const list = await Player.find()
        .populate('user')
        .sort({ createdAt: -1 });
      return list;
    },
    tournaments: async (_parent, _args, { user }) => {
      requireUser(user);
      const list = await Tournament.find()
        .sort({ date: 1, createdAt: -1 })
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
    tournamentLeaderboard: async (_parent, { tournamentId, limit = 25 }, { user }) => {
      requireUser(user);
      const results = await TournamentResult.find({ tournament: tournamentId })
        .sort({ position: 1, score: -1, updatedAt: 1 })
        .limit(Math.min(limit, 100))
        .populate([
          {
            path: 'tournament',
            populate: [{ path: 'gameRef' }],
          },
          { path: 'user' },
          { path: 'game' },
          { path: 'submittedBy' },
        ]);
      return results;
    },
    gameLeaderboard: async (_parent, { gameId, limit = 25 }, { user }) => {
      requireUser(user);
      const results = await TournamentResult.find({ game: gameId })
        .sort({ position: 1, score: -1, updatedAt: 1 })
        .limit(Math.min(limit, 100))
        .populate([
          {
            path: 'tournament',
            populate: [{ path: 'gameRef' }],
          },
          { path: 'user' },
          { path: 'game' },
          { path: 'submittedBy' },
        ]);
      return results;
    },
    allPosts: async (_parent, { search, genre, platform, tag, sort }, { user }) => {
      requireUser(user);
      const filter = {};
      if (search) filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { review: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
      if (genre) filter.genre = { $regex: genre, $options: 'i' };
      if (platform) filter.platform = { $regex: platform, $options: 'i' };
      if (tag) filter.tags = tag;
      let query = GamePost.find(filter).populate('postedBy').populate({ path: 'comments.author' }).populate('likedBy', '_id').populate('bookmarkedBy', '_id');
      if (sort === 'rating') query = query.sort({ rating: -1, createdAt: -1 });
      else if (sort === 'likes') query = query.sort({ _likedByLength: -1, createdAt: -1 });
      else query = query.sort({ createdAt: -1 });
      const posts = await query;
      if (sort === 'likes') posts.sort((a, b) => b.likedBy.length - a.likedBy.length);
      if (sort === 'comments') posts.sort((a, b) => b.comments.length - a.comments.length);
      return posts;
    },
    myPosts: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      return GamePost.find({ postedBy: current._id })
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id')
        .sort({ createdAt: -1 });
    },
    bookmarkedPosts: async (_parent, _args, { user }) => {
      const current = requireUser(user);
      return GamePost.find({ bookmarkedBy: current._id })
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id')
        .sort({ createdAt: -1 });
    },
    getPost: async (_parent, { id }, { user }) => {
      requireUser(user);
      return GamePost.findById(id)
        .populate('postedBy')
        .populate({ path: 'comments.author' })
        .populate('likedBy', '_id')
        .populate('bookmarkedBy', '_id');
    },
    myRecentResults: async (_parent, { limit = 10 }, { user }) => {
      const current = requireUser(user);
      const results = await TournamentResult.find({ user: current._id })
        .sort({ submittedAt: -1, updatedAt: -1 })
        .limit(Math.min(limit, 50))
        .populate([
          {
            path: 'tournament',
            populate: [{ path: 'gameRef' }],
          },
          { path: 'user' },
          { path: 'game' },
          { path: 'submittedBy' },
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
    register: async (_parent, { input }, { res }) => {
      const { username, email, password, role } = input;
      const usernameNorm = normalizeName(username);
      if (!usernameNorm || !email || !password) {
        return { ok: false, message: 'Missing required fields', token: null, user: null };
      }

      const existing = await User.findOne({
        $or: [{ username: usernameNorm }, { email }],
      });
      if (existing) {
        return { ok: false, message: 'Username or email already registered', token: null, user: null };
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        username: usernameNorm,
        email,
        passwordHash,
        role: 'Player',
      });

      await ensurePlayerForUser(user._id);

      return authSuccess(user, res, 'Registration successful');
    },
    login: async (_parent, { identifier, password }, { res }) => {
      const lookup = (identifier || '').trim();
      if (!lookup || !password) {
        return { ok: false, message: 'Invalid credentials', token: null, user: null };
      }

      const user = await User.findOne({
        $or: [{ username: lookup }, { email: lookup }],
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
    askAI: async (_parent, { message }, { user }) => {
      const current = requireUser(user);
      const trimmed = (message || '').trim();
      if (!trimmed) {
        throw new GraphQLError('Message cannot be empty', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        return await askAIAgent({
          userId: current._id,
          username: current.username,
          message: trimmed,
        });
      } catch (err) {
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
      if (!input.title?.trim()) throw new GraphQLError('Title is required', { extensions: { code: 'BAD_USER_INPUT' } });
      if (!input.review?.trim()) throw new GraphQLError('Review is required', { extensions: { code: 'BAD_USER_INPUT' } });
      let tags = input.tags || [];
      if (typeof tags === 'string') tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const isFeatured = input.featured === true && current.role === 'Admin';
      const post = await GamePost.create({
        title: input.title.trim(),
        genre: input.genre?.trim() || undefined,
        platform: input.platform?.trim() || undefined,
        developer: input.developer?.trim() || undefined,
        releaseYear: input.releaseYear || undefined,
        gameType: input.gameType?.trim() || undefined,
        rating: input.rating || undefined,
        coverImageUrl: input.coverImageUrl?.trim() || undefined,
        gameLink: input.gameLink?.trim() || undefined,
        tags,
        review: input.review.trim(),
        postedBy: current._id,
        featured: isFeatured,
        likedBy: [],
        bookmarkedBy: [],
        comments: [],
      });
      await post.populate('postedBy');
      return post;
    },
    deletePost: async (_parent, { id }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(id);
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      if (post.postedBy.toString() !== current._id.toString() && current.role !== 'Admin') {
        throw new GraphQLError('Not authorized', { extensions: { code: 'FORBIDDEN' } });
      }
      await GamePost.findByIdAndDelete(id);
      return true;
    },
    editPost: async (_parent, { id, input }, { user }) => {
      const current = requireUser(user);
      const post = await GamePost.findById(id);
      if (!post) throw new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
      if (post.postedBy.toString() !== current._id.toString() && current.role !== 'Admin') {
        throw new GraphQLError('Not authorized', { extensions: { code: 'FORBIDDEN' } });
      }
      if (input.title !== undefined) post.title = input.title.trim();
      if (input.genre !== undefined) post.genre = input.genre?.trim() || undefined;
      if (input.platform !== undefined) post.platform = input.platform?.trim() || undefined;
      if (input.developer !== undefined) post.developer = input.developer?.trim() || undefined;
      if (input.releaseYear !== undefined) post.releaseYear = input.releaseYear || undefined;
      if (input.gameType !== undefined) post.gameType = input.gameType?.trim() || undefined;
      if (input.rating !== undefined) post.rating = input.rating || undefined;
      if (input.coverImageUrl !== undefined) post.coverImageUrl = input.coverImageUrl?.trim() || undefined;
      if (input.gameLink !== undefined) post.gameLink = input.gameLink?.trim() || undefined;
      if (input.review !== undefined) post.review = input.review.trim();
      if (input.tags !== undefined) {
        let tags = input.tags || [];
        if (typeof tags === 'string') tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
        post.tags = tags;
      }
      await post.save();
      await post.populate('postedBy');
      await post.populate({ path: 'comments.author' });
      await post.populate('likedBy', '_id');
      await post.populate('bookmarkedBy', '_id');
      return post;
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
      return post;
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
      return post;
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
      return post;
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
      return post;
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
      return post;
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
      return post;
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
      const lookup = (email || '').trim().toLowerCase();
      if (!lookup) {
        return { ok: false, message: 'Please provide a valid email address.', resetToken: null };
      }

      const user = await User.findOne({ email: lookup });

      // Always return the same generic message so we don't reveal whether
      // an email exists in the database (prevents user enumeration).
      const genericMsg =
        'If this email is registered, a reset link has been generated. Check the token below (demo mode — in production this is sent by email).';

      if (!user) {
        // Return ok:true with no token to avoid leaking registration status.
        return { ok: true, message: genericMsg, resetToken: null };
      }

      // Generate a cryptographically secure 32-byte token.
      const plainToken = crypto.randomBytes(32).toString('hex');

      // Store only the SHA-256 hash of the token in the database.
      const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      // DEMO: return the plain token so the frontend can display it.
      // In production: send an email with a link containing `plainToken`
      // and return { ok: true, message: genericMsg, resetToken: null }.
      return { ok: true, message: genericMsg, resetToken: plainToken };
    },

    resetPassword: async (_parent, { token, newPassword }, { res }) => {
      const trimmedToken = (token || '').trim();
      const trimmedPwd   = (newPassword || '').trim();

      if (!trimmedToken) {
        return { ok: false, message: 'Reset token is missing.', token: null, user: null };
      }
      if (!trimmedPwd || trimmedPwd.length < 6) {
        return { ok: false, message: 'Password must be at least 6 characters.', token: null, user: null };
      }

      const hashedToken = crypto.createHash('sha256').update(trimmedToken).digest('hex');

      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        return {
          ok: false,
          message: 'This reset link is invalid or has expired. Please request a new one.',
          token: null,
          user: null,
        };
      }

      // Hash the new password and persist it; then clear the reset token fields.
      user.passwordHash = await bcrypt.hash(trimmedPwd, 12);
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return authSuccess(user, res, 'Password reset successful. You are now logged in.');
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
