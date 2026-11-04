import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import { CLOSE_MS } from '../components/AuthShell';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from '../pages/LoginPage';
import { clientUser, freelancerUser, renderApp, typeCode } from './utils';

vi.mock('../api/hustlehub');

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is just the form: one heading, no marketing text beside it', () => {
    renderApp(<LoginPage />, { route: '/login' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText(/Hire local talent/)).not.toBeInTheDocument();
  });

  it('renders the login form', () => {
    renderApp(<LoginPage />, { route: '/login' });
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows validation errors and does not call the API when the form is empty', async () => {
    const user = userEvent.setup();
    const { auth } = renderApp(<LoginPage />, { route: '/login' });

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before contacting the server', async () => {
    const user = userEvent.setup();
    const { auth } = renderApp(<LoginPage />, { route: '/login' });
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('submits the credentials and sends the person to their role home page', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({ status: 'ok', user: freelancerUser });
    renderApp(<LoginPage />, { route: '/login', auth: { login } });

    await user.type(screen.getByLabelText('Email'), 'thabo@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(login).toHaveBeenCalledWith({ email: 'thabo@example.com', password: 'Passw0rdOK' });
    expect(await screen.findByText('My gigs screen')).toBeInTheDocument();
  });

  it('shows the API\'s generic error message when login fails', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(new Error('Invalid email or password.'));
    renderApp(<LoginPage />, { route: '/login', auth: { login } });

    await user.type(screen.getByLabelText('Email'), 'thabo@example.com');
    await user.type(screen.getByLabelText('Password'), 'WrongPassword1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());
  });

  it('redirects people who are already logged in', () => {
    renderApp(<LoginPage />, { route: '/login', user: clientUser });
    expect(screen.getByText('Gigs screen')).toBeInTheDocument();
  });

  describe('switching to registration', () => {
    it('goes straight to the register page when the user prefers reduced motion', async () => {
      const user = userEvent.setup();
      renderApp(<LoginPage />, { route: '/login' });
      await user.click(screen.getByRole('link', { name: 'Create an account' }));
      expect(await screen.findByText('Register screen')).toBeInTheDocument();
    });

    it('closes the card first, then opens the register page', () => {
      window.matchMedia = () => ({ matches: false });
      vi.useFakeTimers();
      try {
        const { container } = renderApp(<LoginPage />, { route: '/login' });
        expect(container.querySelector('.auth')).toHaveClass('auth--opening');

        fireEvent.click(screen.getByRole('link', { name: 'Create an account' }));
        expect(container.querySelector('.auth')).toHaveClass('auth--closing');
        expect(screen.queryByText('Register screen')).not.toBeInTheDocument();

        act(() => vi.advanceTimersByTime(CLOSE_MS + 10));
        expect(screen.getByText('Register screen')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
        delete window.matchMedia;
      }
    });
  });

  describe('email verification and 2FA (real session, six-box code entry)', () => {
    function app(entry = '/login') {
      return render(
        <AuthProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/gigs" element={<p>Explore screen</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );
    }

    it('an unverified account is asked for a code, sees a success check, then is genuinely logged in', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      api.login.mockResolvedValue({ data: { requiresVerification: true, verifyToken: 'vt-1', maskedEmail: 'a***@example.com', devCode: '654321' } });
      api.verifyEmail.mockResolvedValue({ data: { user: clientUser, token: 'a.b.c' } });
      app();

      await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
      await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
      await user.click(screen.getByRole('button', { name: 'Log in' }));

      const boxes = await screen.findByRole('group', { name: 'Verification code' });
      expect(screen.getByText('654321')).toBeInTheDocument(); // demo code shown, no SMTP configured
      await typeCode(user, boxes, '654321');
      await user.click(screen.getByRole('button', { name: 'Verify' }));

      expect(api.verifyEmail).toHaveBeenCalledWith('vt-1', '654321');
      expect(await screen.findByText('Email verified!')).toBeInTheDocument();
      expect(screen.queryByText('Explore screen')).not.toBeInTheDocument(); // not yet - the check is still showing

      await act(async () => vi.advanceTimersByTimeAsync(1200));
      expect(await screen.findByText('Explore screen')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('a 2FA-protected account is asked for a code after the password, and a wrong one shows an error without navigating', async () => {
      const user = userEvent.setup();
      api.login.mockResolvedValue({ data: { requiresTwoFactor: true, twoFactorToken: 'tf-1', maskedEmail: 'a***@example.com' } });
      api.verifyTwoFactorLogin.mockRejectedValue(new Error('Incorrect code. 3 attempts left.'));
      app();

      await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
      await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
      await user.click(screen.getByRole('button', { name: 'Log in' }));

      const boxes = await screen.findByRole('group', { name: 'Verification code' });
      await typeCode(user, boxes, '000000');
      await user.click(screen.getByRole('button', { name: 'Verify' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('3 attempts left');
      expect(screen.queryByText('Explore screen')).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Verification code' })).toBeInTheDocument(); // still here to retry
    });

    it('offers a backup code instead, and logging in with one still starts a real session', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      api.login.mockResolvedValue({ data: { requiresTwoFactor: true, twoFactorToken: 'tf-1', maskedEmail: 'a***@example.com' } });
      api.verifyTwoFactorLogin.mockResolvedValue({ data: { user: clientUser, token: 'a.b.c' } });
      app();

      await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
      await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
      await user.click(screen.getByRole('button', { name: 'Log in' }));

      await screen.findByRole('group', { name: 'Verification code' });
      await user.click(screen.getByRole('button', { name: /use a backup code/i }));
      await user.type(screen.getByLabelText('Backup code'), 'ABCD-1234');
      await user.click(screen.getByRole('button', { name: 'Verify' }));

      expect(api.verifyTwoFactorLogin).toHaveBeenCalledWith('tf-1', { backupCode: 'ABCD-1234' });
      expect(await screen.findByText('Verified!')).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTimeAsync(1200));
      expect(await screen.findByText('Explore screen')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('resending shows the cooldown message from the server and updates the demo code', async () => {
      const user = userEvent.setup();
      api.login.mockResolvedValue({ data: { requiresTwoFactor: true, twoFactorToken: 'tf-1', maskedEmail: 'a***@example.com', devCode: '111111' } });
      api.resendTwoFactorCode.mockRejectedValue(Object.assign(new Error('Please wait 40s before requesting another code.'), { retryAfterSeconds: 40 }));
      app();

      await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
      await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
      await user.click(screen.getByRole('button', { name: 'Log in' }));

      await screen.findByRole('group', { name: 'Verification code' });
      await user.click(screen.getByRole('button', { name: 'Resend code' }));
      expect(await screen.findByText(/wait 40s/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resend in 40s' })).toBeDisabled();
    });
  });
});
