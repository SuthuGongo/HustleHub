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

async function openTab(user, label) {
  renderApp(<AdminPage />, { user: adminUser });
  await user.click(await screen.findByRole('tab', { name: label }));
}

beforeEach(() => {
  api.adminStats.mockResolvedValue(sampleAdminStats);
});

describe('Admin search: Users', () => {
  const users = [
    { id: 'u1', name: 'Sipho Nkosi', email: 'sipho@example.com', role: 'freelancer', isActive: true, createdAt: '2026-09-20T10:00:00Z' },
    { id: 'u2', name: 'Aisha Naidoo', email: 'aisha@example.com', role: 'client', isActive: true, createdAt: '2026-09-21T10:00:00Z' },
  ];

  it('filters live by name, email or role, and shows a result count', async () => {
    const user = userEvent.setup();
    api.adminUsers.mockResolvedValue({ data: { users } });
    await openTab(user, 'Users');
    const list = await screen.findByRole('list', { name: 'Users' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    await user.type(screen.getByLabelText('Search users'), 'Sipho');
    expect(await screen.findByText('1 result for "Sipho"')).toBeInTheDocument();
    expect(within(list).getByText('Sipho Nkosi')).toBeInTheDocument();
    expect(within(list).queryByText('Aisha Naidoo')).not.toBeInTheDocument();
  });

  it('matches by role too, and shows an honest "no match" message', async () => {
    const user = userEvent.setup();
    api.adminUsers.mockResolvedValue({ data: { users } });
    await openTab(user, 'Users');
    await screen.findByText('Sipho Nkosi');
    await user.type(screen.getByLabelText('Search users'), 'client');
    expect(await screen.findByText('1 result for "client"')).toBeInTheDocument();
    expect(screen.getByText('Aisha Naidoo')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search users'));
    await user.type(screen.getByLabelText('Search users'), 'nobody here');
    expect(await screen.findByText('No users match "nobody here".')).toBeInTheDocument();
  });
});

describe('Admin search: Gigs', () => {
  it('filters by title or freelancer name', async () => {
    const user = userEvent.setup();
    api.adminGigs.mockResolvedValue({
      data: {
        gigs: [
          { id: 'g1', title: 'Logo design', price: 650, isActive: true, freelancer: { name: 'Lerato Dlamini' } },
          { id: 'g2', title: 'Website copy', price: 900, isActive: true, freelancer: { name: 'Sipho Nkosi' } },
        ],
      },
    });
    await openTab(user, 'Gigs');
    await screen.findByText('Logo design');
    await user.type(screen.getByLabelText('Search gigs'), 'Sipho');
    expect(await screen.findByText('1 result for "Sipho"')).toBeInTheDocument();
    expect(screen.getByText('Website copy')).toBeInTheDocument();
    expect(screen.queryByText('Logo design')).not.toBeInTheDocument();
  });
});

describe('Admin search: Transactions', () => {
  it('filters by reference, gig, client or freelancer', async () => {
    const user = userEvent.setup();
    api.adminTransactions.mockResolvedValue({
      data: {
        transactions: [
          { id: 't1', gigTitle: 'Logo design', amount: 650, reference: 'TXN-AAAA1111', createdAt: '2026-09-24T10:00:00Z', client: { name: 'Ruan Botha' }, freelancer: { name: 'Lerato Dlamini' } },
          { id: 't2', gigTitle: 'Website copy', amount: 900, reference: 'TXN-BBBB2222', createdAt: '2026-09-24T11:00:00Z', client: { name: 'Zanele Mthembu' }, freelancer: { name: 'Sipho Nkosi' } },
        ],
      },
    });
    await openTab(user, 'Transactions');
    await screen.findByText('Logo design');
    await user.type(screen.getByLabelText('Search transactions'), 'TXN-BBBB2222');
    expect(await screen.findByText('1 result for "TXN-BBBB2222"')).toBeInTheDocument();
    expect(screen.getByText('Website copy')).toBeInTheDocument();
    expect(screen.queryByText('Logo design')).not.toBeInTheDocument();
  });
});

describe('Admin search: Messages', () => {
  const messages = [
    { id: 'm1', reference: 'MSG-072FE2AA', name: 'Sipho Nkosi', email: 'sipho@example.com', topic: 'payment', status: 'new', message: 'My payout has not reflected.', createdAt: '2026-09-24T10:00:00Z', user: null, replies: [] },
    { id: 'm2', reference: 'MSG-99998888', name: 'Aisha Naidoo', email: 'aisha@example.com', topic: 'general', status: 'new', message: 'How do bookings work?', createdAt: '2026-09-24T11:00:00Z', user: null, replies: [] },
  ];

  it('finds a message by its exact reference number', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue({ data: { messages, counts: { new: 2, read: 0, resolved: 0 } } });
    await openTab(user, 'Messages');
    await screen.findByText('Sipho Nkosi');
    await user.type(screen.getByLabelText('Search messages'), 'MSG-072FE2AA');
    expect(await screen.findByText('1 result for "MSG-072FE2AA"')).toBeInTheDocument();
    expect(screen.getByText('Sipho Nkosi')).toBeInTheDocument();
    expect(screen.queryByText('Aisha Naidoo')).not.toBeInTheDocument();
  });

  it('also matches on the message body itself', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue({ data: { messages, counts: { new: 2, read: 0, resolved: 0 } } });
    await openTab(user, 'Messages');
    await screen.findByText('Sipho Nkosi');
    await user.type(screen.getByLabelText('Search messages'), 'bookings work');
    expect(await screen.findByText('1 result for "bookings work"')).toBeInTheDocument();
    expect(screen.getByText('Aisha Naidoo')).toBeInTheDocument();
  });
});
