import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import BookingDialog from '../components/BookingDialog';
import DataState from '../components/DataState';
import ReviewList from '../components/ReviewList';
import StatusPage from '../components/StatusPage';
import sadImage from '../assets/404-sadness.png';
import { TextSkeleton } from '../components/Skeleton';
import { Stars } from '../components/StarRating';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/hustlehub';
import { ROLES, categoryLabel } from '../utils/constants';
import { formatDate, formatRand, pluralise } from '../utils/format';
import { decodeEntities } from '../utils/text';
import { useTitle } from '../utils/useTitle';
import { useAsync } from '../utils/useAsync';

function OrderBox({ gig, user, onBook }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isOwn = user && String(gig.freelancer?.id) === user.id;
  const from = { from: location.pathname };
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState('');

  const messageSeller = async () => {
    setMessaging(true);
    setMessageError('');
    try {
      const { data } = await api.startConversation(gig.id);
      navigate(`/messages/${data.conversation.id}`);
    } catch (err) {
      setMessageError(err.message);
      setMessaging(false);
    }
  };

  let action;
  if (!user) {
    action = (
      <>
        <Link className="btn btn-primary btn-wide" to="/login" state={from}>
          Log in to book
        </Link>
        <p className="order-alt">
          New here?{' '}
          <Link to="/register" state={from}>
            Create a free account
          </Link>
        </p>
      </>
    );
  } else if (user.role === ROLES.CLIENT) {
    action = (
      <>
        <button type="button" className="btn btn-primary btn-wide" onClick={onBook}>
          Book for {formatRand(gig.price)}
        </button>
        <button type="button" className="btn btn-quiet btn-wide" onClick={messageSeller} disabled={messaging}>
          {messaging ? 'Opening chat…' : 'Message the seller'}
        </button>
        {messageError && (
          <p className="field-error" role="alert">
            {messageError}
          </p>
        )}
      </>
    );
  } else if (isOwn) {
    action = (
      <>
        <p className="order-note">This is your gig{gig.isActive ? '.' : ' and it is currently paused, so only you can see it.'}</p>
        <Link className="btn btn-quiet btn-wide" to="/my-gigs">
          Manage my gigs
        </Link>
      </>
    );
  } else {
    action = <p className="order-note">Only client accounts can book gigs. {user.role === ROLES.FREELANCER ? 'Register a separate client account to hire other freelancers.' : ''}</p>;
  }

  return (
    <aside className="order-box" aria-label="Order this gig">
      <h2 className="order-title">Order summary</h2>
      <div className="order-line">
        <span>Service price</span>
        <span>{formatRand(gig.price)}</span>
      </div>
      <div className="order-line">
        <span>Delivery time</span>
        <span>{pluralise(gig.deliveryDays, 'day')}</span>
      </div>
      <div className="order-total">
        <span>Total</span>
        <span className="order-total-amount">{formatRand(gig.price)}</span>
      </div>
      {action}
      <p className="order-demo">This is a simulated payment for demo purposes - no real money moves.</p>
    </aside>
  );
}

export default function GigDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [booking, setBooking] = useState(false);
  const gigState = useAsync(() => api.getGig(id), [id]);
  const reviewState = useAsync(() => api.listGigReviews(id), [id]);

  const gig = gigState.data?.gig;
  const seller = gigState.data?.seller;
  const title = gig ? decodeEntities(gig.title) : '';
  useTitle(title || 'Gig');

  // Only a genuine "no such gig" is reported as not found; a network or server problem gets a retry panel instead.
  const notFound = !gig && [400, 404, 422].includes(gigState.errorStatus);

  return (
    <DataState loading={gigState.loading} error={notFound ? '' : gigState.error} errorStatus={gigState.errorStatus} onRetry={gigState.reload} skeleton={<div className="detail"><div className="skel skel-hero" /><TextSkeleton lines={5} /></div>}>
      {notFound ? (
        <StatusPage
          code="404"
          title="This gig isn't available"
          image={sadImage}
          imageAlt=""
          actions={
            <Link className="btn btn-primary" to="/gigs">
              Explore other gigs
            </Link>
          }
        >
          <p>It may have been removed, or paused by its owner.</p>
        </StatusPage>
      ) : (
        gig && (
          <>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link to={`/gigs?category=${gig.category}`}>{categoryLabel(gig.category)}</Link>
            </nav>

            <div className="detail">
              <div className="detail-head">
                <h1>{title}</h1>
                <p className="detail-by">
                  <Avatar name={seller.name} size="sm" />
                  <strong>{decodeEntities(seller.name)}</strong>
                  <Stars value={gig.ratingAvg} count={gig.ratingCount} />
                </p>
              </div>

              <OrderBox gig={gig} user={user} onBook={() => setBooking(true)} />

              <div className="detail-body">
                <section aria-labelledby="about-gig" className="detail-block">
                  <h2 id="about-gig">About this gig</h2>
                  <p className="detail-desc">{decodeEntities(gig.description)}</p>
                </section>

                <section aria-labelledby="about-seller" className="detail-block seller-card">
                  <h2 id="about-seller">About the seller</h2>
                  <div className="seller-row">
                    <Avatar name={seller.name} size="lg" />
                    <div>
                      <strong>{decodeEntities(seller.name)}</strong>
                      <Stars value={seller.ratingAvg} count={seller.ratingCount} />
                    </div>
                  </div>
                  <dl className="seller-stats">
                    <div>
                      <dt>Member since</dt>
                      <dd>{formatDate(seller.memberSince)}</dd>
                    </div>
                    <div>
                      <dt>Orders completed</dt>
                      <dd>{seller.completedOrders}</dd>
                    </div>
                    <div>
                      <dt>Live gigs</dt>
                      <dd>{seller.activeGigs}</dd>
                    </div>
                  </dl>
                </section>

                <section aria-labelledby="reviews-title" className="detail-block">
                  <h2 id="reviews-title">Reviews</h2>
                  <DataState loading={reviewState.loading} error={reviewState.error} errorStatus={reviewState.errorStatus} onRetry={reviewState.reload} skeleton={<TextSkeleton lines={3} />}>
                    {reviewState.data && <ReviewList reviews={reviewState.data.reviews} summary={reviewState.data.summary} />}
                  </DataState>
                </section>
              </div>
            </div>

            {booking && <BookingDialog gig={gig} onClose={() => setBooking(false)} />}
          </>
        )
      )}
    </DataState>
  );
}
