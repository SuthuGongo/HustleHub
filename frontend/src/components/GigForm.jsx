import { useState } from 'react';
import Alert from './Alert';
import { SelectField, TextAreaField, TextField } from './Fields';
import { CATEGORIES } from '../utils/constants';
import { validateGig } from '../utils/validation';

const EMPTY = { title: '', description: '', category: '', price: '', deliveryDays: '' };

export default function GigForm({ initial = EMPTY, submitLabel = 'Create gig', busy = false, serverError = '', onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState({});

  const change = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    const found = validateGig(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      category: values.category,
      price: Number(values.price),
      deliveryDays: Number(values.deliveryDays),
    });
  };

  return (
    <form className="form gig-form" onSubmit={submit} noValidate aria-label="Gig details">
      <Alert>{serverError}</Alert>
      <TextField label="Title" value={values.title} onChange={change('title')} error={errors.title} maxLength={100} autoComplete="off" />
      <TextAreaField
        label="Description"
        rows={5}
        value={values.description}
        onChange={change('description')}
        error={errors.description}
        hint="Say what the client gets, and what you need from them. 20 to 2000 characters."
        maxLength={2000}
      />
      <div className="form-row">
        <SelectField
          label="Category"
          value={values.category}
          onChange={change('category')}
          error={errors.category}
          options={CATEGORIES}
          placeholder="Choose a category"
        />
        <TextField label="Price (rand)" inputMode="decimal" value={values.price} onChange={change('price')} error={errors.price} autoComplete="off" />
        <TextField
          label="Delivery time (days)"
          inputMode="numeric"
          value={values.deliveryDays}
          onChange={change('deliveryDays')}
          error={errors.deliveryDays}
          autoComplete="off"
        />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
