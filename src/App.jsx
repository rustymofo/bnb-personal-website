import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth, storage } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

// --- Design tokens, ported verbatim from the marketplace platform this
// product was split off from (same DASH dashboard palette + STYLES sheet),
// extended with the dark-sidebar / gradient visual language from the
// reference host dashboard. ---
const DASH = {
  ink: '#1A1A1A',
  sub: '#8A8578',
  grad: 'linear-gradient(135deg, #F0883E, #E8408C)',
  gradStart: '#F0883E',
  gradEnd: '#E8408C',
  purple: '#7C3AED',
  purpleBg: '#F3ECFE',
  teal: '#0D9488',
  tealBg: '#E6F7F4',
  cream: '#FAF9F5',
  dark: '#1A1A1A',
  cardShadow: '0 4px 20px -8px rgba(0,0,0,0.08)',
};

const STYLES = `
.pw-root {
  --ink: #1A1A1A;
  --sub: #8A8578;
  --gray: #6B6B6B;
  --border: #E4E4E4;
  --bg: #FAF9F5;
  --purple: #7C3AED;
  --purple-bg: #F3ECFE;
  --teal: #0D9488;
  --teal-bg: #E6F7F4;
  background: var(--bg);
  color: var(--ink);
  font-family: 'DM Sans', system-ui, sans-serif;
  min-height: 100vh;
}
.pw-btn {
  background: var(--ink); color: #fff; border: none; border-radius: 10px;
  padding: 0.75rem 1.25rem; font-weight: 600; cursor: pointer; font-family: inherit;
}
.pw-btn:hover { opacity: 0.9; }
.pw-btn:disabled { opacity: 0.5; cursor: default; }
.pw-btn-grad {
  background: ${DASH.grad}; color: #fff; border: none; border-radius: 10px;
  padding: 0.75rem 1.25rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.pw-btn-grad:disabled { opacity: 0.6; cursor: default; }
.pw-btn-outline {
  background: transparent; color: var(--ink); border: 1px solid var(--border);
  border-radius: 10px; padding: 0.75rem 1.25rem; font-weight: 600; cursor: pointer; font-family: inherit;
}
.pw-btn-outline:hover { background: #F7F5F3; }
.pw-input {
  border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.75rem;
  font-size: 0.95rem; width: 100%; font-family: inherit; background: #fff; color: var(--ink);
  box-sizing: border-box;
}
.pw-input:focus { outline: 2px solid var(--purple); outline-offset: 1px; }
.pw-card { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; background: #fff; box-shadow: ${DASH.cardShadow}; }
.pw-chip {
  font-size: 0.78rem; border: 1px solid var(--border); border-radius: 999px; padding: 0.25rem 0.7rem;
  background: #fff; display: inline-flex; align-items: center; gap: 4px;
}
.pw-tab {
  border: none; background: none; cursor: pointer; padding: 0.6rem 1rem; font-weight: 600; font-family: inherit;
  border-bottom: 2px solid transparent; color: var(--sub); font-size: 0.92rem;
}
.pw-tab.active { border-bottom: 2px solid var(--purple); color: var(--ink); }
.pw-lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
@keyframes pwSpin { to { transform: rotate(360deg); } }
.pw-spin { animation: pwSpin 0.8s linear infinite; }

/* --- dark sidebar dashboard shell --- */
.pw-dash-shell { display: flex; min-height: 100vh; background: var(--bg); }
.pw-sidebar {
  width: 250px; flex-shrink: 0; background: ${DASH.dark}; padding: 1.5rem 1rem;
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto;
  box-sizing: border-box;
}
.pw-side-label {
  color: #6B6B6B; text-transform: uppercase; font-size: 0.68rem; font-weight: 700;
  letter-spacing: 0.06em; padding: 0 0.7rem; margin: 1.1rem 0 0.4rem;
}
.pw-side-link {
  display: flex; align-items: center; gap: 10px; color: #C4C0B8; background: none; border: none;
  text-align: left; padding: 0.6rem 0.7rem; border-radius: 999px; font-weight: 600; font-size: 0.87rem;
  cursor: pointer; text-decoration: none; width: 100%; box-sizing: border-box; margin-bottom: 2px;
  font-family: inherit;
}
.pw-side-link:hover:not(.active) { background: rgba(255,255,255,0.07); color: #fff; }
.pw-side-link.active { background: ${DASH.grad}; color: #fff; }
.pw-side-icon { width: 18px; text-align: center; font-size: 0.95rem; flex-shrink: 0; }
.pw-dash-main { flex: 1; padding: 2rem; min-width: 0; }

/* --- storefront hero / search / filters --- */
.pw-hero {
  background: ${DASH.dark}; border-radius: 22px; padding: 2.5rem 2rem; position: relative;
  overflow: hidden; color: #fff;
}
.pw-hero-blob {
  position: absolute; top: -60px; right: -60px; width: 260px; height: 260px; border-radius: 50%;
  background: ${DASH.grad}; opacity: 0.35; filter: blur(10px);
}
.pw-search-bar {
  display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 999px;
  padding: 0.4rem 0.4rem 0.4rem 1.25rem; box-shadow: ${DASH.cardShadow}; max-width: 560px;
}
.pw-search-bar input { border: none; outline: none; flex: 1; font-family: inherit; font-size: 0.95rem; background: transparent; }
.pw-search-btn {
  width: 42px; height: 42px; border-radius: 50%; background: ${DASH.dark}; color: #fff;
  border: none; cursor: pointer; font-size: 1rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.pw-pill {
  border-radius: 999px; padding: 0.5rem 1rem; font-size: 0.84rem; font-weight: 600; border: none;
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-family: inherit;
  flex-shrink: 0;
}
.pw-pill.active { background: ${DASH.grad}; color: #fff; }
.pw-promo {
  background: ${DASH.dark}; border-radius: 18px; padding: 1.5rem 1.75rem; color: #fff;
  display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
}
.pw-heart {
  position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255,255,255,0.9); border: none; cursor: pointer; display: flex; align-items: center;
  justify-content: center; font-size: 1rem;
}
`;

// --- Category filter pills (visual language ported from the reference
// host site; drives a real Firestore `category` field on each listing). ---
const CATEGORIES = [
  { key: 'villas', label: 'Villas', icon: '🏝️', bg: '#E1F5F2', color: '#0D6B63' },
  { key: 'cottages', label: 'Cottages', icon: '🌿', bg: '#EAF6E8', color: '#3E7A38' },
  { key: 'cabins', label: 'Cabins', icon: '🪵', bg: '#F5EFE2', color: '#8A6A2A' },
  { key: 'heritage', label: 'Heritage', icon: '🏛️', bg: '#FBEAF2', color: '#B23A6E' },
  { key: 'apartments', label: 'Apartments', icon: '🏢', bg: '#E7F0FB', color: '#2E5FA3' },
  { key: 'houses', label: 'Houses', icon: '🏠', bg: '#FBEEE0', color: '#B2621E' },
  { key: 'studios', label: 'Studios', icon: '🎨', bg: '#F1E9FB', color: '#6B3FA0' },
];
function categoryMeta(key) { return CATEGORIES.find(c => c.key === key); }

