import { Link } from 'react-router-dom';
import { useTitle } from '../utils/useTitle';

function Article({ title, updated, children }) {
  useTitle(title);
  return (
    <article className="prose panel">
      <h1>{title}</h1>
      {updated && <p className="muted small">Last updated {updated}</p>}
      {children}
    </article>
  );
}

const FAQ = [
  { id: 'booking', q: 'How do I book a gig?', a: 'Open any gig, choose “Book”, add notes for the freelancer, then complete the payment step. You need a client account. The price is fixed at the moment you book.' },
  { id: 'real-payments', q: 'Is my payment real?', a: 'No - this is a student project, so payment is simulated. The card form on the booking dialog checks that a card number looks structurally valid (the same Luhn check real forms use) so the flow feels real, but nothing is ever sent anywhere, no card network is contacted, and no money moves. Use the sample number 4242 4242 4242 4242, any future expiry date and any 3-digit CVC.' },
  { id: 'getting-paid', q: 'How do freelancers get paid and track income?', a: 'Once a booking is made, a transaction is recorded linked to the freelancer. The Income page adds these up (total earned, number of paid bookings and the average per booking). Because payment is simulated, no money is actually transferred.' },
  { id: 'reviews', q: 'When can I leave a review?', a: 'After the freelancer marks your booking as completed you can rate the work from 1 to 5 stars and add a comment, once per booking. Reviews are shown on the gig and count towards the seller’s rating.' },
  { id: 'account-type', q: 'Can I be both a client and a freelancer?', a: 'Your account type is chosen when you register and cannot be changed. To hire other freelancers, register a second account with a different email address.' },
  { id: 'security', q: 'How is my account protected?', a: 'Passwords are stored as one-way hashes, the site runs over HTTPS, login attempts are rate-limited, and sessions expire automatically. Prices and payment amounts are always decided on the server.' },
  { id: 'contact', q: 'How do I contact the team?', a: 'Use the Contact page: write your message, choose what it is about, and send it. We reply to the email address you give us, and you get a reference number to quote if you follow up.' },
];

export function HelpPage() {
  return (
    <Article title="Help centre">
      <p>Quick answers to the most common questions.</p>

      <div className="help-callout">
        <p>
          Can't find what you need? <span className="muted">Send a message to the team and we'll reply by email.</span>
        </p>
        <Link className="btn btn-primary" to="/contact">
          Contact the team
        </Link>
      </div>

      <div className="faq">
        {FAQ.map((item) => (
          <details key={item.id} id={item.id}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
            {item.id === 'contact' && (
              <p>
                <Link to="/contact">Go to the Contact page</Link>
              </p>
            )}
          </details>
        ))}
      </div>

      <div className="help-callout">
        <p>Still stuck?</p>
        <Link className="btn btn-primary" to="/contact">
          Send us a message
        </Link>
      </div>
    </Article>
  );
}

export function PrivacyPage() {
  return (
    <Article title="Privacy" updated="September 2026">
      <p>This is a plain-language summary for a demonstration marketplace built as a student project. It describes what the app actually does with your information.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name, email address and role (client or freelancer), chosen when you register.</li>
        <li>A hash of your password. The password itself is never stored.</li>
        <li>What you create or do on the site: gigs, bookings, transaction records and reviews.</li>
        <li>Messages you send from the Contact page: your name, email address, the topic and your message. Only administrators can read them.</li>
        <li>A sign-in token kept in your browser’s session storage. It is removed when you close the tab or log out.</li>
      </ul>

      <h2>What we don’t collect</h2>
      <ul>
        <li>Card details. Payment is simulated for this demo - whatever you type into the card form stays in your browser and is never sent to our servers or anywhere else.</li>
        <li>Advertising or analytics data. There are no trackers and no cookies.</li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>Everyone can see gig details, a seller’s name, and reviews (with the reviewer’s name).</li>
        <li>Your email address is visible only to you and to site administrators.</li>
        <li>Bookings and transactions are visible only to the two people involved and to administrators.</li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>Passwords are hashed, traffic uses HTTPS, and access is limited by role. See the <Link to="/help#security">Help centre</Link> for more.</p>

      <h2>Your data</h2>
      <p>Because this is a demonstration, self-service account deletion is not available in this version. <Link to="/contact?topic=account">Contact the team</Link> to ask for your data to be removed.</p>
    </Article>
  );
}

export function TermsPage() {
  return (
    <Article title="Terms of use" updated="September 2026">
      <p>HustleHub+ is a demonstration marketplace. By using it you agree to the following.</p>

      <h2>Demo only</h2>
      <p>Payment is simulated. No real money is charged, held or paid out, and nothing you “buy” here is a real contract for services. Please don’t enter real card details - use the sample number 4242 4242 4242 4242 instead.</p>

      <h2>Your account</h2>
      <p>Keep your password private. You are responsible for what happens under your account. Your account type (client or freelancer) is fixed when you register.</p>

      <h2>Content</h2>
      <ul>
        <li>Only list services you are able to provide, with an accurate description and price.</li>
        <li>Don’t post anything unlawful, misleading, abusive or that infringes someone else’s rights.</li>
        <li>Reviews must be honest and based on your own booking.</li>
      </ul>

      <h2>Moderation</h2>
      <p>Administrators may remove gigs or disable accounts that break these terms.</p>

      <h2>No warranty</h2>
      <p>The service is provided as is, as part of a course project, without warranty of any kind.</p>
    </Article>
  );
}
