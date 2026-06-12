// src/gql/login.js
import { gql } from '@apollo/client';

export const LOGIN = gql`
  mutation Login($identifier: String!, $password: String!) {
    login(identifier: $identifier, password: $password) {
      ok
      message
      token
      user { id username email emailVerified emailVerifiedAt }
    }
  }
`;
