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

const msg = (over = {}) => ({
  id: 'm1', reference: 'MSG-11111111', name: 'Sam Visitor', email: 'sam@example.com', topic: 'account', status: 'new',
  message: 'I can&#x27;t find where to change my details.', createdAt: '2026-09-21T10:00:00Z', user: null, ...over,
});
const inbox = (messages, counts = { new: 1, read: 0, resolved: 0 }) => ({ data: { messages, counts } });

async function openMessages(user) {
  renderApp(<AdminPage />, { user: adminUser });
  await user.click(screen.getByRole('tab', { name: 'Messages' }));
}

describe('Admin: Messages inbox', () => {
  beforeEach(() => {
    api.adminStats.mockResolvedValue(sampleAdminStats);
    api.adminMessages.mockResolvedValue(inbox([msg()]));
    api.adminSetMessageStatus.mockResolvedValue({ data: {} });
  });

  it('is a tab in the admin console and lists what people sent, readable', async () => {
    const user = userEvent.setup();
    await openMessages(user);
    const list = await screen.findByRole('list', { name: 'Messages' });
    expect(within(list).getByText('Sam Visitor')).toBeInTheDocument();
    expect(within(list).getByText("I can't find where to change my details.")).toBeInTheDocument(); // decoded, not "&#x27;"
    expect(within(list).getByText('MSG-11111111')).toBeInTheDocument();
    expect(within(list).getByText('My account or login')).toBeInTheDocument();
    expect(within(list).getByText('new')).toBeInTheDocument();
  });

  it('shows markup in a message as harmless text and never renders it', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue(inbox([msg({ message: '&lt;img src=x onerror=alert(1)&gt; &lt;b&gt;hi&lt;&#x2F;b&gt;', name: '&lt;i&gt;Tricky&lt;&#x2F;i&gt;' })]));
    await openMessages(user);
    const list = await screen.findByRole('list', { name: 'Messages' });
    expect(within(list).getByText('<img src=x onerror=alert(1)> <b>hi</b>')).toBeInTheDocument();
    expect(list.querySelector('img, b, i')).toBeNull();
  });

  it('shows how many messages are in each state', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue(inbox([msg()], { new: 3, read: 2, resolved: 5 }));
    await openMessages(user);
    await screen.findByRole('list', { name: 'Messages' });
    expect(screen.getByRole('button', { name: 'All (10)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolved (5)' })).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    await openMessages(user);
    await screen.findByRole('list', { name: 'Messages' });
    await user.click(screen.getByRole('button', { name: /^Resolved/ }));
    await vi.waitFor(() => expect(api.adminMessages).toHaveBeenLastCalledWith('resolved'));
  });

  it('marks a message as read and as resolved', async () => {
    const user = userEvent.setup();
    await openMessages(user);
    await user.click(await screen.findByRole('button', { name: 'Mark read' }));
    expect(api.adminSetMessageStatus).toHaveBeenCalledWith('m1', 'read');
    await user.click(await screen.findByRole('button', { name: 'Mark resolved' }));
    expect(api.adminSetMessageStatus).toHaveBeenLastCalledWith('m1', 'resolved');
  });

  it('lets an admin reopen a resolved message, and offers no other action for it', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue(inbox([msg({ status: 'resolved' })], { new: 0, read: 0, resolved: 1 }));
    await openMessages(user);
    await user.click(await screen.findByRole('button', { name: 'Reopen' }));
    expect(api.adminSetMessageStatus).toHaveBeenCalledWith('m1', 'new');
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).not.toBeInTheDocument();
  });

  it('gives a reply link that includes the reference', async () => {
    const user = userEvent.setup();
    await openMessages(user);
    const link = await screen.findByRole('link', { name: 'sam@example.com' });
    expect(link.getAttribute('href')).toBe('mailto:sam@example.com?subject=Re%3A%20HustleHub%2B%20MSG-11111111');
  });

  it('cannot be tricked into adding mail headers through a strange email address', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue(inbox([msg({ email: 'a?bcc=evil@z.com' })]));
    await openMessages(user);
    const link = await screen.findByRole('link', { name: 'a?bcc=evil@z.com' });
    const href = link.getAttribute('href');
    expect(href.startsWith('mailto:a%3Fbcc%3Devil@z.com?subject=')).toBe(true);
    expect(href.match(/\?/g)).toHaveLength(1); // only the one that starts the real subject
  });

  it('says whether the sender was signed in', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue(inbox([msg({ user: { id: 'c1', name: 'Aisha', email: 'a@x.com', role: 'client' } })]));
    await openMessages(user);
    expect(await screen.findByText('Signed-in client')).toBeInTheDocument();
  });

  it('has an honest empty state', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockResolvedValue(inbox([], { new: 0, read: 0, resolved: 0 }));
    await openMessages(user);
    expect(await screen.findByRole('heading', { name: 'No messages yet' })).toBeInTheDocument();
    expect(screen.getByText(/appear here/i)).toBeInTheDocument();
  });

  it('offers Try again if the inbox cannot be loaded', async () => {
    const user = userEvent.setup();
    api.adminMessages.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 })).mockResolvedValueOnce(inbox([msg()]));
    await openMessages(user);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Messages' })).toBeInTheDocument();
  });

  it('shows the reason if a status change fails', async () => {
    const user = userEvent.setup();
    api.adminSetMessageStatus.mockRejectedValue(new Error('Message not found.'));
    await openMessages(user);
    await user.click(await screen.findByRole('button', { name: 'Mark read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Message not found.');
  });

  describe('replying from the admin page', () => {
    beforeEach(() => {
      api.adminMessages.mockResolvedValue(inbox([msg()]));
    });

    it('opens a reply form, and sends the trimmed text to the right message', async () => {
      const user = userEvent.setup();
      api.adminReplyToMessage.mockResolvedValue({ data: { message: msg({ replies: [{ text: 'Sure, here is how.', adminName: 'Platform Admin', sentAt: '2026-09-24T09:00:00Z' }] }) } });
      await openMessages(user);

      await user.click(await screen.findByRole('button', { name: 'Reply' }));
      const form = screen.getByRole('form', { name: /Reply to Sam Visitor/ });
      await user.type(within(form).getByRole('textbox'), '  Sure, here is how.  ');
      await user.click(within(form).getByRole('button', { name: 'Send reply' }));

      expect(api.adminReplyToMessage).toHaveBeenCalledWith('m1', 'Sure, here is how.');
    });

    it('says where the reply will be sent, quoting the reference', async () => {
      const user = userEvent.setup();
      await openMessages(user);
      await user.click(await screen.findByRole('button', { name: 'Reply' }));
      const form = screen.getByRole('form', { name: /Reply to Sam Visitor/ });
      expect(within(form).getByText(/sam@example\.com/)).toBeInTheDocument();
      expect(within(form).getByText(/MSG-11111111/)).toBeInTheDocument();
    });

    it('will not send an empty reply', async () => {
      const user = userEvent.setup();
      await openMessages(user);
      await user.click(await screen.findByRole('button', { name: 'Reply' }));
      await user.click(screen.getByRole('button', { name: 'Send reply' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Write a reply');
      expect(api.adminReplyToMessage).not.toHaveBeenCalled();
    });

    it('shows the server error and keeps what was typed if sending fails', async () => {
      const user = userEvent.setup();
      api.adminReplyToMessage.mockRejectedValue(new Error('Too many replies. Please wait a moment.'));
      await openMessages(user);
      await user.click(await screen.findByRole('button', { name: 'Reply' }));
      const form = screen.getByRole('form', { name: /Reply to Sam Visitor/ });
      await user.type(within(form).getByRole('textbox'), 'My reply');
      await user.click(within(form).getByRole('button', { name: 'Send reply' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Too many replies');
      expect(within(form).getByRole('textbox')).toHaveValue('My reply');
    });

    it('can be cancelled without sending anything', async () => {
      const user = userEvent.setup();
      await openMessages(user);
      await user.click(await screen.findByRole('button', { name: 'Reply' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('form', { name: /Reply to/ })).not.toBeInTheDocument();
      expect(api.adminReplyToMessage).not.toHaveBeenCalled();
    });

    it('closes the form and refreshes the list once a reply is sent', async () => {
      const user = userEvent.setup();
      api.adminReplyToMessage.mockResolvedValue({ data: { message: msg() } });
      await openMessages(user);
      await user.click(await screen.findByRole('button', { name: 'Reply' }));
      const form = screen.getByRole('form', { name: /Reply to Sam Visitor/ });
      await user.type(within(form).getByRole('textbox'), 'Thanks for reaching out.');
      await user.click(within(form).getByRole('button', { name: 'Send reply' }));
      await screen.findByText('Thanks for reaching out.', { exact: false }).catch(() => {}); // toast, best-effort
      expect(screen.queryByRole('form', { name: /Reply to/ })).not.toBeInTheDocument();
      expect(api.adminMessages).toHaveBeenCalledTimes(2); // initial load + reload after the reply
    });

    it('shows earlier replies as a thread, with markup rendered as harmless text', async () => {
      const user = userEvent.setup();
      api.adminMessages.mockResolvedValue(
        inbox([
          msg({
            replies: [
              { text: '&lt;b&gt;First&lt;&#x2F;b&gt; reply, please check your email.', adminName: 'Platform Admin', sentAt: '2026-09-24T09:00:00Z' },
              { text: 'Following up once more.', adminName: 'Platform Admin', sentAt: '2026-09-24T10:00:00Z' },
            ],
          }),
        ])
      );
      await openMessages(user);
      const list = await screen.findByRole('list', { name: 'Messages' });
      expect(within(list).getByText('<b>First</b> reply, please check your email.')).toBeInTheDocument();
      expect(within(list).getByText('Following up once more.')).toBeInTheDocument();
      expect(within(list).getByText('2 replies sent')).toBeInTheDocument();
      expect(list.querySelector('b')).toBeNull();
    });

    it('uses the singular for exactly one reply', async () => {
      const user = userEvent.setup();
      api.adminMessages.mockResolvedValue(inbox([msg({ replies: [{ text: 'Hi there.', adminName: 'Platform Admin', sentAt: '2026-09-24T09:00:00Z' }] })]));
      await openMessages(user);
      expect(await screen.findByText('1 reply sent')).toBeInTheDocument();
    });

    it('shows no reply thread for a message that has never been replied to', async () => {
      const user = userEvent.setup();
      await openMessages(user);
      await screen.findByText('Sam Visitor');
      expect(screen.queryByLabelText('Replies sent so far')).not.toBeInTheDocument();
    });
  });
});
