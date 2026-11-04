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

describe('Admin: Overview dashboard', () => {
  beforeEach(() => {
    api.adminStats.mockResolvedValue(sampleAdminStats);
    api.adminMessages.mockResolvedValue({ data: { messages: [], counts: { new: 0, read: 0, resolved: 0 } } });
  });

  it('shows headline totals with a role breakdown and how many are new this week', async () => {
    const { container } = renderApp(<AdminPage />, { user: adminUser });
    await screen.findByText(/freelancers/); // wait for the data to load
    const totals = container.querySelector('.ledger');
    expect(within(totals).getByText('10')).toBeInTheDocument(); // users total
    expect(within(totals).getByText(/4 freelancers, 5 clients, 1 admin/)).toBeInTheDocument();
    // regression: must read "3 new this week", never a mangled "3 new this weeks"
    expect(within(totals).getByText('3 new this week')).toBeInTheDocument();
    expect(within(totals).queryByText(/weeks/)).not.toBeInTheDocument();
  });

  it('uses the singular for exactly one admin', async () => {
    api.adminStats.mockResolvedValue({ data: { ...sampleAdminStats.data, users: { ...sampleAdminStats.data.users, admins: 1 } } });
    renderApp(<AdminPage />, { user: adminUser });
    expect(await screen.findByText(/1 admin\b/)).toBeInTheDocument();
    expect(screen.queryByText(/1 admins/)).not.toBeInTheDocument();
  });

  it('draws a bar for the one day that had transactions', async () => {
    renderApp(<AdminPage />, { user: adminUser });
    const chart = await screen.findByRole('img', { name: /trend/i });
    expect(chart.querySelectorAll('rect')).toHaveLength(14); // one bar per day in the window
  });

  it('shows an honest empty state instead of an invisible chart when there is no data at all', async () => {
    api.adminStats.mockResolvedValue({
      data: { ...sampleAdminStats.data, transactions: { ...sampleAdminStats.data.transactions, trend: sampleAdminStats.data.transactions.trend.map((t) => ({ ...t, total: 0, count: 0 })) } },
    });
    renderApp(<AdminPage />, { user: adminUser });
    expect(await screen.findByText('No transactions in this period yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /trend/i })).not.toBeInTheDocument();
  });

  it('breaks gigs down by category and bookings down by status', async () => {
    renderApp(<AdminPage />, { user: adminUser });
    const cats = await screen.findByText('Gigs by category');
    expect(cats.closest('section')).toHaveTextContent('Design and creative');
    expect(cats.closest('section')).toHaveTextContent('3'); // count for design
    const statuses = screen.getByText('Bookings by status');
    expect(statuses.closest('section')).toHaveTextContent('Confirmed');
    expect(statuses.closest('section')).toHaveTextContent('Completed');
  });

  it('shows an honest empty state for breakdowns with no data', async () => {
    api.adminStats.mockResolvedValue({ data: { ...sampleAdminStats.data, gigs: { ...sampleAdminStats.data.gigs, byCategory: {} } } });
    renderApp(<AdminPage />, { user: adminUser });
    const cats = await screen.findByText('Gigs by category');
    expect(within(cats.closest('section')).getByText('No data yet.')).toBeInTheDocument();
  });

  it('lists recent activity across users, bookings and messages, newest first, in plain words', async () => {
    renderApp(<AdminPage />, { user: adminUser });
    const feed = await screen.findByText('Recent activity');
    const items = within(feed.closest('section')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Aisha Naidoo joined as client');
    expect(items[1]).toHaveTextContent('booked "Logo design"');
    expect(items[2]).toHaveTextContent('sent a message');
  });

  it('says so when nothing has happened yet', async () => {
    api.adminStats.mockResolvedValue({ data: { ...sampleAdminStats.data, activity: [] } });
    renderApp(<AdminPage />, { user: adminUser });
    expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument();
  });

  it('shows how many new messages are waiting, right in the headline totals', async () => {
    const { container } = renderApp(<AdminPage />, { user: adminUser });
    await screen.findByText('New messages');
    const totals = container.querySelector('.ledger');
    expect(within(totals).getByText('New messages')).toBeInTheDocument();
    expect(within(totals).getByText('2')).toBeInTheDocument();
  });

  it('offers Try again if the dashboard cannot be loaded', async () => {
    const user = userEvent.setup();
    api.adminStats.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 })).mockResolvedValueOnce(sampleAdminStats);
    const { container } = renderApp(<AdminPage />, { user: adminUser });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText(/freelancers/);
    expect(container.querySelector('.ledger')).toBeInTheDocument();
  });

  describe('downloading the report', () => {
    it('calls the API when clicked, and shows a busy state meanwhile', async () => {
      const user = userEvent.setup();
      let resolveDownload;
      api.adminStats.mockResolvedValue(sampleAdminStats);
      api.downloadAdminReport.mockReturnValue(new Promise((r) => { resolveDownload = r; }));
      renderApp(<AdminPage />, { user: adminUser });
      const button = await screen.findByRole('button', { name: 'Download report (CSV)' });
      await user.click(button);
      expect(api.downloadAdminReport).toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Preparing…' })).toBeDisabled();
      resolveDownload();
      expect(await screen.findByRole('button', { name: 'Download report (CSV)' })).toBeEnabled();
    });

    it('shows the reason if the download fails', async () => {
      const user = userEvent.setup();
      api.adminStats.mockResolvedValue(sampleAdminStats);
      api.downloadAdminReport.mockRejectedValue(new Error('Could not download the report.'));
      renderApp(<AdminPage />, { user: adminUser });
      await user.click(await screen.findByRole('button', { name: 'Download report (CSV)' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the report.');
    });
  });
});
