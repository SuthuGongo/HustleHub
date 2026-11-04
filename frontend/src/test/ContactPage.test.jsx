import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import ContactPage from '../pages/ContactPage';
import { validateContact } from '../utils/validation';
import { clientUser, renderApp } from './utils';

vi.mock('../api/hustlehub');
vi.mock('../context/ChatContext', async () => {
  const actual = await vi.importActual('../context/ChatContext');
  return { ...actual, useChat: vi.fn(() => ({ refreshSupportUnread: vi.fn() })) };
});

const at = (route = '/contact', user = null) => ({ route, path: '/contact', user });

async function fill(user, { name = 'Sam Visitor', email = 'sam@example.com', message = 'I cannot see my booking on the bookings page.' } = {}) {
  await user.clear(screen.getByLabelText('Your name'));
  if (name) await user.type(screen.getByLabelText('Your name'), name);
  await user.clear(screen.getByLabelText('Email address'));
  if (email) await user.type(screen.getByLabelText('Email address'), email);
  if (message) await user.type(screen.getByLabelText('Your message'), message);
}

describe('ContactPage', () => {
  beforeEach(() => {
    api.sendContactMessage.mockResolvedValue({ data: { reference: 'MSG-1A2B3C4D' } });
    api.contactMine.mockResolvedValue({ data: { messages: [] } });
    api.markContactMineSeen.mockResolvedValue({ success: true });
  });

  it('is a plain form anyone can use, with a pointer back to the Help centre', () => {
    renderApp(<ContactPage />, at());
    expect(screen.getByRole('heading', { level: 1, name: 'Contact the team' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Contact the team' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the Help centre' })).toHaveAttribute('href', '/help');
    expect(screen.getByText(/never send your password or card details/i)).toBeInTheDocument();
    expect(document.title).toBe('Contact the team · HustleHub+');
  });

  it('starts empty for a visitor', () => {
    renderApp(<ContactPage />, at());
    expect(screen.getByLabelText('Your name')).toHaveValue('');
    expect(screen.getByLabelText('Email address')).toHaveValue('');
  });

  it('pre-fills the name and email of a signed-in person', () => {
    renderApp(<ContactPage />, at('/contact', clientUser));
    expect(screen.getByLabelText('Your name')).toHaveValue('Aisha Naidoo');
    expect(screen.getByLabelText('Email address')).toHaveValue('aisha@example.com');
  });

  it('pre-selects the topic from the link that brought you here (?topic=)', () => {
    renderApp(<ContactPage />, at('/contact?topic=account'));
    expect(screen.getByLabelText('What is it about?')).toHaveValue('account');
  });

  it('ignores an unknown ?topic= value', () => {
    renderApp(<ContactPage />, at('/contact?topic=<script>'));
    expect(screen.getByLabelText('What is it about?')).toHaveValue('general');
  });

  it('shows a live character count', async () => {
    const user = userEvent.setup();
    renderApp(<ContactPage />, at());
    await user.type(screen.getByLabelText('Your message'), 'Hello there');
    expect(screen.getByText(/11 \/ 2000/)).toBeInTheDocument();
  });

  describe('validation (nothing is sent until the form is right)', () => {
    it.each([
      ['no name', { name: '' }, 'Enter your name.'],
      ['no email', { email: '' }, 'Enter your email address so we can reply.'],
      ['a bad email', { email: 'not-an-email' }, 'Enter a valid email address.'],
      ['no message', { message: '' }, 'Write your message.'],
      ['a too-short message', { message: 'Hi' }, 'Please write at least 10 characters so we can help.'],
    ])('rejects %s', async (_label, override, error) => {
      const user = userEvent.setup();
      renderApp(<ContactPage />, at());
      await fill(user, override);
      await user.click(screen.getByRole('button', { name: 'Send message' }));
      expect(await screen.findByText(error)).toBeInTheDocument();
      expect(api.sendContactMessage).not.toHaveBeenCalled();
    });
  });

  it('removes a field\'s error as soon as the person starts fixing it', async () => {
    const user = userEvent.setup();
    renderApp(<ContactPage />, at());
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Write your message.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name'), 'S');
    expect(screen.queryByText('Enter your name.')).not.toBeInTheDocument();
    expect(screen.getByText('Write your message.')).toBeInTheDocument(); // untouched fields keep theirs
  });

  it('sends the trimmed details and topic, then thanks the person with their reference', async () => {
    const user = userEvent.setup();
    renderApp(<ContactPage />, at());
    await fill(user, { name: '  Sam Visitor  ', message: '   I cannot see my booking on the bookings page.   ' });
    await user.selectOptions(screen.getByLabelText('What is it about?'), 'payment');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(api.sendContactMessage).toHaveBeenCalledWith({
      name: 'Sam Visitor',
      email: 'sam@example.com',
      topic: 'payment',
      message: 'I cannot see my booking on the bookings page.',
      website: '',
    });
    expect(await screen.findByRole('heading', { name: 'Thank you, Sam' })).toBeInTheDocument();
    expect(screen.getByText('MSG-1A2B3C4D')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('lets the person send another message, keeping their name but clearing the text', async () => {
    const user = userEvent.setup();
    renderApp(<ContactPage />, at());
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await user.click(await screen.findByRole('button', { name: 'Send another message' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Sam Visitor');
    expect(screen.getByLabelText('Your message')).toHaveValue('');
  });

  it('shows the server\'s reason (e.g. sending too many) and keeps everything typed', async () => {
    const user = userEvent.setup();
    api.sendContactMessage.mockRejectedValue(Object.assign(new Error('Too many contact messages. Limit is 5 per 15 minutes. Please try again in 9 minutes.'), { status: 429 }));
    renderApp(<ContactPage />, at());
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many contact messages');
    expect(screen.getByLabelText('Your message')).toHaveValue('I cannot see my booking on the bookings page.');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  it('disables the button while sending, so a double click cannot send twice', async () => {
    const user = userEvent.setup();
    let release;
    api.sendContactMessage.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderApp(<ContactPage />, at());
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    release({ data: { reference: 'MSG-AAAAAAAA' } });
    expect(await screen.findByText('MSG-AAAAAAAA')).toBeInTheDocument();
    expect(api.sendContactMessage).toHaveBeenCalledTimes(1);
  });

  describe('spam trap', () => {
    it('has a hidden field that people cannot see, reach by keyboard, or hear', () => {
      const { container } = renderApp(<ContactPage />, at());
      const trap = container.querySelector('.hp');
      expect(trap).toHaveAttribute('aria-hidden', 'true');
      const input = trap.querySelector('input');
      expect(input).toHaveAttribute('tabindex', '-1');
      expect(input).toHaveAttribute('autocomplete', 'off');
      expect(input).toHaveValue('');
    });

    it('is sent along when a bot fills it in (the server then discards the message)', async () => {
      const user = userEvent.setup();
      const { container } = renderApp(<ContactPage />, at());
      await fill(user);
      await user.type(container.querySelector('.hp input'), 'http://spam.example');
      await user.click(screen.getByRole('button', { name: 'Send message' }));
      expect(api.sendContactMessage).toHaveBeenCalledWith(expect.objectContaining({ website: 'http://spam.example' }));
    });
  });
});

describe('validateContact', () => {
  const ok = { name: 'Sam', email: 'sam@example.com', topic: 'general', message: 'A perfectly fine message.' };

  it('accepts a good message', () => {
    expect(validateContact(ok)).toEqual({});
  });

  it('enforces the same limits as the server (name 2-80, message 10-2000)', () => {
    expect(validateContact({ ...ok, name: 'A' }).name).toBeTruthy();
    expect(validateContact({ ...ok, name: 'A'.repeat(81) }).name).toBeTruthy();
    expect(validateContact({ ...ok, name: 'A'.repeat(80) }).name).toBeUndefined();
    expect(validateContact({ ...ok, message: 'x'.repeat(9) }).message).toBeTruthy();
    expect(validateContact({ ...ok, message: 'x'.repeat(10) }).message).toBeUndefined();
    expect(validateContact({ ...ok, message: 'x'.repeat(2001) }).message).toBeTruthy();
    expect(validateContact({ ...ok, message: 'x'.repeat(2000) }).message).toBeUndefined();
  });

  it('rejects a topic the server would not accept', () => {
    expect(validateContact({ ...ok, topic: 'hacking' }).topic).toBeTruthy();
  });
});

describe('YourMessages (past enquiries + replies, for a signed-in person)', () => {
  const oldMsg = (over = {}) => ({
    id: 'm1',
    reference: 'MSG-11111111',
    topic: 'account',
    status: 'resolved',
    message: 'I can&#x27;t find where to change my details.',
    createdAt: '2026-09-20T10:00:00Z',
    replies: [],
    unreadReply: false,
    ...over,
  });

  beforeEach(() => {
    api.sendContactMessage.mockResolvedValue({ data: { reference: 'MSG-1A2B3C4D' } });
    api.markContactMineSeen.mockResolvedValue({ success: true });
  });

  it('stays out of the way entirely for a visitor who is not signed in', () => {
    api.contactMine.mockResolvedValue({ data: { messages: [oldMsg()] } });
    renderApp(<ContactPage />, at('/contact', null));
    expect(screen.queryByText('Your messages')).not.toBeInTheDocument();
    expect(api.contactMine).not.toHaveBeenCalled();
  });

  it('stays out of the way for a signed-in person who has never written in', () => {
    api.contactMine.mockResolvedValue({ data: { messages: [] } });
    renderApp(<ContactPage />, at('/contact', clientUser));
    expect(screen.queryByText('Your messages')).not.toBeInTheDocument();
  });

  it('lists a past message, readable, with its status and topic', async () => {
    api.contactMine.mockResolvedValue({ data: { messages: [oldMsg()] } });
    renderApp(<ContactPage />, at('/contact', clientUser));
    const section = await screen.findByRole('region', { name: 'Your messages to the team' });
    expect(within(section).getByText("I can't find where to change my details.")).toBeInTheDocument(); // decoded, not "&#x27;"
    expect(within(section).getByText('MSG-11111111')).toBeInTheDocument();
    expect(within(section).getByText('resolved')).toBeInTheDocument();
    expect(within(section).getByText('My account or login')).toBeInTheDocument();
  });

  it("shows the team's reply underneath, with markup rendered as harmless text", async () => {
    api.contactMine.mockResolvedValue({
      data: { messages: [oldMsg({ replies: [{ text: '&lt;b&gt;Done!&lt;&#x2F;b&gt; Try logging in again.', sentAt: '2026-09-21T09:00:00Z' }] })] },
    });
    renderApp(<ContactPage />, at('/contact', clientUser));
    const section = await screen.findByRole('region', { name: 'Your messages to the team' });
    expect(within(section).getByText('<b>Done!</b> Try logging in again.')).toBeInTheDocument();
    expect(section.querySelector('b')).toBeNull();
    expect(within(section).getByText('The team')).toBeInTheDocument(); // never names which admin, just "The team"
  });

  it('marks an unread reply "New reply" and marks it seen once the page is opened', async () => {
    api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ unreadReply: true, replies: [{ text: 'Sorted.', sentAt: '2026-09-21T09:00:00Z' }] })] } });
    renderApp(<ContactPage />, at('/contact', clientUser));
    const section = await screen.findByRole('region', { name: 'Your messages to the team' });
    expect(within(section).getByText('New reply')).toBeInTheDocument();
    await waitFor(() => expect(api.markContactMineSeen).toHaveBeenCalled());
  });

  it('does not call markContactMineSeen when nothing is unread (no needless writes)', async () => {
    api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ unreadReply: false })] } });
    renderApp(<ContactPage />, at('/contact', clientUser));
    await screen.findByRole('region', { name: 'Your messages to the team' });
    expect(api.markContactMineSeen).not.toHaveBeenCalled();
  });

  it('shows multiple past messages, and offers Try again if they fail to load', async () => {
    const user = userEvent.setup();
    api.contactMine.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 })).mockResolvedValueOnce({
      data: { messages: [oldMsg({ id: 'm1', reference: 'MSG-AAAA1111' }), oldMsg({ id: 'm2', reference: 'MSG-BBBB2222', status: 'new' })] },
    });
    renderApp(<ContactPage />, at('/contact', clientUser));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    const section = await screen.findByRole('region', { name: 'Your messages to the team' });
    expect(within(section).getByText('MSG-AAAA1111')).toBeInTheDocument();
    expect(within(section).getByText('MSG-BBBB2222')).toBeInTheDocument();
  });

  it('a freshly sent message shows up in the list once you send another', async () => {
    const user = userEvent.setup();
    api.contactMine.mockResolvedValue({ data: { messages: [] } });
    renderApp(<ContactPage />, at('/contact', clientUser));
    expect(screen.queryByText('Your messages')).not.toBeInTheDocument();

    api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ id: 'new1', reference: 'MSG-1A2B3C4D', message: 'A brand new one.', replies: [] })] } });
    await fill(user, { message: 'A brand new one.' });
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await user.click(await screen.findByRole('button', { name: 'Send another message' }));

    const section = await screen.findByRole('region', { name: 'Your messages to the team' });
    expect(within(section).getByText('A brand new one.')).toBeInTheDocument();
  });

  describe('following up on a message that has already been replied to', () => {
    it('shows both sides of the conversation, labelled "The team" and "You"', async () => {
      api.contactMine.mockResolvedValue({
        data: {
          messages: [
            oldMsg({
              replies: [
                { from: 'admin', text: 'Try logging in again.', sentAt: '2026-09-21T09:00:00Z' },
                { from: 'sender', text: "Still doesn't work.", sentAt: '2026-09-21T10:00:00Z' },
              ],
            }),
          ],
        },
      });
      renderApp(<ContactPage />, at('/contact', clientUser));
      const thread = await screen.findByRole('list', { name: 'Conversation so far' });
      expect(within(thread).getByText('Try logging in again.')).toBeInTheDocument();
      expect(within(thread).getByText("Still doesn't work.")).toBeInTheDocument();
      expect(within(thread).getByText('The team')).toBeInTheDocument();
      expect(within(thread).getByText('You')).toBeInTheDocument();
    });

    it('opens a reply box, sends the follow-up to the right message, and refreshes the thread', async () => {
      const user = userEvent.setup();
      api.contactMine.mockResolvedValueOnce({
        data: { messages: [oldMsg({ replies: [{ from: 'admin', text: 'Try logging in again.', sentAt: '2026-09-21T09:00:00Z' }] })] },
      });
      api.replyToOwnMessage.mockResolvedValue({ data: {} });
      renderApp(<ContactPage />, at('/contact', clientUser));
      await screen.findByText('Try logging in again.');

      api.contactMine.mockResolvedValueOnce({
        data: {
          messages: [
            oldMsg({
              status: 'new',
              replies: [
                { from: 'admin', text: 'Try logging in again.', sentAt: '2026-09-21T09:00:00Z' },
                { from: 'sender', text: "Still doesn't work, same error.", sentAt: '2026-09-21T10:00:00Z' },
              ],
            }),
          ],
        },
      });
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      const form = screen.getByRole('form', { name: /Follow up on MSG-11111111/ });
      await user.type(within(form).getByRole('textbox'), "Still doesn't work, same error.");
      await user.click(within(form).getByRole('button', { name: 'Send follow-up' }));

      expect(api.replyToOwnMessage).toHaveBeenCalledWith('m1', "Still doesn't work, same error.");
      expect(await screen.findByText("Still doesn't work, same error.")).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: /Follow up on/ })).not.toBeInTheDocument();
    });

    it('will not send an empty follow-up', async () => {
      const user = userEvent.setup();
      api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ replies: [{ from: 'admin', text: 'Sorted?', sentAt: '2026-09-21T09:00:00Z' }] })] } });
      renderApp(<ContactPage />, at('/contact', clientUser));
      await screen.findByText('Sorted?');
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.click(screen.getByRole('button', { name: 'Send follow-up' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Write a message');
      expect(api.replyToOwnMessage).not.toHaveBeenCalled();
    });

    it('shows the server error and keeps the draft if sending fails', async () => {
      const user = userEvent.setup();
      api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ replies: [] })] } });
      api.replyToOwnMessage.mockRejectedValue(new Error('Too many messages. Please wait a moment.'));
      renderApp(<ContactPage />, at('/contact', clientUser));
      await screen.findByRole('button', { name: 'Reply' });
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      const form = screen.getByRole('form', { name: /Follow up on MSG-11111111/ });
      await user.type(within(form).getByRole('textbox'), 'Still an issue');
      await user.click(within(form).getByRole('button', { name: 'Send follow-up' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Too many messages');
      expect(within(form).getByRole('textbox')).toHaveValue('Still an issue');
    });

    it('can be cancelled without sending anything', async () => {
      const user = userEvent.setup();
      api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ replies: [] })] } });
      renderApp(<ContactPage />, at('/contact', clientUser));
      await screen.findByRole('button', { name: 'Reply' });
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('form', { name: /Follow up on/ })).not.toBeInTheDocument();
      expect(api.replyToOwnMessage).not.toHaveBeenCalled();
    });

    it('Reply is offered even before any admin reply exists yet', async () => {
      api.contactMine.mockResolvedValue({ data: { messages: [oldMsg({ replies: [] })] } });
      renderApp(<ContactPage />, at('/contact', clientUser));
      expect(await screen.findByRole('button', { name: 'Reply' })).toBeInTheDocument();
    });
  });
});
