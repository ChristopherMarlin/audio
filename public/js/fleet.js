(async () => {
  const el = document.getElementById('fleet-list');
  try {
    const cars = await api.get('/api/cars');
    if (!cars.length) { el.innerHTML = '<p style="text-align:center">No cars available right now.</p>'; return; }
    el.innerHTML = cars.map((car) => `
      <div class="card">
        <img src="${car.image}" alt="${car.name}">
        <div class="card__body">
          <h3>${car.name}</h3>
          <div class="card__meta">
            <span class="tag">${car.category}</span>
            <span class="tag">${car.seats} seats</span>
            <span class="tag">${car.transmission}</span>
          </div>
          <p style="color:var(--muted);flex:1">${car.description}</p>
          <div class="card__price">$${(car.price_per_day_cents / 100).toFixed(2)} <span>/ day</span></div>
          <a href="/book.html?car=${car.slug}" class="btn btn-primary btn-block">Book This Car</a>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = '<p style="text-align:center;color:var(--coral)">Could not load the fleet right now.</p>';
  }
})();
