// Seeds the fleet with the initial 3 cars. Safe to re-run - uses INSERT OR IGNORE keyed on slug.
require('dotenv').config();
const db = require('../db');

const cars = [
  {
    slug: 'kia-picanto',
    name: 'Kia Picanto',
    category: 'Economy',
    seats: 4,
    transmission: 'Automatic',
    price_per_day_cents: 4500,
    image: '/images/car-picanto.svg',
    description: 'Compact, fuel-efficient, and easy to park - perfect for zipping around Willemstad and the beaches.'
  },
  {
    slug: 'kia-sorento',
    name: 'Kia Sorento',
    category: 'SUV',
    seats: 7,
    transmission: 'Automatic',
    price_per_day_cents: 6500,
    image: '/images/car-sorento.svg',
    description: 'Spacious 7-seat SUV with plenty of trunk space - great for families and island road trips.'
  },
  {
    slug: 'chevrolet-trax',
    name: 'Chevrolet Trax',
    category: 'Compact SUV',
    seats: 5,
    transmission: 'Automatic',
    price_per_day_cents: 5500,
    image: '/images/car-trax.svg',
    description: 'A comfortable, reliable crossover with a smooth ride - a great all-rounder for exploring Curacao.'
  }
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO cars (slug, name, category, seats, transmission, price_per_day_cents, image, description)
  VALUES (@slug, @name, @category, @seats, @transmission, @price_per_day_cents, @image, @description)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) insert.run(row);
});

insertMany(cars);

console.log(`Seed complete. Fleet now has ${db.prepare('SELECT COUNT(*) AS c FROM cars').get().c} car(s).`);
console.log('NOTE: prices are placeholders (in cents) - update them from the admin dashboard or directly in the database.');
