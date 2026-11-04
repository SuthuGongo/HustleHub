import { Link, useNavigate } from 'react-router-dom';
import StatusPage from './StatusPage';
import { useAuth } from '../context/AuthContext';
import { HOME_BY_ROLE, ROLE_LABELS } from '../utils/constants';
import sadnessImage from '../assets/403-sadness.png';

const list = (roles) => roles.map((r) => ROLE_LABELS[r] ?? r).join(' or ');

// 403: signed in, but this page belongs to a different type of account.
export default function AccessDenied({ roles, user }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const switchAccount = () => {
    logout();
    navigate('/login');
  };

  return (
    <StatusPage
      code="403"
      title="This page is for a different account"
      tabTitle="No access"
      image={sadnessImage}
      imageAlt=""
      actions={
        <>
          <Link className="btn btn-primary" to={HOME_BY_ROLE[user.role] || '/'}>
            Go to my home page
          </Link>
          <button type="button" className="btn btn-quiet" onClick={switchAccount}>
            Log in with a different account
          </button>
        </>
      }
    >
      <p>
        This area is only for {list(roles)} accounts, and you're signed in as {ROLE_LABELS[user.role] === 'administrator' ? 'an' : 'a'} {ROLE_LABELS[user.role] ?? user.role}.
      </p>
      <p>Account types are chosen when you register and can't be changed. To use this area you would need a separate account.</p>
    </StatusPage>
  );
}
