import { Link } from 'react-router-dom';
import { CATEGORIES } from '../utils/constants';

const REPO = 'https://github.com/SG-NYANDA/HustleHub-';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="wordmark" aria-label="HustleHub+ home">
            HustleHub<span className="wordmark-plus">+</span>
          </Link>
          <p>A marketplace where freelancers list what they do and clients book it, with prices in rand and every booking recorded.</p>
        </div>

        <nav aria-label="Marketplace" className="footer-col">
          <h2>Marketplace</h2>
          <Link to="/gigs">Explore all gigs</Link>
          {CATEGORIES.slice(0, 5).map((c) => (
            <Link key={c.value} to={`/gigs?category=${c.value}`}>
              {c.label}
            </Link>
          ))}
        </nav>

        <nav aria-label="Selling" className="footer-col">
          <h2>Selling</h2>
          <Link to="/register">Become a seller</Link>
          <Link to="/#how-it-works">How it works</Link>
          <Link to="/help#getting-paid">Getting paid</Link>
        </nav>

        <nav aria-label="Support" className="footer-col">
          <h2>Support</h2>
          <Link to="/help">Help centre</Link>
          <Link to="/contact">Contact us</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms of use</Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Project on GitHub
          </a>
        </nav>
      </div>
      <div className="footer-base">
        <p>© {new Date().getFullYear()} HustleHub+. A student project by Group 1.</p>
        <p>Payments are simulated: no real money moves. Prices are in South African rand (ZAR).</p>
      </div>
    </footer>
  );
}
