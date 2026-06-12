import { gql } from '@apollo/client';

export const SEARCH_GAMES = gql`
  query SearchGames($query: String!, $limit: Int) {
    searchGames(query: $query, limit: $limit) {
      id
      title
      titleNormalized
      genre
      platform
      developer
      releaseYear
    }
  }
`;
