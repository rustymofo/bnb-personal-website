import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

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

const STYLES = `
.pw-root {
  --ink: #0F0F0F;
  --gold: #B8860B;
  --gray: #6B6B6B;
  --border: #E4E4E4;
  --bg: #FFFFFF;
  background: var(--bg);
  color: var(--ink);
  font-family: 'DM Sans', system-ui, sans-serif;
  min-height: 100vh;
}
.pw-btn {
  background: var(--ink); color: #fff; border: none; border-radius: 10px;
  padding: 0.75rem 1.25rem; font-weight: 600; cursor: pointer;
}
.pw-btn:hover { opacity: 0.9; }
.pw-btn-outline {
  background: transparent; color: var(--ink); border: 1px solid var(--border);
  border-radius: 10px; padding: 0.75rem 1.25rem; font-weight: 600; cursor: pointer;
}
.pw-input {
  border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.75rem;
  font-size: 0.95rem; width: 100%; font-family: inherit;
}
.pw-card { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; background: #fff; }
`;

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

// ============================= UI ============================= //

function LoadingScreen() {
  return (
    <div className="pw-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{STYLES}</style>
      <p style={{ color: '#6B6B6B' }}>Loading…</p>
    </div>
  );
}

function Nav({ site, onDashboardClick }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <a href="/" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ink)', textDecoration: 'none' }}>{site.hostName}</a>
      <button className="pw-btn-outline" onClick={onDashboardClick} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Host sign in</button>
    </div>
  );
}

function ListingCard({ listing, onClick }) {
  const cover = listing.images && listing.images[0];
  return (
    <div className="pw-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ aspectRatio: '4/3', background: '#F2F2F2', backgroundImage: cover ? `url(${cover.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ padding: '0.85rem 1rem' }}>
        <p style={{ fontWeight: 700, marginBottom: 2 }}>{listing.title}</p>
        <p style={{ color: 'var(--gray)', fontSize: '0.85rem', marginBottom: 6 }}>{listing.city}</p>
        <p style={{ fontWeight: 600 }}>{formatINR(listing.price)} <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: '0.85rem' }}>/ night</span></p>
      </div>
    </div>
  );
}

