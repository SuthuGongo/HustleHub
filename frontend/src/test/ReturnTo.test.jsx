import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import ProtectedRoute from '../components/ProtectedRoute';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';

vi.mock('../api/hustlehub');

// These use the REAL AuthProvider: the bug they guard against only appears when the user state actually changes.
const client = { id: 'c1', name: 'Aisha Naidoo', email: 'aisha@example.com', role: 'client' };
const session = { data: { user: client, token: 'a.b.c' } };

function app(entry) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/gigs" element={<p>Explore screen</p>} />
          <Route path="/gigs/:id" element={<p>The gig page</p>} />
          <Route path="/bookings" element={<ProtectedRoute roles={['client']}><p>Bookings screen</p></ProtectedRoute>} />
          <Route path="/my-gigs" element={<ProtectedRoute roles={['freelancer']}><p>My gigs screen</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

async function fillLogin(user) {
  await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
  await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('returning people to where they were', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    api.login.mockResolvedValue(session);
    api.register.mockResolvedValue(session);
  });

  it('after "Log in to book", brings the client back to the gig they were viewing', async () => {
    const user = userEvent.setup();
    app({ pathname: '/login', state: { from: '/gigs/g1' } });
    await fillLogin(user);
    expect(await screen.findByText('The gig page')).toBeInTheDocument();
  });

  it('after registering from a gig page, also returns to that gig', async () => {
    const user = userEvent.setup();
    api.register.mockResolvedValue(session);
    app({ pathname: '/register', state: { from: '/gigs/g1' } });
    await user.type(screen.getByLabelText('Full name'), 'Aisha Naidoo');
    await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('The gig page')).toBeInTheDocument();
  });

  it('after being bounced from a protected page, returns there once logged in', async () => {
    const user = userEvent.setup();
    app('/bookings'); // not logged in: ProtectedRoute sends us to /login and remembers /bookings
    await fillLogin(user);
    expect(await screen.findByText('Bookings screen')).toBeInTheDocument();
  });

  it('with nowhere to return to, goes to the role\'s home page', async () => {
    const user = userEvent.setup();
    app('/login');
    await fillLogin(user);
    expect(await screen.findByText('Explore screen')).toBeInTheDocument();
  });

  // Regression: on a shared browser, a freelancer's expired session on /my-gigs left `from` pointing
  // there. A client then logging in on that same tab must NOT be bounced into that freelancer-only
  // page (and its "wrong account type" 403) - they should land on their own home page instead.
  it('ignores a remembered path from a DIFFERENT role and goes home instead', async () => {
    const user = userEvent.setup();
    app({ pathname: '/login', state: { from: '/my-gigs' } });
    await fillLogin(user);
    expect(await screen.findByText('Explore screen')).toBeInTheDocument();
  });
});
