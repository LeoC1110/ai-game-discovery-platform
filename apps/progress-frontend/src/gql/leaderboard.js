import { gql } from '@apollo/client';

export const LEADERBOARD = gql`
  query Leaderboard($gameId: String!) {
    leaderboard(gameId: $gameId) {
      rank
      userId
      username
      gameId
      gameTitle
      score
      experience
      level
    }
  }
`;
