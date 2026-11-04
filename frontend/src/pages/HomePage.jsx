import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CategoryIcon from '../components/CategoryIcon';
import DataState from '../components/DataState';
import GigCard from '../components/GigCard';
import { GigGridSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/hustlehub';
import { CATEGORIES, HOME_BY_ROLE } from '../utils/constants';
import { pluralise } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useTitle } from '../utils/useTitle';
import { useAsync } from '../utils/useAsync';

const POPULAR = ['Logo design', 'Website', 'Translation', 'Tutoring', 'Video editing'];

const PRINCIPLES = [
  { title: 'Reviews from real bookings', text: 'Only a client whose booking was completed can review a gig.' },
  { title: 'A price that stays put', text: 'The price is fixed when you book, so it cannot change afterwards.' },
  { title: 'Every payment recorded', text: 'Each booking creates a transaction that both sides can see.' },
  { title: 'Your account is protected', text: 'Passwords are hashed and sessions expire automatically.' },
];

const CLIENT_STEPS = [
  { title: 'Browse and compare', text: 'Search by keyword or category, then read the reviews and check the seller.' },
  { title: 'Book in a few clicks', text: 'Add notes for the freelancer and pay with a simulated card - no real money moves.' },
  { title: 'Receive and review', text: 'When the freelancer marks the work completed, you can rate it.' },
];
const FREELANCER_STEPS = [
  { title: 'Create your gigs', text: 'Set a title, description, fixed price and delivery time.' },
  { title: 'Get booked', text: 'Bookings arrive with the client’s notes. Mark each one completed when you deliver.' },
  { title: 'Track your income', text: 'Every booking is recorded, so you always know what you have earned.' },
];

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const categories = useAsync(() => api.getCategoryCounts(), []);
  const latest = useAsync(() => api.listGigs({ sort: 'newest', limit: 6 }), []);
  useTitle();

  const counts = Object.fromEntries((categories.data?.categories ?? []).map((c) => [c.category, c.count]));
  const gigs = latest.data?.gigs ?? [];

  const search = (event) => {
    event.preventDefault();
    const text = q.trim();
    navigate(text ? `/gigs?q=${encodeURIComponent(text)}` : '/gigs');
  };

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        {user && <p className="hero-welcome">Welcome back, {decodeEntities(user.name).split(' ')[0]}</p>}
        <h1 id="hero-title">Find the right freelancer for the job</h1>
        <p className="hero-sub">Browse services from independent freelancers, book in a few clicks, and pay in rand.</p>

        <form className="hero-search" role="search" onSubmit={search}>
          <input type="search" aria-label="What do you need done?" placeholder="What do you need done?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>

        <p className="hero-popular">
          <span>Popular:</span>
          {POPULAR.map((term) => (
            <Link key={term} to={`/gigs?q=${encodeURIComponent(term)}`} className="chip chip-link">
              {term}
            </Link>
          ))}
        </p>

        {user ? (
          <Link className="btn btn-quiet" to={HOME_BY_ROLE[user.role] || '/gigs'}>
            Go to your {user.role === 'admin' ? 'admin console' : user.role === 'freelancer' ? 'gigs' : 'marketplace'}
          </Link>
        ) : (
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/register">
              Create free account
            </Link>
            <Link className="btn btn-quiet" to="/login">
              Log in
            </Link>
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="cats-title">
        <div className="section-head">
          <h2 id="cats-title">Browse by category</h2>
          <Link to="/gigs">See all gigs</Link>
        </div>
        <ul className="cat-grid">
          {CATEGORIES.map((c) => (
            <li key={c.value}>
              <Link to={`/gigs?category=${c.value}`} className="cat-tile" data-category={c.value}>
                <span className="cat-icon">
                  <CategoryIcon category={c.value} />
                </span>
                <span className="cat-name">{c.label}</span>
                <span className="cat-count">{categories.data ? pluralise(counts[c.value] ?? 0, 'gig') : ' '}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="latest-title">
        <div className="section-head">
          <h2 id="latest-title">New on HustleHub+</h2>
          <Link to="/gigs">See all gigs</Link>
        </div>
        <DataState loading={latest.loading} error={latest.error} errorStatus={latest.errorStatus} onRetry={latest.reload} skeleton={<GigGridSkeleton count={3} />} empty={gigs.length === 0} emptyTitle="No gigs yet" emptyText="Be the first to list a service.">
          <ul className="gig-grid" aria-label="Newest gigs">
            {gigs.map((gig) => (
              <li key={gig.id}>
                <GigCard gig={gig} isOwn={Boolean(user) && gig.freelancer?.id === user.id} showRating={false} />
              </li>
            ))}
          </ul>
        </DataState>
      </section>

      <section className="home-section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-head">
          <h2 id="how-title">How HustleHub+ works</h2>
        </div>
        <div className="how">
          {[
            { heading: 'If you want to hire', steps: CLIENT_STEPS, role: 'client', cta: 'Start hiring' },
            { heading: 'If you want to earn', steps: FREELANCER_STEPS, role: 'freelancer', cta: 'Start selling' },
          ].map((group) => (
            <div key={group.heading} className="how-col">
              <h3>{group.heading}</h3>
              <ol className="steps">
                {group.steps.map((s) => (
                  <li key={s.title}>
                    <strong>{s.title}</strong>
                    <p>{s.text}</p>
                  </li>
                ))}
              </ol>
              {!user && (
                <Link className="btn btn-primary" to={`/register?role=${group.role}`}>
                  {group.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="count-on-title">
        <div className="section-head">
          <h2 id="count-on-title">What you can count on</h2>
        </div>
        <ul className="principles">
          {PRINCIPLES.map((p) => (
            <li key={p.title}>
              <strong>{p.title}</strong>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {!user && (
        <section className="cta-band" aria-labelledby="cta-title">
          <div>
            <h2 id="cta-title">Ready to get started?</h2>
            <p>Join as a client to hire, or as a freelancer to sell. It takes about a minute.</p>
          </div>
          <div className="cta-actions">
            <Link className="btn btn-primary" to="/register">
              Create an account
            </Link>
            <Link className="btn btn-quiet" to="/login">
              Log in
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
