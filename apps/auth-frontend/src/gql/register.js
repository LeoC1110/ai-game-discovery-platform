// src/gql/register.js
import { gql } from '@apollo/client';

export const REGISTER_USER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      ok
      message
      token
      user { id username email emailVerified emailVerifiedAt }
    }
  }
`;
