import { screen, within } from '@testing-library/react';
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

// AdminPage always mounts the Overview tab first (its default), so its api.adminStats() call fires
// on every render here regardless of which tab a test then switches to.
beforeEach(() => {
  api.adminStats.mockResolvedValue(sampleAdminStats);
});

const held = (over = {}) => ({
  id: 'b1', gigTitle: 'Logo &amp; brand identity design', price: 450.5, escrowStatus: 'held',
  createdAt: '2026-09-20T10:00:00Z', client: { id: 'c1', name: 'Aisha Naidoo' }, freelancer: { id: 'f1', name: 'Thabo Mokoena' }, ...over,
});

const disputed = (over = {}) => ({
  id: 'd1', gigTitle: 'Website copy', price: 650, escrowStatus: 'disputed', disputeReason: 'The delivered copy was in the wrong language.',
  disputedAt: '2026-09-25T10:00:00Z', client: { id: 'c1', name: 'Aisha Naidoo' }, freelancer: { id: 'f2', name: 'Lerato Dlamini' }, ...over,
});

async function openTab(user, name) {
  renderApp(<AdminPage />, { user: adminUser });
  await user.click(screen.getByRole('tab', { name }));
}

describe('Admin: Active bookings (escrow)', () => {
  it('lists what is currently held, with a running total', async () => {
    const user = userEvent.setup();
    api.adminEscrow.mockResolvedValue({ data: { bookings: [held()], totalHeld: 450.5 } });
    renderApp(<AdminPage />, { user: adminUser });
    await user.click(screen.getByRole('tab', { name: 'Active bookings' }));

    const list = await screen.findByRole('list', { name: 'Active bookings' });
    expect(within(list).getByText('Logo & brand identity design')).toBeInTheDocument();
    expect(within(list).getByText('Held')).toBeInTheDocument();
    const ledger = screen.getByLabelText('Escrow totals');
    expect(within(ledger).getByText('R450.50')).toBeInTheDocument(); // the ledger total
    expect(within(ledger).getByText(/1 active booking/)).toBeInTheDocument();
  });

  it('shows an awaiting-review booking with when it auto-releases', async () => {
    const user = userEvent.setup();
    const soon = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    api.adminEscrow.mockResolvedValue({
      data: { bookings: [held({ id: 'b2', escrowStatus: 'awaiting_review', reviewDeadline: soon })], totalHeld: 450.5 },
    });
    await openTab(user, 'Active bookings');
    expect(await screen.findByText('Awaiting client review')).toBeInTheDocument();
    expect(screen.getByText(/Auto-releases in \d+ hours?/)).toBeInTheDocument();
  });

  it('has an honest empty state when nothing is held', async () => {
    const user = userEvent.setup();
    api.adminEscrow.mockResolvedValue({ data: { bookings: [], totalHeld: 0 } });
    await openTab(user, 'Active bookings');
    expect(await screen.findByRole('heading', { name: 'Nothing currently held' })).toBeInTheDocument();
  });
});

describe('Admin: Disputes', () => {
  beforeEach(() => {
    api.adminDisputes.mockResolvedValue({ data: { bookings: [disputed()] } });
  });

  it('lists a dispute with the reason and both parties', async () => {
    const user = userEvent.setup();
    await openTab(user, 'Disputes');
    const list = await screen.findByRole('list', { name: 'Disputes' });
    expect(within(list).getByText('Website copy')).toBeInTheDocument();
    expect(within(list).getByText(/wrong language/)).toBeInTheDocument();
    expect(within(list).getByText(/Aisha Naidoo vs Lerato Dlamini/)).toBeInTheDocument();
  });

  it('lets an admin release the funds to the freelancer', async () => {
    const user = userEvent.setup();
    api.adminResolveDispute.mockResolvedValue({ data: {} });
    await openTab(user, 'Disputes');
    await user.click(await screen.findByRole('button', { name: 'Release to freelancer' }));
    expect(api.adminResolveDispute).toHaveBeenCalledWith('d1', 'released');
  });

  it('lets an admin refund the client instead', async () => {
    const user = userEvent.setup();
    api.adminResolveDispute.mockResolvedValue({ data: {} });
    await openTab(user, 'Disputes');
    await user.click(await screen.findByRole('button', { name: 'Refund client' }));
    expect(api.adminResolveDispute).toHaveBeenCalledWith('d1', 'refunded');
  });

  it('shows the server error if resolving fails', async () => {
    const user = userEvent.setup();
    api.adminResolveDispute.mockRejectedValue(new Error('This booking is not currently disputed.'));
    await openTab(user, 'Disputes');
    await user.click(await screen.findByRole('button', { name: 'Release to freelancer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not currently disputed');
  });

  it('has an honest empty state with no open disputes', async () => {
    const user = userEvent.setup();
    api.adminDisputes.mockResolvedValue({ data: { bookings: [] } });
    await openTab(user, 'Disputes');
    expect(await screen.findByRole('heading', { name: 'No open disputes' })).toBeInTheDocument();
  });
});
