if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/mobile/sw.js').catch(() => {}));
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-banner').style.display = 'flex';
});
document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-banner').style.display = 'none';
});

function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

async function loadCars() {
  const listEl = document.getElementById('car-list');
  try {
    const cars = await api.get('/api/cars');
    if (!cars.length) { listEl.innerHTML = '<p style="text-align:center">No cars available right now.</p>'; return; }

    listEl.innerHTML = cars.map((c) => `
      <div class="m-car-card" id="car-${c.id}">
        <img src="${c.image}" alt="${c.name}">
        <div class="body">
          <h3>${c.name}</h3>
          <div class="price">${money(c.price_per_day_cents)} / day</div>
          <button class="toggle-btn" data-slug="${c.slug}" data-id="${c.id}">Check Availability</button>
          <div class="calendar-wrap">
            <div class="calendar" id="calendar-${c.id}"></div>
            <a class="btn btn-primary btn-block book-btn" id="book-btn-${c.id}" style="pointer-events:none;opacity:0.5;">Select dates to book</a>
          </div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.toggle-btn').forEach((btn) => btn.addEventListener('click', () => toggleCard(btn)));
  } catch (e) {
    listEl.innerHTML = '<p style="text-align:center;color:var(--coral)">Could not load the fleet. Pull to refresh.</p>';
  }
}

const calendarsByCarId = {};

async function toggleCard(btn) {
  const card = document.getElementById(`car-${btn.dataset.id}`);
  const isOpen = card.classList.toggle('expanded');
  btn.textContent = isOpen ? 'Hide Calendar' : 'Check Availability';
  if (!isOpen || calendarsByCarId[btn.dataset.id]) return;

  const carId = btn.dataset.id;
  const slug = btn.dataset.slug;
  const calEl = document.getElementById(`calendar-${carId}`);
  const bookBtn = document.getElementById(`book-btn-${carId}`);

  const calendar = createRangeCalendar({
    container: calEl,
    onChange: ({ start, end }) => {
      if (start && end) {
        bookBtn.href = `/book.html?car=${slug}&start=${start}&end=${end}`;
        bookBtn.textContent = `Book ${start} → ${end}`;
        bookBtn.style.pointerEvents = 'auto';
        bookBtn.style.opacity = '1';
      } else {
        bookBtn.style.pointerEvents = 'none';
        bookBtn.style.opacity = '0.5';
        bookBtn.textContent = 'Select dates to book';
      }
    }
  });
  calendarsByCarId[carId] = calendar;

  try {
    const avail = await api.get(`/api/cars/${slug}/availability`);
    calendar.setUnavailable(avail.unavailable.map((r) => ({ start: r.start, end: r.end })));
  } catch (e) {
    calEl.innerHTML = '<p style="color:var(--coral)">Could not load availability.</p>';
  }
}

loadCars();