function HomeView({ site, listings, onOpenListing, onDashboardClick }) {
  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <Nav site={site} onDashboardClick={onDashboardClick} />
      <div style={{ padding: '3rem 1.5rem', maxWidth: 640 }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '0.75rem' }}>{site.bannerTitle}</h1>
        <p style={{ color: 'var(--gray)', fontSize: '1.05rem' }}>{site.bannerSubtitle}</p>
      </div>
      <div style={{ padding: '0 1.5rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
        {listings.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--gray)' }}>
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

function DetailView({ listing, site, onBack }) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [error, setError] = useState('');

  const nights = calculateNights(checkIn, checkOut);
  const total = calculateTotalPrice(listing, checkIn, checkOut);
  const blocked = listing.blockedDates || [];

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
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="pw-btn-outline" onClick={onBack} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>← Back</button>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,1fr)', gap: '2rem' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: listing.images && listing.images.length > 1 ? '2fr 1fr' : '1fr', gap: 8, marginBottom: '1.5rem' }}>
            {(listing.images && listing.images.length > 0 ? listing.images : [{ url: '' }]).slice(0, 3).map((img, i) => (
              <div key={i} style={{ aspectRatio: '4/3', background: '#F2F2F2', backgroundImage: img.url ? `url(${img.url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 10 }} />
            ))}
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>{listing.title}</h1>
          <p style={{ color: 'var(--gray)', marginBottom: '1rem' }}>{listing.city} · {listing.guests} guests · {listing.beds} beds</p>
          <p style={{ lineHeight: 1.6, marginBottom: '1.5rem' }}>{listing.description}</p>
          {listing.amenities && listing.amenities.length > 0 && (
            <div>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>What this place offers</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {listing.amenities.map((a, i) => (
                  <span key={i} style={{ fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 999, padding: '0.3rem 0.7rem' }}>{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pw-card" style={{ padding: '1.25rem', alignSelf: 'start', position: 'sticky', top: 20 }}>
          <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>{formatINR(listing.price)} <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: '0.85rem' }}>/ night</span></p>
          {status === 'done' ? (
            <div style={{ padding: '1rem', background: '#F3FBF5', border: '1px solid #CFEBD8', borderRadius: 10 }}>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>Request sent</p>
              <p style={{ fontSize: '0.9rem', color: 'var(--gray)' }}>{site.hostName} will reach out to confirm your dates.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Check-in</label>
                  <input className="pw-input" type="date" min={todayStr()} value={checkIn} onChange={e => setCheckIn(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Check-out</label>
                  <input className="pw-input" type="date" min={checkIn || todayStr()} value={checkOut} onChange={e => setCheckOut(e.target.value)} required />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Guests</label>
                <input className="pw-input" type="number" min={1} max={listing.guests || 10} value={guests} onChange={e => setGuests(e.target.value)} />
              </div>
              <input className="pw-input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
              <input className="pw-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <input className="pw-input" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
              {nights > 0 && (
                <div style={{ fontSize: '0.9rem', color: 'var(--gray)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {nights} night{nights > 1 ? 's' : ''} · <strong style={{ color: 'var(--ink)' }}>{formatINR(total)}</strong> total
                </div>
              )}
              {error && <p style={{ color: '#C0392B', fontSize: '0.85rem' }}>{error}</p>}
              <button className="pw-btn" type="submit" disabled={status === 'submitting'}>
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
        <button className="pw-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="pw-btn-outline" onClick={onBack}>Back to site</button>
      </form>
    </div>
  );
}

function BookingsSection({ bookings, listings, onRefresh }) {
  async function act(b, status) {
    const listing = listings.find(l => l.id === b.listingId);
    await updateBookingStatus(b.id, status, listing);
    onRefresh();
  }
  if (bookings.length === 0) return <p style={{ color: 'var(--gray)' }}>No booking requests yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bookings.map(b => (
        <div key={b.id} className="pw-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <p style={{ fontWeight: 700 }}>{b.listingTitle}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>{formatDateDisplay(b.checkIn)} → {formatDateDisplay(b.checkOut)} · {b.guests} guests · {formatINR(b.total)}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>{b.name} · {b.email} · {b.phone}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: b.status === 'confirmed' ? '#2F6B4F' : b.status === 'cancelled' ? '#C0392B' : '#9C6B0B' }}>{b.status}</span>
            {b.status === 'pending' && (
              <>
                <button className="pw-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => act(b, 'confirmed')}>Confirm</button>
                <button className="pw-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => act(b, 'cancelled')}>Decline</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListingEditCard({ listing, onSaved, onCancel }) {
  const [draft, setDraft] = useState(listing || { title: '', city: '', price: '', weekendPrice: '', beds: 1, guests: 2, description: '', amenities: [], images: [], blockedDates: [] });
  const [amenityInput, setAmenityInput] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  function set(field, value) { setDraft(d => ({ ...d, [field]: value })); }

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

  function addAmenity() {
    if (!amenityInput.trim()) return;
    set('amenities', [...(draft.amenities || []), amenityInput.trim()]);
    setAmenityInput('');
  }

  async function handleSave() {
    setBusy(true);
    try {
      const fields = {
        title: draft.title, city: draft.city, price: Number(draft.price) || 0,
        weekendPrice: Number(draft.weekendPrice) || 0, beds: Number(draft.beds) || 1,
        guests: Number(draft.guests) || 1, description: draft.description || '',
        amenities: draft.amenities || [], images: draft.images || [],
        blockedDates: draft.blockedDates || [],
      };
      const id = await saveListing(draft.id, fields);
      onSaved(id);
    } finally { setBusy(false); }
  }

  return (
    <div className="pw-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: 4 }}>Amenities</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="pw-input" placeholder="e.g. Wifi" value={amenityInput} onChange={e => setAmenityInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAmenity())} />
          <button type="button" className="pw-btn-outline" onClick={addAmenity}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(draft.amenities || []).map((a, i) => (
            <span key={i} style={{ fontSize: '0.78rem', border: '1px solid var(--border)', borderRadius: 999, padding: '0.25rem 0.6rem' }}>
              {a} <button type="button" onClick={() => set('amenities', draft.amenities.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray)' }}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: 4 }}>Photos</p>
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

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pw-btn" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save listing'}</button>
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
      <button className="pw-btn" style={{ marginBottom: 14 }} onClick={() => setEditing('new')}>+ Add listing</button>
      {listings.length === 0 ? (
        <p style={{ color: 'var(--gray)' }}>No listings yet — add your first one.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listings.map(l => (
            <div key={l.id} className="pw-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700 }}>{l.title || 'Untitled'}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>{l.city} · {formatINR(l.price)}/night</p>
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

function SettingsSection({ site, onSaved }) {
  const [draft, setDraft] = useState(site);
  const [busy, setBusy] = useState(false);
  async function handleSave() {
    setBusy(true);
    try { await saveSiteSettings(draft); onSaved(draft); } finally { setBusy(false); }
  }
  return (
    <div className="pw-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Site / host name</label>
        <input className="pw-input" value={draft.hostName} onChange={e => setDraft({ ...draft, hostName: e.target.value })} />
      </div>
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Banner title</label>
        <input className="pw-input" value={draft.bannerTitle} onChange={e => setDraft({ ...draft, bannerTitle: e.target.value })} />
      </div>
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Banner subtitle</label>
        <input className="pw-input" value={draft.bannerSubtitle} onChange={e => setDraft({ ...draft, bannerSubtitle: e.target.value })} />
      </div>
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>WhatsApp number (with country code)</label>
        <input className="pw-input" value={draft.whatsappNumber} onChange={e => setDraft({ ...draft, whatsappNumber: e.target.value })} placeholder="+919999999999" />
      </div>
      <button className="pw-btn" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
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
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="pw-root">
      <style>{STYLES}</style>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700 }}>{siteState.hostName} · Dashboard</p>
        <button className="pw-btn-outline" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={onSignOut}>Sign out</button>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '1rem 1.5rem 0' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', padding: '0.6rem 1rem', fontWeight: 600,
              borderBottom: tab === t.key ? '2px solid var(--ink)' : '2px solid transparent', color: tab === t.key ? 'var(--ink)' : 'var(--gray)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '1.5rem', maxWidth: 900 }}>
        {!loaded ? <p style={{ color: 'var(--gray)' }}>Loading…</p> : (
          <>
            {tab === 'bookings' && <BookingsSection bookings={bookings} listings={listings} onRefresh={refresh} />}
            {tab === 'listings' && <ListingsSection listings={listings} onRefresh={refresh} />}
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
