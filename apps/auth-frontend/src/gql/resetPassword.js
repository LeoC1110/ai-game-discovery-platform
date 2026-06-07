import { gql } from '@apollo/client';

export const RESET_PASSWORD_WITH_CODE = gql`
  mutation ResetPasswordWithCode(
    $email: String!
    $code: String!
    $newPassword: String!
    $confirmPassword: String!
  ) {
    resetPasswordWithCode(
      email: $email
      code: $code
      newPassword: $newPassword
      confirmPassword: $confirmPassword
    )
  }
`;
