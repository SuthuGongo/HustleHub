import { useId } from 'react';

function FieldShell({ id, label, error, hint, children }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ label, error, hint, ...inputProps }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} {...inputProps} />
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, ...areaProps }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} {...areaProps} />
    </FieldShell>
  );
}

export function SelectField({ label, error, hint, options, placeholder, ...selectProps }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} {...selectProps}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
