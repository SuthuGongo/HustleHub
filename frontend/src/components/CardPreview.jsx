// A purely visual, front-end-only mock of a bank card. It shows exactly what was typed and
// nothing more - it does not validate, store, or transmit anything. Flips to its "back" (a real
// card's usual CVC spot) while the CVC field is focused, and flips back once it isn't.
export default function CardPreview({ number, name, expiry, cvc, flipped }) {
  const display = number && number.trim() ? number : '•••• •••• •••• ••••';
  return (
    <div className={`card-preview-scene${flipped ? ' is-flipped' : ''}`} aria-hidden="true">
      <div className="card-preview-inner">
        <div className="card-preview card-preview-front">
          <div className="card-preview-chip" />
          <p className="card-preview-number">{display}</p>
          <div className="card-preview-row">
            <div>
              <p className="card-preview-label">Cardholder</p>
              <p className="card-preview-value">{name && name.trim() ? name.toUpperCase() : 'YOUR NAME'}</p>
            </div>
            <div>
              <p className="card-preview-label">Expires</p>
              <p className="card-preview-value">{expiry && expiry.trim() ? expiry : 'MM/YY'}</p>
            </div>
          </div>
        </div>
        <div className="card-preview card-preview-back">
          <div className="card-preview-stripe" />
          <div className="card-preview-signature">
            <span className="card-preview-cvc">{cvc && cvc.trim() ? cvc : '•••'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
