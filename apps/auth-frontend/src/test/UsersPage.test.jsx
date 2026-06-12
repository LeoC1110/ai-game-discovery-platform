import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, test } from 'vitest';
import UsersPage from '../screens/UsersPage';
import { SEARCH_USERS, TOGGLE_FOLLOW_USER } from '../gql/users';
import { renderWithProviders } from './helpers';
import { gql } from '@apollo/client';

const ME_QUERY = gql`query MeUsersPage { me { id } }`;

describe('UsersPage', () => {
  test('shows Follow on search results and toggles to Unfollow', async () => {
    const mocks = [
      {
        request: { query: ME_QUERY },
        result: { data: { me: { id: 'me-1' } } },
      },
      {
        request: {
          query: SEARCH_USERS,
          variables: { query: 'target' },
        },
        result: {
          data: {
            searchUsers: [
              {
                id: 'user-2',
                username: 'targetUser',
                postCount: 2,
                bookmarkCount: 1,
                likesReceived: 4,
                commentCount: 3,
                followerCount: 0,
                followingCount: 1,
                isFollowedByMe: false,
              },
            ],
          },
        },
      },
      {
        request: {
          query: TOGGLE_FOLLOW_USER,
          variables: { userId: 'user-2' },
        },
        result: {
          data: {
            toggleFollowUser: {
              id: 'user-2',
              username: 'targetUser',
              postCount: 2,
              bookmarkCount: 1,
              likesReceived: 4,
              commentCount: 3,
              followerCount: 1,
              followingCount: 1,
              isFollowedByMe: true,
              posts: [],
              bookmarkedPosts: [],
            },
          },
        },
      },
    ];

    renderWithProviders(<UsersPage />, { mocks, route: '/users', path: '/users' });

    fireEvent.change(screen.getByPlaceholderText(/search by username or user id/i), {
      target: { value: 'target' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('targetUser')).toBeInTheDocument();
      expect(screen.getByText('Followers: 0')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unfollow' })).toBeInTheDocument();
    });
  });
});
