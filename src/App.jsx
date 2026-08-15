import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

// --- Design tokens, ported verbatim from the marketplace platform this
// product was split off from (same DASH dashboard palette + STYLES sheet). ---
const DASH = {
  ink: '#1A1A1A',
  sub: '#8A8578',
  grad: 'linear-gradient(135deg, #FB923C, #EC4899)',
  gradStart: '#FB923C',
  gradEnd: '#EC4899',
  purple: '#7C3AED',
  purpleBg: '#F3ECFE',
  teal: '#0D9488',
  tealBg: '#E6F7F4',
  cardShadow: '0 4px 20px -8px rgba(0,0,0,0.08)',
};

const STYLES = `
.pw-root {
  --ink: #1A1A1A;
  --sub: #8A8578;
  --gray: #6B6B6B;
  --border: #E4E4E4;
  --bg: #FDFCFB;
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
  background: linear-gradient(135deg, #FB923C, #EC4899); color: #fff; border: none; border-radius: 10px;
  padding: 0.75rem 1.25rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.pw-btn-outline {
  background: transparent; color: var(--ink); border: 1px solid var(--border);
  border-radius: 10px; padding: 0.75rem 1.25rem; font-weight: 600; cursor: pointer; font-family: inherit;
}
.pw-btn-outline:hover { background: #F7F5F3; }
.pw-input {
  border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.75rem;
  font-size: 0.95rem; width: 100%; font-family: inherit; background: #fff; color: var(--ink);
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
`;

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

// --- Site settings (single doc: settings/site) ---
const DEFAULT_SITE = {
  hostName: 'Your Stay',
  bannerTitle: 'Book direct, no platform fees',
  bannerSubtitle: 'Reach out directly and book your stay',
  whatsappNumber: '',
  whatsappMessage: 'Hi! I have a question about a stay.',
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
  await addDoc(collection(db, 'bookings'), {
    ...fields,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  });
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

// ============================= UI ============================= //

function LoadingScreen() {
  return (
    <div className="pw-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{STYLES}</style>
      <p className="pw-spin" style={{ color: 'var(--sub)', fontSize: '1.5rem' }}>⟳</p>
    </div>
  );
}

function Nav({ site, onDashboardClick }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <a href="/" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)', textDecoration: 'none' }}>{site.hostName}</a>
      <button className="pw-btn-outline" onClick={onDashboardClick} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Host sign in</button>
    </div>
  );
}

function ListingCard({ listing, onClick }) {
  const cover = listing.images && listing.images[0];
  return (
    <div className="pw-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ aspectRatio: '4/3', background: '#F2F0EC', backgroundImage: cover ? `url(${cover.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ padding: '0.85rem 1rem' }}>
        <p style={{ fontWeight: 700, marginBottom: 2 }}>{listing.title}</p>
        <p style={{ color: 'var(--sub)', fontSize: '0.85rem', marginBottom: 6 }}>{listing.city}</p>
        <p style={{ fontWeight: 700 }}>{formatINR(listing.price)} <span style={{ color: 'var(--sub)', fontWeight: 400, fontSize: '0.85rem' }}>/ night</span></p>
      </div>
    </div>
  );
}

