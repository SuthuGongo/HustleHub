import { useRef } from 'react';

// A blank slot is represented internally as a literal space, never an empty string: joining an array
// of strings with '' silently collapses any empty-string slots, even ones in the middle (there is no
// way to tell "nothing here" from "this slot doesn't exist" once joined) - a space survives the round
// trip through a plain string and is easy to tell apart from a real digit.
const BLANK = ' ';

// Six single-digit boxes instead of one text field: type a digit, focus jumps to the next box;
// backspace on an empty box jumps back and clears the one before it; arrow keys move between boxes;
// pasting (or an autofill/password-manager fill) that drops in more than one character at once is
// spread across the remaining boxes instead of being rejected.
export default function CodeBoxes({ length = 6, value, onChange, disabled, label = 'Verification code' }) {
  const boxRefs = useRef([]);
  const padded = Array.from({ length }, (_, i) => value[i] || BLANK);
  const digits = padded.map((c) => (c === BLANK ? '' : c));

  const commit = (next) => onChange(next.join(''));

  const setDigitsFrom = (index, text) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    const next = [...padded];
    let i = index;
    for (const ch of clean) {
      if (i >= length) break;
      next[i] = ch;
      i += 1;
    }
    commit(next);
    const focusIndex = Math.min(i, length - 1);
    boxRefs.current[focusIndex]?.focus();
    boxRefs.current[focusIndex]?.select();
  };

  const handleChange = (index) => (event) => {
    const raw = event.target.value;
    if (raw.length <= 1) {
      const next = [...padded];
      next[index] = raw.replace(/\D/g, '') || BLANK;
      commit(next);
      if (raw && index < length - 1) boxRefs.current[index + 1]?.focus();
    } else {
      // More than one character landed in a single box: a paste or an autofill. Distribute it from here.
      setDigitsFrom(index, raw);
    }
  };

  const handlePaste = (index) => (event) => {
    event.preventDefault();
    setDigitsFrom(index, event.clipboardData.getData('text'));
  };

  const handleKeyDown = (index) => (event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...padded];
      next[index - 1] = BLANK;
      commit(next);
      boxRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      boxRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="code-boxes" role="group" aria-label={label}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxRefs.current[i] = el;
          }}
          className="code-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length} // generous on purpose: lets a paste/autofill land here and be redistributed
          value={digit}
          onChange={handleChange(i)}
          onPaste={handlePaste(i)}
          onKeyDown={handleKeyDown(i)}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </div>
  );
}
