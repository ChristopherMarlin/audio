(async function () {
  const content = document.getElementById('deposit-content');

  function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

  const STATUS_MESSAGE = {
    authorized: 'This deposit hold is already active on your card. Nothing more to do — it will be released automatically if the car is returned undamaged.',
    captured: 'This deposit has already been charged for this booking.',
    released: 'This deposit hold has already been released. Nothing further is needed.',
    expired: 'This hold expired without being resolved. Please contact us if you still need to provide a deposit.',
    failed: 'The previous attempt to place this hold failed. Please contact us so we can send a new request.'
  };

  const params = new URLSearchParams(location.search);
  const token = params.get('token');

  if (!token) {
    content.innerHTML = '<div class="alert alert-error">This link is missing its token. Please use the exact link you were sent.</div>';
    return;
  }

  let data;
  try {
    data = await api.get(`/api/deposit/${encodeURIComponent(token)}`);
  } catch (err) {
    content.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    return;
  }

  if (data.status !== 'requested') {
    content.innerHTML = `
      <div class="card"><div class="card__body">
        <p>${STATUS_MESSAGE[data.status] || 'This deposit request is no longer active.'}</p>
      </div></div>`;
    return;
  }

  if (typeof Stripe === 'undefined') {
    content.innerHTML = '<div class="alert alert-error">Payment form could not load (check your internet connection). Please refresh, or contact us directly.</div>';
    return;
  }

  const isHold = data.capture_method !== 'automatic';
  const introText = isHold
    ? `A refundable security deposit of <strong>${money(data.amount_cents)}</strong> for your <strong>${data.car_name}</strong> rental will be <strong>held</strong> on your card — not charged.`
    : `Because this is a longer rental, a refundable security deposit of <strong>${money(data.amount_cents)}</strong> for your <strong>${data.car_name}</strong> rental will be <strong>charged now</strong> and refunded in full after your rental if the car is returned undamaged.`;
  const noteText = isHold
    ? 'We only charge this if the car comes back damaged. Otherwise the hold is released automatically after your rental.'
    : 'This will appear as a real charge on your card statement. It is refunded (in full, or partially if there is damage) once the car is returned.';
  const buttonText = isHold ? `Authorize ${money(data.amount_cents)} Hold` : `Pay ${money(data.amount_cents)} Deposit`;

  content.innerHTML = `
    <div class="card"><div class="card__body">
      <p>${introText}</p>
      <p style="color:var(--muted);font-size:0.9rem;">${noteText}</p>
      <form id="deposit-form">
        <label>Card details</label>
        <div id="stripe-card-element"></div>
        <div id="deposit-alert"></div>
        <button type="submit" id="deposit-submit" class="btn btn-primary btn-block" style="margin-top:16px;">${buttonText}</button>
      </form>
    </div></div>`;

  const cfg = await api.get('/api/config');
  if (!cfg.stripePublishableKey) {
    content.innerHTML = '<div class="alert alert-error">Online payment is not configured yet. Please contact us directly.</div>';
    return;
  }

  const stripe = Stripe(cfg.stripePublishableKey);
  const elements = stripe.elements();
  const cardElement = elements.create('card');
  cardElement.mount('#stripe-card-element');

  document.getElementById('deposit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('deposit-alert');
    const submitBtn = document.getElementById('deposit-submit');
    alertBox.innerHTML = '';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Processing…';

    const result = await stripe.confirmCardPayment(data.client_secret, {
      payment_method: { card: cardElement }
    });

    if (result.error) {
      alertBox.innerHTML = `<div class="alert alert-error">${result.error.message}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = buttonText;
      return;
    }

    content.innerHTML = isHold
      ? `<div class="card"><div class="card__body">
          <h3 style="color:var(--teal-700)">Hold placed successfully</h3>
          <p>${money(data.amount_cents)} is now held on your card for your ${data.car_name} rental. It will be released automatically if the car is returned undamaged.</p>
        </div></div>`
      : `<div class="card"><div class="card__body">
          <h3 style="color:var(--teal-700)">Deposit received</h3>
          <p>${money(data.amount_cents)} has been charged for your ${data.car_name} rental deposit. It will be refunded after your rental if the car is returned undamaged.</p>
        </div></div>`;
  });
})();