// --- Amenity categories (ported verbatim — same checklist a host sees when
// editing a listing on the marketplace platform, minus nothing) ---
const AMENITY_CATEGORIES = [
  { name: 'Bedroom', items: ['Sheets, duvets, duvet covers, pillows, pillowcases', 'Extra blankets and pillows', 'A/C unit or fan', 'Bedside table', 'Reading lamp', 'Box of tissues', 'Clothes rails and hangers', 'Safe to store valuables'] },
  { name: 'Living room', items: ['Comfortable chairs', 'TV', 'Wifi', 'Books and magazines', 'Board games and cards', 'Notepad and pen', 'Face masks and hand sanitizer'] },
  { name: 'Bathroom', items: ['Bath towels, hand towels, washcloths', 'Toilet paper', 'Soap, shampoo, conditioner, body wash', 'Body/hand lotion', 'Toothpaste', 'Disposable toothbrushes', 'Disposable razors', 'Hairdryer', 'Sewing kit'] },
  { name: 'Safety equipment', items: ['Fire extinguisher', 'Smoke detector', 'First aid kit'] },
  { name: 'Kitchen', items: ['Coffee machine', 'Electric kettle', 'Plates', 'Glasses', 'Cups and mugs', 'Cutlery', 'Pots and pans', 'Cutting board', 'Tea and coffee'] },
  { name: 'Extra amenities', items: ['Welcome gift', 'Netflix', 'Toys, board games, or coloring books for kids', 'Toys, bowls, and treats for pets', 'Bluetooth speakers', 'Smart home devices', 'Bathrobes and slippers', 'Complimentary bottle of wine or champagne', 'Complimentary bowl of fruits', 'Washer and dryer', 'Iron and ironing board', 'Outlet adapters'] },
];

// --- Pricing / date helpers (same logic as the marketplace platform this
// product was split off from, adapted for a single host with no
// multi-tenant hostId in the path) ---
function pad2(n) { return String(n).padStart(2, '0'); }

export function isDateBlocked(dateStr, blockedDates) {
  return (blockedDates || []).some(([start, end]) => dateStr >= start && dateStr <= end);
}
export function rangeOverlapsBlocked(checkIn, checkOut, blockedDates) {
  return (blockedDates || []).some(([start, end]) => checkIn < end && checkOut > start);
}
export function getNightPrice(listing, dateStr) {
  const seasonal = (listing.seasonalRates || []).find(s => dateStr >= s.start && dateStr < s.end);
  if (seasonal) return Number(seasonal.price) || 0;
  const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  if (isWeekend && listing.weekendPrice) return Number(listing.weekendPrice) || 0;
  return Number(listing.price) || 0;
}
export function calculateTotalPrice(listing, checkIn, checkOut) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  let total = 0;
  let current = new Date(checkIn + 'T00:00:00');
  const end = new Date(checkOut + 'T00:00:00');
  while (current < end) {
    const dateStr = `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`;
    total += getNightPrice(listing, dateStr);
    current.setDate(current.getDate() + 1);
  }
  return total;
}
export function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
}
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function formatINR(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
}
function monthLabel(y, m) {
  return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// --- Site settings (single doc: settings/site) ---
const DEFAULT_SITE = {
  hostName: 'Your Stay',
  bannerTitle: 'Book direct, no platform fees',
  bannerSubtitle: 'Reach out directly and book your stay',
  whatsappNumber: '',
  whatsappMessage: 'Hi! I have a question about a stay.',
  coverPhotoUrl: '',
  coverPhotoPath: '',
  payoutLog: [],
};
async function loadSiteSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if (!snap.exists()) return DEFAULT_SITE;
    return { ...DEFAULT_SITE, ...snap.data() };
  } catch (e) { console.error('Failed to load site settings', e); return DEFAULT_SITE; }
}
async function saveSiteSettings(fields) {
  await setDoc(doc(db, 'settings', 'site'), fields, { merge: true });
}
async function uploadSiteCoverPhoto(dataUrl) {
  // storage.rules only grants write access under `listings/{listingId}/{fileName}`
  // and we were told not to touch storage.rules, so the site-wide cover photo
  // is stored under a reserved pseudo-listing id that matches that existing
  // pattern rather than a new top-level path that would be silently denied.
  const path = `listings/_site-cover/${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, 'data_url');
  return { path, url: await getDownloadURL(storageRef) };
}

// --- Listings ---
async function loadListings() {
  try {
    const snap = await getDocs(query(collection(db, 'listings'), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('Failed to load listings', e); return []; }
}
async function loadListing(id) {
  try {
    const snap = await getDoc(doc(db, 'listings', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) { console.error('Failed to load listing', e); return null; }
}
async function saveListing(id, fields) {
  if (id) {
    await updateDoc(doc(db, 'listings', id), fields);
    return id;
  }
  const ref2 = await addDoc(collection(db, 'listings'), { ...fields, createdAt: new Date().toISOString() });
  return ref2.id;
}
async function deleteListing(id) {
  await deleteDoc(doc(db, 'listings', id));
}
function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function uploadListingImage(listingId, dataUrl) {
  const path = `listings/${listingId}/${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, 'data_url');
  return { path, url: await getDownloadURL(storageRef) };
}
async function deleteListingImage(path) {
  try { await deleteObject(ref(storage, path)); } catch (e) { console.error('Failed to delete image', e); }
}

// --- Bookings ---
async function loadBookings() {
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), orderBy('submittedAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('Failed to load bookings', e); return []; }
}
async function submitBookingRequest(fields) {
  const ref2 = await addDoc(collection(db, 'bookings'), {
    ...fields,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  });
  return ref2.id;
}
async function updateBookingStatus(id, status, listing) {
  await updateDoc(doc(db, 'bookings', id), { status });
  // Approving a booking blocks those dates on the listing so future
  // guests can't double-book the same nights.
  if (status === 'confirmed' && listing) {
    const bookingSnap = await getDoc(doc(db, 'bookings', id));
    const b = bookingSnap.data();
    const blocked = listing.blockedDates || [];
    blocked.push([b.checkIn, b.checkOut]);
    await updateDoc(doc(db, 'listings', listing.id), { blockedDates: blocked });
  }
}
// Guests aren't authenticated in this single-tenant site, so "My trips" is a
// simple honest lookup by confirmation code (the booking's document id) +
// the email used at booking time, rather than a fake account system.
async function lookupBookingByCode(code, email) {
  try {
    const snap = await getDoc(doc(db, 'bookings', code.trim()));
    if (!snap.exists()) return null;
    const data = snap.data();
    if ((data.email || '').trim().toLowerCase() !== email.trim().toLowerCase()) return null;
    return { id: snap.id, ...data };
  } catch (e) { return null; }
}

