import { gql } from '@apollo/client';
import { POST_FRAGMENT } from './gamePosts';

export const SEARCH_USERS = gql`
  query SearchUsers($query: String!) {
    searchUsers(query: $query) {
      id
      username
      postCount
      bookmarkCount
      likesReceived
      commentCount
    }
  }
`;

export const PUBLIC_USER_PROFILE = gql`
  ${POST_FRAGMENT}
  query PublicUserProfile($id: ID!) {
    publicUserProfile(id: $id) {
      id
      username
      postCount
      bookmarkCount
      likesReceived
      commentCount
      posts { ...PostFields }
      bookmarkedPosts { ...PostFields }
    }
  }
`;
