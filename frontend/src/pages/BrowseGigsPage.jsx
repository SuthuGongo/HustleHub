import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataState from '../components/DataState';
import GigCard from '../components/GigCard';
import { GigGridSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/hustlehub';
import { CATEGORIES, categoryLabel } from '../utils/constants';
import { pluralise } from '../utils/format';
import { useTitle } from '../utils/useTitle';
import { useAsync, useDebouncedValue } from '../utils/useAsync';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'top', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];
const SORT_VALUES = SORTS.map((s) => s.value);
const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

// The address bar is the source of truth for the search, so results can be bookmarked, shared and reached
// from the header search box, the home page and the footer.
export default function BrowseGigsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const q = (params.get('q') ?? '').slice(0, 100);
  const category = CATEGORY_VALUES.includes(params.get('category')) ? params.get('category') : '';
  const sort = SORT_VALUES.includes(params.get('sort')) ? params.get('sort') : 'newest';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const setParam = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: '', ...changes }).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };

  // Typing updates the box immediately; the address (and the search) follows after a short pause.
  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text, 300);
  const latestDebounced = useRef(debounced);
  latestDebounced.current = debounced;
  useEffect(() => {
    if (q !== latestDebounced.current.trim()) setText(q); // the address changed from elsewhere (e.g. the header search)
  }, [q]);
  useEffect(() => {
    if (debounced.trim() !== q) setParam({ q: debounced.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, loading, error, errorStatus, reload } = useAsync(() => api.listGigs({ q, category, sort, page, limit: 9 }), [q, category, sort, page]);

  const gigs = data?.gigs ?? [];
  const pagination = data?.pagination;
  useTitle(category ? categoryLabel(category) : q ? `Results for “${q}”` : 'Explore gigs');

  return (
    <>
      <header className="page-head">
        <h1>{category ? categoryLabel(category) : 'Explore gigs'}</h1>
        <p className="muted">
          {pagination ? `${pluralise(pagination.total, 'gig')} ${q ? `matching “${q}”` : 'available'}` : 'Find someone to help with your next project.'}
        </p>
      </header>

      <form className="filters" role="search" aria-label="Filter gigs" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor="gig-search">Search</label>
          <input id="gig-search" type="search" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} placeholder="Logo, tutoring, website…" />
        </div>
        <div className="field">
          <label htmlFor="gig-sort">Sort by</label>
          <select id="gig-sort" value={sort} onChange={(e) => setParam({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="chips" role="group" aria-label="Category">
          {[{ value: '', label: 'All' }, ...CATEGORIES].map((c) => (
            <button key={c.value || 'all'} type="button" className="chip" aria-pressed={category === c.value} onClick={() => setParam({ category: c.value })}>
              {c.label}
            </button>
          ))}
        </div>
      </form>

      <DataState
        loading={loading && !data}
        error={error} errorStatus={errorStatus} onRetry={reload}
        skeleton={<GigGridSkeleton count={6} />}
        empty={!loading && gigs.length === 0}
        emptyTitle="No gigs match your search"
        emptyText="Try a different keyword or category."
      >
        <ul className="gig-grid" aria-label="Available gigs">
          {gigs.map((gig) => (
            <li key={gig.id}>
              <GigCard gig={gig} isOwn={Boolean(user) && gig.freelancer?.id === user.id} />
            </li>
          ))}
        </ul>

        {pagination && pagination.totalPages > 1 && (
          <nav className="pager" aria-label="Pagination">
            <button type="button" className="btn btn-quiet" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button type="button" className="btn btn-quiet" disabled={page >= pagination.totalPages} onClick={() => setParam({ page: String(page + 1) })}>
              Next
            </button>
          </nav>
        )}
      </DataState>
    </>
  );
}