// --- Messages (single-tenant guest inquiry thread, stored per listing) ---
async function loadMessages(listingId) {
  try {
    const snap = await getDocs(query(collection(db, 'listings', listingId, 'messages'), orderBy('createdAt', 'asc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('Failed to load messages', e); return []; }
}
async function sendMessage(listingId, fields) {
  await addDoc(collection(db, 'listings', listingId, 'messages'), { ...fields, createdAt: new Date().toISOString() });
}

// --- Favorites: local-only "save" toggle. No backend for guests since they
// aren't authenticated, so this is honestly a per-browser preference, not a
// synced account feature. ---
const FAVORITES_KEY = 'pw_favorites';
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch (e) { return []; }
}
function saveFavorites(list) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

// ============================= UI ============================= //

function LoadingScreen() {
  return (
    <div className="pw-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{STYLES}</style>
      <p className="pw-spin" style={{ color: 'var(--sub)', fontSize: '1.5rem' }}>⟳</p>
    </div>
  );
}

function MyTripsModal({ onClose }) {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | found | notfound
  const [booking, setBooking] = useState(null);

  async function handleLookup(e) {
    e.preventDefault();
    setStatus('loading');
    const b = await lookupBookingByCode(code, email);
    if (b) { setBooking(b); setStatus('found'); } else { setStatus('notfound'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="pw-card" style={{ padding: '1.5rem', width: 380, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <p style={{ fontWeight: 800, fontSize: '1.05rem' }}>My trips</p>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--sub)' }}>×</button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--sub)', marginBottom: 14 }}>
          We don't have guest accounts yet — look up your booking with the confirmation code from your request email, plus the email address you booked with.
        </p>
        {status === 'found' && booking ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontWeight: 700 }}>{booking.listingTitle}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>{formatDateDisplay(booking.checkIn)} → {formatDateDisplay(booking.checkOut)} · {booking.guests} guests</p>
            <p style={{ fontSize: '0.85rem' }}>Status: <strong>{booking.status}</strong></p>
            <p style={{ fontSize: '0.85rem' }}>Total: <strong>{formatINR(booking.total)}</strong></p>
            <button className="pw-btn-outline" style={{ marginTop: 8 }} onClick={() => { setStatus('idle'); setBooking(null); }}>Look up another</button>
          </div>
        ) : (
          <form onSubmit={handleLookup} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="pw-input" placeholder="Confirmation code" value={code} onChange={e => setCode(e.target.value)} required />
            <input className="pw-input" type="email" placeholder="Email used to book" value={email} onChange={e => setEmail(e.target.value)} required />
            {status === 'notfound' && <p style={{ color: '#C0392B', fontSize: '0.82rem' }}>No matching booking found. Double-check the code and email.</p>}
            <button className="pw-btn-grad" type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Looking up…' : 'Find my trip'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function Nav({ site, onDashboardClick }) {
  const [showTrips, setShowTrips] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {showTrips && <MyTripsModal onClose={() => setShowTrips(false)} />}
      <a href="/" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)', textDecoration: 'none' }}>{site.hostName}</a>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="pw-btn-outline" onClick={() => setShowTrips(true)} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>My trips</button>
        <button className="pw-btn-outline" onClick={onDashboardClick} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Host sign in</button>
      </div>
    </div>
  );
}

function ListingCard({ listing, onClick, favorite, onToggleFavorite }) {
  const cover = listing.images && listing.images[0];
  const cat = categoryMeta(listing.category);
  return (
    <div className="pw-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ position: 'relative' }}>
        <div style={{ aspectRatio: '4/3', background: '#F2F0EC', backgroundImage: cover ? `url(${cover.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <button
          className="pw-heart"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(listing.id); }}
          title={favorite ? 'Remove from saved' : 'Save'}
          style={{ color: favorite ? '#E8408C' : '#1A1A1A' }}
        >{favorite ? '♥' : '♡'}</button>
      </div>
      <div style={{ padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontWeight: 700, marginBottom: 2 }}>{listing.title}</p>
          {cat && <span style={{ fontSize: '0.68rem', fontWeight: 700, borderRadius: 999, padding: '0.15rem 0.5rem', background: cat.bg, color: cat.color, whiteSpace: 'nowrap' }}>{cat.icon} {cat.label}</span>}
        </div>
        <p style={{ color: 'var(--sub)', fontSize: '0.85rem', marginBottom: 6 }}>{listing.city}</p>
        <p style={{ fontWeight: 700 }}>{formatINR(listing.price)} <span style={{ color: 'var(--sub)', fontWeight: 400, fontSize: '0.85rem' }}>/ night</span></p>
      </div>
    </div>
  );
}

function HomeView({ site, listings, onOpenListing, onDashboardClick }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [favorites, setFavorites] = useState(loadFavorites());

  function toggleFavorite(id) {
    setFavorites(f => {
      const next = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
      saveFavorites(next);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listings.filter(l => {
      if (category !== 'all' && l.category !== category) return false;
      if (!term) return true;
      const hay = `${l.title || ''} ${l.city || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [listings, search, category]);

  const presentCategories = useMemo(() => {
    const set = new Set(listings.map(l => l.category).filter(Boolean));
    return CATEGORIES.filter(c => set.has(c.key));
  }, [listings]);

  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <Nav site={site} onDashboardClick={onDashboardClick} />
      <div style={{ padding: '2rem 1.5rem 0', maxWidth: 1100, margin: '0 auto' }}>
        <div className="pw-hero">
          <div className="pw-hero-blob" />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: DASH.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.3rem', flexShrink: 0 }}>
              {(site.hostName || 'H').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{site.bannerTitle || `${site.hostName}'s stays`}</h1>
              <p style={{ color: '#D8D5CE', fontSize: '0.98rem', margin: '4px 0 0' }}>
                {site.bannerSubtitle || `${listings.length} handpicked stay${listings.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <div className="pw-search-bar" style={{ position: 'relative' }}>
            <span style={{ color: 'var(--sub)' }}>🔍</span>
            <input placeholder="Search destinations" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="pw-search-btn">🔍</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.5rem 0', maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 8, overflowX: 'auto' }}>
        <button className="pw-pill" style={{ background: '#fff', border: '1px solid var(--border)' }}>Filters ⚙</button>
        <button className={'pw-pill' + (category === 'all' ? ' active' : '')} style={category === 'all' ? {} : { background: '#F2F0EC', color: 'var(--ink)' }} onClick={() => setCategory('all')}>All</button>
        {presentCategories.map(c => (
          <button
            key={c.key}
            className={'pw-pill' + (category === c.key ? ' active' : '')}
            style={category === c.key ? {} : { background: c.bg, color: c.color }}
            onClick={() => setCategory(category === c.key ? 'all' : c.key)}
          >{c.icon} {c.label}</button>
        ))}
      </div>

      <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div className="pw-promo">
          <div>
            <p style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Book direct, save the fees</p>
            <p style={{ color: '#D8D5CE', fontSize: '0.9rem', margin: '4px 0 0' }}>Skip the commission markups other booking sites add to your price</p>
          </div>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: DASH.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🏷️</div>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>{filtered.length} stay{filtered.length === 1 ? '' : 's'}</p>
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--sub)' }}>
            {listings.length === 0 ? 'No stays are live yet. Check back soon.' : 'No stays match your search.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.25rem' }}>
            {filtered.map(l => (
              <ListingCard key={l.id} listing={l} onClick={() => onOpenListing(l)} favorite={favorites.includes(l.id)} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
        )}
      </div>
      {site.whatsappNumber && (
        <a
          href={`https://wa.me/${site.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(site.whatsappMessage)}`}
          target="_blank" rel="noreferrer"
          style={{ position: 'fixed', bottom: 24, right: 24, background: '#25D366', color: '#fff', borderRadius: 999, padding: '0.85rem 1.25rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
        >
          WhatsApp us
        </a>
      )}
    </div>
  );
}

function PhotoLightbox({ images, index, onClose, onNav }) {
  if (index == null) return null;
  const img = images[index];
  return (
    <div className="pw-lightbox" onClick={onClose}>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: '1.8rem', cursor: 'pointer' }}>×</button>
      {images.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNav(-1); }} style={{ position: 'absolute', left: 20, background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer' }}>‹</button>
      )}
      <img src={img.url} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
      {images.length > 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNav(1); }} style={{ position: 'absolute', right: 20, background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer' }}>›</button>
      )}
      <p style={{ position: 'absolute', bottom: 20, color: '#fff', fontSize: '0.85rem' }}>{index + 1} / {images.length}</p>
    </div>
  );
}

function AvailabilityCalendar({ blockedDates }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  const y = base.getFullYear();
  const m = base.getMonth() + monthOffset;
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="pw-card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button className="pw-btn-outline" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setMonthOffset(o => o - 1)}>‹</button>
        <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{monthLabel(y, m)}</p>
        <button className="pw-btn-outline" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setMonthOffset(o => o + 1)}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: '0.72rem', color: 'var(--sub)', marginBottom: 4, textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
          const blocked = isDateBlocked(dateStr, blockedDates);
          return (
            <div key={i} style={{
              aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.78rem', borderRadius: 6,
              background: blocked ? '#F2F0EC' : 'transparent',
              color: blocked ? 'var(--sub)' : 'var(--ink)',
              textDecoration: blocked ? 'line-through' : 'none',
            }}>{d}</div>
          );
        })}
      </div>
    </div>
  );
}

