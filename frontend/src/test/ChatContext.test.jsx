import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import { AuthContext } from '../context/AuthContext';
import { ChatProvider, useChat } from '../context/ChatContext';

vi.mock('../api/hustlehub');

// A fake socket.io-client that behaves enough like the real thing for ChatContext: records every
// .on() handler by event name so a test can fire it directly, and every .emit() call for assertions.
const handlers = {};
const emitted = [];
let mockSocket;
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    mockSocket = {
      connected: true,
      on: vi.fn((event, fn) => {
        (handlers[event] ||= []).push(fn);
      }),
      emit: vi.fn((event, payload, ack) => {
        emitted.push({ event, payload });
        if (event === 'message:send') ack?.({ message: { id: 'm-ack', text: payload.text } });
        if (event === 'message:read') ack?.({ ok: true });
      }),
      disconnect: vi.fn(),
    };
    return mockSocket;
  }),
}));

const fire = (event, payload) => (handlers[event] || []).forEach((fn) => fn(payload));

function Probe() {
  const { unreadTotal, supportUnread, connected } = useChat();
  return (
    <p>
      unread:{unreadTotal} support:{supportUnread} connected:{String(connected)}
    </p>
  );
}

function mount(user) {
  return render(
    <AuthContext.Provider value={{ user, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
      <ChatProvider>
        <Probe />
      </ChatProvider>
    </AuthContext.Provider>
  );
}

describe('ChatContext', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    emitted.length = 0;
    vi.clearAllMocks();
    window.sessionStorage.setItem('hustlehub.token', 'a.b.c');
    // Support-badge sources: a client/freelancer reads their own contactMine(); an admin reads
    // adminMessages('new'). Neither is what most of these tests are about, so both get a harmless
    // default here and are overridden per test only where the support badge itself is under test.
    api.contactMine.mockResolvedValue({ data: { messages: [] } });
    api.adminMessages.mockResolvedValue({ data: { counts: { new: 0, read: 0, resolved: 0 } } });
  });

  it('does not connect at all when nobody is signed in', () => {
    mount(null);
    expect(mockSocket).toBeUndefined();
  });

  it('connects once someone is signed in, and reflects the connect event', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [] } });
    mount({ id: 'c1', role: 'client' });
    expect(mockSocket).toBeDefined();
    await act(async () => fire('connect'));
    expect(await screen.findByText(/connected:true/)).toBeInTheDocument();
  });

  it('computes the unread badge from the conversations list on connect', async () => {
    api.listConversations.mockResolvedValue({
      data: { conversations: [{ id: '1', unread: true }, { id: '2', unread: false }, { id: '3', unread: true }] },
    });
    mount({ id: 'c1', role: 'client' });
    await act(async () => fire('connect'));
    expect(await screen.findByText(/unread:2/)).toBeInTheDocument();
  });

  it('refreshes the badge when a live event arrives for this user', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [] } });
    mount({ id: 'c1', role: 'client' });
    await act(async () => fire('connect'));
    await screen.findByText(/unread:0/); // settled at the connect-time baseline

    api.listConversations.mockResolvedValue({ data: { conversations: [{ id: '1', unread: true }] } });
    await act(async () => fire('message:new', { conversationId: '1' }));
    expect(await screen.findByText(/unread:1/)).toBeInTheDocument();
  });

  it('disconnects and resets the badge to 0 when the person logs out', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [{ id: '1', unread: true }] } });
    const { rerender } = mount({ id: 'c1', role: 'client' });
    await act(async () => fire('connect'));
    await screen.findByText(/unread:1/);
    const socketBeforeLogout = mockSocket;

    rerender(
      <AuthContext.Provider value={{ user: null, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
        <ChatProvider>
          <Probe />
        </ChatProvider>
      </AuthContext.Provider>
    );
    expect(socketBeforeLogout.disconnect).toHaveBeenCalled();
    expect(await screen.findByText(/unread:0/)).toBeInTheDocument();
  });

  it('sendMessage emits over the socket and resolves with the server-confirmed message', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [] } });
    let ctx;
    function Capture() {
      ctx = useChat();
      return null;
    }
    render(
      <AuthContext.Provider value={{ user: { id: 'c1', role: 'client' }, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
        <ChatProvider>
          <Capture />
        </ChatProvider>
      </AuthContext.Provider>
    );
    const message = await ctx.sendMessage('conv1', 'Hello there');
    expect(emitted[0]).toEqual({ event: 'message:send', payload: { conversationId: 'conv1', text: 'Hello there' } });
    expect(message).toEqual({ id: 'm-ack', text: 'Hello there' });
  });

  it('sendMessage rejects if the socket is not connected, without throwing an unhandled error', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [] } });
    let ctx;
    function Capture() {
      ctx = useChat();
      return null;
    }
    render(
      <AuthContext.Provider value={{ user: { id: 'c1', role: 'client' }, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
        <ChatProvider>
          <Capture />
        </ChatProvider>
      </AuthContext.Provider>
    );
    mockSocket.connected = false;
    await expect(ctx.sendMessage('conv1', 'Hello')).rejects.toThrow('Not connected');
  });

  it('markRead refreshes the badge for this tab, since nothing else would know to', async () => {
    api.listConversations.mockResolvedValue({ data: { conversations: [{ id: '1', unread: true }] } });
    let ctx;
    function Capture() {
      ctx = useChat();
      return null;
    }
    render(
      <AuthContext.Provider value={{ user: { id: 'c1', role: 'client' }, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
        <ChatProvider>
          <Capture />
          <Probe />
        </ChatProvider>
      </AuthContext.Provider>
    );
    await act(async () => fire('connect'));
    await screen.findByText(/unread:1/); // settled at the connect-time baseline

    api.listConversations.mockResolvedValue({ data: { conversations: [{ id: '1', unread: false }] } });
    await act(async () => ctx.markRead('1'));
    expect(await screen.findByText(/unread:0/)).toBeInTheDocument();
  });

  describe('the support badge (Contact us)', () => {
    it("a client/freelancer's badge comes from their own contactMine(), counting only unread replies", async () => {
      api.listConversations.mockResolvedValue({ data: { conversations: [] } });
      api.contactMine.mockResolvedValue({
        data: { messages: [{ id: 'm1', unreadReply: true }, { id: 'm2', unreadReply: false }, { id: 'm3', unreadReply: true }] },
      });
      mount({ id: 'c1', role: 'client' });
      await act(async () => fire('connect'));
      expect(await screen.findByText(/support:2/)).toBeInTheDocument();
      expect(api.adminMessages).not.toHaveBeenCalled(); // wrong source for a non-admin
    });

    it("an admin's badge comes from adminMessages('new'), not their own sent messages", async () => {
      api.listConversations.mockResolvedValue({ data: { conversations: [] } });
      api.adminMessages.mockResolvedValue({ data: { counts: { new: 4, read: 1, resolved: 2 } } });
      mount({ id: 'a1', role: 'admin' });
      await act(async () => fire('connect'));
      expect(await screen.findByText(/support:4/)).toBeInTheDocument();
      expect(api.adminMessages).toHaveBeenCalledWith('new');
      expect(api.contactMine).not.toHaveBeenCalled(); // wrong source for an admin
    });

    it('refreshes when a new enquiry arrives live (admin side)', async () => {
      api.listConversations.mockResolvedValue({ data: { conversations: [] } });
      api.adminMessages.mockResolvedValue({ data: { counts: { new: 0, read: 0, resolved: 0 } } });
      mount({ id: 'a1', role: 'admin' });
      await act(async () => fire('connect'));
      await screen.findByText(/support:0/);

      api.adminMessages.mockResolvedValue({ data: { counts: { new: 1, read: 0, resolved: 0 } } });
      await act(async () => fire('contact:new', { reference: 'MSG-1' }));
      expect(await screen.findByText(/support:1/)).toBeInTheDocument();
    });

    it('refreshes when the team replies live (sender side)', async () => {
      api.listConversations.mockResolvedValue({ data: { conversations: [] } });
      api.contactMine.mockResolvedValue({ data: { messages: [] } });
      mount({ id: 'c1', role: 'client' });
      await act(async () => fire('connect'));
      await screen.findByText(/support:0/);

      api.contactMine.mockResolvedValue({ data: { messages: [{ id: 'm1', unreadReply: true }] } });
      await act(async () => fire('contact-reply:new', { reference: 'MSG-1' }));
      expect(await screen.findByText(/support:1/)).toBeInTheDocument();
    });

    it('resets to 0 on logout, same as the chat badge', async () => {
      api.listConversations.mockResolvedValue({ data: { conversations: [] } });
      api.contactMine.mockResolvedValue({ data: { messages: [{ id: 'm1', unreadReply: true }] } });
      const { rerender } = mount({ id: 'c1', role: 'client' });
      await act(async () => fire('connect'));
      await screen.findByText(/support:1/);

      rerender(
        <AuthContext.Provider value={{ user: null, login: vi.fn(), register: vi.fn(), logout: vi.fn() }}>
          <ChatProvider>
            <Probe />
          </ChatProvider>
        </AuthContext.Provider>
      );
      expect(await screen.findByText(/support:0/)).toBeInTheDocument();
    });
  });
});
