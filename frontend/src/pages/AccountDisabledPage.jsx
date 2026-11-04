import { Link } from 'react-router-dom';
import StatusPage from '../components/StatusPage';
import disabledImage from '../assets/account-disabled.jpg';

// Shown when someone tries to log in to an account an administrator has disabled.
export default function AccountDisabledPage() {
  return (
    <StatusPage
      title="This account has been disabled"
      image={disabledImage}
      imageAlt=""
      imageFramed
      actions={
        <>
          <Link className="btn btn-primary" to="/contact?topic=account">
            Contact the team
          </Link>
          <Link className="btn btn-quiet" to="/">
            Back to home
          </Link>
        </>
      }
    >
      <p>An administrator has switched this account off, so you can't log in right now.</p>
      <p>If you think this is a mistake, get in touch and we'll look into it.</p>
    </StatusPage>
  );
}
