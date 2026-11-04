import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusPage from '../components/StatusPage';
import sadImage from '../assets/404-sadness.png';

// 404: the address does not exist. Offer a search and the useful places to go next.
export default function NotFoundPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const search = (event) => {
    event.preventDefault();
    const text = q.trim();
    navigate(text ? `/gigs?q=${encodeURIComponent(text)}` : '/gigs');
  };

  return (
    <StatusPage
      code="404"
      title="We can't find that page"
      tabTitle="Page not found"
      image={sadImage}
      imageAlt=""
      actions={
        <>
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
          <Link className="btn btn-quiet" to="/gigs">
            Explore gigs
          </Link>
          <Link className="btn btn-quiet" to="/help">
            Help centre
          </Link>
        </>
      }
    >
      <p>The link may be old, or the address may have a typo. If you were looking for a service, try searching for it:</p>
      <form className="status-search" role="search" onSubmit={search}>
        <input type="search" aria-label="Search gigs" placeholder="What do you need done?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
    </StatusPage>
  );
}
