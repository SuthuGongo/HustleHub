import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// Keep in sync with the auth-close animation duration in styles/index.css
export const CLOSE_MS = 520;

const reducedMotion = () =>
  typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The login/register card. Switching between the two closes the card in on its cut corners
// (top-left and bottom-right), then the other form opens back out of the same shape.
export default function AuthShell({ title, switchPrompt, switchLabel, switchTo, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState('opening'); // opening -> idle -> closing
  const timer = useRef(null);

  useEffect(() => {
    const settle = setTimeout(() => setPhase((p) => (p === 'opening' ? 'idle' : p)), 900);
    return () => {
      clearTimeout(settle);
      clearTimeout(timer.current);
    };
  }, []);

  const switchMode = (event) => {
    event.preventDefault();
    if (reducedMotion()) {
      navigate(switchTo, { state: location.state });
      return;
    }
    setPhase('closing');
    timer.current = setTimeout(() => navigate(switchTo, { state: location.state }), CLOSE_MS);
  };

  return (
    <div className={`auth auth--${phase}`}>
      <section className="auth-main" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        {children}
        <p className="auth-footer">
          {switchPrompt}{' '}
          <Link to={switchTo} state={location.state} onClick={switchMode}>
            {switchLabel}
          </Link>
        </p>
      </section>
    </div>
  );
}
