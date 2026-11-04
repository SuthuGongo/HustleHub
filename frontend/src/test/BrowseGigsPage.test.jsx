import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import BrowseGigsPage from '../pages/BrowseGigsPage';
import { clientUser, freelancerUser, renderApp, sampleGig } from './utils';

vi.mock('../api/hustlehub');

const listResponse = (gigs) => ({ data: { gigs, pagination: { page: 1, limit: 9, total: gigs.length, totalPages: 1 } } });

describe('BrowseGigsPage', () => {
  beforeEach(() => {
    api.listGigs.mockResolvedValue(listResponse([sampleGig]));
  });

  it('lets anonymous visitors browse, and each card links to its own gig page', async () => {
    renderApp(<BrowseGigsPage />, { route: '/gigs' }); // nobody is logged in
    const link = await screen.findByRole('link', { name: 'Logo & brand identity design' });
    expect(link).toHaveAttribute('href', '/gigs/g1');
    expect(screen.getByText(/1 gig available/)).toBeInTheDocument();
  });

  it('does not call a gig with no known seller "Your gig" for an anonymous visitor', async () => {
    api.listGigs.mockResolvedValue({ data: { gigs: [{ ...sampleGig, freelancer: null }], pagination: { page: 1, limit: 9, total: 1, totalPages: 1 } } });
    renderApp(<BrowseGigsPage />, { route: '/gigs' });
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });
    expect(screen.queryByText('Your gig')).not.toBeInTheDocument();
  });

  it('shows the owner their own gig as "Your gig"', async () => {
    renderApp(<BrowseGigsPage />, { user: freelancerUser }); // sampleGig belongs to freelancer f1
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });
    expect(screen.getByText('Your gig')).toBeInTheDocument();
  });

  it('reads the search, category, sort and page from the address (shareable links)', async () => {
    renderApp(<BrowseGigsPage />, { route: '/gigs?q=logo&category=design&sort=top&page=2' });
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });
    expect(api.listGigs).toHaveBeenCalledWith({ q: 'logo', category: 'design', sort: 'top', page: 2, limit: 9 });
    expect(screen.getByLabelText('Search')).toHaveValue('logo');
    expect(screen.getByRole('button', { name: 'Design and creative' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Sort by')).toHaveValue('top');
  });

  it('ignores junk in the address instead of sending it to the API', async () => {
    renderApp(<BrowseGigsPage />, { route: '/gigs?category=hacking&sort=cheapest&page=-4' });
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });
    expect(api.listGigs).toHaveBeenCalledWith({ q: '', category: '', sort: 'newest', page: 1, limit: 9 });
  });

  it('can sort by top rated', async () => {
    const user = userEvent.setup();
    renderApp(<BrowseGigsPage />);
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });
    await user.selectOptions(screen.getByLabelText('Sort by'), 'top');
    await vi.waitFor(() => expect(api.listGigs).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'top', page: 1 })));
  });

  it('shows a helpful empty state', async () => {
    api.listGigs.mockResolvedValue(listResponse([]));
    renderApp(<BrowseGigsPage />, { user: clientUser });
    expect(await screen.findByRole('heading', { name: 'No gigs match your search' })).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    api.listGigs.mockRejectedValue(new Error('Cannot reach the server. Check your connection and try again.'));
    renderApp(<BrowseGigsPage />, { user: clientUser });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  it('filters by category chip', async () => {
    const user = userEvent.setup();
    renderApp(<BrowseGigsPage />, { user: clientUser });
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });

    const design = screen.getByRole('button', { name: 'Design and creative' });
    expect(design).toHaveAttribute('aria-pressed', 'false');
    await user.click(design);

    expect(design).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    await vi.waitFor(() => expect(api.listGigs).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'design', page: 1 })));
  });

  it('searches the API with the typed keyword', async () => {
    const user = userEvent.setup();
    renderApp(<BrowseGigsPage />, { user: clientUser });
    await screen.findByRole('heading', { name: 'Logo & brand identity design' });

    await user.type(screen.getByLabelText('Search'), 'logo');

    await vi.waitFor(() => expect(api.listGigs).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'logo', page: 1 })));
  });
});
