import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/hustlehub';
import HomePage from '../pages/HomePage';
import { CATEGORIES } from '../utils/constants';
import { Where, clientUser, renderApp, sampleGig } from './utils';

vi.mock('../api/hustlehub');

const gigs = [
  { ...sampleGig, id: 'g1' },
  { ...sampleGig, id: 'g2', title: 'One-page website', category: 'development', price: 2500 },
  { ...sampleGig, id: 'g3', title: 'Maths tutoring', category: 'tutoring', price: 900 },
];
const home = (extra = {}) => ({ route: '/x', path: '*', stub: false, ...extra });

describe('HomePage', () => {
  beforeEach(() => {
    api.getCategoryCounts.mockResolvedValue({
      data: { categories: ['design', 'writing', 'development', 'marketing', 'video', 'tutoring', 'admin', 'other'].map((category, i) => ({ category, count: i === 0 ? 1 : 0 })) },
    });
    api.listGigs.mockResolvedValue({ data: { gigs, pagination: { page: 1, limit: 6, total: 3, totalPages: 1 } } });
  });

  it('greets visitors with a headline, a search box and a call to action', async () => {
    renderApp(<HomePage />, home());
    expect(screen.getByRole('heading', { level: 1, name: 'Find the right freelancer for the job' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'What do you need done?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready to get started?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });

  it('leads visitors to sign up or log in, straight from the hero', () => {
    renderApp(<HomePage />, home());
    const hero = screen.getByRole('region', { name: 'Find the right freelancer for the job' });
    expect(within(hero).getByRole('link', { name: 'Create free account' })).toHaveAttribute('href', '/register');
    expect(within(hero).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('opens the right sign-up from each "how it works" column', () => {
    renderApp(<HomePage />, home());
    expect(screen.getByRole('link', { name: 'Start hiring' })).toHaveAttribute('href', '/register?role=client');
    expect(screen.getByRole('link', { name: 'Start selling' })).toHaveAttribute('href', '/register?role=freelancer');
  });

  it('shows no sign-up buttons to someone who is already signed in', () => {
    renderApp(<HomePage />, home({ user: clientUser }));
    ['Create free account', 'Start hiring', 'Start selling'].forEach((name) => expect(screen.queryByRole('link', { name })).not.toBeInTheDocument());
  });

  it('lists every category with how many live gigs it has', async () => {
    renderApp(<HomePage />, home());
    const section = screen.getByRole('region', { name: 'Browse by category' });
    const design = await within(section).findByRole('link', { name: /Design and creative/ });
    expect(design).toHaveAttribute('href', '/gigs?category=design');
    expect(design).toHaveTextContent('1 gig');
    expect(within(section).getByRole('link', { name: /Tutoring/ })).toHaveTextContent('0 gigs');
    expect(within(section).getAllByRole('listitem')).toHaveLength(CATEGORIES.length); // one per real category - whatever that count is today
  });

  it('shows the newest gigs as cards and links each to its page', async () => {
    renderApp(<HomePage />, home());
    const grid = await screen.findByRole('list', { name: 'Newest gigs' });
    expect(within(grid).getAllByRole('article')).toHaveLength(3);
    expect(within(grid).getByRole('link', { name: 'One-page website' })).toHaveAttribute('href', '/gigs/g2');
    expect(api.listGigs).toHaveBeenCalledWith({ sort: 'newest', limit: 6 });
  });

  it('never shows star ratings or review counts on the landing page', async () => {
    renderApp(<HomePage />, home());
    const grid = await screen.findByRole('list', { name: 'Newest gigs' });
    expect(within(grid).getAllByRole('article')).toHaveLength(3);
    expect(within(grid).queryByRole('img', { name: /rated/i })).not.toBeInTheDocument();
    expect(grid.textContent).not.toMatch(/\(\d+\)|New\b/); // no "(12)" counts and no "New" rating label
  });

  it('has no floating showcase cards: the page is plain, honest content', () => {
    const { container } = renderApp(<HomePage />, home());
    expect(container.querySelector('.hero-stack, .hero-card')).toBeNull();
  });

  it('lists what people can rely on, in plain words', () => {
    renderApp(<HomePage />, home());
    const section = screen.getByRole('region', { name: 'What you can count on' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(4);
    expect(within(section).getByText('Reviews from real bookings')).toBeInTheDocument();
  });

  it('explains how it works for both clients and freelancers', () => {
    renderApp(<HomePage />, home());
    const how = screen.getByRole('region', { name: 'How HustleHub+ works' });
    expect(within(how).getByRole('heading', { name: 'If you want to hire' })).toBeInTheDocument();
    expect(within(how).getByRole('heading', { name: 'If you want to earn' })).toBeInTheDocument();
    expect(within(how).getAllByRole('listitem')).toHaveLength(6);
  });

  it('searches and lands on the results page', async () => {
    const user = userEvent.setup();
    renderApp(<><HomePage /><Where /></>, home());
    await user.type(screen.getByRole('searchbox', { name: 'What do you need done?' }), 'website{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/gigs?q=website');
  });

  it('offers quick popular searches', () => {
    renderApp(<HomePage />, home());
    expect(screen.getByRole('link', { name: 'Logo design' })).toHaveAttribute('href', '/gigs?q=Logo%20design');
  });

  it('welcomes a signed-in person by name and drops the sign-up banner', () => {
    renderApp(<HomePage />, home({ user: clientUser }));
    expect(screen.getByText('Welcome back, Aisha')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to get started?' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to your marketplace/i })).toHaveAttribute('href', '/gigs');
  });

  it('still shows the page if the gigs cannot be loaded', async () => {
    api.listGigs.mockRejectedValue(new Error('Cannot reach the server. Check your connection and try again.'));
    renderApp(<HomePage />, home());
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
