import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import Footer from './Footer';
import NavBar from './NavBar';
import OfflineBanner from './OfflineBanner';
import ServerErrorPage from '../pages/ServerErrorPage';

// Scroll to the top on navigation, or to the #section when the link has one (e.g. /#how-it-works).
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo?.(0, 0);
  }, [pathname, hash]);
}

export default function Layout() {
  useScrollOnNavigate();
  const { pathname } = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <NavBar />
      <OfflineBanner />
      <main id="main" className="page">
        <ErrorBoundary resetKey={pathname} fallback={<ServerErrorPage />}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
