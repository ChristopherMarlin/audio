(async () => {
  const root = document.getElementById('car-detail-root');
  const params = new URLSearchParams(location.search);
  const slug = params.get('car');

  try {
    const cars = await api.get('/api/cars');
    if (!cars.length) throw new Error('No cars available');
    const car = cars.find((c) => c.slug === slug) || cars[0];
    const others = cars.filter((c) => c.slug !== car.slug);
    const meta = carMeta(car);

    document.title = `${car.name} — Marlin Rentals`;

    document.getElementById('car-main-img').src = car.image;
    document.getElementById('car-main-img').alt = car.name;
    document.querySelectorAll('.car-thumb-img').forEach((img) => {
      img.src = car.image;
      img.alt = car.name;
    });

    document.getElementById('car-badge').textContent = meta.detailCategory;
    document.getElementById('car-title').textContent = car.name;
    document.getElementById('car-desc').textContent = car.description;

    const specs = [
      { icon: '👤', value: String(car.seats), label: 'Seats' },
      { icon: '⚙️', value: car.transmission, label: 'Transmission' },
      { icon: '❄️', value: 'Included', label: 'A/C' },
      { icon: '🚪', value: '5', label: 'Doors' },
      { icon: '🧳', value: meta.luggage, label: 'Luggage' },
      { icon: '⛽', value: 'Unlimited', label: 'Mileage' }
    ];
    document.getElementById('spec-grid').innerHTML = specs.map((s) => `
      <div class="spec-card">
        <div class="spec-card__icon">${s.icon}</div>
        <div class="spec-card__value">${s.value}</div>
        <div class="spec-card__label">${s.label}</div>
      </div>
    `).join('');

    document.getElementById('car-price').innerHTML =
      `$${(car.price_per_day_cents / 100).toFixed(0)}<span>/day</span>`;
    document.getElementById('car-book-link').href = `/book.html?car=${car.slug}`;

    document.getElementById('other-cars').innerHTML = others.map((c) => `
      <a href="/car.html?car=${c.slug}" class="other-car-card">
        <div class="other-car-card__img"><img src="${c.image}" alt="${c.name}"></div>
        <div class="other-car-card__body">
          <div class="other-car-card__name">${c.name}</div>
          <div class="other-car-card__price">$${(c.price_per_day_cents / 100).toFixed(0)}<span>/day</span></div>
        </div>
      </a>
    `).join('');
  } catch (e) {
    root.innerHTML = '<p style="text-align:center;padding:60px 20px;color:var(--coral)">Could not load this car right now.</p>';
  }
})();
