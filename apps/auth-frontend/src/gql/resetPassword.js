// src/gql/resetPassword.js
import { gql } from '@apollo/client';

export const RESET_PASSWORD = gql`
  mutation ResetPassword($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword) {
      ok
      message
      token
      user { id username email }
    }
  }
`;
