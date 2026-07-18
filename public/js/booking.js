(async function () {
  const carPicker = document.getElementById('car-picker');
  const summaryBox = document.getElementById('summary-box');
  const submitBtn = document.getElementById('submit-btn');
  const form = document.getElementById('booking-form');
  const formAlert = document.getElementById('form-alert');
  const airportCheckbox = document.getElementById('airport_dropoff');

  document.getElementById('year') && (document.getElementById('year').textContent = new Date().getFullYear());

  let cars = [];
  let selectedCar = null;
  let stripe = null;
  let cardElement = null;
  let currentClientSecret = null;
  const AIRPORT_FEE_CENTS = 1500;

  const calendar = createRangeCalendar({
    container: document.getElementById('calendar'),
    onChange: updateSummary
  });

  function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

  function nightsBetween(start, end) {
    return Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000);
  }

  function updateSummary() {
    const { start, end } = calendar.getSelection();
    if (!selectedCar || !start || !end) {
      summaryBox.innerHTML = `<p style="color:var(--muted);margin:0;">Choose a car and dates to see your price.</p>`;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Select dates to continue';
      return;
    }
    const nights = nightsBetween(start, end);
    const carTotal = nights * selectedCar.price_per_day_cents;
    const airportFee = airportCheckbox.checked ? AIRPORT_FEE_CENTS : 0;
    const total = carTotal + airportFee;

    summaryBox.innerHTML = `
      <div class="summary-row"><span>${selectedCar.name} × ${nights} night${nights === 1 ? '' : 's'}</span><span>${money(carTotal)}</span></div>
      ${airportCheckbox.checked ? `<div class="summary-row"><span>Airport drop-off</span><span>${money(airportFee)}</span></div>` : ''}
      <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
      <div class="summary-row" style="color:var(--muted);font-size:0.85rem;"><span>${start} → ${end}</span><span></span></div>
    `;
    submitBtn.disabled = false;
    submitBtn.textContent = `Pay ${money(total)} & Book`;
  }

  airportCheckbox.addEventListener('change', updateSummary);

  function renderCarPicker() {
    carPicker.innerHTML = cars.map((c) => `
      <div class="car-pick${selectedCar && selectedCar.slug === c.slug ? ' selected' : ''}" data-slug="${c.slug}">
        <img src="${c.image}" alt="${c.name}">
        <div class="car-pick__body">
          <h3>${c.name}</h3>
          <div class="card__meta">
            <span class="tag">${c.category}</span>
            <span class="tag">${c.seats} seats</span>
          </div>
          <div class="car-pick__price">${money(c.price_per_day_cents)} <span>/ day</span></div>
        </div>
      </div>
    `).join('');

    carPicker.querySelectorAll('.car-pick').forEach((el) => {
      el.addEventListener('click', () => selectCar(el.dataset.slug));
    });
  }

  async function loadCars() {
    cars = await api.get('/api/cars');
    renderCarPicker();

    const params = new URLSearchParams(location.search);
    const preselect = params.get('car');
    const initial = (preselect && cars.find((c) => c.slug === preselect)) || cars[0];
    if (initial) await selectCar(initial.slug);
  }

  async function selectCar(slug) {
    if (selectedCar && selectedCar.slug === slug) return;
    selectedCar = cars.find((c) => c.slug === slug) || null;
    renderCarPicker();
    calendar.reset();
    updateSummary();
    if (!selectedCar) return;
    try {
      const avail = await api.get(`/api/cars/${selectedCar.slug}/availability`);
      calendar.setUnavailable(avail.unavailable.map((r) => ({ start: r.start, end: r.end })));

      const params = new URLSearchParams(location.search);
      const wantStart = params.get('start');
      const wantEnd = params.get('end');
      if (wantStart && wantEnd && slug === params.get('car')) calendar.trySelectRange(wantStart, wantEnd);
      updateSummary();
    } catch (e) {
      // If availability can't load, leave the calendar with no known blocks
      // rather than silently letting a booking through the client;
      // the server re-checks availability again anyway before confirming.
    }
  }

  async function setupStripe() {
    const cfg = await api.get('/api/config');
    if (!cfg.stripePublishableKey) {
      document.getElementById('stripe-card-element').innerHTML =
        '<p style="color:var(--coral)">Online payment is not configured yet. Please <a href="/contact.html">contact us</a> to book.</p>';
      return;
    }
    if (typeof Stripe === 'undefined') {
      document.getElementById('stripe-card-element').innerHTML =
        '<p style="color:var(--coral)">Payment form could not load (check your internet connection). Please refresh, or <a href="/contact.html">contact us</a> to book.</p>';
      return;
    }
    stripe = Stripe(cfg.stripePublishableKey);
    const elements = stripe.elements();
    cardElement = elements.create('card');
    cardElement.mount('#stripe-card-element');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formAlert.innerHTML = '';
    const { start, end } = calendar.getSelection();
    if (!selectedCar || !start || !end) return;

    if (!stripe || !cardElement) {
      formAlert.innerHTML = '<div class="alert alert-error">Online payment is not available right now. Please contact us directly.</div>';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Processing…';

    try {
      const booking = await api.post('/api/bookings', {
        car_slug: selectedCar.slug,
        start_date: start,
        end_date: end,
        customer_name: document.getElementById('customer_name').value,
        customer_email: document.getElementById('customer_email').value,
        customer_phone: document.getElementById('customer_phone').value,
        airport_dropoff: airportCheckbox.checked,
        notes: document.getElementById('notes').value
      });

      currentClientSecret = booking.client_secret;

      const result = await stripe.confirmCardPayment(currentClientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: document.getElementById('customer_name').value,
            email: document.getElementById('customer_email').value
          }
        }
      });

      if (result.error) {
        formAlert.innerHTML = `<div class="alert alert-error">${result.error.message} Your dates were released — please try again.</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Try Payment Again';
        return;
      }

      document.getElementById('step-form').style.display = 'none';
      document.getElementById('step-success').style.display = '';
      document.getElementById('success-details').innerHTML =
        `Booking <strong>#${booking.booking_id}</strong> for the <strong>${selectedCar.name}</strong><br>
         ${start} → ${end} · Total ${money(booking.total_price_cents)}<br>
         A confirmation will be sent to your email once payment finishes processing.`;
    } catch (err) {
      formAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Try Again';
    }
  });

  await loadCars();
  await setupStripe();
})();
