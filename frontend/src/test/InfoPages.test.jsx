import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Footer from '../components/Footer';
import { HelpPage, PrivacyPage, TermsPage } from '../pages/InfoPages';
import { renderApp } from './utils';

describe('Help centre', () => {
  it('answers the common questions and reveals answers on demand', async () => {
    const user = userEvent.setup();
    renderApp(<HelpPage />, { route: '/help' });
    expect(screen.getByRole('heading', { level: 1, name: 'Help centre' })).toBeInTheDocument();

    const item = screen.getByText('Is my payment real?').closest('details');
    expect(item).not.toHaveAttribute('open');
    await user.click(screen.getByText('Is my payment real?'));
    expect(item).toHaveAttribute('open');
    expect(within(item).getByText(/payment is simulated/i)).toBeInTheDocument();
    expect(within(item).getByText(/no money moves/i)).toBeInTheDocument();
  });

  it('has anchors the footer can link to', () => {
    const { container } = renderApp(<HelpPage />, { route: '/help' });
    expect(container.querySelector('#getting-paid')).not.toBeNull();
  });

  it('leads to a page where people can send a message to the team (top and bottom of the page)', () => {
    renderApp(<HelpPage />, { route: '/help' });
    expect(screen.getByRole('link', { name: 'Contact the team' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Send us a message' })).toHaveAttribute('href', '/contact');
  });

  it('answers "How do I contact the team?" and links to the contact page from that answer too', async () => {
    const user = userEvent.setup();
    renderApp(<HelpPage />, { route: '/help' });
    await user.click(screen.getByText('How do I contact the team?'));
    const item = screen.getByText('How do I contact the team?').closest('details');
    expect(within(item).getByText(/reference number/i)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Go to the Contact page' })).toHaveAttribute('href', '/contact');
  });
});

describe('Privacy and Terms', () => {
  it('states plainly what is and is not collected', () => {
    renderApp(<PrivacyPage />, { route: '/privacy' });
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/Card details\. Payment is simulated for this demo/)).toBeInTheDocument();
    expect(screen.getByText(/hash of your password/i)).toBeInTheDocument();
    expect(screen.getByText(/Your email address is visible only to you/)).toBeInTheDocument();
    expect(screen.getByText(/Messages you send from the Contact page/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact the team' })).toHaveAttribute('href', '/contact?topic=account');
  });

  it('is clear that payments are simulated, not real money', () => {
    renderApp(<TermsPage />, { route: '/terms' });
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeInTheDocument();
    expect(screen.getByText(/Payment is simulated/)).toBeInTheDocument();
  });

  it('sets the browser tab title', () => {
    renderApp(<PrivacyPage />, { route: '/privacy' });
    expect(document.title).toBe('Privacy · HustleHub+');
  });
});

describe('Footer', () => {
  it('links to every information page and category shortcuts', () => {
    renderApp(<Footer />);
    expect(screen.getByRole('link', { name: 'Help centre' })).toHaveAttribute('href', '/help');
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Become a seller' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Design and creative' })).toHaveAttribute('href', '/gigs?category=design');
    expect(screen.getByText(/payments are simulated/i)).toBeInTheDocument();
  });
});
