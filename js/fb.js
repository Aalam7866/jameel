// Firebase for saudithobe.best (JAMEEL AL HINDAM's own project)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { FIREBASE_CONFIG } from './config.js';

export const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
export const auth = getAuth(app);
// local tests only (never on the real site)
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Riyadh time (UTC+3, no summer time); the shop's work day runs 05:00 → 05:00
export function riyadh(d = new Date()) { return new Date(d.getTime() + 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 19); }
export function workDay(d = new Date()) { return new Date(d.getTime() + 3 * 3600e3 - 5 * 3600e3).toISOString().slice(0, 10); }
