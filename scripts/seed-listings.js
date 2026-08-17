const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = admin.firestore();

const listings = [
  {
    title: 'Serviced Suites by TMG',
    city: 'Delhi',
    category: 'apartments',
    price: 100,
    weekendPrice: 0,
    beds: 1,
    guests: 4,
    description: 'Experience a blend of contemporary style and soulful peace in this newly designed apartment. Located in a secure residential pocket of Chhatarpur, this apartment is perfect for couples, solo travelers, business or leisure tourists looking for a "home away from home" vibe.',
    amenities: [
      'Sheets, duvets, duvet covers, pillows, pillowcases',
      'A/C unit or fan',
      'Reading lamp',
      'Box of tissues',
      'Clothes rails and hangers',
      'TV',
      'Comfortable chairs',
      'Wifi',
      'Books and magazines',
      'Board games and cards',
      'Shower gel',
      'Conditioner',
      'Shampoo',
      'Hand soap',
      'Rolls of toilet paper',
      'Mirror',
      'Bath towels and hand towels',
      'Bath mat',
      'Hairdryer',
      'Sewing kit',
      'Coffee machine',
      'Electric kettle',
      'Cleaning supplies',
      'Mop and bucket',
    ],
    images: [],
    blockedDates: [],
    seasonalRates: [],
    createdAt: new Date().toISOString(),
  },
  {
    title: 'Serviced Suites by TMG — Unit 3',
    city: 'Delhi',
    category: 'apartments',
    price: 2982,
    weekendPrice: 0,
    beds: 1,
    guests: 2,
    description: 'Escape to a calm, thoughtfully designed  apartment that blends tropical warmth with modern elegance. Designed for comfort and tranquility, this peaceful retreat features earthy textures, lush green accents, and clean contemporary interiors creating a space that feels both refreshing and luxurious.',
    amenities: [],
    images: [],
    blockedDates: [],
    seasonalRates: [],
    createdAt: new Date().toISOString(),
  },
  {
    title: 'Serviced Suites by TMG, Saket',
    city: 'Delhi',
    category: 'apartments',
    price: 3500,
    weekendPrice: 0,
    beds: 1,
    guests: 2,
    description: 'Details coming soon — view live pricing, photos, and availability on Airbnb.',
    amenities: [],
    images: [],
    blockedDates: [],
    seasonalRates: [],
    createdAt: new Date().toISOString(),
  },
];

(async () => {
  for (const listing of listings) {
    const ref = await db.collection('listings').add(listing);
    console.log(`Created listing "${listing.title}" -> ${ref.id}`);
  }
  console.log('Done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
