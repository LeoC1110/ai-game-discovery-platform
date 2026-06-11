import { gql } from '@apollo/client';

export const ASK_AI = gql`
  mutation AskAI($message: String!) {
    askAI(message: $message) {
      answer
      recommendedPosts {
        id
        title
        rating
        authorRating
        communityRating
        ratingCount
        tags
        likesCount
        commentsCount
        reason
      }
    }
  }
`;

export const CLEAR_AI_HISTORY = gql`
  mutation ClearAIHistory {
    clearAIHistory
  }
`;

export const MY_AI_HISTORY = gql`
  query MyAIHistory {
    myAIHistory {
      role
      content
      createdAt
    }
  }
`;

// Developer-only health check — run from Apollo Sandbox to verify Gemini connectivity.
// mutation { geminiHealthTest }
export const GEMINI_HEALTH_TEST = gql`
  mutation GeminiHealthTest {
    geminiHealthTest
  }
`;
