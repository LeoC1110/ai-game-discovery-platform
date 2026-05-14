export const typeDefs = /* GraphQL */ `
  type Progress {
    id: ID!
    userId: ID!
    username: String!
    gameId: String!
    gameTitle: String
    level: Int!
    experience: Int!
    score: Int!
    achievements: [String!]!
    lastPlayedAt: String
    createdAt: String
    updatedAt: String
  }

  type LeaderboardEntry {
    rank: Int!
    userId: ID!
    username: String!
    gameId: String!
    gameTitle: String
    score: Int!
    experience: Int!
    level: Int!
  }

  type Query {
    _health: String!
    myProgress: [Progress!]!
    leaderboard(gameId: String!): [LeaderboardEntry!]!
  }

  type Mutation {
    addExperience(gameId: String!, gameTitle: String, amount: Int!): Progress!
    unlockAchievement(gameId: String!, gameTitle: String, achievement: String!): Progress!
    setScore(gameId: String!, gameTitle: String, score: Int!): Progress!
  }
`;
