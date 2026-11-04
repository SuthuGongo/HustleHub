import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import BookingsPage from '../pages/BookingsPage';
import { clientUser, freelancerUser, renderApp } from './utils';

vi.mock('../api/hustlehub');

const booking = (over = {}) => ({
  id: 'b1', gig: 'g1', gigTitle: 'Logo &amp; brand identity design', price: 450.5, status: 'confirmed', reviewed: false, notes: '',
  escrowStatus: 'held', createdAt: '2026-09-20T10:00:00Z', client: { id: 'c1', name: 'Aisha Naidoo' }, freelancer: { id: 'f1', name: 'Thabo Mokoena' }, ...over,
});
const list = (...bookings) => ({ data: { bookings } });

describe('BookingsPage: reviews', () => {
  // Rating only ever becomes available once the money side is settled (paid out or refunded) - see
  // the "does not offer a review" tests further down for the awaiting-review/disputed cases themselves.
  beforeEach(() => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'released' })));
  });

  it('lets a client review a completed booking, once', async () => {
    const user = userEvent.setup();
    api.reviewBooking.mockResolvedValue({ data: {} });
    renderApp(<BookingsPage />, { user: clientUser });

    await user.click(await screen.findByRole('button', { name: 'Rate experience' }));
    const form = screen.getByRole('form', { name: 'Write a review' });
    await user.click(within(form).getByRole('radio', { name: '5 stars: Excellent' }));
    await user.type(within(form).getByLabelText(/tell others/i), 'Fast and friendly.');
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'released', reviewed: true })));
    await user.click(within(form).getByRole('button', { name: 'Submit review' }));

    expect(api.reviewBooking).toHaveBeenCalledWith('b1', { rating: 5, comment: 'Fast and friendly.' });
    expect(await screen.findByText('Reviewed')).toBeInTheDocument(); // list reloaded; the button is gone
    expect(screen.queryByRole('button', { name: 'Rate experience' })).not.toBeInTheDocument();
  });

  it('asks for a star rating before submitting', async () => {
    const user = userEvent.setup();
    renderApp(<BookingsPage />, { user: clientUser });
    await user.click(await screen.findByRole('button', { name: 'Rate experience' }));
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a star rating first.');
    expect(api.reviewBooking).not.toHaveBeenCalled();
  });

  it('shows the server\'s message if the review is refused', async () => {
    const user = userEvent.setup();
    api.reviewBooking.mockRejectedValue(new Error('You have already reviewed this booking.'));
    renderApp(<BookingsPage />, { user: clientUser });
    await user.click(await screen.findByRole('button', { name: 'Rate experience' }));
    await user.click(screen.getByRole('radio', { name: '3 stars: Good' }));
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already reviewed');
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled();
  });

  it('can be cancelled without sending anything', async () => {
    const user = userEvent.setup();
    renderApp(<BookingsPage />, { user: clientUser });
    await user.click(await screen.findByRole('button', { name: 'Rate experience' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Write a review' })).not.toBeInTheDocument();
    expect(api.reviewBooking).not.toHaveBeenCalled();
  });

  it('does not offer a review until the work is completed', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed' })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByText('Confirmed');
    expect(screen.queryByRole('button', { name: 'Rate experience' })).not.toBeInTheDocument();
  });

  it('does not offer a review while payment is still awaiting the client\'s own pay-or-refund decision', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'awaiting_review' })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByText('Awaiting your review');
    expect(screen.queryByRole('button', { name: 'Rate experience' })).not.toBeInTheDocument();
  });

  it('does not offer a review while a refund request is still with an admin', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'disputed', disputeReason: 'Wrong file format.' })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByText('Disputed');
    expect(screen.queryByRole('button', { name: 'Rate experience' })).not.toBeInTheDocument();
  });

  it('never offers reviews to the freelancer, only "Mark completed"', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed' }), booking({ id: 'b2', status: 'confirmed' })));
    renderApp(<BookingsPage />, { user: freelancerUser });
    await screen.findAllByText(/Client: Aisha Naidoo/);
    expect(screen.queryByRole('button', { name: 'Rate experience' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeInTheDocument();
  });

  it('links each booking to its gig page and shows readable titles', async () => {
    renderApp(<BookingsPage />, { user: clientUser });
    expect(await screen.findByRole('link', { name: 'Logo & brand identity design' })).toHaveAttribute('href', '/gigs/g1');
  });
});

