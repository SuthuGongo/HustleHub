import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import { AuthProvider } from '../context/AuthContext';
import RegisterPage from '../pages/RegisterPage';
import { clientUser, renderApp, typeCode } from './utils';

vi.mock('../api/hustlehub');

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is just the form: one heading, no marketing panel beside it', () => {
    renderApp(<RegisterPage />, { route: '/register' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByText(/Set up in a minute/)).not.toBeInTheDocument();
  });

  it('pre-selects the account type from the landing page buttons (?role=)', () => {
    renderApp(<RegisterPage />, { route: '/register?role=freelancer' });
    expect(screen.getByRole('radio', { name: /offer services/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /want to hire/i })).not.toBeChecked();
  });

  it('defaults to client, and ignores an unknown or privileged ?role= value', () => {
    renderApp(<RegisterPage />, { route: '/register?role=admin' });
    expect(screen.getByRole('radio', { name: /want to hire/i })).toBeChecked();
  });

  it('offers only the client and freelancer roles (never admin)', () => {
    renderApp(<RegisterPage />, { route: '/register' });
    const roles = screen.getAllByRole('radio');
    expect(roles.map((r) => r.value).sort()).toEqual(['client', 'freelancer']);
  });

  it('explains password rules and blocks weak passwords', async () => {
    const user = userEvent.setup();
    const { auth } = renderApp(<RegisterPage />, { route: '/register' });

    await user.type(screen.getByLabelText('Full name'), 'Aisha Naidoo');
    await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
    await user.type(screen.getByLabelText('Password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('registers with trimmed details, then asks for the emailed code (every account starts unverified)', async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue({ status: 'verify', verifyToken: 'vt-1', maskedEmail: 'th***@example.com', devCode: '778899' });
    renderApp(<RegisterPage />, { route: '/register', auth: { register } });

    await user.click(screen.getByRole('radio', { name: /offer services/i }));
    await user.type(screen.getByLabelText('Full name'), '  Thabo Mokoena  ');
    await user.type(screen.getByLabelText('Email'), 'thabo@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(register).toHaveBeenCalledWith({ name: 'Thabo Mokoena', email: 'thabo@example.com', password: 'Passw0rdOK', role: 'freelancer' });
    expect(await screen.findByText(/th\*\*\*@example\.com/)).toBeInTheDocument();
    expect(screen.getByText('778899')).toBeInTheDocument(); // the demo code, shown since no SMTP is configured
  });

  // Uses the REAL AuthProvider, not the static `auth` override: this checks that completing
  // verification actually establishes a working session (see AuthContext.jsx's finishAuth), not just
  // that the right functions were called - a static mock context can't catch a session that was never
  // really started, which is exactly the class of bug this test exists to guard against.
  it('completes registration once the emailed code is entered, shows a success check, then lands on the right home page (real session)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.register.mockResolvedValue({ data: { requiresVerification: true, verifyToken: 'vt-1', maskedEmail: 'a***@example.com', devCode: '111111' } });
    api.verifyEmail.mockResolvedValue({ data: { user: { ...clientUser, role: 'freelancer' }, token: 'a.b.c' } });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/my-gigs" element={<p>My gigs screen</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await user.type(screen.getByLabelText('Full name'), 'Aisha Naidoo');
    await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await typeCode(user, await screen.findByRole('group', { name: 'Verification code' }), '111111');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(api.verifyEmail).toHaveBeenCalledWith('vt-1', '111111');
    // The form disappears in favour of a check and a message - not an instant jump to the next page.
    expect(await screen.findByText('Email verified!')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Verification code' })).not.toBeInTheDocument();
    expect(screen.queryByText('My gigs screen')).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(1200));
    expect(await screen.findByText('My gigs screen')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows the server\'s error if the code is wrong, without losing the verification step', async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue({ status: 'verify', verifyToken: 'vt-1', maskedEmail: 'a***@example.com' });
    const completeVerification = vi.fn().mockRejectedValue(new Error('Incorrect code. 4 attempts left.'));
    renderApp(<RegisterPage />, { route: '/register', auth: { register, completeVerification } });

    await user.type(screen.getByLabelText('Full name'), 'Aisha Naidoo');
    await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const boxes = await screen.findByRole('group', { name: 'Verification code' });
    await typeCode(user, boxes, '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('4 attempts left');
    expect(screen.getByRole('group', { name: 'Verification code' })).toBeInTheDocument(); // still on the code step
    expect(screen.queryByText('Email verified!')).not.toBeInTheDocument(); // no success shown on a wrong code
  });

  it('lets the person go back from the verification step without registering again', async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue({ status: 'verify', verifyToken: 'vt-1', maskedEmail: 'a***@example.com' });
    renderApp(<RegisterPage />, { route: '/register', auth: { register } });

    await user.type(screen.getByLabelText('Full name'), 'Aisha Naidoo');
    await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('shows a duplicate-email error from the API', async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockRejectedValue(new Error('An account with this email already exists.'));
    renderApp(<RegisterPage />, { route: '/register', auth: { register } });

    await user.type(screen.getByLabelText('Full name'), 'Aisha Naidoo');
    await user.type(screen.getByLabelText('Email'), 'aisha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
