import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import GigDetailPage from '../pages/GigDetailPage';
import { adminUser, clientUser, freelancerUser, renderApp, sampleGig, sampleReviews, sampleSeller } from './utils';

vi.mock('../api/hustlehub');

const detail = (user = null, extra = {}) => ({ route: '/gigs/g1', path: '/gigs/:id', user, ...extra });

describe('GigDetailPage', () => {
  beforeEach(() => {
    api.getGig.mockResolvedValue({ data: { gig: sampleGig, seller: sampleSeller } });
    api.listGigReviews.mockResolvedValue(sampleReviews);
  });

  it('shows the gig, the seller profile, the rating and the reviews', async () => {
    renderApp(<GigDetailPage />, detail());
    expect(await screen.findByRole('heading', { level: 1, name: 'Logo & brand identity design' })).toBeInTheDocument();
    expect(screen.getByText(/I will design a memorable logo/)).toBeInTheDocument();

    const seller = screen.getByRole('region', { name: 'About the seller' });
    expect(within(seller).getByText('Thabo Mokoena')).toBeInTheDocument();
    expect(within(seller).getByText('7')).toBeInTheDocument(); // completed orders
    expect(within(seller).getByText('20 Aug 2026')).toBeInTheDocument();

    const reviews = await screen.findByRole('region', { name: 'Reviews' });
    expect(within(reviews).getByText('12 reviews')).toBeInTheDocument();
    expect(within(reviews).getByText('Aisha Naidoo')).toBeInTheDocument();
    // markup in a review is shown as harmless text, never as elements
    expect(within(reviews).getByText('Brilliant work, <b>fast</b> and friendly.')).toBeInTheDocument();
    expect(reviews.querySelector('b')).toBeNull();
  });

  it('shows a helpful message when a gig has no reviews yet', async () => {
    api.listGigReviews.mockResolvedValue({ data: { reviews: [], summary: { average: 0, count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } } } });
    renderApp(<GigDetailPage />, detail());
    expect(await screen.findByRole('heading', { name: 'No reviews yet' })).toBeInTheDocument();
  });

  it('says so when the gig does not exist (or is paused)', async () => {
    api.getGig.mockRejectedValue(Object.assign(new Error('Gig not found.'), { status: 404 }));
    renderApp(<GigDetailPage />, detail());
    expect(await screen.findByRole('heading', { name: "This gig isn't available" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore other gigs' })).toHaveAttribute('href', '/gigs');
  });

  it('does NOT claim the gig is missing when the real problem is the network, and lets you retry', async () => {
    const user = userEvent.setup();
    api.getGig.mockRejectedValueOnce(Object.assign(new Error('Cannot reach the server.'), { status: 0 }));
    renderApp(<GigDetailPage />, detail());
    expect(await screen.findByRole('heading', { name: "We can't reach the server" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "This gig isn't available" })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Logo & brand identity design' })).toBeInTheDocument();
  });

  describe('who can order', () => {
    it('sends visitors to log in, and remembers to bring them back here', async () => {
      renderApp(<GigDetailPage />, detail());
      const login = await screen.findByRole('link', { name: 'Log in to book' });
      expect(login).toHaveAttribute('href', '/login');
      expect(screen.getByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/register');
      expect(screen.queryByRole('button', { name: /book for/i })).not.toBeInTheDocument();
    });

    it('lets a client book', async () => {
      renderApp(<GigDetailPage />, detail(clientUser));
      expect(await screen.findByRole('button', { name: 'Book for R450.50' })).toBeInTheDocument();
    });

    it('does not let another freelancer book, and explains why', async () => {
      renderApp(<GigDetailPage />, detail({ ...freelancerUser, id: 'f2' }));
      expect(await screen.findByText(/only client accounts can book/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /book for/i })).not.toBeInTheDocument();
    });

    it('shows the owner a link to manage their gigs instead of an order button', async () => {
      renderApp(<GigDetailPage />, detail(freelancerUser)); // sampleGig belongs to f1
      expect(await screen.findByText('This is your gig.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Manage my gigs' })).toBeInTheDocument();
    });

    it('does not let an admin book', async () => {
      renderApp(<GigDetailPage />, detail(adminUser));
      expect(await screen.findByText(/only client accounts can book/i)).toBeInTheDocument();
    });
  });

  describe('booking and (simulated) payment flow', () => {
    it('reviews the gig before moving on to the (simulated) payment step', async () => {
      const user = userEvent.setup();
      renderApp(<GigDetailPage />, detail(clientUser));

      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('R450.50')).toBeInTheDocument();
      expect(within(dialog).getByText(/simulated/i)).toBeInTheDocument();
      expect(api.createBooking).not.toHaveBeenCalled();
    });

    it('shows the demo card form after Continue to payment, pre-filled with the test card', async () => {
      const user = userEvent.setup();
      renderApp(<GigDetailPage />, detail(clientUser));

      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to payment' }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByLabelText(/card number/i)).toHaveValue('4242 4242 4242 4242');
      expect(within(dialog).getByRole('button', { name: /^Pay R450\.50$/ })).toBeInTheDocument();
    });

    it('books and pays for the gig once valid card details are entered', async () => {
      const user = userEvent.setup();
      api.createBooking.mockResolvedValue({ data: { booking: { id: 'b1', price: 450.5 } } });
      renderApp(<GigDetailPage />, detail(clientUser));

      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));
      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/notes for the freelancer/i), 'Please send drafts by Friday');
      await user.click(within(dialog).getByRole('button', { name: 'Continue to payment' }));

      await user.type(within(dialog).getByLabelText(/cardholder name/i), 'Aisha Naidoo');
      await user.type(within(dialog).getByLabelText(/expiry/i), '1234');
      await user.type(within(dialog).getByLabelText(/cvc/i), '123');
      await user.click(within(dialog).getByRole('button', { name: /^Pay R450\.50$/ }));

      expect(api.createBooking).toHaveBeenCalledWith({ gigId: 'g1', notes: 'Please send drafts by Friday' });
      expect(await within(dialog).findByText(/payment confirmed/i)).toBeInTheDocument();
    });

    it('will not let payment proceed with an invalid card number', async () => {
      const user = userEvent.setup();
      renderApp(<GigDetailPage />, detail(clientUser));

      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to payment' }));
      const dialog = screen.getByRole('dialog');

      await user.clear(within(dialog).getByLabelText(/card number/i));
      await user.type(within(dialog).getByLabelText(/card number/i), '1234 5678 9012 3456');
      await user.type(within(dialog).getByLabelText(/cardholder name/i), 'Aisha Naidoo');
      await user.type(within(dialog).getByLabelText(/expiry/i), '1234');
      await user.type(within(dialog).getByLabelText(/cvc/i), '123');

      expect(within(dialog).getByRole('button', { name: /^Pay R450\.50$/ })).toBeDisabled();
      expect(api.createBooking).not.toHaveBeenCalled();
    });

    it('shows the server error and lets the client retry if the booking fails', async () => {
      const user = userEvent.setup();
      api.createBooking.mockRejectedValue(new Error('Too many booking requests. Limit is 10 per 15 minutes. Please try again in 14 minutes.'));
      renderApp(<GigDetailPage />, detail(clientUser));

      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Continue to payment' }));
      await user.type(within(dialog).getByLabelText(/cardholder name/i), 'Aisha Naidoo');
      await user.type(within(dialog).getByLabelText(/expiry/i), '1234');
      await user.type(within(dialog).getByLabelText(/cvc/i), '123');
      await user.click(within(dialog).getByRole('button', { name: /^Pay R450\.50$/ }));

      expect(await screen.findByText(/Too many booking requests/)).toBeInTheDocument();
    });

    it('closes with Cancel and with the Escape key', async () => {
      const user = userEvent.setup();
      renderApp(<GigDetailPage />, detail(clientUser));

      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /book for r450\.50/i }));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.createBooking).not.toHaveBeenCalled();
    });

    it('refuses overly long notes before moving on', async () => {
      const user = userEvent.setup();
      renderApp(<GigDetailPage />, detail(clientUser));
      await user.click(await screen.findByRole('button', { name: /book for r450\.50/i }));

      await user.click(screen.getByLabelText(/notes for the freelancer/i));
      await user.paste('x'.repeat(1001));

      expect(screen.getByText('Notes must be 1000 characters or fewer.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
      expect(api.createBooking).not.toHaveBeenCalled();
    });
  });

  describe('messaging the seller', () => {
    it('offers a client "Message the seller" alongside booking', async () => {
      renderApp(<GigDetailPage />, detail(clientUser));
      expect(await screen.findByRole('button', { name: 'Message the seller' })).toBeInTheDocument();
    });

    it('starts (or reopens) a conversation and takes the client straight to it', async () => {
      const user = userEvent.setup();
      api.startConversation.mockResolvedValue({ data: { conversation: { id: 'conv1' } } });
      renderApp(<GigDetailPage />, detail(clientUser, { path: '/gigs/:id', stub: false }));
      await user.click(await screen.findByRole('button', { name: 'Message the seller' }));
      expect(api.startConversation).toHaveBeenCalledWith('g1');
    });

    it('shows the server error and stays put if starting the conversation fails', async () => {
      const user = userEvent.setup();
      api.startConversation.mockRejectedValue(new Error('You cannot message yourself about your own gig.'));
      renderApp(<GigDetailPage />, detail(clientUser));
      await user.click(await screen.findByRole('button', { name: 'Message the seller' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('You cannot message yourself');
    });

    it('is not offered to the freelancer who owns the gig', async () => {
      renderApp(<GigDetailPage />, detail(freelancerUser));
      await screen.findByRole('heading', { level: 1, name: 'Logo & brand identity design' });
      expect(screen.queryByRole('button', { name: 'Message the seller' })).not.toBeInTheDocument();
    });

    it('is not offered to a visitor who is not logged in', async () => {
      renderApp(<GigDetailPage />, detail(null));
      await screen.findByRole('heading', { level: 1, name: 'Logo & brand identity design' });
      expect(screen.queryByRole('button', { name: 'Message the seller' })).not.toBeInTheDocument();
    });

    it('is not offered to an admin (they are not a marketplace participant)', async () => {
      renderApp(<GigDetailPage />, detail(adminUser));
      await screen.findByRole('heading', { level: 1, name: 'Logo & brand identity design' });
      expect(screen.queryByRole('button', { name: 'Message the seller' })).not.toBeInTheDocument();
    });
  });
});
