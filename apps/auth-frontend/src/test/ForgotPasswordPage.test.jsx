import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ForgotPasswordPage from '../screens/ForgotPasswordPage';
import { SEND_PASSWORD_RESET_CODE } from '../gql/forgotPassword';
import { RESET_PASSWORD_WITH_CODE } from '../gql/resetPassword';
import { renderWithProviders } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ForgotPasswordPage', () => {
  test('sends verification code and starts 60s resend countdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T00:00:00.000Z'));

    const email = 'test@example.com';
    const mocks = [
      {
        request: {
          query: SEND_PASSWORD_RESET_CODE,
          variables: { email },
        },
        result: {
          data: { sendPasswordResetCode: true },
        },
      },
    ];

    renderWithProviders(<ForgotPasswordPage />, {
      mocks,
      route: '/forgot-password',
      path: '/forgot-password',
    });

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: email },
    });

    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(
      screen.getByText(/if this email exists, a verification code has been sent/i),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /resend in 60s/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(61000);
    });

    expect(screen.getByRole('button', { name: /send verification code/i })).toBeEnabled();
  });

  test('resets password successfully after entering code and new password', async () => {
    const email = 'test@example.com';
    const code = '123456';
    const newPassword = 'new-pass-123';

    const mocks = [
      {
        request: {
          query: SEND_PASSWORD_RESET_CODE,
          variables: { email },
        },
        result: {
          data: { sendPasswordResetCode: true },
        },
      },
      {
        request: {
          query: RESET_PASSWORD_WITH_CODE,
          variables: {
            email,
            code,
            newPassword,
            confirmPassword: newPassword,
          },
        },
        result: {
          data: { resetPasswordWithCode: true },
        },
      },
    ];

    renderWithProviders(<ForgotPasswordPage />, {
      mocks,
      route: '/forgot-password',
      path: '/forgot-password',
    });

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: email },
    });

    fireEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/if this email exists, a verification code has been sent/i),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('6-digit verification code'), {
      target: { value: code },
    });
    fireEvent.change(screen.getByPlaceholderText('New password'), {
      target: { value: newPassword },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: newPassword },
    });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/your password has been reset successfully/i),
      ).toBeInTheDocument();
    });
  });
});
