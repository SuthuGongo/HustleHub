import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import CategoryIcon from './CategoryIcon';
import { Stars } from './StarRating';
import { categoryLabel } from '../utils/constants';
import { formatRand, pluralise } from '../utils/format';
import { decodeEntities } from '../utils/text';

// showRating={false} is used on the landing page, which should never look like it is advertising reviews.
export default function GigCard({ gig, isOwn = false, showRating = true }) {
  const title = decodeEntities(gig.title);
  const freelancerName = decodeEntities(gig.freelancer?.name ?? '');

  return (
    <article className="gig-card">
      <div className="gig-cover" data-category={gig.category} aria-hidden="true">
        <span className="gig-icon">
          <CategoryIcon category={gig.category} />
        </span>
      </div>
      <div className="gig-card-body">
        <p className="gig-category">{categoryLabel(gig.category)}</p>
        <h3 className="gig-title">
          <Link to={`/gigs/${gig.id}`} className="stretched-link">
            {title}
          </Link>
        </h3>
        <p className="gig-by">
          <Avatar name={gig.freelancer?.name ?? ''} size="xs" />
          <span>{isOwn ? 'Your gig' : freelancerName}</span>
        </p>
        <p className="gig-desc">{decodeEntities(gig.description)}</p>
        <div className="gig-foot">
          <span className="gig-foot-meta">
            {showRating ? <Stars value={gig.ratingAvg} count={gig.ratingCount} /> : <span>Delivery</span>}
            <span>{pluralise(gig.deliveryDays, 'day')}</span>
          </span>
          <span className="gig-foot-price" aria-label={`Price ${formatRand(gig.price)}`}>
            <span className="gig-foot-price-label">From</span>
            <span className="gig-foot-price-amount">{formatRand(gig.price)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
