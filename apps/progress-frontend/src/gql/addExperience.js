import { gql } from '@apollo/client';

export const ADD_EXPERIENCE = gql`
  mutation AddExperience($gameId: String!, $gameTitle: String, $amount: Int!) {
    addExperience(gameId: $gameId, gameTitle: $gameTitle, amount: $amount) {
      id
      gameId
      gameTitle
      level
      experience
      score
      achievements
      lastPlayedAt
      updatedAt
    }
  }
`;
