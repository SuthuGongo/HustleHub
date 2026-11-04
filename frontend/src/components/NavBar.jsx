import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { HOME_BY_ROLE } from '../utils/constants';
import { decodeEntities } from '../utils/text';

// Role-specific links. "Explore" is public and always shown first. "Messages" is added separately
// below (both roles get it, with an unread badge), since its count comes from ChatContext, not a
// plain static list like the rest of these.
const ROLE_LINKS = {
  client: [
    { to: '/bookings', label: 'My bookings' },
    { to: '/payments', label: 'Payments' },
  ],
  freelancer: [
    { to: '/my-gigs', label: 'My gigs' },
    { to: '/bookings', label: 'Bookings' },
    { to: '/income', label: 'Income' },
  ],
  admin: [{ to: '/admin', label: 'Administration' }],
};

function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const name = decodeEntities(user.name);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.name} size="sm" />
        <span className="account-name">{name.split(' ')[0]}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="chevron">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="account-menu" role="menu" aria-label="Account">
          <div className="account-head">
            <Avatar name={user.name} size="md" />
            <div>
              <strong>{name}</strong>
              <span className="muted small">{user.email}</span>
              <span className="pill pill-neutral">{user.role}</span>
            </div>
          </div>
          <Link role="menuitem" className="account-item" to={HOME_BY_ROLE[user.role] || '/'} onClick={() => setOpen(false)}>
            {user.role === 'admin' ? 'Administration' : user.role === 'freelancer' ? 'My gigs' : 'Browse gigs'}
          </Link>
          <Link role="menuitem" className="account-item" to="/account/security" onClick={() => setOpen(false)}>
            Security settings
          </Link>
          <button type="button" role="menuitem" className="account-item" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { unreadTotal, supportUnread } = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    setMenuOpen(false); // close the mobile menu after navigating
  }, [location.pathname, location.search]);

  const roleLinks = (user ? ROLE_LINKS[user.role] || [] : []).map((l) =>
    // The admin's one role link doubles as their "someone wrote in" notification - there is no
    // separate nav entry for it the way Messages has its own, so the badge rides on Administration.
    l.to === '/admin' ? { ...l, badge: supportUnread } : l
  );

  const links = [
    { to: '/gigs', label: 'Explore' },
    // Contact us is only shown to clients/freelancers and signed-out visitors - an admin *is* who this
    // form writes to, so a link inviting them to contact themselves makes no sense. Their equivalent
    // notification already rides on Administration instead (see roleLinks above).
    ...(user?.role !== 'admin' ? [{ to: '/contact', label: 'Contact us', badge: user ? supportUnread : 0 }] : []),
    ...(user && (user.role === 'client' || user.role === 'freelancer') ? [{ to: '/messages', label: 'Messages', badge: unreadTotal }] : []),
    ...roleLinks,
  ];

  const search = (event) => {
    event.preventDefault();
    const text = q.trim();
    navigate(text ? `/gigs?q=${encodeURIComponent(text)}` : '/gigs');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="wordmark" aria-label="HustleHub+ home">
          HustleHub<span className="wordmark-plus">+</span>
        </Link>

        <form className="header-search" role="search" onSubmit={search}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M11 4a7 7 0 105.2 11.7l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0011 4z" fill="currentColor" />
          </svg>
          <input type="search" aria-label="Search gigs" placeholder="Search gigs" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </form>

        <button
          type="button"
          className="menu-toggle"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span aria-hidden="true" className="burger" />
        </button>

        <nav id="main-nav" aria-label="Main" className={`topnav${menuOpen ? ' open' : ''}`}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to !== '/messages'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {l.label}
              {!!l.badge && (
                <span className="nav-badge" aria-label={`, ${l.badge} unread`}>
                  {l.badge > 9 ? '9+' : l.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-user">
          {user ? (
            <AccountMenu user={user} onLogout={handleLogout} />
          ) : (
            <>
              <Link to="/login" className="btn btn-quiet">
                Log in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
