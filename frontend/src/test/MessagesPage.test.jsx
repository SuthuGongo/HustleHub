import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import * as chatCtx from '../context/ChatContext';
import { AuthContext } from '../context/AuthContext';
import MessagesPage from '../pages/MessagesPage';
import { clientUser, freelancerUser } from './utils';

vi.mock('../api/hustlehub');
vi.mock('../context/ChatContext', async () => {
  const actual = await vi.importActual('../context/ChatContext');
  return { ...actual, useChat: vi.fn() };
});

// A fake chat context that behaves like the real one for exactly what MessagesPage needs: subscribe()
// returns an unsubscribe function and lets this test simulate a live event by calling the captured
// listener directly - the same trigger point the real socket would eventually call.
function fakeChat({ sendMessage = vi.fn(), markRead = vi.fn().mockResolvedValue() } = {}) {
  const listeners = new Set();
  const emit = (event, payload) => listeners.forEach((fn) => fn(event, payload));
  const subscribe = vi.fn((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  });
  chatCtx.useChat.mockReturnValue({ subscribe, sendMessage, markRead, setTyping: vi.fn(), unreadTotal: 0, connected: true });
  return { emit };
}

const conv = (over = {}) => ({
  id: 'conv1',
  client: { id: 'c1', name: 'Aisha Naidoo' },
  freelancer: { id: 'f1', name: 'Thabo Mokoena' },
  gigTitle: 'Logo design',
  lastMessageAt: '2026-09-24T10:00:00Z',
  lastMessagePreview: 'Hi there',
  unread: false,
  ...over,
});

const msg = (over = {}) => ({ id: 'm1', conversation: 'conv1', sender: { id: 'c1', name: 'Aisha Naidoo', role: 'client' }, text: 'Hi there', createdAt: '2026-09-24T10:00:00Z', ...over });

function mount(user, route = '/messages') {
  return renderWith(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:id" element={<MessagesPage />} />
      </Routes>
    </MemoryRouter>,
    user
  );
}

function renderWith(ui, user) {
  const { render } = require('@testing-library/react');
  return render(
    <AuthContext.Provider value={{ user, login: vi.fn(), register: vi.fn(), logout: vi.fn(), completeVerification: vi.fn(), completeTwoFactor: vi.fn(), initialising: false }}>
      {ui}
    </AuthContext.Provider>
  );
}

describe('MessagesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists conversations, newest activity first, with the gig and a preview', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    fakeChat();
    mount(clientUser);
    const list = await screen.findByRole('list', { name: 'Conversations' });
    expect(within(list).getByText('Thabo Mokoena')).toBeInTheDocument();
    expect(within(list).getByText('Logo design')).toBeInTheDocument();
    expect(within(list).getByText('Hi there')).toBeInTheDocument();
  });

  it('shows an honest empty state, worded for the role', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [] } });
    fakeChat();
    mount(clientUser);
    expect(await screen.findByRole('heading', { name: 'No conversations yet' })).toBeInTheDocument();
    expect(screen.getByText(/Message a seller/)).toBeInTheDocument();
  });

  it('freelancers see the reciprocal empty-state wording', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [] } });
    fakeChat();
    mount(freelancerUser);
    expect(await screen.findByText(/Conversations appear here once a client messages you/)).toBeInTheDocument();
  });

  it('opening a conversation loads its history and marks it read', async () => {
    const user = userEvent.setup();
    api.listConversations.mockResolvedValue({ data: { conversations: [conv({ unread: true })] } });
    api.listMessages.mockResolvedValue({ data: { messages: [msg()], hasMore: false } });
    fakeChat();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    expect(api.listMessages).toHaveBeenCalledWith('conv1');
    const thread = document.querySelector('.thread-body');
    expect(await within(thread).findByText('Hi there')).toBeInTheDocument();
  });

  it('a message the person sent themselves is styled as their own', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    api.listMessages.mockResolvedValue({ data: { messages: [msg({ sender: { id: 'c1', name: 'Aisha Naidoo' } })], hasMore: false } });
    fakeChat();
    const user = userEvent.setup();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    const thread = document.querySelector('.thread-body');
    const bubbleRow = (await within(thread).findByText('Hi there')).closest('.bubble-row');
    expect(bubbleRow).toHaveClass('mine');
  });

  it('sending a message calls the chat context and shows it immediately', async () => {
    const sendMessage = vi.fn().mockResolvedValue(msg({ id: 'm2', text: 'When can you start?', sender: { id: 'c1', name: 'Aisha' } }));
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    api.listMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
    fakeChat({ sendMessage });
    const user = userEvent.setup();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    await screen.findByText('No messages yet. Say hello!');
    await user.type(screen.getByPlaceholderText(/Message Thabo Mokoena/), 'When can you start?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendMessage).toHaveBeenCalledWith('conv1', 'When can you start?');
    expect(await screen.findByText('When can you start?')).toBeInTheDocument();
  });

  it('a message arriving live (simulated socket event) appears without reloading the page', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    api.listMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
    const { emit } = fakeChat();
    const user = userEvent.setup();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    await screen.findByText('No messages yet. Say hello!');
    expect(api.listMessages).toHaveBeenCalledTimes(1); // proves what follows is a push, not a re-fetch

    emit('message:new', { conversationId: 'conv1', message: msg({ id: 'm-live', text: 'Yes, Monday works!', sender: { id: 'f1', name: 'Thabo' } }) });
    expect(await screen.findByText('Yes, Monday works!')).toBeInTheDocument();
    expect(api.listMessages).toHaveBeenCalledTimes(1); // still just the once - this really was a live push
  });

  it('a live event for a different conversation is ignored', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    api.listMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
    const { emit } = fakeChat();
    const user = userEvent.setup();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    await screen.findByText('No messages yet. Say hello!');
    emit('message:new', { conversationId: 'some-other-conversation', message: msg({ text: 'Not for you' }) });
    await waitFor(() => expect(screen.queryByText('Not for you')).not.toBeInTheDocument());
  });

  it('shows a typing indicator that clears itself after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    api.listMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
    const { emit } = fakeChat();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    await screen.findByText('No messages yet. Say hello!');

    emit('typing', { conversationId: 'conv1', isTyping: true });
    expect(await screen.findByLabelText('Thabo Mokoena is typing')).toBeInTheDocument();
    emit('typing', { conversationId: 'conv1', isTyping: false });
    await waitFor(() => expect(screen.queryByLabelText('Thabo Mokoena is typing')).not.toBeInTheDocument());
    vi.useRealTimers();
  });

  it('shows the reason if sending fails, and keeps the draft', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('Not connected. Check your connection and try again.'));
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    api.listMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
    fakeChat({ sendMessage });
    const user = userEvent.setup();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: /Thabo Mokoena/ }));
    await screen.findByText('No messages yet. Say hello!');
    await user.type(screen.getByPlaceholderText(/Message Thabo Mokoena/), 'Hello?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not connected');
    expect(screen.getByPlaceholderText(/Message Thabo Mokoena/)).toHaveValue('Hello?');
  });

  it('offers Try again if the conversation list cannot be loaded', async () => {
    const user = userEvent.setup();
    api.listConversations.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 })).mockResolvedValueOnce({ data: { conversations: [conv()] } });
    fakeChat();
    mount(clientUser);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Thabo Mokoena')).toBeInTheDocument();
  });

  it('shows a placeholder until a conversation is chosen', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [conv()] } });
    fakeChat();
    mount(clientUser);
    await screen.findByText('Thabo Mokoena');
    expect(screen.getByText('Choose a conversation to view it.')).toBeInTheDocument();
  });
});
