import { gql } from '@apollo/client';

export const MY_PROGRESS = gql`
  query MyProgress {
    myProgress {
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
