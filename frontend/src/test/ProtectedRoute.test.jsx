import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ProtectedRoute from '../components/ProtectedRoute';
import { adminUser, clientUser, freelancerUser, renderApp } from './utils';

const secret = <ProtectedRoute roles={['freelancer']}><p>Freelancer dashboard</p></ProtectedRoute>;

describe('ProtectedRoute (role-based UI access)', () => {
  it('sends anonymous visitors to the login page', () => {
    renderApp(secret, { route: '/my-gigs' });
    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Freelancer dashboard')).not.toBeInTheDocument();
  });

  it('shows the page to a user with an allowed role', () => {
    renderApp(secret, { route: '/my-gigs', user: freelancerUser });
    expect(screen.getByText('Freelancer dashboard')).toBeInTheDocument();
  });

  it.each([
    ['client', clientUser, '/gigs'],
    ['admin', adminUser, '/admin'],
  ])('blocks a %s from a freelancer-only page and offers a way home', (_name, user, home) => {
    renderApp(secret, { route: '/my-gigs', user });
    expect(screen.queryByText('Freelancer dashboard')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /different account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to my home page/i })).toHaveAttribute('href', home);
  });

  it('says which account type the page is for, and which one you have', () => {
    renderApp(secret, { route: '/my-gigs', user: clientUser });
    expect(screen.getByText(/only for freelancer accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/you're signed in as a client/i)).toBeInTheDocument();
  });

  it('lets you log out to use a different account from the access-denied page', async () => {
    const user = userEvent.setup();
    const { auth } = renderApp(secret, { route: '/my-gigs', user: clientUser });
    await user.click(screen.getByRole('button', { name: /log in with a different account/i }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('waits for the session check instead of flashing the login page', () => {
    renderApp(secret, { route: '/my-gigs', initialising: true });
    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
  });
});
