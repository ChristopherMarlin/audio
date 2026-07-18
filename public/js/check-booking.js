const STATUS_LABEL = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed'
};

document.getElementById('lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('lookup-alert');
  const resultBox = document.getElementById('result');
  alertBox.innerHTML = '';
  resultBox.innerHTML = '';

  const id = document.getElementById('booking_id').value;
  const email = document.getElementById('email').value;

  try {
    const b = await api.get(`/api/bookings/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`);
    resultBox.innerHTML = `
      <div class="card"><div class="card__body">
        <h3>Booking #${b.id} — ${b.car_name}</h3>
        <p><strong>Status:</strong> ${STATUS_LABEL[b.status] || b.status}</p>
        <p><strong>Pickup:</strong> ${b.start_date}</p>
        <p><strong>Return:</strong> ${b.end_date}</p>
        <p><strong>Airport drop-off:</strong> ${b.airport_dropoff ? 'Yes' : 'No'}</p>
        <p><strong>Total:</strong> $${(b.total_price_cents / 100).toFixed(2)} ${b.currency.toUpperCase()}</p>
      </div></div>`;
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
});
