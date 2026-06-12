import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, test } from 'vitest';
import VerifyEmailPage from '../screens/VerifyEmailPage';
import { SEND_EMAIL_VERIFICATION_CODE } from '../gql/sendEmailVerification';
import { VERIFY_EMAIL_CODE } from '../gql/verifyEmail';
import { renderWithProviders } from './helpers';

describe('VerifyEmailPage', () => {
  test('sends verification code', async () => {
    const email = 'verify@example.com';
    const mocks = [
      {
        request: {
          query: SEND_EMAIL_VERIFICATION_CODE,
          variables: { email },
        },
        result: {
          data: { sendEmailVerificationCode: { ok: true, demoCode: null } },
        },
      },
    ];

    renderWithProviders(<VerifyEmailPage />, {
      mocks,
      route: '/verify-email',
      path: '/verify-email',
    });

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: email },
    });
    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/if this account exists and is unverified, a verification code has been sent/i),
      ).toBeInTheDocument();
    });
  });

  test('verifies email with code', async () => {
    const email = 'verify@example.com';
    const code = '123456';
    const mocks = [
      {
        request: {
          query: VERIFY_EMAIL_CODE,
          variables: { email, code },
        },
        result: {
          data: { verifyEmailCode: true },
        },
      },
    ];

    renderWithProviders(<VerifyEmailPage />, {
      mocks,
      route: '/verify-email',
      path: '/verify-email',
    });

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: email },
    });
    fireEvent.change(screen.getByPlaceholderText('6-digit verification code'), {
      target: { value: code },
    });

    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(screen.getByText(/email verified successfully/i)).toBeInTheDocument();
    });
  });
});
