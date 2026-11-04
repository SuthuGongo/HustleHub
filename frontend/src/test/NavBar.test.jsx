import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NavBar from '../components/NavBar';
import * as chat from '../context/ChatContext';
import { Where, adminUser, clientUser, freelancerUser, renderApp } from './utils';

vi.mock('../context/ChatContext', async () => {
  const actual = await vi.importActual('../context/ChatContext');
  return { ...actual, useChat: vi.fn(() => ({ unreadTotal: 0, supportUnread: 0 })) };
});

const navLinks = () => within_nav().map((l) => l.textContent);
const within_nav = () => Array.from(document.querySelectorAll('nav[aria-label="Main"] a'));
const withWhere = (user) => ({ user, route: '/x', path: '*', stub: false }); // '*' keeps the component mounted after navigating

describe('NavBar', () => {
  it('shows Explore, Contact us, Log in and Join to visitors', () => {
    renderApp(<NavBar />);
    expect(navLinks()).toEqual(['Explore', 'Contact us']);
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aisha/i })).not.toBeInTheDocument();
  });

  it('shows client links to clients, including Messages', () => {
    renderApp(<NavBar />, { user: clientUser });
    expect(navLinks()).toEqual(['Explore', 'Contact us', 'Messages', 'My bookings', 'Payments']);
  });

  it('shows freelancer links (including income) to freelancers, including Messages', () => {
    renderApp(<NavBar />, { user: freelancerUser });
    expect(navLinks()).toEqual(['Explore', 'Contact us', 'Messages', 'My gigs', 'Bookings', 'Income']);
  });

  it("does not show Messages or Contact us to an admin - they aren't a marketplace participant, and their own enquiry badge lives on Administration instead", () => {
    renderApp(<NavBar />, { user: adminUser });
    expect(navLinks()).not.toContain('Messages');
    expect(navLinks()).not.toContain('Contact us');
    expect(navLinks()).toContain('Administration');
  });

  it('shows an unread badge on Messages when there is one', () => {
    chat.useChat.mockReturnValue({ unreadTotal: 3 });
    renderApp(<NavBar />, { user: clientUser });
    expect(screen.getByRole('link', { name: 'Messages, 3 unread' })).toBeInTheDocument();
    chat.useChat.mockReturnValue({ unreadTotal: 0 });
  });

  it('caps the badge at 9+', () => {
    chat.useChat.mockReturnValue({ unreadTotal: 14 });
    renderApp(<NavBar />, { user: freelancerUser });
    expect(screen.getByText('9+')).toBeInTheDocument();
    chat.useChat.mockReturnValue({ unreadTotal: 0 });
  });

  it("shows an admin how many enquiries are new, right on Administration - there is no separate nav entry for it", () => {
    chat.useChat.mockReturnValue({ supportUnread: 2 });
    renderApp(<NavBar />, { user: adminUser });
    expect(screen.getByRole('link', { name: 'Administration, 2 unread' })).toBeInTheDocument();
    chat.useChat.mockReturnValue({ unreadTotal: 0, supportUnread: 0 });
  });

  it('gives anyone signed in a badge on Contact us once one of their own messages has an unread reply', () => {
    chat.useChat.mockReturnValue({ supportUnread: 1 });
    renderApp(<NavBar />, { user: clientUser });
    expect(screen.getByRole('link', { name: 'Contact us, 1 unread' })).toBeInTheDocument();
    chat.useChat.mockReturnValue({ unreadTotal: 0, supportUnread: 0 });
  });

  it('never shows a Contact us badge to a signed-out visitor, even if the mock somehow reports one', () => {
    chat.useChat.mockReturnValue({ supportUnread: 5 });
    renderApp(<NavBar />);
    expect(screen.getByRole('link', { name: 'Contact us' })).toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    chat.useChat.mockReturnValue({ unreadTotal: 0, supportUnread: 0 });
  });

  it('shows no badge at all when there is nothing unread', () => {
    renderApp(<NavBar />, { user: clientUser });
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it('shows administration only to admins', () => {
    renderApp(<NavBar />, { user: adminUser });
    expect(navLinks()).toContain('Administration');
    expect(navLinks()).not.toContain('My gigs');
  });

  it('searches from the header and lands on the results', async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <NavBar />
        <Where />
      </>,
      withWhere(null)
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search gigs' }), 'logo & brand{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/gigs?q=logo%20%26%20brand');
  });

  describe('account menu', () => {
    it('opens with the person\'s details, and closes on Escape', async () => {
      const user = userEvent.setup();
      renderApp(<NavBar />, { user: clientUser });
      const button = screen.getByRole('button', { name: /aisha/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      const menu = screen.getByRole('menu', { name: 'Account' });
      expect(menu).toHaveTextContent('Aisha Naidoo');
      expect(menu).toHaveTextContent('aisha@example.com');

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes when you click elsewhere', async () => {
      const user = userEvent.setup();
      renderApp(<><NavBar /><p>Elsewhere</p></>, { user: clientUser, route: '/x', path: '/x' });
      await user.click(screen.getByRole('button', { name: /aisha/i }));
      await user.click(screen.getByText('Elsewhere'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('logs out and goes to the home page', async () => {
      const user = userEvent.setup();
      const { auth } = renderApp(<><NavBar /><Where /></>, withWhere(clientUser));
      await user.click(screen.getByRole('button', { name: /aisha/i }));
      await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
      expect(auth.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    });
  });

  it('has a menu button that shows and hides the links on small screens', async () => {
    const user = userEvent.setup();
    renderApp(<NavBar />, { user: clientUser });
    const toggle = screen.getByRole('button', { name: 'Menu' });
    const nav = document.querySelector('nav[aria-label="Main"]');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(nav).not.toHaveClass('open');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveClass('open');
  });
});