function HomeView({ site, listings, onOpenListing, onDashboardClick }) {
  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <Nav site={site} onDashboardClick={onDashboardClick} />
      <div style={{ padding: '3rem 1.5rem 1.5rem', maxWidth: 640 }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>{site.bannerTitle}</h1>
        <p style={{ color: 'var(--sub)', fontSize: '1.05rem' }}>{site.bannerSubtitle}</p>
      </div>
      <div style={{ padding: '0 1.5rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
        {listings.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--sub)' }}>
            No stays are live yet. Check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.25rem' }}>
            {listings.map(l => <ListingCard key={l.id} listing={l} onClick={() => onOpenListing(l)} />)}
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
      await submitBookingRequest({
        listingId: listing.id,
        listingTitle: listing.title,
        checkIn, checkOut, nights, guests: Number(guests), total,
        name, email, phone,
      });
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
  return (
    <div className="pw-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <div>
        <p style={{ fontWeight: 700 }}>{b.listingTitle}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>{formatDateDisplay(b.checkIn)} → {formatDateDisplay(b.checkOut)} · {b.guests} guests · {formatINR(b.total)}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>{b.name} · {b.email} · {b.phone}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', borderRadius: 999, padding: '0.25rem 0.6rem',
          color: b.status === 'confirmed' ? DASH.teal : b.status === 'cancelled' ? '#C0392B' : '#9C6B0B',
          background: b.status === 'confirmed' ? DASH.tealBg : b.status === 'cancelled' ? '#FBEAEA' : '#FBF3E0',
        }}>{b.status}</span>
        {b.status === 'pending' && (
          <>
            <button className="pw-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => onAct(b, 'confirmed')}>Confirm</button>
            <button className="pw-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => onAct(b, 'cancelled')}>Decline</button>
          </>
        )}
      </div>
    </div>
  );
}

function BookingsSection({ bookings, listings, onRefresh }) {
  async function act(b, status) {
    const listing = listings.find(l => l.id === b.listingId);
    await updateBookingStatus(b.id, status, listing);
    onRefresh();
  }
  if (bookings.length === 0) return <p style={{ color: 'var(--sub)' }}>No booking requests yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bookings.map(b => <BookingRequestCard key={b.id} b={b} listings={listings} onAct={act} />)}
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
  const [draft, setDraft] = useState(listing || { title: '', city: '', price: '', weekendPrice: '', beds: 1, guests: 2, description: '', amenities: [], images: [], blockedDates: [], seasonalRates: [] });
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
        title: draft.title, city: draft.city, price: Number(draft.price) || 0,
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
    <div className="pw-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input className="pw-input" placeholder="Title" value={draft.title} onChange={e => set('title', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input className="pw-input" placeholder="City" value={draft.city} onChange={e => set('city', e.target.value)} />
        <input className="pw-input" type="number" placeholder="Price / night (INR)" value={draft.price} onChange={e => set('price', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <input className="pw-input" type="number" placeholder="Weekend price" value={draft.weekendPrice} onChange={e => set('weekendPrice', e.target.value)} />
        <input className="pw-input" type="number" placeholder="Beds" value={draft.beds} onChange={e => set('beds', e.target.value)} />
        <input className="pw-input" type="number" placeholder="Max guests" value={draft.guests} onChange={e => set('guests', e.target.value)} />
      </div>
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

function ListingsSection({ listings, onRefresh }) {
  const [editing, setEditing] = useState(null); // null | 'new' | listing object

  if (editing) {
    return (
      <ListingEditCard
        listing={editing === 'new' ? null : editing}
        onSaved={() => { setEditing(null); onRefresh(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <button className="pw-btn-grad" style={{ marginBottom: 14 }} onClick={() => setEditing('new')}>+ Add listing</button>
      {listings.length === 0 ? (
        <p style={{ color: 'var(--sub)' }}>No listings yet — add your first one.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listings.map(l => (
            <div key={l.id} className="pw-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700 }}>{l.title || 'Untitled'}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>{l.city} · {formatINR(l.price)}/night</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pw-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setEditing(l)}>Edit</button>
                <button className="pw-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={async () => { if (confirm('Delete this listing?')) { await deleteListing(l.id); onRefresh(); } }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarSyncCard({ site, onSaved }) {
  const [icsUrl, setIcsUrl] = useState(site.calendarSyncUrl || '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await saveSiteSettings({ calendarSyncUrl: icsUrl });
      onSaved({ ...site, calendarSyncUrl: icsUrl });
      setSaved(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="pw-card" style={{ padding: '1.25rem', maxWidth: 520 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>Calendar sync</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--sub)', marginBottom: 10 }}>
        Paste your Airbnb / Booking.com iCal export URL here. Once a sync job is connected, dates blocked on
        that platform will automatically block here too, so you never get double-booked. (The sync job itself
        is a follow-up step — this saves the URL now so it's ready to wire up.)
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="pw-input" placeholder="https://www.airbnb.com/calendar/ical/..." value={icsUrl} onChange={e => { setIcsUrl(e.target.value); setSaved(false); }} />
        <button className="pw-btn-outline" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {saved && <p style={{ fontSize: '0.8rem', color: 'var(--teal)', marginTop: 6 }}>Saved.</p>}
    </div>
  );
}

function WalletSection({ bookings }) {
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const totalEarnings = confirmed.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  const pending = bookings.filter(b => b.status === 'pending');
  const pendingValue = pending.reduce((sum, b) => sum + (Number(b.total) || 0), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 640 }}>
      <div className="pw-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--sub)', marginBottom: 4 }}>Confirmed earnings</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>{formatINR(totalEarnings)}</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--sub)' }}>{confirmed.length} confirmed booking{confirmed.length === 1 ? '' : 's'}</p>
      </div>
      <div className="pw-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--sub)', marginBottom: 4 }}>Pending value</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#9C6B0B' }}>{formatINR(pendingValue)}</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--sub)' }}>{pending.length} awaiting confirmation</p>
      </div>
      <div className="pw-card" style={{ padding: '1rem', gridColumn: '1 / -1', background: 'var(--purple-bg)', border: 'none' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--purple)' }}>
          This is a summary view — since bookings here are confirmed manually (no built-in payment
          processing yet), collect payment directly from the guest and mark it here for your records.
          Connecting a payment processor (e.g. Razorpay) is a separate follow-up.
        </p>
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
        For your own reference — where guests should send payment until a payment processor is connected.
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
  const guests = {};
  bookings.forEach(b => {
    const key = b.email;
    if (!guests[key]) guests[key] = { name: b.name, email: b.email, phone: b.phone, trips: 0, spend: 0 };
    guests[key].trips += 1;
    guests[key].spend += Number(b.total) || 0;
  });
  const list = Object.values(guests).sort((a, b) => b.spend - a.spend);
  if (list.length === 0) return <p style={{ color: 'var(--sub)' }}>No guests yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map(g => (
        <div key={g.email} className="pw-card" style={{ padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: 700 }}>{g.name}</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--sub)' }}>{g.email} · {g.phone}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 700 }}>{formatINR(g.spend)}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--sub)' }}>{g.trips} trip{g.trips === 1 ? '' : 's'}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsSection({ bookings, listings }) {
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const totalNights = confirmed.reduce((s, b) => s + (Number(b.nights) || 0), 0);
  const avgNightly = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;
  const byListing = {};
  confirmed.forEach(b => {
    byListing[b.listingTitle] = (byListing[b.listingTitle] || 0) + (Number(b.total) || 0);
  });
  const topListings = Object.entries(byListing).sort((a, b) => b[1] - a[1]);

  const stats = [
    { label: 'Total revenue', value: formatINR(totalRevenue) },
    { label: 'Confirmed bookings', value: confirmed.length },
    { label: 'Nights booked', value: totalNights },
    { label: 'Avg. nightly rate', value: formatINR(avgNightly) },
    { label: 'Live listings', value: listings.length },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} className="pw-card" style={{ padding: '0.9rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--sub)', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontWeight: 800, fontSize: '1.15rem' }}>{s.value}</p>
          </div>
        ))}
      </div>
      {topListings.length > 0 && (
        <div>
          <p style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>Revenue by listing</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topListings.map(([title, rev]) => (
              <div key={title} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>{title}</span>
                <strong>{formatINR(rev)}</strong>
              </div>
            ))}
          </div>
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
  async function handleSave() {
    setBusy(true);
    try { await saveSiteSettings(draft); onSaved(draft); } finally { setBusy(false); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>
      <div className="pw-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Site / host name</label>
          <input className="pw-input" value={draft.hostName} onChange={e => setDraft({ ...draft, hostName: e.target.value })} />
        </div>
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
        <button className="pw-btn-grad" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>
      <CalendarSyncCard site={draft} onSaved={setDraft} />
      <PayoutDetailsSection site={draft} onSaved={setDraft} />
    </div>
  );
}

function VendorDashboard({ site, onSignOut }) {
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [siteState, setSiteState] = useState(site);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [b, l] = await Promise.all([loadBookings(), loadListings()]);
    setBookings(b); setListings(l); setLoaded(true);
  }
  useEffect(() => { refresh(); }, []);

  const tabs = [
    { key: 'bookings', label: 'Bookings' },
    { key: 'listings', label: 'Listings' },
    { key: 'wallet', label: 'Wallet' },
    { key: 'messages', label: 'Messages' },
    { key: 'guests', label: 'Guests' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 800 }}>{siteState.hostName} · Dashboard</p>
        <button className="pw-btn-outline" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={onSignOut}>Sign out</button>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '0.5rem 1.5rem 0', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={'pw-tab' + (tab === t.key ? ' active' : '')}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '1.5rem', maxWidth: 900 }}>
        {!loaded ? <p style={{ color: 'var(--sub)' }}>Loading…</p> : (
          <>
            {tab === 'bookings' && <BookingsSection bookings={bookings} listings={listings} onRefresh={refresh} />}
            {tab === 'listings' && <ListingsSection listings={listings} onRefresh={refresh} />}
            {tab === 'wallet' && <WalletSection bookings={bookings} />}
            {tab === 'messages' && <HostMessagesSection listings={listings} />}
            {tab === 'guests' && <GuestsSection bookings={bookings} />}
            {tab === 'reports' && <ReportsSection bookings={bookings} listings={listings} />}
            {tab === 'settings' && <SettingsSection site={siteState} onSaved={setSiteState} />}
          </>
        )}
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
