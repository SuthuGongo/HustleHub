export const ROLES = { FREELANCER: 'freelancer', CLIENT: 'client', ADMIN: 'admin' };

export const CATEGORIES = [
  { value: 'design', label: 'Design and creative' },
  { value: 'writing', label: 'Writing and translation' },
  { value: 'development', label: 'Web and software' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'video', label: 'Video and audio' },
  { value: 'tutoring', label: 'Tutoring' },
  { value: 'admin', label: 'Admin support' },
  { value: 'photography', label: 'Photography' },
  { value: 'consulting', label: 'Business consulting' },
  { value: 'events', label: 'Events and entertainment' },
  { value: 'other', label: 'Other' },
];

export const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

// Must match the topics the API accepts (backend/src/utils/constants.js).
export const CONTACT_TOPICS = [
  { value: 'general', label: 'A general question' },
  { value: 'account', label: 'My account or login' },
  { value: 'payment', label: 'A payment or booking' },
  { value: 'gig', label: 'A gig or a review' },
  { value: 'bug', label: 'Something is not working' },
  { value: 'other', label: 'Something else' },
];
export const topicLabel = (value) => CONTACT_TOPICS.find((t) => t.value === value)?.label ?? value;

export const ROLE_LABELS = { client: 'client', freelancer: 'freelancer', admin: 'administrator' };

export const HOME_BY_ROLE = {
  client: '/gigs',
  freelancer: '/my-gigs',
  admin: '/admin',
};

// Mirrors the `roles` prop each <ProtectedRoute> is given in App.jsx. Kept here, next to
// HOME_BY_ROLE, as the one other place that needs to know which roles a path allows.
const ROUTE_ROLES = [
  { prefix: '/my-gigs', roles: [ROLES.FREELANCER] },
  { prefix: '/income', roles: [ROLES.FREELANCER] },
  { prefix: '/payments', roles: [ROLES.CLIENT] },
  { prefix: '/admin', roles: [ROLES.ADMIN] },
  { prefix: '/bookings', roles: [ROLES.CLIENT, ROLES.FREELANCER] },
  { prefix: '/messages', roles: [ROLES.CLIENT, ROLES.FREELANCER] },
];

// Where to send someone right after they log in or finish registering. `from` is wherever
// ProtectedRoute bounced them from before they had a session - but on a shared browser, that page
// may have been remembered for a DIFFERENT account (e.g. a freelancer's session expired while on
// /my-gigs, and later a client logs in on that same tab). Blindly honouring `from` in that case
// would send the newly-logged-in person straight into a 403 "wrong account type" page instead of
// their own home page. So `from` is only trusted when the role that just logged in is actually
// allowed on that route.
export function resolveHomeAfterAuth(from, role) {
  if (!from) return HOME_BY_ROLE[role] || '/';
  const restriction = ROUTE_ROLES.find((r) => from === r.prefix || from.startsWith(`${r.prefix}/`));
  if (restriction && !restriction.roles.includes(role)) {
    return HOME_BY_ROLE[role] || '/';
  }
  return from;
}
