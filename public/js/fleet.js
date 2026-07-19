(async () => {
  const el = document.getElementById('fleet-list');
  try {
    const cars = await api.get('/api/cars');
    if (!cars.length) { el.innerHTML = '<p style="text-align:center">No cars available right now.</p>'; return; }
    el.innerHTML = cars.map((car) => {
      const meta = carMeta(car);
      return `
      <div class="fleet-card">
        <div class="fleet-card__img"><img src="${car.image}" alt="${car.name}"></div>
        <div class="fleet-card__body">
          <div class="fleet-card__top">
            <div class="fleet-card__name">${car.name}</div>
            <div class="fleet-card__badge${meta.fleetBadgeWarm ? ' warm' : ''}">${meta.fleetBadge}</div>
          </div>
          <div class="fleet-card__meta">${meta.bodyType} · Seats ${car.seats} · A/C · ${car.transmission}</div>
          <div class="fleet-card__footer">
            <div class="fleet-card__price">$${(car.price_per_day_cents / 100).toFixed(0)}<span>/day</span></div>
            <a href="/car.html?car=${car.slug}" class="btn-select">Select</a>
          </div>
        </div>
      </div>
    `;
    }).join('');
  } catch (e) {
    el.innerHTML = '<p style="text-align:center;color:var(--coral)">Could not load the fleet right now.</p>';
  }
})();
