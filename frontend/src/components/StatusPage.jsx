import { useTitle } from '../utils/useTitle';

// One layout for every "something other than the normal page" scenario (not found, no access, crashed...),
// so they all feel like the same site: a code, a plain-language headline, a short explanation, and next steps.
export default function StatusPage({ code, title, children, actions, tabTitle, image, imageAlt, imageFramed }) {
  useTitle(tabTitle ?? title);
  return (
    <section className="status-page" aria-labelledby="status-title">
      {image && (
        <img
          src={image}
          alt={imageAlt || ''}
          className={imageFramed ? 'status-image status-image-framed' : 'status-image'}
        />
      )}
      <div className="status-body">
        {code && (
          <p className="status-code" aria-hidden="true">
            {code}
          </p>
        )}
        <h1 id="status-title">{title}</h1>
        <div className="status-text">{children}</div>
        {actions && <div className="status-actions">{actions}</div>}
      </div>
    </section>
  );
}
