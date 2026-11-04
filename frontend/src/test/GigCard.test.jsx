import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GigCard from '../components/GigCard';
import { renderApp, sampleGig } from './utils';

describe('GigCard', () => {
  it('shows readable text, price, delivery time and freelancer', () => {
    renderApp(<GigCard gig={sampleGig} />);
    // The API stores "&" as "&amp;" - people must see a plain ampersand.
    expect(screen.getByRole('heading', { name: 'Logo & brand identity design' })).toBeInTheDocument();
    expect(screen.getByText('R450.50')).toBeInTheDocument();
    expect(screen.getByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
  });

  it('renders malicious markup as inert text, never as elements', () => {
    const evil = { ...sampleGig, title: '&lt;img src=x onerror=alert(1)&gt;', description: '&lt;script&gt;alert(1)&lt;&#x2F;script&gt; padding text here' };
    const { container } = renderApp(<GigCard gig={evil} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  it('links through to the gig page and shows its rating', () => {
    renderApp(<GigCard gig={sampleGig} />);
    expect(screen.getByRole('link', { name: 'Logo & brand identity design' })).toHaveAttribute('href', '/gigs/g1');
    expect(screen.getByRole('img', { name: 'Rated 4.8 out of 5, 12 reviews' })).toBeInTheDocument();
  });

  it('never labels a gig "Your gig" when nobody is signed in, even if the seller is unknown', () => {
    renderApp(<GigCard gig={{ ...sampleGig, freelancer: null }} isOwn={false} />);
    expect(screen.queryByText('Your gig')).not.toBeInTheDocument();
  });

  it('can hide the rating entirely (used on the landing page)', () => {
    renderApp(<GigCard gig={sampleGig} showRating={false} />);
    expect(screen.queryByRole('img', { name: /rated/i })).not.toBeInTheDocument();
    expect(screen.queryByText('(12)')).not.toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
  });

  it('marks a gig with no reviews as new instead of showing empty stars', () => {
    renderApp(<GigCard gig={{ ...sampleGig, ratingAvg: 0, ratingCount: 0 }} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('labels the owner\'s own gig', () => {
    renderApp(<GigCard gig={sampleGig} isOwn />);
    expect(screen.getByText('Your gig')).toBeInTheDocument();
  });

  it('shows the category cover with its icon, and the category name', () => {
    const { container } = renderApp(<GigCard gig={sampleGig} />);
    const cover = container.querySelector('.gig-cover');
    expect(cover).toHaveAttribute('data-category', 'design'); // the flat cover colour comes from the category
    expect(cover.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Design and creative')).toBeInTheDocument();
  });
});
