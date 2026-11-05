import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import AdminPage from '../pages/AdminPage';
import { adminUser, renderApp, sampleAdminStats } from './utils';

vi.mock('../api/hustlehub');
vi.mock('../context/ChatContext', async () => {
  const actual = await vi.importActual('../context/ChatContext');
  return { ...actual, useChat: vi.fn(() => ({ supportUnread: 0 })) };
});

const hash = (c) => c.repeat(64);
const entries = [
  { seq: 2, at: '2026-11-05T10:00:00Z', event: 'funds.released', bookingId: 'b1', actorId: 'c1', amount: 450.5, note: 'released by the client', hash: hash('b'), prevHash: hash('a') },
  { seq: 1, at: '2026-11-05T09:00:00Z', event: 'booking.paid', bookingId: 'b1', actorId: 'c1', amount: 450.5, note: 'held in escrow', hash: hash('a'), prevHash: '0'.repeat(64) },
];

async function openAudit(user) {
  renderApp(<AdminPage />, { user: adminUser });
  await user.click(await screen.findByRole('tab', { name: 'Audit trail' }));
}

describe('Admin audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.adminStats.mockResolvedValue(sampleAdminStats);
  });

  it('lists the money events with plain labels, amounts and shortened hashes', async () => {
    const user = userEvent.setup();
    api.adminAudit.mockResolvedValue({ data: { entries } });
    await openAudit(user);
    const list = await screen.findByRole('list', { name: 'Audit trail entries' });
    expect(list).toHaveTextContent('#2 Funds released');
    expect(list).toHaveTextContent('#1 Payment held in escrow');
    expect(list).toHaveTextContent('R450.50');
    expect(list).toHaveTextContent(`hash ${'b'.repeat(12)}… follows ${'a'.repeat(12)}…`);
  });

  it('says so when nothing has been recorded yet', async () => {
    const user = userEvent.setup();
    api.adminAudit.mockResolvedValue({ data: { entries: [] } });
    await openAudit(user);
    expect(await screen.findByText('Nothing recorded yet')).toBeInTheDocument();
  });

  it('Verify integrity reports an intact chain', async () => {
    const user = userEvent.setup();
    api.adminAudit.mockResolvedValue({ data: { entries } });
    api.adminVerifyAudit.mockResolvedValue({ data: { ok: true, checked: 2, headHash: hash('b') } });
    await openAudit(user);
    await user.click(await screen.findByRole('button', { name: 'Verify integrity' }));
    expect(await screen.findByText(/Chain intact\. 2 entries checked/)).toBeInTheDocument();
  });

  it('Verify integrity shows where a broken chain stopped being trustworthy', async () => {
    const user = userEvent.setup();
    api.adminAudit.mockResolvedValue({ data: { entries } });
    api.adminVerifyAudit.mockResolvedValue({ data: { ok: false, checked: 1, brokenAtSeq: 2, reason: 'its contents were changed after it was written' } });
    await openAudit(user);
    await user.click(await screen.findByRole('button', { name: 'Verify integrity' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chain broken at entry 2: its contents were changed after it was written.');
    expect(alert).toHaveTextContent('1 earlier entry is still intact');
  });

  it('shows the server message if the check itself fails', async () => {
    const user = userEvent.setup();
    api.adminAudit.mockResolvedValue({ data: { entries } });
    api.adminVerifyAudit.mockRejectedValue(new Error('Something went wrong.'));
    await openAudit(user);
    await user.click(await screen.findByRole('button', { name: 'Verify integrity' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
  });
});
