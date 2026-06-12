import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, test } from 'vitest';
import { gql } from '@apollo/client';
import UserProfilePage from '../screens/UserProfilePage';
import { PUBLIC_USER_PROFILE } from '../gql/users';
import { renderWithProviders } from './helpers';

const ME_QUERY = gql`query MeUserProfile { me { id } }`;

describe('UserProfilePage', () => {
  test('renders target profile and follow entry', async () => {
    const initialProfile = {
      id: 'user-2',
      username: 'targetUser',
      postCount: 1,
      bookmarkCount: 2,
      likesReceived: 3,
      commentCount: 4,
      followerCount: 0,
      followingCount: 1,
      isFollowedByMe: false,
      posts: [],
      bookmarkedPosts: [],
    };

    const mocks = [
      {
        request: { query: ME_QUERY },
        result: { data: { me: { id: 'me-1' } } },
      },
      {
        request: {
          query: PUBLIC_USER_PROFILE,
          variables: { id: 'user-2' },
        },
        result: { data: { publicUserProfile: initialProfile } },
      },
    ];

    renderWithProviders(<UserProfilePage />, {
      mocks,
      route: '/users/user-2',
      path: '/users/:id',
    });

    await waitFor(() => {
      expect(screen.getByText('targetUser')).toBeInTheDocument();
      expect(screen.getByText(/viewing target user profile/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
      expect(screen.getByText('Followers')).toBeInTheDocument();
    });
  });
});
