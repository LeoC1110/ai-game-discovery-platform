import { gql } from '@apollo/client';

export const SEND_PASSWORD_RESET_CODE = gql`
  mutation SendPasswordResetCode($email: String!) {
    sendPasswordResetCode(email: $email) {
      ok
      demoCode
    }
  }
`;
