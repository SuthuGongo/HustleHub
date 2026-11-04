// Client-side validation mirrors the server rules so people get instant, specific feedback.
// The server still validates everything again - this is a convenience, not a security control.
import { CATEGORIES, CONTACT_TOPICS } from './constants';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLogin({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export function validateEmail(email) {
  const errors = {};
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

// Same shape and wording as the password half of validateRegister, kept in sync deliberately:
// a reset must never be allowed to produce a weaker password than a fresh signup would.
export function validateNewPassword(password) {
  const errors = {};
  if (!password) errors.newPassword = 'Choose a new password.';
  else if (password.length < 8) errors.newPassword = 'Password must be at least 8 characters.';
  else if (!/\d/.test(password)) errors.newPassword = 'Password must contain at least one number.';
  else if (!/[A-Z]/.test(password)) errors.newPassword = 'Password must contain at least one uppercase letter.';
  else if (password.length > 128) errors.newPassword = 'Password must be 128 characters or fewer.';
  return errors;
}

export function validateRegister({ name, email, password, role }) {
  const errors = {};
  const trimmedName = name.trim();
  if (!trimmedName) errors.name = 'Enter your name.';
  else if (trimmedName.length < 2 || trimmedName.length > 100) errors.name = 'Name must be 2 to 100 characters.';

  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';

  if (!password) errors.password = 'Choose a password.';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/\d/.test(password)) errors.password = 'Password must contain at least one number.';
  else if (!/[A-Z]/.test(password)) errors.password = 'Password must contain at least one uppercase letter.';
  else if (password.length > 128) errors.password = 'Password must be 128 characters or fewer.';

  if (!['freelancer', 'client'].includes(role)) errors.role = 'Choose whether you want to hire or to offer services.';
  return errors;
}

export function validateContact({ name, email, topic, message }) {
  const errors = {};
  const n = name.trim();
  if (!n) errors.name = 'Enter your name.';
  else if (n.length < 2 || n.length > 80) errors.name = 'Name must be 2 to 80 characters.';

  if (!email.trim()) errors.email = 'Enter your email address so we can reply.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';

  if (!CONTACT_TOPICS.some((t) => t.value === topic)) errors.topic = 'Choose what your message is about.';

  const m = message.trim();
  if (!m) errors.message = 'Write your message.';
  else if (m.length < 10) errors.message = 'Please write at least 10 characters so we can help.';
  else if (m.length > 2000) errors.message = 'Message must be 2000 characters or fewer.';
  return errors;
}

export function validateGig({ title, description, category, price, deliveryDays }) {
  const errors = {};
  const t = title.trim();
  const d = description.trim();

  if (t.length < 5 || t.length > 100) errors.title = 'Title must be 5 to 100 characters.';
  if (d.length < 20 || d.length > 2000) errors.description = 'Description must be 20 to 2000 characters.';
  if (!CATEGORIES.some((c) => c.value === category)) errors.category = 'Choose a category.';

  const priceText = String(price).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(priceText)) errors.price = 'Enter a price in rand, with at most two decimals.';
  else if (Number(priceText) < 1 || Number(priceText) > 1000000) errors.price = 'Price must be between R1 and R1,000,000.';

  const daysText = String(deliveryDays).trim();
  if (!/^\d+$/.test(daysText) || Number(daysText) < 1 || Number(daysText) > 365) {
    errors.deliveryDays = 'Delivery time must be a whole number of days from 1 to 365.';
  }
  return errors;
}

export function validateBookingNotes(notes) {
  return notes.length > 1000 ? 'Notes must be 1000 characters or fewer.' : '';
}