function DetailView({ listing, site, onBack }) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [confirmationCode, setConfirmationCode] = useState('');

  const nights = calculateNights(checkIn, checkOut);
  const total = calculateTotalPrice(listing, checkIn, checkOut);
  const blocked = listing.blockedDates || [];
  const images = (listing.images && listing.images.length > 0) ? listing.images : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!checkIn || !checkOut || nights <= 0) { setError('Pick valid check-in and check-out dates.'); return; }
    if (rangeOverlapsBlocked(checkIn, checkOut, blocked)) { setError('Those dates are no longer available.'); return; }
    if (!name || !email || !phone) { setError('Name, email, and phone are required.'); return; }
    setStatus('submitting');
    try {
      const id = await submitBookingRequest({
        listingId: listing.id,
        listingTitle: listing.title,
        checkIn, checkOut, nights, guests: Number(guests), total,
        name, email, phone,
      });
      setConfirmationCode(id);
      setStatus('done');
    } catch (e2) {
      console.error(e2);
      setError('Could not submit your request. Please try again.');
      setStatus('idle');
    }
  }

  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <PhotoLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNav={(dir) => setLightboxIndex(i => (i + dir + images.length) % images.length)}
      />
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="pw-btn-outline" onClick={onBack} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>← Back</button>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,1fr)', gap: '2rem' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: images.length > 1 ? '2fr 1fr' : '1fr', gap: 8, marginBottom: '1.5rem' }}>
            {(images.length > 0 ? images : [{ url: '' }]).slice(0, 3).map((img, i) => (
              <div key={i} onClick={() => img.url && setLightboxIndex(i)} style={{ cursor: img.url ? 'pointer' : 'default', aspectRatio: '4/3', background: '#F2F0EC', backgroundImage: img.url ? `url(${img.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 10 }} />
            ))}
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>{listing.title}</h1>
          <p style={{ color: 'var(--sub)', marginBottom: '1rem' }}>{listing.city} · {listing.guests} guests · {listing.beds} beds</p>
          <p style={{ lineHeight: 1.6, marginBottom: '1.5rem' }}>{listing.description}</p>
          {listing.amenities && listing.amenities.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>What this place offers</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {listing.amenities.map((a, i) => (
                  <span key={i} className="pw-chip">{a}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Availability</p>
            <AvailabilityCalendar blockedDates={blocked} />
          </div>
        </div>

        <div className="pw-card" style={{ padding: '1.25rem', alignSelf: 'start', position: 'sticky', top: 20 }}>
          <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>{formatINR(listing.price)} <span style={{ fontWeight: 400, color: 'var(--sub)', fontSize: '0.85rem' }}>/ night</span></p>
          {status === 'done' ? (
            <div style={{ padding: '1rem', background: 'var(--teal-bg)', border: '1px solid #B9E4DC', borderRadius: 10 }}>
              <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--teal)' }}>Request sent</p>
              <p style={{ fontSize: '0.9rem', color: 'var(--gray)' }}>{site.hostName} will reach out to confirm your dates.</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginTop: 8 }}>
                Confirmation code: <strong>{confirmationCode}</strong><br />
                Save this — use it with your email under "My trips" to check your status any time.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Check-in</label>
                  <input className="pw-input" type="date" min={todayStr()} value={checkIn} onChange={e => setCheckIn(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Check-out</label>
                  <input className="pw-input" type="date" min={checkIn || todayStr()} value={checkOut} onChange={e => setCheckOut(e.target.value)} required />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Guests</label>
                <input className="pw-input" type="number" min={1} max={listing.guests || 10} value={guests} onChange={e => setGuests(e.target.value)} />
              </div>
              <input className="pw-input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
              <input className="pw-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <input className="pw-input" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
              {nights > 0 && (
                <div style={{ fontSize: '0.9rem', color: 'var(--sub)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {nights} night{nights > 1 ? 's' : ''} · <strong style={{ color: 'var(--ink)' }}>{formatINR(total)}</strong> total
                </div>
              )}
              {error && <p style={{ color: '#C0392B', fontSize: '0.85rem' }}>{error}</p>}
              <button className="pw-btn-grad" type="submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Sending…' : 'Request to book'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------- Host dashboard ---------------------- //

function HostSignIn({ onSignedIn, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onSignedIn();
    } catch (e2) {
      setError('Incorrect email or password.');
    } finally { setBusy(false); }
  }

  return (
    <div className="pw-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{STYLES}</style>
      <form onSubmit={handleSubmit} className="pw-card" style={{ padding: '2rem', width: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>Host sign in</p>
        <input className="pw-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="pw-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p style={{ color: '#C0392B', fontSize: '0.85rem' }}>{error}</p>}
        <button className="pw-btn-grad" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="pw-btn-outline" onClick={onBack}>Back to site</button>
      </form>
    </div>
  );
}

function ManualBlockCard({ listing, onRefresh }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = listing.blockedDates || [];

  async function addBlock() {
    if (!start || !end || end <= start) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'listings', listing.id), { blockedDates: [...blocked, [start, end]] });
      setStart(''); setEnd('');
      onRefresh();
    } finally { setBusy(false); }
  }
  async function removeBlock(i) {
    const next = blocked.filter((_, idx) => idx !== i);
    await updateDoc(doc(db, 'listings', listing.id), { blockedDates: next });
    onRefresh();
  }

  return (
    <div className="pw-card" style={{ padding: '1rem' }}>
      <p style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>Block dates manually</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <input className="pw-input" type="date" style={{ width: 140 }} value={start} onChange={e => setStart(e.target.value)} />
        <input className="pw-input" type="date" style={{ width: 140 }} value={end} onChange={e => setEnd(e.target.value)} />
        <button className="pw-btn-outline" onClick={addBlock} disabled={busy}>Block</button>
      </div>
      {blocked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {blocked.map(([s, e], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--sub)' }}>
              <span>{formatDateDisplay(s)} → {formatDateDisplay(e)}</span>
              <button onClick={() => removeBlock(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C0392B' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingRequestCard({ b, listings, onAct }) {
  const listing = listings.find(l => l.id === b.listingId);
  const cover = listing && listing.images && listing.images[0];
  return (
    <div className="pw-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 220 }}>
        <div style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0, background: '#F2F0EC', backgroundImage: cover ? `url(${cover.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div>
          <p style={{ fontWeight: 700 }}>{b.listingTitle}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>{formatDateDisplay(b.checkIn)} → {formatDateDisplay(b.checkOut)} · {b.guests} guests · {formatINR(b.total)}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>{b.name} · {b.email} · {b.phone}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', borderRadius: 999, padding: '0.25rem 0.6rem',
          color: b.status === 'confirmed' ? DASH.teal : (b.status === 'cancelled' || b.status === 'declined') ? '#C0392B' : '#9C6B0B',
          background: b.status === 'confirmed' ? DASH.tealBg : (b.status === 'cancelled' || b.status === 'declined') ? '#FBEAEA' : '#FBF3E0',
        }}>{b.status}</span>
        {b.status === 'pending' && (
          <>
            <button className="pw-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => onAct(b, 'confirmed')}>Confirm</button>
            <button className="pw-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => onAct(b, 'cancelled')}>Decline</button>
          </>
        )}
        {b.status === 'confirmed' && (
          <button className="pw-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => onAct(b, 'cancelled')}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function BookingsSection({ bookings, listings, onRefresh }) {
  const [filter, setFilter] = useState('all');
  async function act(b, status) {
    const listing = listings.find(l => l.id === b.listingId);
    await updateBookingStatus(b.id, status, listing);
    onRefresh();
  }
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];
  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <button key={f.key} className={'pw-pill' + (filter === f.key ? ' active' : '')} style={filter === f.key ? {} : { background: '#F2F0EC', color: 'var(--ink)' }} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--sub)' }}>No booking requests here.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(b => <BookingRequestCard key={b.id} b={b} listings={listings} onAct={act} />)}
        </div>
      )}
    </div>
  );
}

function SeasonalRateForm({ draft, set }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [price, setPrice] = useState('');
  const rates = draft.seasonalRates || [];

  function add() {
    if (!start || !end || !price || end <= start) return;
    set('seasonalRates', [...rates, { start, end, price: Number(price) }]);
    setStart(''); setEnd(''); setPrice('');
  }
  function remove(i) {
    set('seasonalRates', rates.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <p style={{ fontSize: '0.8rem', color: 'var(--sub)', marginBottom: 4 }}>Seasonal rates (override the base price for a date range)</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <input className="pw-input" type="date" style={{ width: 140 }} value={start} onChange={e => setStart(e.target.value)} />
        <input className="pw-input" type="date" style={{ width: 140 }} value={end} onChange={e => setEnd(e.target.value)} />
        <input className="pw-input" type="number" placeholder="Price / night" style={{ width: 140 }} value={price} onChange={e => setPrice(e.target.value)} />
        <button type="button" className="pw-btn-outline" onClick={add}>Add</button>
      </div>
      {rates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rates.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--sub)' }}>
              <span>{formatDateDisplay(r.start)} → {formatDateDisplay(r.end)}: {formatINR(r.price)}/night</span>
              <button type="button" onClick={() => remove(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C0392B' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListingEditCard({ listing, onSaved, onCancel }) {
  const [draft, setDraft] = useState(listing || { title: '', city: '', category: '', price: '', weekendPrice: '', beds: 1, guests: 2, description: '', amenities: [], images: [], blockedDates: [], seasonalRates: [] });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  function set(field, value) { setDraft(d => ({ ...d, [field]: value })); }
  function toggleAmenity(item) {
    const list = draft.amenities || [];
    set('amenities', list.includes(item) ? list.filter(a => a !== item) : [...list, item]);
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const dataUrl = await compressImageFile(file);
      const id = draft.id || 'draft-' + Date.now();
      const { path, url } = await uploadListingImage(id, dataUrl);
      set('images', [...(draft.images || []), { path, url }]);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function removeImage(path) {
    await deleteListingImage(path);
    set('images', (draft.images || []).filter(img => img.path !== path));
  }

  async function handleSave() {
    setBusy(true);
    try {
      const fields = {
        title: draft.title, city: draft.city, category: draft.category || '', price: Number(draft.price) || 0,
        weekendPrice: Number(draft.weekendPrice) || 0, beds: Number(draft.beds) || 1,
        guests: Number(draft.guests) || 1, description: draft.description || '',
        amenities: draft.amenities || [], images: draft.images || [],
        blockedDates: draft.blockedDates || [], seasonalRates: draft.seasonalRates || [],
      };
      const id = await saveListing(draft.id, fields);
      onSaved(id);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input className="pw-input" placeholder="Title" value={draft.title} onChange={e => set('title', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input className="pw-input" placeholder="City" value={draft.city} onChange={e => set('city', e.target.value)} />
        <select className="pw-input" value={draft.category || ''} onChange={e => set('category', e.target.value)}>
          <option value="">Category (none)</option>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <input className="pw-input" type="number" placeholder="Price / night (INR)" value={draft.price} onChange={e => set('price', e.target.value)} />
        <input className="pw-input" type="number" placeholder="Weekend price" value={draft.weekendPrice} onChange={e => set('weekendPrice', e.target.value)} />
        <input className="pw-input" type="number" placeholder="Beds" value={draft.beds} onChange={e => set('beds', e.target.value)} />
      </div>
      <input className="pw-input" type="number" placeholder="Max guests" value={draft.guests} onChange={e => set('guests', e.target.value)} style={{ maxWidth: 200 }} />
      <textarea className="pw-input" placeholder="Description" rows={3} value={draft.description} onChange={e => set('description', e.target.value)} />

      <SeasonalRateForm draft={draft} set={set} />

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--sub)', marginBottom: 6 }}>Amenities</p>
        {AMENITY_CATEGORIES.map(cat => (
          <div key={cat.name} style={{ marginBottom: 10 }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{cat.name}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cat.items.map(item => {
                const active = (draft.amenities || []).includes(item);
                return (
                  <button type="button" key={item} onClick={() => toggleAmenity(item)}
                    className="pw-chip"
                    style={{ cursor: 'pointer', background: active ? 'var(--purple-bg)' : '#fff', borderColor: active ? 'var(--purple)' : 'var(--border)', color: active ? 'var(--purple)' : 'var(--ink)' }}>
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--sub)', marginBottom: 4 }}>Photos</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {(draft.images || []).map(img => (
            <div key={img.path} style={{ position: 'relative' }}>
              <img src={img.url} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
              <button type="button" onClick={() => removeImage(img.path)} style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--border)', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: '0.7rem' }}>×</button>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} />
      </div>

      {draft.id && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <AvailabilityCalendar blockedDates={draft.blockedDates || []} />
          <ManualBlockCard listing={draft} onRefresh={() => set('blockedDates', draft.blockedDates)} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pw-btn-grad" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save listing'}</button>
        <button className="pw-btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ListingRow({ listing, expanded, onToggle, onSaved }) {
  const cover = listing.images && listing.images[0];
  return (
    <div className="pw-card">
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 10, background: '#F2F0EC', backgroundImage: cover ? `url(${cover.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700 }}>{listing.title || 'Untitled'}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>{listing.city} · {formatINR(listing.price)}/night · {(listing.images || []).length} photo{(listing.images || []).length === 1 ? '' : 's'}</p>
        </div>
        <span className="pw-chip" style={{ background: 'var(--teal-bg)', color: 'var(--teal)', borderColor: 'transparent', flexShrink: 0 }}>Live</span>
        <span style={{ fontSize: '1.2rem', color: 'var(--sub)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>›</span>
      </div>
      {expanded && (
        <div style={{ padding: '0 1rem 1.25rem', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <ListingEditCard listing={listing} onSaved={onSaved} onCancel={onToggle} />
        </div>
      )}
    </div>
  );
}

function ListingsSection({ listings, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {listings.length === 0 && !addingNew && (
        <p style={{ color: 'var(--sub)' }}>No listings yet — add your first one below.</p>
      )}
      {listings.map(l => (
        <ListingRow
          key={l.id}
          listing={l}
          expanded={expandedId === l.id}
          onToggle={() => setExpandedId(id => (id === l.id ? null : l.id))}
          onSaved={() => { setExpandedId(null); onRefresh(); }}
        />
      ))}
      {addingNew ? (
        <div className="pw-card" style={{ padding: '1.25rem' }}>
          <ListingEditCard listing={null} onSaved={() => { setAddingNew(false); onRefresh(); }} onCancel={() => setAddingNew(false)} />
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          style={{ border: '2px dashed var(--border)', borderRadius: 14, padding: '1.1rem', background: 'none', cursor: 'pointer', color: 'var(--sub)', fontWeight: 700, fontFamily: 'inherit' }}
        >+ Add a listing</button>
      )}
    </div>
  );
}

function CalendarSyncCard({ listing, onRefresh }) {
  const [icsUrl, setIcsUrl] = useState(listing.icalUrl || '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'listings', listing.id), { icalUrl: icsUrl });
      onRefresh();
      setSaved(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="pw-card" style={{ padding: '1rem' }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{listing.title || 'Untitled'}</p>
      <p style={{ fontSize: '0.82rem', color: 'var(--sub)', marginBottom: 10 }}>
        Paste this listing's calendar export link (Airbnb, Booking.com, etc.) — a listing can have more than
        one connected once real syncing is wired up. For now this just saves the link here; automatically
        blocking dates from it is a follow-up step.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="pw-input" placeholder="https://www.airbnb.com/calendar/ical/..." value={icsUrl} onChange={e => { setIcsUrl(e.target.value); setSaved(false); }} />
        <button className="pw-btn-outline" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {saved && <p style={{ fontSize: '0.8rem', color: 'var(--teal)', marginTop: 6 }}>Saved.</p>}
    </div>
  );
}

function CalendarSection({ listings, onRefresh }) {
  if (listings.length === 0) return <p style={{ color: 'var(--sub)' }}>Add a listing first — its calendar tools show up here.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--sub)', fontSize: '0.9rem', maxWidth: 640 }}>
        Connect each listing's calendar export link so its booked dates can eventually sync automatically —
        no sync job runs yet, this just saves the link — and block dates by hand any time in the meantime.
      </p>
      {listings.map(l => (
        <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <CalendarSyncCard listing={l} onRefresh={onRefresh} />
          <ManualBlockCard listing={l} onRefresh={onRefresh} />
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, icon, grad }) {
  return (
    <div className="pw-card" style={{ padding: '1.1rem', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 160, ...(grad ? { background: DASH.grad, border: 'none' } : {}) }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: grad ? 'rgba(255,255,255,0.22)' : 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{icon}</div>
      <div>
        <p style={{ fontSize: '0.78rem', color: grad ? 'rgba(255,255,255,0.9)' : 'var(--sub)', marginBottom: 2 }}>{label}</p>
        <p style={{ fontWeight: 800, fontSize: '1.3rem', color: grad ? '#fff' : 'var(--ink)' }}>{value}</p>
      </div>
    </div>
  );
}

function BarChart({ data }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--sub)' }}>{formatINR(d.value)}</span>
          <div style={{ width: '100%', maxWidth: 30, borderRadius: '6px 6px 2px 2px', background: DASH.grad, height: `${Math.max(4, (d.value / max) * 100)}%` }} />
          <span style={{ fontSize: '0.68rem', color: 'var(--sub)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ segments, size = 130 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const radius = 42, circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <g transform="rotate(-90 50 50)">
          {total === 0 ? (
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#F2F0EC" strokeWidth="14" />
          ) : segments.map((seg, i) => {
            const frac = seg.value / total;
            const dash = frac * circumference;
            const circle = (
              <circle key={i} cx="50" cy="50" r={radius} fill="none" stroke={seg.color} strokeWidth="14"
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} strokeLinecap="butt" />
            );
            offset += dash;
            return circle;
          })}
        </g>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {segments.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>No data yet</span>}
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--sub)' }}>{s.label}</span>
            <strong>{typeof s.display !== 'undefined' ? s.display : s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsSection({ bookings, listings }) {
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const totalNights = confirmed.reduce((s, b) => s + (Number(b.nights) || 0), 0);
  const avgNightly = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;

  const monthMap = {};
  confirmed.forEach(b => {
    const key = (b.checkIn || b.submittedAt || '').slice(0, 7);
    if (!key) return;
    monthMap[key] = (monthMap[key] || 0) + (Number(b.total) || 0);
  });
  const monthData = Object.keys(monthMap).sort().slice(-6).map(k => {
    const [y, m] = k.split('-').map(Number);
    return { label: new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short' }), value: monthMap[k] };
  });

  const statusColors = { pending: '#F5A524', confirmed: DASH.teal, cancelled: '#C0392B', declined: '#C0392B' };
  const statusCounts = {};
  bookings.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });
  const statusSegments = Object.entries(statusCounts).map(([k, v]) => ({ label: k, value: v, color: statusColors[k] || '#999' }));

  const byListing = {};
  confirmed.forEach(b => { byListing[b.listingTitle || 'Untitled'] = (byListing[b.listingTitle || 'Untitled'] || 0) + (Number(b.total) || 0); });
  const listingColors = [DASH.gradStart, DASH.gradEnd, DASH.purple, DASH.teal, '#3B82F6', '#F59E0B'];
  const listingSegments = Object.entries(byListing).map(([k, v], i) => ({ label: k, value: v, display: formatINR(v), color: listingColors[i % listingColors.length] }));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatTile label="Total revenue" value={formatINR(totalRevenue)} icon="₹" grad />
        <StatTile label="Total bookings" value={bookings.length} icon="📩" />
        <StatTile label="Avg. nightly rate" value={formatINR(avgNightly)} icon="🌙" />
        <StatTile label="Live listings" value={listings.length} icon="🏠" />
      </div>
      {monthData.length > 0 && (
        <div className="pw-card" style={{ padding: '1.25rem', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9rem' }}>Revenue by month</p>
          <BarChart data={monthData} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div className="pw-card" style={{ padding: '1.25rem' }}>
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9rem' }}>Bookings by status</p>
          <DonutChart segments={statusSegments} />
        </div>
        <div className="pw-card" style={{ padding: '1.25rem' }}>
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9rem' }}>Revenue by listing</p>
          <DonutChart segments={listingSegments} />
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ bookings, listings, site }) {
  const total = bookings.length;
  const awaiting = bookings.filter(b => b.status === 'pending').length;
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>Welcome back, {site.hostName}</h1>
      <p style={{ color: 'var(--sub)', marginBottom: 20 }}>Here's how your stays are doing.</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatTile label="Total requests" value={total} icon="📥" />
        <StatTile label="Awaiting reply" value={awaiting} icon="⏳" />
        <StatTile label="Confirmed" value={confirmed} icon="✅" />
      </div>
      <ReportsSection bookings={bookings} listings={listings} />
    </div>
  );
}

function WalletSection({ bookings, site, onSaved }) {
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const totalEarnings = confirmed.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const payoutLog = site.payoutLog || [];
  const paidOut = payoutLog.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const available = Math.max(0, totalEarnings - paidOut);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function logPayout() {
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    try {
      const entry = { amount: Number(amount), note: note || '', date: new Date().toISOString() };
      const next = [entry, ...payoutLog];
      await saveSiteSettings({ payoutLog: next });
      onSaved({ ...site, payoutLog: next });
      setAmount(''); setNote('');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatTile label="Available balance" value={formatINR(available)} icon="₹" grad />
        <StatTile label="Paid out so far" value={formatINR(paidOut)} icon="🏦" />
      </div>
      <div className="pw-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontWeight: 700, marginBottom: 4 }}>Request a payout</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--sub)', marginBottom: 12 }}>
          No payment processor is connected yet, so guests pay you directly and this just logs it for your
          records — a running history of what's been paid out, not an automatic transfer.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="pw-input" type="number" placeholder="Amount (INR)" style={{ maxWidth: 160 }} value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="pw-input" placeholder="Note (optional)" style={{ flex: 1, minWidth: 160 }} value={note} onChange={e => setNote(e.target.value)} />
          <button className="pw-btn-grad" onClick={logPayout} disabled={busy}>{busy ? 'Logging…' : 'Log payout'}</button>
        </div>
      </div>
      <div>
        <p style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>Request history</p>
        {payoutLog.length === 0 ? (
          <p style={{ color: 'var(--sub)', fontSize: '0.9rem' }}>No payouts logged yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {payoutLog.map((p, i) => (
              <div key={i} className="pw-card" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>{p.note || 'Payout'} · {timeAgo(p.date)}</span>
                <strong>{formatINR(p.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PayoutDetailsSection({ site, onSaved }) {
  const [draft, setDraft] = useState({
    accountName: site.payoutAccountName || '',
    accountNumber: site.payoutAccountNumber || '',
    ifsc: site.payoutIfsc || '',
    upi: site.payoutUpi || '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await saveSiteSettings({
        payoutAccountName: draft.accountName, payoutAccountNumber: draft.accountNumber,
        payoutIfsc: draft.ifsc, payoutUpi: draft.upi,
      });
      onSaved({ ...site, payoutAccountName: draft.accountName });
      setSaved(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="pw-card" style={{ padding: '1.25rem', maxWidth: 480 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>Payout details</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--sub)', marginBottom: 10 }}>
        Where your payouts get sent — add this once so you don't have to send bank details separately each
        time. This is just your own reference; no payout automation is wired up yet.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="pw-input" placeholder="Account holder name" value={draft.accountName} onChange={e => setDraft({ ...draft, accountName: e.target.value })} />
        <input className="pw-input" placeholder="Account number" value={draft.accountNumber} onChange={e => setDraft({ ...draft, accountNumber: e.target.value })} />
        <input className="pw-input" placeholder="IFSC code" value={draft.ifsc} onChange={e => setDraft({ ...draft, ifsc: e.target.value })} />
        <input className="pw-input" placeholder="UPI ID" value={draft.upi} onChange={e => setDraft({ ...draft, upi: e.target.value })} />
        <button className="pw-btn-outline" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {saved && <p style={{ fontSize: '0.8rem', color: 'var(--teal)' }}>Saved.</p>}
      </div>
    </div>
  );
}

function GuestsSection({ bookings }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const guests = {};
  bookings.forEach(b => {
    const key = b.email;
    if (!key) return;
    if (!guests[key]) guests[key] = { name: b.name, email: b.email, phone: b.phone, trips: 0, spend: 0, last: b.submittedAt };
    guests[key].trips += 1;
    guests[key].spend += Number(b.total) || 0;
    if (!guests[key].last || (b.submittedAt && b.submittedAt > guests[key].last)) guests[key].last = b.submittedAt;
  });
  let list = Object.values(guests);
  if (search.trim()) {
    const term = search.trim().toLowerCase();
    list = list.filter(g => (g.name || '').toLowerCase().includes(term));
  }
  list = list.sort((a, b) => sort === 'recent' ? (b.last || '').localeCompare(a.last || '') : b.spend - a.spend);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="pw-input" placeholder="Search by name" style={{ maxWidth: 260 }} value={search} onChange={e => setSearch(e.target.value)} />
        <select className="pw-input" style={{ maxWidth: 180 }} value={sort} onChange={e => setSort(e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="spend">Highest spend</option>
        </select>
      </div>
      {list.length === 0 ? (
        <p style={{ color: 'var(--sub)' }}>No guests yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(g => (
            <div key={g.email} className="pw-card" style={{ padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: DASH.grad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                  {(g.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 700 }}>{g.name}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>{g.phone} · {g.email}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 700 }}>{formatINR(g.spend)}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>{g.trips} trip{g.trips === 1 ? '' : 's'} · {timeAgo(g.last)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HostMessagesSection({ listings }) {
  const [selectedId, setSelectedId] = useState(listings[0]?.id || null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setLoaded(false);
    loadMessages(selectedId).then(m => { setMessages(m); setLoaded(true); });
  }, [selectedId]);

  async function send() {
    if (!reply.trim() || !selectedId) return;
    await sendMessage(selectedId, { from: 'host', text: reply.trim() });
    setReply('');
    setMessages(await loadMessages(selectedId));
  }

  if (listings.length === 0) return <p style={{ color: 'var(--sub)' }}>Add a listing first — guest inquiries show up here per listing.</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {listings.map(l => (
          <button key={l.id} onClick={() => setSelectedId(l.id)}
            className="pw-btn-outline"
            style={{ textAlign: 'left', fontSize: '0.82rem', padding: '0.5rem 0.75rem', background: selectedId === l.id ? 'var(--purple-bg)' : '#fff', borderColor: selectedId === l.id ? 'var(--purple)' : 'var(--border)' }}>
            {l.title || 'Untitled'}
          </button>
        ))}
      </div>
      <div className="pw-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 240 }}>
        {!loaded ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : messages.length === 0 ? (
          <p style={{ color: 'var(--sub)' }}>No messages yet for this listing.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {messages.map(m => (
              <div key={m.id} style={{
                alignSelf: m.from === 'host' ? 'flex-end' : 'flex-start',
                background: m.from === 'host' ? 'var(--purple-bg)' : '#F2F0EC',
                borderRadius: 10, padding: '0.5rem 0.75rem', maxWidth: '75%', fontSize: '0.85rem',
              }}>{m.text}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="pw-input" placeholder="Reply to guest…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
          <button className="pw-btn" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ site, onSaved }) {
  const [draft, setDraft] = useState(site);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const coverFileRef = useRef(null);

  async function handleSave() {
    setBusy(true);
    try { await saveSiteSettings(draft); onSaved(draft); } finally { setBusy(false); }
  }

  async function handleCoverPhoto(e) {
    const file = (e.target.files || [])[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageFile(file, 1800, 0.85);
      const { path, url } = await uploadSiteCoverPhoto(dataUrl);
      const next = { ...draft, coverPhotoUrl: url, coverPhotoPath: path };
      setDraft(next);
      await saveSiteSettings({ coverPhotoUrl: url, coverPhotoPath: path });
      onSaved(next);
    } finally {
      setUploading(false);
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div className="pw-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Display name</label>
          <input className="pw-input" value={draft.hostName} onChange={e => setDraft({ ...draft, hostName: e.target.value })} />
        </div>
        <button className="pw-btn-grad" onClick={handleSave} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>

      <div className="pw-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>Cover photo</p>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/6', borderRadius: 12, overflow: 'hidden', background: draft.coverPhotoUrl ? 'none' : DASH.dark, backgroundImage: draft.coverPhotoUrl ? `url(${draft.coverPhotoUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 12 }}>
          <button type="button" className="pw-btn-outline" style={{ background: 'rgba(255,255,255,0.92)' }} onClick={() => coverFileRef.current && coverFileRef.current.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
          <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverPhoto} />
        </div>
      </div>

      <div className="pw-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontWeight: 700 }}>Storefront copy</p>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Banner title</label>
          <input className="pw-input" value={draft.bannerTitle} onChange={e => setDraft({ ...draft, bannerTitle: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Banner subtitle</label>
          <input className="pw-input" value={draft.bannerSubtitle} onChange={e => setDraft({ ...draft, bannerSubtitle: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>WhatsApp number (with country code)</label>
          <input className="pw-input" value={draft.whatsappNumber} onChange={e => setDraft({ ...draft, whatsappNumber: e.target.value })} placeholder="+919999999999" />
        </div>
        <button className="pw-btn-outline" onClick={handleSave} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function Sidebar({ tab, setTab, site, onSignOut }) {
  const menu = [
    { key: 'overview', label: 'Overview', icon: '⌂' },
    { key: 'listings', label: 'Listings', icon: '🏠' },
    { key: 'bookings', label: 'Bookings', icon: '📩' },
    { key: 'calendar', label: 'Calendar', icon: '📅' },
    { key: 'guests', label: 'Guests', icon: '👤' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'reports', label: 'Reports', icon: '📊' },
    { key: 'wallet', label: 'Wallet', icon: '💰' },
    { key: 'payout', label: 'Payout Details', icon: '🏦' },
  ];
  const initial = (site.hostName || 'H').charAt(0).toUpperCase();
  return (
    <div className="pw-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0.6rem 0.5rem' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: DASH.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>{initial}</div>
        <p style={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.hostName}</p>
      </div>
      <p className="pw-side-label">MENU</p>
      {menu.map(m => (
        <button key={m.key} className={'pw-side-link' + (tab === m.key ? ' active' : '')} onClick={() => setTab(m.key)}>
          <span className="pw-side-icon">{m.icon}</span>{m.label}
        </button>
      ))}
      <p className="pw-side-label">ACCOUNT</p>
      <button className={'pw-side-link' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>
        <span className="pw-side-icon">⚙</span>Settings
      </button>
      <a className="pw-side-link" href="/" target="_blank" rel="noreferrer">
        <span className="pw-side-icon">↗</span>View as guest
      </a>
      <button className="pw-side-link" style={{ color: '#F87171' }} onClick={onSignOut}>
        <span className="pw-side-icon">⎋</span>Log out
      </button>
    </div>
  );
}

const TAB_TITLES = {
  overview: 'Overview', listings: 'Listings', bookings: 'Bookings', calendar: 'Calendar',
  guests: 'Guests', messages: 'Messages', reports: 'Reports', wallet: 'Wallet',
  payout: 'Payout Details', settings: 'Settings',
};

function VendorDashboard({ site, onSignOut }) {
  const [tab, setTab] = useState('overview');
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [siteState, setSiteState] = useState(site);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [b, l] = await Promise.all([loadBookings(), loadListings()]);
    setBookings(b); setListings(l); setLoaded(true);
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <div className="pw-dash-shell">
        <Sidebar tab={tab} setTab={setTab} site={siteState} onSignOut={onSignOut} />
        <div className="pw-dash-main">
          {!loaded ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : (
            <>
              {tab === 'overview' && <OverviewSection bookings={bookings} listings={listings} site={siteState} />}
              {tab === 'listings' && <ListingsSection listings={listings} onRefresh={refresh} />}
              {tab === 'bookings' && <BookingsSection bookings={bookings} listings={listings} onRefresh={refresh} />}
              {tab === 'calendar' && <CalendarSection listings={listings} onRefresh={refresh} />}
              {tab === 'guests' && <GuestsSection bookings={bookings} />}
              {tab === 'messages' && <HostMessagesSection listings={listings} />}
              {tab === 'reports' && <ReportsSection bookings={bookings} listings={listings} />}
              {tab === 'wallet' && <WalletSection bookings={bookings} site={siteState} onSaved={setSiteState} />}
              {tab === 'payout' && <PayoutDetailsSection site={siteState} onSaved={setSiteState} />}
              {tab === 'settings' && <SettingsSection site={siteState} onSaved={setSiteState} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------- Top-level app ---------------------- //

export default function App() {
  const [view, setView] = useState('home'); // home | listing | signin | dashboard
  const [site, setSite] = useState(null);
  const [listings, setListings] = useState([]);
  const [activeListing, setActiveListing] = useState(null);
  const [authUser, setAuthUser] = useState(undefined);

  useEffect(() => {
    loadSiteSettings().then(setSite);
    loadListings().then(setListings);
    const unsub = onAuthStateChanged(auth, u => setAuthUser(u || null));
    return unsub;
  }, []);

  if (!site || authUser === undefined) return <LoadingScreen />;

  if (view === 'dashboard' || (authUser && view === 'signin')) {
    if (!authUser) { setView('signin'); return null; }
    return <VendorDashboard site={site} onSignOut={async () => { await signOut(auth); setView('home'); }} />;
  }
  if (view === 'signin') {
    return <HostSignIn onSignedIn={() => setView('dashboard')} onBack={() => setView('home')} />;
  }
  if (view === 'listing' && activeListing) {
    return <DetailView listing={activeListing} site={site} onBack={() => setView('home')} />;
  }
  return (
    <HomeView
      site={site}
      listings={listings}
      onOpenListing={async (l) => { const fresh = await loadListing(l.id); setActiveListing(fresh || l); setView('listing'); }}
      onDashboardClick={() => setView(authUser ? 'dashboard' : 'signin')}
    />
  );
}
