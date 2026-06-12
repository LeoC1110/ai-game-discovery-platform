import { gql } from '@apollo/client';

export const SEND_EMAIL_VERIFICATION_CODE = gql`
  mutation SendEmailVerificationCode($email: String!) {
    sendEmailVerificationCode(email: $email) {
      ok
      demoCode
    }
  }
`;
