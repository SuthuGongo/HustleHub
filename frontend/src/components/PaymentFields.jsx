import { useState } from 'react';
import { TextField } from './Fields';
import CardPreview from './CardPreview';
import {
  formatCardNumber,
  formatExpiry,
  validateCardNumber,
  validateExpiry,
  validateCvc,
  validateCardholderName,
} from '../utils/card';

// The demo card-entry step. Everything typed here stays in this component's state - it is used
// only to render CardPreview and to decide whether "Pay" is enabled, and is never sent to the
// server or stored anywhere. See utils/card.js for the (client-side-only) validation rules.
export default function PaymentFields({ values, onChange, disabled }) {
  const { number, name, expiry, cvc } = values;
  const [cvcFocused, setCvcFocused] = useState(false);

  const numberError = validateCardNumber(number);
  const nameError = validateCardholderName(name);
  const expiryError = validateExpiry(expiry);
  const cvcError = validateCvc(cvc);

  const set = (key) => (event) => onChange({ ...values, [key]: event.target.value });

  return (
    <div className="payment-fields">
      <CardPreview number={number} name={name} expiry={expiry} cvc={cvc} flipped={cvcFocused} />
      <TextField
        label="Card number"
        inputMode="numeric"
        autoComplete="cc-number"
        placeholder="4242 4242 4242 4242"
        value={number}
        onChange={(e) => onChange({ ...values, number: formatCardNumber(e.target.value) })}
        error={number ? numberError : ''}
        disabled={disabled}
        maxLength={23}
      />
      <TextField
        label="Cardholder name"
        autoComplete="cc-name"
        placeholder="As it appears on the card"
        value={name}
        onChange={set('name')}
        error={name ? nameError : ''}
        disabled={disabled}
      />
      <div className="payment-fields-row">
        <TextField
          label="Expiry (MM/YY)"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/YY"
          value={expiry}
          onChange={(e) => onChange({ ...values, expiry: formatExpiry(e.target.value) })}
          error={expiry ? expiryError : ''}
          disabled={disabled}
          maxLength={5}
        />
        <TextField
          label="CVC"
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder="123"
          value={cvc}
          onChange={(e) => onChange({ ...values, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          onFocus={() => setCvcFocused(true)}
          onBlur={() => setCvcFocused(false)}
          error={cvc ? cvcError : ''}
          disabled={disabled}
          maxLength={4}
        />
      </div>
      <p className="payment-demo-note">
        This is a simulated payment step for demo purposes: card details never leave your browser, and no real card
        network is contacted. Try the test number above, any future expiry and any 3-digit CVC.
      </p>
    </div>
  );
}
