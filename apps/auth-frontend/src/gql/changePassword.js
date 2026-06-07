import { gql } from '@apollo/client';

export const CHANGE_PASSWORD = gql`
  mutation ChangePassword(
    $identifier: String!
    $oldPassword: String!
    $newPassword: String!
  ) {
    changePassword(
      identifier: $identifier
      oldPassword: $oldPassword
      newPassword: $newPassword
    ) {
      ok
      message
    }
  }
`;
