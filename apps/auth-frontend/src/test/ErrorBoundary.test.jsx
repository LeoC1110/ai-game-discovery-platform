import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

function CrashComponent() {
  throw new Error('Boom from child component');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows fallback UI when a child component crashes', () => {
    render(
      <ErrorBoundary isDevOverride={false}>
        <CrashComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('Please refresh the page or return home.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeInTheDocument();
  });

  test('does not show error details in production mode', () => {
    render(
      <ErrorBoundary isDevOverride={false}>
        <CrashComponent />
      </ErrorBoundary>,
    );

    expect(screen.queryByText('Error details (development only)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Boom from child component/i)).not.toBeInTheDocument();
  });

  test('shows error details in development mode', () => {
    render(
      <ErrorBoundary isDevOverride>
        <CrashComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Error details (development only)')).toBeInTheDocument();
    expect(screen.getByText(/Boom from child component/i)).toBeInTheDocument();
  });
});
