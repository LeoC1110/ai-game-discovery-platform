// src/test/helpers.jsx — shared test utilities
import React from 'react';
import { render } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Render a component wrapped in Apollo MockedProvider + MemoryRouter.
 */
export function renderWithProviders(ui, { mocks = [], route = '/', path = '*' } = {}) {
  return render(
      <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}
