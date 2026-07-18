const STATUS_LABEL = {
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed'
};

let carsCache = [];

function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

// customer_email/phone are format-validated server-side but not HTML-escaped
// at write time (unlike name/notes/car fields), so escape them here before
// interpolating into innerHTML.
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = String(s ?? '');
  return div.innerHTML;
}

function statusPill(status) {
  return `<span class="status-pill status-${status}">${STATUS_LABEL[status] || status}</span>`;
}

function showModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${html}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ------------------------------------------------------------- Auth / shell
async function init() {
  try {
    const me = await api.get('/api/auth/me');
    if (!me.authenticated) { location.href = '/dashboard/login.html'; return; }
    document.getElementById('who').textContent = `Signed in as ${me.username}`;
  } catch (e) {
    location.href = '/dashboard/login.html';
    return;
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/api/auth/logout', {});
    location.href = '/dashboard/login.html';
  });

  document.querySelectorAll('.dash-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('filter-status').addEventListener('change', loadBookings);
  document.getElementById('refresh-bookings').addEventListener('click', loadBookings);
  document.getElementById('add-car-form').addEventListener('submit', onAddCar);
  document.getElementById('add-block-form').addEventListener('submit', onAddBlock);

  await Promise.all([loadCars(), loadOverview(), loadBookings(), loadBlocks()]);
}

function switchTab(tab) {
  document.querySelectorAll('.dash-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.dash-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab}`));
}

// ------------------------------------------------------------------ Overview
async function loadOverview() {
  const stats = await api.get('/api/admin/stats');
  const byStatus = Object.fromEntries(stats.totals.map((t) => [t.status, t.count]));

  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-card"><div class="num">${byStatus.confirmed || 0}</div><div class="label">Confirmed bookings</div></div>
    <div class="stat-card"><div class="num">${byStatus.pending_payment || 0}</div><div class="label">Pending payment</div></div>
    <div class="stat-card"><div class="num">${byStatus.completed || 0}</div><div class="label">Completed</div></div>
    <div class="stat-card"><div class="num">${money(stats.revenue_cents)}</div><div class="label">Revenue (confirmed+completed)</div></div>
  `;

  document.getElementById('upcoming-body').innerHTML = stats.upcoming_pickups.length
    ? stats.upcoming_pickups.map((p) => `
        <tr><td>${p.start_date}</td><td>${p.end_date}</td><td>${p.car_name}</td><td>${p.customer_name}</td></tr>
      `).join('')
    : '<tr><td colspan="4">No upcoming pickups.</td></tr>';
}

// ------------------------------------------------------------------ Bookings
async function loadBookings() {
  const status = document.getElementById('filter-status').value;
  const bookings = await api.get(`/api/admin/bookings${status ? `?status=${status}` : ''}`);
  const tbody = document.getElementById('bookings-body');

  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="7">No bookings found.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings.map((b) => `
    <tr>
      <td>#${b.id}</td>
      <td>${b.car_name}</td>
      <td>${b.customer_name}<br><span style="color:var(--muted);font-size:0.8rem;">${escapeHtml(b.customer_email)}</span></td>
      <td>${b.start_date} → ${b.end_date}</td>
      <td>${money(b.total_price_cents)}</td>
      <td>${statusPill(b.status)}</td>
      <td>
        ${b.status === 'pending_payment' ? `<button class="action-btn success" data-action="confirm" data-id="${b.id}">Confirm</button>` : ''}
        ${b.status === 'confirmed' ? `<button class="action-btn success" data-action="complete" data-id="${b.id}">Complete</button>` : ''}
        ${b.status !== 'cancelled' && b.status !== 'completed' ? `<button class="action-btn danger" data-action="cancel" data-id="${b.id}">Cancel</button>` : ''}
        <button class="action-btn" data-action="edit" data-id="${b.id}">Edit</button>
        <button class="action-btn danger" data-action="delete" data-id="${b.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleBookingAction(btn.dataset.action, parseInt(btn.dataset.id, 10), bookings));
  });
}

async function handleBookingAction(action, id, bookings) {
  const booking = bookings.find((b) => b.id === id);
  if (action === 'confirm') return patchBooking(id, { status: 'confirmed' });
  if (action === 'complete') return patchBooking(id, { status: 'completed' });
  if (action === 'cancel') {
    if (confirm('Cancel this booking? This frees up the dates immediately.')) return patchBooking(id, { status: 'cancelled' });
    return;
  }
  if (action === 'delete') {
    if (confirm('Permanently delete this booking record? This cannot be undone.')) {
      await api.del(`/api/admin/bookings/${id}`);
      await Promise.all([loadBookings(), loadOverview()]);
    }
    return;
  }
  if (action === 'edit') return openEditBookingModal(booking);
}

async function patchBooking(id, patch) {
  try {
    await api.patch(`/api/admin/bookings/${id}`, patch);
    await Promise.all([loadBookings(), loadOverview()]);
  } catch (err) {
    alert(err.message);
  }
}

