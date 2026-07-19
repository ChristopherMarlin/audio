/**
 * Cosmetic, design-driven labels for the 3 seeded cars that aren't stored in
 * the database (marketing badge text, body-type word, luggage capacity).
 * Falls back to the real DB fields for any car not in this map.
 */
const CAR_META = {
  'chevrolet-trax': { fleetBadge: 'Compact SUV', fleetBadgeWarm: false, bodyType: 'SUV', detailCategory: 'Compact SUV', luggage: '3 bags' },
  'kia-picanto': { fleetBadge: 'Popular', fleetBadgeWarm: true, bodyType: 'Hatchback', detailCategory: 'City Hatchback', luggage: '2 bags' },
  'kia-sorento': { fleetBadge: 'Spacious', fleetBadgeWarm: false, bodyType: 'SUV', detailCategory: 'Family SUV', luggage: '5 bags' }
};

function carMeta(car) {
  return CAR_META[car.slug] || {
    fleetBadge: car.category,
    fleetBadgeWarm: false,
    bodyType: car.category,
    detailCategory: car.category,
    luggage: '—'
  };
}
