import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import { request } from '../api/client';
import { AuthContext, AuthProvider, useAuth } from '../context/AuthContext';
import { tokenStore } from '../utils/tokenStore';
import DataState from '../components/DataState';
import { describeError } from '../components/ErrorPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import OfflineBanner from '../components/OfflineBanner';
import ProtectedRoute from '../components/ProtectedRoute';
import AccountDisabledPage from '../pages/AccountDisabledPage';
import BookingsPage from '../pages/BookingsPage';
import LoginPage from '../pages/LoginPage';
import MyGigsPage from '../pages/MyGigsPage';
import NotFoundPage from '../pages/NotFoundPage';
import PaymentsPage from '../pages/PaymentsPage';
import ServerErrorPage from '../pages/ServerErrorPage';
import { Where, clientUser, freelancerUser, renderApp } from './utils';

vi.mock('../api/hustlehub');

describe('404: page not found', () => {
  it('explains, offers a search, and links to the useful places', () => {
    renderApp(<NotFoundPage />, { route: '/nope', path: '*' });
    expect(screen.getByRole('heading', { level: 1, name: "We can't find that page" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Explore gigs' })).toHaveAttribute('href', '/gigs');
    expect(screen.getByRole('link', { name: 'Help centre' })).toHaveAttribute('href', '/help');
    expect(document.title).toBe('Page not found · HustleHub+');
  });

  it('lets people search from the 404 page', async () => {
    const user = userEvent.setup();
    renderApp(<><NotFoundPage /><Where /></>, { route: '/nope', path: '*', stub: false });
    await user.type(screen.getByRole('searchbox', { name: 'Search gigs' }), 'logo{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/gigs?q=logo');
  });
});

describe('login required / session ended', () => {
  const guarded = <ProtectedRoute roles={['client']}><p>Private</p></ProtectedRoute>;

  it('tells a visitor why they were sent to log in', () => {
    renderApp(<LoginPage />, { route: { pathname: '/login', state: { notice: 'login-required' } } });
    expect(screen.getByRole('status')).toHaveTextContent('Please log in to continue.');
  });

  it('tells someone whose session ended that it ended', () => {
    renderApp(<LoginPage />, { route: { pathname: '/login', state: { notice: 'expired' } } });
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended, so please log in again.');
  });

  it('shows no notice when someone simply opens the login page', () => {
    renderApp(<LoginPage />, { route: '/login' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  function ShowState() {
    const l = useLocation();
    return <p data-testid="state">{JSON.stringify(l.state)}</p>;
  }
  const guardedApp = (auth) =>
    render(
      <AuthContext.Provider value={{ user: null, initialising: false, ...auth }}>
        <MemoryRouter initialEntries={['/bookings']}>
          <Routes>
            <Route path="/bookings" element={guarded} />
            <Route path="/login" element={<ShowState />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

  it('sends a visitor to login with the reason "login-required", remembering where they were going', () => {
    guardedApp({});
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({ from: '/bookings', notice: 'login-required' });
  });

  it('uses the reason "expired" when a signed-in session was rejected', () => {
    guardedApp({ sessionEnded: true });
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({ from: '/bookings', notice: 'expired' });
  });

  it('really flips the flag: a 401 on a request that carried a token ends the session', async () => {
    tokenStore.set('a.b.c');
    api.getMe.mockResolvedValue({ data: { user: clientUser } });
    function Probe() {
      const { user, sessionEnded } = useAuth();
      return <p data-testid="probe">{`${user ? 'in' : 'out'}|${sessionEnded ? 'ended' : 'fine'}`}</p>;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await screen.findByText('in|fine')).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'Invalid or expired token.' }) }));
    await act(async () => {
      await request('/gigs/mine').catch(() => {});
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('out|ended');
    vi.unstubAllGlobals();
  });
});

describe('account disabled', () => {
  it('has its own page with a way to get help', () => {
    renderApp(<AccountDisabledPage />, { route: '/account-disabled' });
    expect(screen.getByRole('heading', { level: 1, name: 'This account has been disabled' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact the team' })).toHaveAttribute('href', '/contact?topic=account');
  });

  it('is where a disabled person lands after trying to log in', async () => {
    const user = userEvent.setup();
    const disabled = Object.assign(new Error('This account has been disabled. Please contact support.'), { status: 403 });
    renderApp(<><LoginPage /><Where /></>, { route: '/login', path: '*', stub: false, auth: { login: vi.fn().mockRejectedValue(disabled) } });
    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/account-disabled');
  });

  it('keeps a wrong-password message on the login page (that is not a disabled account)', async () => {
    const user = userEvent.setup();
    const wrong = Object.assign(new Error('Invalid email or password.'), { status: 401 });
    renderApp(<><LoginPage /><Where /></>, { route: '/login', path: '*', stub: false, auth: { login: vi.fn().mockRejectedValue(wrong) } });
    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });
});

describe('500: the page crashed', () => {
  function Boom() {
    throw new Error('kaboom: secret internal detail');
  }

  it('shows a calm page instead of a blank screen, and leaks nothing technical', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <ErrorBoundary resetKey="a" fallback={<ServerErrorPage />}>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(document.body.textContent).not.toMatch(/kaboom|secret internal detail/);
    expect(screen.getByRole('link', { name: 'tell the team' })).toHaveAttribute('href', '/contact?topic=bug');
  });

  it('recovers when the person navigates somewhere else', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let crash = true;
    function Maybe() {
      if (crash) throw new Error('boom');
      return <p>All fine</p>;
    }
    const tree = (key) => (
      <MemoryRouter>
        <ErrorBoundary resetKey={key} fallback={<p>Crashed</p>}>
          <Maybe />
        </ErrorBoundary>
      </MemoryRouter>
    );
    const { rerender } = render(tree('/a'));
    expect(screen.getByText('Crashed')).toBeInTheDocument();
    crash = false;
    rerender(tree('/b'));
    expect(screen.getByText('All fine')).toBeInTheDocument();
  });
});

describe('data that cannot be loaded', () => {
  it.each([
    [0, "We can't reach the server", /internet connection/i],
    [429, 'Too many requests', /try again in 5 minutes/i],
    [500, 'Something went wrong on our side', /not your fault/i],
    [503, 'Something went wrong on our side', /not your fault/i],
    [400, "We couldn't load this", /custom message/i],
  ])('status %s gets its own wording', (status, title, text) => {
    render(<DataState error={status === 429 ? 'Please try again in 5 minutes.' : 'custom message'} errorStatus={status} />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('always offers Try again when it can, and calls it', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<DataState error="x" errorStatus={0} onRetry={retry} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button when nothing can be retried', () => {
    render(<DataState error="x" errorStatus={500} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('never turns an unknown status into a misleading title', () => {
    expect(describeError('Boom', undefined).title).toBe("We couldn't load this");
    expect(describeError('Boom', null).title).toBe("We couldn't load this");
  });

  it('retries a real page: a payments list that failed loads on the second try', async () => {
    const user = userEvent.setup();
    api.listTransactions.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 502 })).mockResolvedValueOnce({ data: { transactions: [] } });
    renderApp(<PaymentsPage />, { user: clientUser });
    expect(await screen.findByRole('heading', { name: 'Something went wrong on our side' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'No payments yet' })).toBeInTheDocument();
  });
});

describe('offline', () => {
  beforeEach(() => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true));

  it('shows a banner when the connection drops, and removes it when it returns', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent(/you're offline/i);
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is already showing if the page loads while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('empty lists point to the next step', () => {
  it('bookings (client) -> explore gigs', async () => {
    api.listBookings.mockResolvedValue({ data: { bookings: [] } });
    renderApp(<BookingsPage />, { user: clientUser });
    expect(await screen.findByRole('link', { name: 'Explore gigs' })).toHaveAttribute('href', '/gigs');
  });

  it('bookings (freelancer) -> manage my gigs', async () => {
    api.listBookings.mockResolvedValue({ data: { bookings: [] } });
    renderApp(<BookingsPage />, { user: freelancerUser });
    expect(await screen.findByRole('link', { name: 'Manage my gigs' })).toHaveAttribute('href', '/my-gigs');
  });

  it('payments -> explore gigs', async () => {
    api.listTransactions.mockResolvedValue({ data: { transactions: [] } });
    renderApp(<PaymentsPage />, { user: clientUser });
    expect(await screen.findByRole('link', { name: 'Explore gigs' })).toHaveAttribute('href', '/gigs');
  });

  it('my gigs -> a button that opens the new-gig form', async () => {
    const user = userEvent.setup();
    api.listMyGigs.mockResolvedValue({ data: { gigs: [] } });
    renderApp(<MyGigsPage />, { user: freelancerUser });
    await user.click(await screen.findByRole('button', { name: 'Create your first gig' }));
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });
});
