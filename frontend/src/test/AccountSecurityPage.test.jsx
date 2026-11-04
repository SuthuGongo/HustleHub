import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import AccountSecurityPage from '../pages/AccountSecurityPage';
import { clientUser, renderApp, typeCode } from './utils';

vi.mock('../api/hustlehub');

const mount = () => renderApp(<AccountSecurityPage />, { user: clientUser });

describe('AccountSecurityPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the off state and lets you start turning 2FA on', async () => {
    api.twoFactorStatus.mockResolvedValue({ data: { twoFactorEnabled: false } });
    mount();
    expect(await screen.findByRole('button', { name: 'Turn on two-factor authentication' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off two-factor authentication' })).not.toBeInTheDocument();
  });

  it('walks through enabling: request code -> six-box confirm -> success check -> backup codes shown once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.twoFactorStatus.mockResolvedValue({ data: { twoFactorEnabled: false } });
    api.requestEnableTwoFactor.mockResolvedValue({ data: { maskedEmail: 'a***@example.com', devCode: '246810' } });
    api.confirmEnableTwoFactor.mockResolvedValue({
      data: { backupCodes: ['AAAA-1111', 'BBBB-2222', 'CCCC-3333', 'DDDD-4444', 'EEEE-5555', 'FFFF-6666', 'GGGG-7777', 'HHHH-8888'] },
    });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }));
    const boxes = await screen.findByRole('group', { name: 'Verification code' });
    expect(screen.getByText('246810')).toBeInTheDocument();
    await typeCode(user, boxes, '246810');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(api.confirmEnableTwoFactor).toHaveBeenCalledWith('246810');
    // The check shows first; the backup codes are not dumped straight onto the screen behind it.
    expect(await screen.findByText('Two-factor authentication is on!')).toBeInTheDocument();
    expect(screen.queryByText('AAAA-1111')).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(1200));
    expect(await screen.findByText('AAAA-1111')).toBeInTheDocument();
    expect(screen.getByText('HHHH-8888')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('a wrong confirmation code keeps you on the code step, with no success shown', async () => {
    const user = userEvent.setup();
    api.twoFactorStatus.mockResolvedValue({ data: { twoFactorEnabled: false } });
    api.requestEnableTwoFactor.mockResolvedValue({ data: { maskedEmail: 'a***@example.com' } });
    api.confirmEnableTwoFactor.mockRejectedValue(new Error('Incorrect code. 4 attempts left.'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }));
    const boxes = await screen.findByRole('group', { name: 'Verification code' });
    await typeCode(user, boxes, '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('4 attempts left');
    expect(screen.queryByText('Two-factor authentication is on!')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Verification code' })).toBeInTheDocument();
  });

  it('finishing "I\'ve saved these codes" refreshes the status to on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.twoFactorStatus.mockResolvedValueOnce({ data: { twoFactorEnabled: false } }).mockResolvedValueOnce({ data: { twoFactorEnabled: true } });
    api.requestEnableTwoFactor.mockResolvedValue({ data: { devCode: '111111' } });
    api.confirmEnableTwoFactor.mockResolvedValue({ data: { backupCodes: ['AAAA-1111'] } });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }));
    await typeCode(user, await screen.findByRole('group', { name: 'Verification code' }), '111111');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await act(async () => vi.advanceTimersByTimeAsync(1200));

    await user.click(await screen.findByRole('button', { name: "I've saved these codes" }));
    expect(await screen.findByRole('button', { name: 'Turn off two-factor authentication' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows the on state, and disabling asks for the password', async () => {
    const user = userEvent.setup();
    api.twoFactorStatus.mockResolvedValue({ data: { twoFactorEnabled: true } });
    api.disableTwoFactor.mockResolvedValue({ data: {} });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Turn off two-factor authentication' }));
    await user.type(screen.getByLabelText('Password'), 'Passw0rdOK');
    await user.click(screen.getByRole('button', { name: 'Turn off two-factor authentication' }));

    expect(api.disableTwoFactor).toHaveBeenCalledWith('Passw0rdOK');
  });

  it('shows the server error if the password is wrong when disabling', async () => {
    const user = userEvent.setup();
    api.twoFactorStatus.mockResolvedValue({ data: { twoFactorEnabled: true } });
    api.disableTwoFactor.mockRejectedValue(new Error('Incorrect password.'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'Turn off two-factor authentication' }));
    await user.type(screen.getByLabelText('Password'), 'WrongPass1');
    await user.click(screen.getByRole('button', { name: 'Turn off two-factor authentication' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.');
  });

  it('offers Try again if the status cannot be loaded', async () => {
    const user = userEvent.setup();
    api.twoFactorStatus.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 })).mockResolvedValueOnce({ data: { twoFactorEnabled: false } });
    mount();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Turn on two-factor authentication' })).toBeInTheDocument();
  });
});
