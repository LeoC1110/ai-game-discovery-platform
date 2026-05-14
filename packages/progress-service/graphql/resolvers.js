import Progress from '../models/Progress.js';

const safeProgress = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id?.toString() || obj.id,
    userId: obj.userId,
    username: obj.username,
    gameId: obj.gameId,
    gameTitle: obj.gameTitle,
    level: obj.level,
    experience: obj.experience,
    score: obj.score,
    achievements: obj.achievements || [],
    lastPlayedAt: obj.lastPlayedAt ? obj.lastPlayedAt.toISOString?.() || String(obj.lastPlayedAt) : null,
    createdAt: obj.createdAt ? obj.createdAt.toISOString?.() || String(obj.createdAt) : null,
    updatedAt: obj.updatedAt ? obj.updatedAt.toISOString?.() || String(obj.updatedAt) : null,
  };
};

const calculateLevel = (experience) => Math.max(1, Math.floor(experience / 1000) + 1);

const ensureProgress = async (user, gameId, gameTitle) => {
  const normalizedGameId = (gameId || '').trim();
  if (!normalizedGameId) throw new Error('gameId is required');
  let doc = await Progress.findOne({ userId: user.uid, gameId: normalizedGameId });
  if (!doc) {
    doc = await Progress.create({
      userId: user.uid,
      username: user.username,
      gameId: normalizedGameId,
      gameTitle: gameTitle || normalizedGameId,
      experience: 0,
      level: 1,
      score: 0,
      achievements: [],
      lastPlayedAt: new Date(),
    });
  } else {
    if (gameTitle && gameTitle !== doc.gameTitle) doc.gameTitle = gameTitle;
    doc.lastPlayedAt = new Date();
  }
  return doc;
};

const requireUser = (context) => {
  const { user } = context;
  if (!user?.uid) throw new Error('Not authenticated');
  return user;
};

export const resolvers = {
  Query: {
    _health: () => 'ok',
    myProgress: async (_parent, _args, context) => {
      const user = requireUser(context);
      const docs = await Progress.find({ userId: user.uid }).sort({ updatedAt: -1 });
      return docs.map(safeProgress);
    },
    leaderboard: async (_parent, { gameId }, context) => {
      requireUser(context);
      const gid = (gameId || '').trim();
      if (!gid) throw new Error('gameId is required');
      const docs = await Progress.find({ gameId: gid })
        .sort({ score: -1, experience: -1 })
        .limit(25)
        .lean();
      return docs.map((doc, index) => ({
        rank: index + 1,
        userId: doc.userId,
        username: doc.username,
        gameId: doc.gameId,
        gameTitle: doc.gameTitle,
        score: doc.score,
        experience: doc.experience,
        level: doc.level,
      }));
    },
  },
  Mutation: {
    addExperience: async (_parent, { gameId, gameTitle, amount }, context) => {
      const user = requireUser(context);
      const amt = Number(amount || 0);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error('amount must be a positive number');
      }
      const doc = await ensureProgress(user, gameId, gameTitle);
      doc.experience += amt;
      doc.level = calculateLevel(doc.experience);
      doc.lastPlayedAt = new Date();
      await doc.save();
      return safeProgress(doc);
    },
    unlockAchievement: async (_parent, { gameId, gameTitle, achievement }, context) => {
      const user = requireUser(context);
      const label = (achievement || '').trim();
      if (!label) throw new Error('achievement is required');
      const doc = await ensureProgress(user, gameId, gameTitle);
      if (!doc.achievements.includes(label)) {
        doc.achievements.push(label);
      }
      doc.lastPlayedAt = new Date();
      await doc.save();
      return safeProgress(doc);
    },
    setScore: async (_parent, { gameId, gameTitle, score }, context) => {
      const user = requireUser(context);
      const nextScore = Number(score || 0);
      if (!Number.isFinite(nextScore) || nextScore < 0) {
        throw new Error('score must be a non-negative number');
      }
      const doc = await ensureProgress(user, gameId, gameTitle);
      if (nextScore > doc.score) {
        doc.score = nextScore;
      }
      doc.lastPlayedAt = new Date();
      await doc.save();
      return safeProgress(doc);
    },
  },
};
