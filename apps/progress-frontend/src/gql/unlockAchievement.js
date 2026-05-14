import { gql } from '@apollo/client';

export const UNLOCK_ACHIEVEMENT = gql`
  mutation UnlockAchievement($gameId: String!, $gameTitle: String, $achievement: String!) {
    unlockAchievement(gameId: $gameId, gameTitle: $gameTitle, achievement: $achievement) {
      id
      achievements
      updatedAt
    }
  }
`;
