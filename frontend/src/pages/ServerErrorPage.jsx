import { Link } from 'react-router-dom';
import StatusPage from '../components/StatusPage';
import anxietyImage from '../assets/500-anxiety.png';

// 500: the page itself crashed. Nothing technical is shown; the person can retry or leave.
export default function ServerErrorPage() {
  return (
    <StatusPage
      code="500"
      title="Something went wrong"
      image={anxietyImage}
      imageAlt=""
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <Link className="btn btn-quiet" to="/">
            Back to home
          </Link>
        </>
      }
    >
      <p>Something broke on our side while showing this page. It's not your fault, and nothing you did has been lost.</p>
      <p>
        Reloading usually fixes it. If it keeps happening, please <Link to="/contact?topic=bug">tell the team</Link>.
      </p>
    </StatusPage>
  );
}
