// graphql-server/graphql/schema.js
export const typeDefs = /* GraphQL */ `
  """用户（不含密码字段）"""
  type User {
    id: ID!
    username: String!
    email: String!
    role: String!
    createdAt: String
    updatedAt: String
  }

  """登录 / 注册返回值"""
  type AuthPayload {
    ok: Boolean!
    message: String
    token: String
    user: User
  }

  """密码重置流程返回值"""
  type PasswordResetPayload {
    ok: Boolean!
    message: String!
    """
    DEMO ONLY — the plain-text reset token.
    In production this field is omitted and the token is delivered by email.
    """
    resetToken: String
  }

  input RegisterInput {
    username: String!
    email: String!
    password: String!
    role: String
  }

  enum GameSourceType {
    LocalMeta
    ExternalLink
    Embeddable
  }

  enum TournamentLaunchType {
    Local
    ExternalLink
    Embeddable
  }

  type Game {
    id: ID!
    title: String!
    genre: String
    platform: String
    releaseYear: Int
    developer: String
    rating: Int
    description: String
     sourceType: GameSourceType!
     externalUrl: String
     embedUrl: String
     coverImage: String
     tags: [String!]!
    owner: User
    createdAt: String
    updatedAt: String
  }

  input AddGameInput {
    title: String!
    genre: String
    platform: String
    releaseYear: Int
    developer: String
    rating: Int
    description: String
    sourceType: GameSourceType
    externalUrl: String
    embedUrl: String
    coverImage: String
    tags: [String!]
  }

  type Player {
    id: ID!
    nickname: String
    user: User!
    createdAt: String
    updatedAt: String
  }

  input TournamentInput {
    name: String!
    game: String!
    date: String
    status: String
    launchType: TournamentLaunchType
    launchUrl: String
    embedUrl: String
    gameId: ID
    rules: String
    scoreRules: String
    prizePool: String
  }

  type Tournament {
    id: ID!
    name: String!
    game: String!
    date: String
    status: String!
    launchType: TournamentLaunchType!
    launchUrl: String
    embedUrl: String
    rules: String
    scoreRules: String
    prizePool: String
    linkedGame: Game
    players: [Player!]!
    createdAt: String
    updatedAt: String
  }

  type TournamentResult {
    id: ID!
    tournament: Tournament!
    user: User!
    game: Game
    score: Int!
    position: Int
    notes: String
    submittedBy: User
    submittedAt: String
    createdAt: String
    updatedAt: String
  }

  input TournamentResultInput {
    tournamentId: ID!
    userId: ID
    score: Int!
    position: Int
    notes: String
    gameId: ID
  }

  type PostComment {
    id: ID!
    author: User!
    text: String!
    createdAt: String
    likedBy: [ID!]!
    likeCount: Int!
  }

  enum PostType {
    GAME
    IDEA
  }

  type GamePost {
    id: ID!
    postType: PostType!
    title: String!
    genre: String
    platform: String
    developer: String
    releaseYear: Int
    gameType: String
    rating: Int
    coverImageUrl: String
    gameLink: String
    tags: [String!]!
    review: String
    postedBy: User!
    likedBy: [User!]!
    bookmarkedBy: [User!]!
    comments: [PostComment!]!
    likesCount: Int!
    commentsCount: Int!
    bookmarksCount: Int!
    isLikedByMe: Boolean!
    isBookmarkedByMe: Boolean!
    featured: Boolean!
    createdAt: String
    updatedAt: String
  }

  input CreatePostInput {
    postType: PostType
    title: String
    genre: String
    platform: String
    developer: String
    releaseYear: Int
    gameType: String
    rating: Int
    coverImageUrl: String
    gameLink: String
    tags: [String!]
    review: String!
    featured: Boolean
  }

  input EditPostInput {
    title: String
    genre: String
    platform: String
    developer: String
    releaseYear: Int
    gameType: String
    rating: Int
    coverImageUrl: String
    gameLink: String
    tags: [String!]
    review: String
  }

  # ── AI User Memory ──────────────────────────────────────────────────────────

  type UserPreference {
    id: ID!
    likedGenres: [String!]!
    avoidedGenres: [String!]!
    preferredPlatforms: [String!]!
    recommendationTone: String!
    explicitNotes: [String!]!
    updatedAt: String
  }

  input UpdatePreferenceInput {
    likedGenres: [String]
    avoidedGenres: [String]
    preferredPlatforms: [String]
    recommendationTone: String
  }

  # ── AI Game Agent ───────────────────────────────────────────────────────────

  type AIRecommendedPost {
    id: ID
    title: String
    rating: Float
    tags: [String]
    likesCount: Int
    commentsCount: Int
    reason: String
    confidence: Float
    matchedTags: [String]
  }

  type AIEvaluation {
    groundingScore: Float
    matchedTitles: [String]
    hallucinations: [String]
    safetyPassed: Boolean
    recommendedPostsValid: Boolean
    flags: [String]
    wasReflected: Boolean
  }

  type AIResponse {
    answer: String!
    recommendedPosts: [AIRecommendedPost]
    evaluation: AIEvaluation
  }

  type AIHistoryMessage {
    role: String!
    content: String!
    createdAt: String
  }

  # ── Queries & Mutations ──────────────────────────────────────────────────────

  type Query {
    _health: String!
    me: User
    myAIHistory: [AIHistoryMessage!]!
    myGames: [Game!]!
    getAllGames: [Game!]!
    players: [Player!]!
    tournaments: [Tournament!]!
    myRecentTournaments(limit: Int): [Tournament!]!
    tournamentLeaderboard(tournamentId: ID!, limit: Int): [TournamentResult!]!
    gameLeaderboard(gameId: ID!, limit: Int): [TournamentResult!]!
    myRecentResults(limit: Int): [TournamentResult!]!
    allPosts(search: String, genre: String, platform: String, tag: String, sort: String, postType: PostType): [GamePost!]!
    myPosts: [GamePost!]!
    bookmarkedPosts: [GamePost!]!
    getPost(id: ID!): GamePost
    myPreferences: UserPreference
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(identifier: String!, password: String!): AuthPayload!
    logout: Boolean!
    askAI(message: String!): AIResponse!
    clearAIHistory: Boolean!
    geminiHealthTest: String!
    addGame(input: AddGameInput!): Game!
    removeGameFromUser(gameId: ID!): Boolean!
    createTournament(input: TournamentInput!): Tournament!
    deleteTournament(id: ID!): Boolean!
    addPlayerToTournament(tournamentId: ID!, playerId: ID!): Tournament!
    recordTournamentResult(input: TournamentResultInput!): TournamentResult!
    createPost(input: CreatePostInput!): GamePost!
    deletePost(id: ID!): Boolean!
    editPost(id: ID!, input: EditPostInput!): GamePost!
    likePost(id: ID!): GamePost!
    addComment(postId: ID!, text: String!): GamePost!
    toggleBookmark(postId: ID!): GamePost!
    deleteComment(postId: ID!, commentId: ID!): GamePost!
    toggleCommentLike(postId: ID!, commentId: ID!): GamePost!
    featurePost(id: ID!, featured: Boolean!): GamePost!
    updatePreference(input: UpdatePreferenceInput!): UserPreference!
    clearPreferences: Boolean!
    sendPasswordResetCode(email: String!): Boolean!
    resetPasswordWithCode(
      email: String!
      code: String!
      newPassword: String!
      confirmPassword: String!
    ): Boolean!
    requestPasswordReset(email: String!): PasswordResetPayload!
    resetPassword(token: String!, newPassword: String!): AuthPayload!
  }
`;
