const ROLES = Object.freeze({ FREELANCER: 'freelancer', CLIENT: 'client', ADMIN: 'admin' });

// Only these roles can be chosen at public registration. "admin" is deliberately excluded.
const REGISTRABLE_ROLES = [ROLES.FREELANCER, ROLES.CLIENT];

const GIG_CATEGORIES = [
  'design',
  'writing',
  'development',
  'marketing',
  'video',
  'tutoring',
  'admin',
  'photography',
  'consulting',
  'events',
  'other',
];

// Messages sent to the team from the Contact page.
const CONTACT_TOPICS = ['general', 'account', 'payment', 'gig', 'bug', 'other'];
const MESSAGE_STATUSES = ['new', 'read', 'resolved'];

// Two-factor email codes: what the code was sent for.
const TWO_FACTOR_PURPOSES = ['login', 'enable', 'verify_email', 'reset_password'];

module.exports = { ROLES, REGISTRABLE_ROLES, GIG_CATEGORIES, CONTACT_TOPICS, MESSAGE_STATUSES, TWO_FACTOR_PURPOSES };
