import { gql } from '@apollo/client';

export const SET_SCORE = gql`
  mutation SetScore($gameId: String!, $gameTitle: String, $score: Int!) {
    setScore(gameId: $gameId, gameTitle: $gameTitle, score: $score) {
      id
      score
      updatedAt
    }
  }
`;
