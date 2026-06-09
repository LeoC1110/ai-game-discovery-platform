import { gql } from '@apollo/client';

export const POST_FRAGMENT = gql`
  fragment PostFields on GamePost {
    id
    postType
    title
    genre
    platform
    developer
    releaseYear
    gameType
    rating
    coverImageUrl
    gameLink
    tags
    review
    featured
    postedBy { id username }
    likesCount
    commentsCount
    bookmarksCount
    isLikedByMe
    isBookmarkedByMe
    comments { id author { id username } text createdAt likedBy likeCount }
    createdAt
    updatedAt
  }
`;

export const ALL_POSTS = gql`
  ${POST_FRAGMENT}
  query AllPosts($search: String, $genre: String, $platform: String, $tag: String, $sort: String, $postType: PostType, $limit: Int, $offset: Int) {
    allPosts(search: $search, genre: $genre, platform: $platform, tag: $tag, sort: $sort, postType: $postType, limit: $limit, offset: $offset) {
      ...PostFields
    }
  }
`;

export const PAGED_POSTS = gql`
  ${POST_FRAGMENT}
  query PagedPosts($search: String, $genre: String, $platform: String, $tag: String, $sort: String, $postType: PostType, $limit: Int, $offset: Int) {
    pagedPosts(search: $search, genre: $genre, platform: $platform, tag: $tag, sort: $sort, postType: $postType, limit: $limit, offset: $offset) {
      posts { ...PostFields }
      totalCount
    }
  }
`;

export const MY_POSTS = gql`
  ${POST_FRAGMENT}
  query MyPosts($limit: Int, $offset: Int) {
    myPosts(limit: $limit, offset: $offset) { ...PostFields }
  }
`;

export const BOOKMARKED_POSTS = gql`
  ${POST_FRAGMENT}
  query BookmarkedPosts($limit: Int, $offset: Int) {
    bookmarkedPosts(limit: $limit, offset: $offset) { ...PostFields }
  }
`;

export const PAGED_BOOKMARKS = gql`
  ${POST_FRAGMENT}
  query PagedBookmarks($limit: Int, $offset: Int) {
    pagedBookmarks(limit: $limit, offset: $offset) {
      posts { ...PostFields }
      totalCount
    }
  }
`;

export const GET_POST = gql`
  query GetPost($id: ID!) {
    getPost(id: $id) {
      id
      postType
      title
      genre
      platform
      developer
      releaseYear
      gameType
      rating
      coverImageUrl
      gameLink
      tags
      review
      postedBy { id username }
      likesCount
      commentsCount
      bookmarksCount
      isLikedByMe
      isBookmarkedByMe
      comments { id author { id username } text createdAt }
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_POST = gql`
  ${POST_FRAGMENT}
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) { ...PostFields }
  }
`;

export const DELETE_POST = gql`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`;

export const LIKE_POST = gql`
  mutation LikePost($id: ID!) {
    likePost(id: $id) {
      id likesCount isLikedByMe
    }
  }
`;

export const ADD_COMMENT = gql`
  mutation AddComment($postId: ID!, $text: String!) {
    addComment(postId: $postId, text: $text) {
      id commentsCount
      comments { id author { id username } text createdAt likedBy likeCount }
    }
  }
`;

export const TOGGLE_BOOKMARK = gql`
  mutation ToggleBookmark($postId: ID!) {
    toggleBookmark(postId: $postId) {
      id bookmarksCount isBookmarkedByMe
    }
  }
`;

export const EDIT_POST = gql`
  ${POST_FRAGMENT}
  mutation EditPost($id: ID!, $input: EditPostInput!) {
    editPost(id: $id, input: $input) { ...PostFields }
  }
`;

export const DELETE_COMMENT = gql`
  mutation DeleteComment($postId: ID!, $commentId: ID!) {
    deleteComment(postId: $postId, commentId: $commentId) {
      id commentsCount
      comments { id author { id username } text createdAt likedBy likeCount }
    }
  }
`;

export const TOGGLE_COMMENT_LIKE = gql`
  mutation ToggleCommentLike($postId: ID!, $commentId: ID!) {
    toggleCommentLike(postId: $postId, commentId: $commentId) {
      id
      comments { id author { id username } text createdAt likedBy likeCount }
    }
  }
`;

export const FEATURE_POST = gql`
  mutation FeaturePost($id: ID!, $featured: Boolean!) {
    featurePost(id: $id, featured: $featured) {
      id featured
    }
  }
`;
