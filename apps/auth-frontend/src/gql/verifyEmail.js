import { gql } from '@apollo/client';

export const VERIFY_EMAIL_CODE = gql`
  mutation VerifyEmailCode($email: String!, $code: String!) {
    verifyEmailCode(email: $email, code: $code)
  }
`;
