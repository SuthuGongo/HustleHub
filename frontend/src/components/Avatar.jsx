import { decodeEntities } from '../utils/text';

const toneOf = (name) => [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 6;

export const initialsOf = (name) =>
  name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word)) // skip stray symbols such as the "&" in "Smith & Sons"
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?';

// A round avatar built from someone's initials. The colour is derived from the name, so a person always looks the same.
export default function Avatar({ name = '', size = 'md' }) {
  const clean = decodeEntities(name);
  return (
    <span className={`avatar avatar-${size}`} data-tone={toneOf(clean)} aria-hidden="true">
      {initialsOf(clean)}
    </span>
  );
}