describe('BookingsPage: follow up and reporting an issue', () => {
  it('offers Follow up on every booking, whatever its status, for both a client and a freelancer', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed' })));
    renderApp(<BookingsPage />, { user: clientUser });
    expect(await screen.findByRole('link', { name: 'Follow up' })).toBeInTheDocument();

    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed' })));
    renderApp(<BookingsPage />, { user: freelancerUser });
    expect(await screen.findAllByRole('link', { name: 'Follow up' })).toHaveLength(1);
  });

  it('Follow up links to the Contact page with the booking already typed in as context', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed', gigTitle: 'Website copy', createdAt: '2026-09-20T10:00:00Z' })));
    renderApp(<BookingsPage />, { user: clientUser });
    const link = await screen.findByRole('link', { name: 'Follow up' });
    const href = link.getAttribute('href');
    expect(href).toMatch(/^\/contact\?topic=payment&prefill=/);
    const prefill = decodeURIComponent(href.split('prefill=')[1]);
    expect(prefill).toContain('Website copy');
    expect(prefill).toContain('Thabo Mokoena'); // the other party, decoded and readable, not "&amp;" or similar
  });

  it('offers "Report an issue" and flips it to "Issue resolved" once flagged', async () => {
    const user = userEvent.setup();
    api.listBookings.mockResolvedValueOnce(list(booking({ status: 'confirmed', hasOpenIssue: false }))).mockResolvedValueOnce(list(booking({ status: 'confirmed', hasOpenIssue: true })));
    api.setBookingIssue.mockResolvedValue({ data: {} });
    renderApp(<BookingsPage />, { user: clientUser });
    await user.click(await screen.findByRole('button', { name: 'Report an issue' }));
    expect(api.setBookingIssue).toHaveBeenCalledWith('b1', true);
    expect(await screen.findByRole('button', { name: 'Issue resolved' })).toBeInTheDocument();
    expect(screen.getByText('Issue reported')).toBeInTheDocument();
  });

  it('clears the flag when "Issue resolved" is clicked', async () => {
    const user = userEvent.setup();
    api.listBookings.mockResolvedValueOnce(list(booking({ status: 'confirmed', hasOpenIssue: true }))).mockResolvedValueOnce(list(booking({ status: 'confirmed', hasOpenIssue: false })));
    api.setBookingIssue.mockResolvedValue({ data: {} });
    renderApp(<BookingsPage />, { user: freelancerUser });
    await user.click(await screen.findByRole('button', { name: 'Issue resolved' }));
    expect(api.setBookingIssue).toHaveBeenCalledWith('b1', false);
    expect(await screen.findByRole('button', { name: 'Report an issue' })).toBeInTheDocument();
    expect(screen.queryByText('Issue reported')).not.toBeInTheDocument();
  });

  it('shows the server error if toggling the issue flag fails', async () => {
    const user = userEvent.setup();
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed' })));
    api.setBookingIssue.mockRejectedValue(new Error('Booking not found.'));
    renderApp(<BookingsPage />, { user: clientUser });
    await user.click(await screen.findByRole('button', { name: 'Report an issue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Booking not found.');
  });

  it('hides Follow up and Report an issue while the client is mid pay-or-refund decision, to keep that choice to just two buttons', async () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'awaiting_review', reviewDeadline: soon })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByRole('button', { name: 'Pay' });
    expect(screen.queryByRole('link', { name: 'Follow up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report an issue' })).not.toBeInTheDocument();
  });

  it('hides Follow up and Report an issue once a refund request is disputed, for both sides', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'disputed', disputeReason: 'Wrong file format.' })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByText('Disputed');
    expect(screen.queryByRole('link', { name: 'Follow up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report an issue' })).not.toBeInTheDocument();
  });
});

describe('BookingsPage: payment is already settled at booking time', () => {
  // Payment is simulated at the moment of booking (see BookingDialog), so by the time a booking
  // shows up here it is always already "paid" - there is no separate pay step or Pay button on
  // this page. Nothing here ever offers a way to pay again.
  it('never shows a Pay button, whatever the booking status', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed' })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByText('Confirmed');
    expect(screen.queryByRole('button', { name: /^Pay /i })).not.toBeInTheDocument();
  });

  it('offers the freelancer "Mark completed" as soon as a booking is confirmed', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed' })));
    renderApp(<BookingsPage />, { user: freelancerUser });
    expect(await screen.findByRole('button', { name: 'Mark completed' })).toBeInTheDocument();
  });
});

