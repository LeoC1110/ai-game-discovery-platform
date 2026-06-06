// src/gql/forgotPassword.js
import { gql } from '@apollo/client';

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      ok
      message
      resetToken
    }
  }
`;