function openEditBookingModal(b) {
  showModal(`
    <button class="modal-close" id="modal-close">&times;</button>
    <h3>Edit Booking #${b.id}</h3>
    <form id="edit-booking-form">
      <label>Pickup date</label>
      <input name="start_date" type="date" value="${b.start_date}" required>
      <div style="height:12px"></div>
      <label>Return date</label>
      <input name="end_date" type="date" value="${b.end_date}" required>
      <div style="height:12px"></div>
      <label>Notes</label>
      <textarea name="notes" rows="3">${b.notes || ''}</textarea>
      <div id="edit-alert"></div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">Save Changes</button>
    </form>
  `);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('edit-booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.patch(`/api/admin/bookings/${b.id}`, {
        start_date: fd.get('start_date'),
        end_date: fd.get('end_date'),
        notes: fd.get('notes')
      });
      closeModal();
      await Promise.all([loadBookings(), loadOverview()]);
    } catch (err) {
      document.getElementById('edit-alert').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });
}

// ---------------------------------------------------------------------- Fleet
async function loadCars() {
  carsCache = await api.get('/api/admin/cars');
  renderFleetList();
  renderBlockCarSelect();
}

function renderFleetList() {
  const el = document.getElementById('fleet-list');
  el.innerHTML = carsCache.map((c) => `
    <div class="car-row">
      <img src="${c.image}" alt="${c.name}">
      <div class="info">
        <h4>${c.name} ${c.active ? '' : '<span style="color:var(--coral);font-size:0.8rem;">(inactive)</span>'}</h4>
        <div style="color:var(--muted);font-size:0.85rem;">${c.category} · ${c.seats} seats · ${c.transmission} · ${money(c.price_per_day_cents)}/day</div>
      </div>
      <button class="action-btn" data-edit-car="${c.id}">Edit</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-edit-car]').forEach((btn) => {
    btn.addEventListener('click', () => openEditCarModal(carsCache.find((c) => c.id === parseInt(btn.dataset.editCar, 10))));
  });
}

function renderBlockCarSelect() {
  document.getElementById('block-car-select').innerHTML = carsCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}

function openEditCarModal(car) {
  showModal(`
    <button class="modal-close" id="modal-close">&times;</button>
    <h3>Edit ${car.name}</h3>
    <form id="edit-car-form" class="form-grid">
      <div class="full"><label>Name</label><input name="name" value="${car.name}" required></div>
      <div><label>Category</label><input name="category" value="${car.category}" required></div>
      <div><label>Seats</label><input name="seats" type="number" min="1" max="15" value="${car.seats}" required></div>
      <div><label>Transmission</label><input name="transmission" value="${car.transmission}" required></div>
      <div><label>Price per day (USD)</label><input name="price" type="number" min="0" step="0.01" value="${(car.price_per_day_cents / 100).toFixed(2)}" required></div>
      <div class="full"><label>Description</label><textarea name="description" rows="2">${car.description || ''}</textarea></div>
      <div class="full checkbox-row"><input type="checkbox" name="active" id="active-cb" ${car.active ? 'checked' : ''}><label for="active-cb" style="margin:0;">Listed / bookable</label></div>
      <div id="edit-car-alert" class="full"></div>
      <div class="full"><button type="submit" class="btn btn-primary btn-block">Save Changes</button></div>
    </form>
  `);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('edit-car-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.put(`/api/admin/cars/${car.id}`, {
        name: fd.get('name'),
        category: fd.get('category'),
        seats: parseInt(fd.get('seats'), 10),
        transmission: fd.get('transmission'),
        price_per_day_cents: Math.round(parseFloat(fd.get('price')) * 100),
        description: fd.get('description'),
        active: fd.get('active') === 'on'
      });
      closeModal();
      await loadCars();
    } catch (err) {
      document.getElementById('edit-car-alert').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });
}

async function onAddCar(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api.post('/api/admin/cars', {
      slug: fd.get('slug'),
      name: fd.get('name'),
      category: fd.get('category'),
      seats: parseInt(fd.get('seats'), 10),
      transmission: fd.get('transmission'),
      price_per_day_cents: Math.round(parseFloat(fd.get('price')) * 100),
      description: fd.get('description')
    });
    e.target.reset();
    await loadCars();
  } catch (err) {
    alert(err.message);
  }
}

// ------------------------------------------------------------------- Blocks
async function loadBlocks() {
  const blocks = await api.get('/api/admin/blocks');
  const tbody = document.getElementById('blocks-body');
  if (!blocks.length) {
    tbody.innerHTML = '<tr><td colspan="5">No blocked dates.</td></tr>';
    return;
  }
  tbody.innerHTML = blocks.map((b) => {
    const car = carsCache.find((c) => c.id === b.car_id);
    return `<tr>
      <td>${car ? car.name : `Car #${b.car_id}`}</td>
      <td>${b.start_date}</td>
      <td>${b.end_date}</td>
      <td>${b.reason}</td>
      <td><button class="action-btn danger" data-del-block="${b.id}">Remove</button></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-del-block]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (confirm('Remove this block?')) {
        await api.del(`/api/admin/blocks/${btn.dataset.delBlock}`);
        await loadBlocks();
      }
    });
  });
}

async function onAddBlock(e) {
  e.preventDefault();
  const alertBox = document.getElementById('block-alert');
  alertBox.innerHTML = '';
  const fd = new FormData(e.target);
  try {
    await api.post('/api/admin/blocks', {
      car_id: parseInt(fd.get('car_id'), 10),
      start_date: fd.get('start_date'),
      end_date: fd.get('end_date'),
      reason: fd.get('reason') || 'maintenance'
    });
    e.target.reset();
    await loadBlocks();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

init();