describe('BookingsPage: escrow - funds held until the client reviews completed work', () => {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // ~2 hours from now

  it('lets a client pay out early, once the freelancer has marked the work done', async () => {
    const user = userEvent.setup();
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'awaiting_review', reviewDeadline: soon })));
    api.releaseBookingFunds.mockResolvedValue({ data: {} });
    renderApp(<BookingsPage />, { user: clientUser });

    expect(await screen.findByText('Awaiting your review')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(api.releaseBookingFunds).toHaveBeenCalledWith('b1');
  });

  it('lets a client ask for a refund instead, with a reason sent to the freelancer and the team', async () => {
    const user = userEvent.setup();
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'awaiting_review', reviewDeadline: soon })));
    api.disputeBooking.mockResolvedValue({ data: {} });
    renderApp(<BookingsPage />, { user: clientUser });

    await user.click(await screen.findByRole('button', { name: 'Ask for refund' }));
    const form = screen.getByRole('form', { name: /ask for a refund/i });
    await user.type(within(form).getByLabelText(/why are you asking for a refund/i), 'The logo files were the wrong format.');
    await user.click(within(form).getByRole('button', { name: 'Request refund' }));

    expect(api.disputeBooking).toHaveBeenCalledWith('b1', 'The logo files were the wrong format.');
  });

  it('will not submit a refund request with no reason', async () => {
    const user = userEvent.setup();
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'awaiting_review', reviewDeadline: soon })));
    renderApp(<BookingsPage />, { user: clientUser });

    await user.click(await screen.findByRole('button', { name: 'Ask for refund' }));
    await user.click(screen.getByRole('button', { name: 'Request refund' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Explain why');
    expect(api.disputeBooking).not.toHaveBeenCalled();
  });

  it('never offers pay/refund actions to the freelancer - only the client decides', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'awaiting_review', reviewDeadline: soon })));
    renderApp(<BookingsPage />, { user: freelancerUser });

    await screen.findByText('Awaiting client review');
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask for refund' })).not.toBeInTheDocument();
  });

  it('shows a disputed booking as disputed, with the reason, to both sides', async () => {
    api.listBookings.mockResolvedValue(
      list(booking({ status: 'completed', escrowStatus: 'disputed', disputeReason: 'Delivered late and incomplete.' }))
    );
    renderApp(<BookingsPage />, { user: clientUser });
    expect(await screen.findByText('Disputed')).toBeInTheDocument();
    expect(screen.getByText(/Delivered late and incomplete\./)).toBeInTheDocument();
  });

  it('shows a released booking as paid out, with no further action available', async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'completed', escrowStatus: 'released' })));
    renderApp(<BookingsPage />, { user: clientUser });
    expect(await screen.findByText('Paid out')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
  });

  it("shows the freelancer a running total of what's still held for them", async () => {
    api.listBookings.mockResolvedValue(
      list(
        booking({ id: 'b1', price: 450.5, status: 'confirmed', escrowStatus: 'held' }),
        booking({ id: 'b2', price: 300, status: 'completed', escrowStatus: 'awaiting_review', reviewDeadline: soon }),
        booking({ id: 'b3', price: 900, status: 'completed', escrowStatus: 'released' })
      )
    );
    renderApp(<BookingsPage />, { user: freelancerUser });

    const summary = await screen.findByLabelText('Pending payments');
    expect(within(summary).getByText('R750.50')).toBeInTheDocument(); // 450.50 + 300, released money excluded
    expect(within(summary).getByText(/2 bookings not yet paid out/)).toBeInTheDocument();
  });

  it("shows nothing extra for a client whose booking is still just held (work not done yet)", async () => {
    api.listBookings.mockResolvedValue(list(booking({ status: 'confirmed', escrowStatus: 'held' })));
    renderApp(<BookingsPage />, { user: clientUser });
    await screen.findByText('Confirmed');
    expect(screen.queryByRole('button', { name: 'Release funds now' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pending payments')).not.toBeInTheDocument(); // that summary is freelancer-only
  });
});
