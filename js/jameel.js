// The "server" of JAMEEL's online pages, now on Firebase (was Code.gs on Google Apps Script).
// Same functions, same answers – Page.html / Order.html / Admin.html work unchanged.
// The shop PC (ShopSync) puts the data here and collects what the pages write.
import { db, sha256, riyadh, workDay } from './fb.js';
import {
  doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, limit, writeBatch, addDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const tsStr = (ts) => ts && ts.toDate ? riyadh(ts.toDate()) : riyadh();
const orderKey = (s) => { const d = String(s || '').replace(/\D/g, ''); return d ? String(parseInt(d, 10)) : ''; };
const digits = (s) => String(s || '').replace(/\D/g, '');

// ================================================================ worker page (?t=TOKEN)
const cacheW = {};
async function worker(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  if (cacheW[token]) return cacheW[token];
  const s = await getDoc(doc(db, 'wk', token));
  if (!s.exists()) return null;
  return (cacheW[token] = { token, ...s.data() });
}
export async function pageVars(token) {
  const w = await worker(token);
  return { ok: !!w, token: w ? token : '', name: w ? w.name : '', kind: w ? w.kind : '', needPin: !!(w && w.pin),
           photo: w && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(w.photo || '') ? w.photo : '' };
}

// open orders + every worker's transfers the shop has not collected yet (the shop PC keeps them up to date)
async function space(w) {
  const s = await getDoc(doc(db, 'sp', w.s));
  const d = s.exists() ? s.data() : {};
  const orders = {};
  for (const r of J(d.rows, [])) {
    const n = (i) => Number(r[i]) || 0;
    orders[String(r[0])] = {
      CUT: n(1), STITCH: n(2), HINGE: n(4), MEASURE: n(6), ARRIVE: n(8), EMBROIDERY: n(13),
      total: { CUT: n(3), STITCH: n(3), HINGE: n(5), MEASURE: n(7), ARRIVE: n(9), EMBROIDERY: n(14) },
      fit: n(10) === 1, fitCut: n(11) === 1, fitDone: n(12) === 1,
    };
  }
  // pending: from the PC's list + my own new transfers (the PC may not have seen them yet)
  const pend = {};
  for (const p of J(d.pend, [])) pend[p.id] = p;
  const mine = await getDocs(query(collection(db, 'wk', w.token, 'e'), where('st', '==', 'new')));
  mine.forEach(x => { const e = x.data(); pend[x.id] = { id: x.id, kind: e.kind, o: e.o, q: e.q, fit: e.fit }; });
  return { orders, pend: Object.values(pend) };
}
function pending(sp, kind) {
  const p = {};
  for (const e of sp.pend) if (e.kind === kind) p[String(e.o)] = (p[String(e.o)] || 0) + Number(e.q);
  return p;
}
function pendingFit(sp, kind) {
  const p = {};
  for (const e of sp.pend) if (e.kind === kind && Number(e.fit) === 1) p[String(e.o)] = true;
  return p;
}
function fitChoice(kind, o, od, fitCutPending, myFitPending) {
  if (!od.fit || myFitPending[o]) return '';
  if (kind === 'CUT') return od.fitCut ? '' : 'cut';
  if (kind === 'STITCH') return od.fitDone ? '' : (od.fitCut || fitCutPending[o]) ? 'done' : 'waitcut';
  return '';
}
function cutAvail(o, od, cutPending, stitchPending) {
  const cut = od.total.CUT - od.CUT + (cutPending[o] || 0);
  const stitched = od.total.STITCH - od.STITCH + (stitchPending[o] || 0);
  return Math.max(0, cut - stitched);
}

async function orderInfo(token, order) {
  const w = await worker(token), o = orderKey(order);
  if (!w || !o) return null;
  const sp = await space(w);
  const od = sp.orders[o];
  if (!od || !(od.total[w.kind] > 0)) return { order: o, found: false };
  const mine = pending(sp, w.kind);
  const left = Math.max(0, od[w.kind] - (mine[o] || 0));
  return {
    order: o, found: true, total: od.total[w.kind], left,
    cutAvail: w.kind === 'STITCH' ? cutAvail(o, od, pending(sp, 'CUT'), mine) : left,
    fit: fitChoice(w.kind, o, od, pendingFit(sp, 'CUT'), pendingFit(sp, w.kind)),
  };
}

async function today(w) {
  const r = await getDocs(query(collection(db, 'wk', w.token, 'e'), where('d', '==', workDay())));
  const out = [];
  r.forEach(x => { const e = x.data(); if (e.st !== 'deleted') out.push({ ts: e.ts ? e.ts.toMillis() : Date.now(), time: tsStr(e.ts).slice(11, 16), order: e.o, qty: e.q, fit: e.fit === 1 }); });
  out.sort((a, b) => b.ts - a.ts);
  return out.map(({ ts, ...x }) => x);
}
async function myToday(token) { const w = await worker(token); return w ? today(w) : []; }

async function waiting(token) {
  const w = await worker(token);
  if (!w) return [];
  const sp = await space(w), p = pending(sp, w.kind), out = [];
  for (const o of Object.keys(sp.orders)) {
    const od = sp.orders[o], left = (od[w.kind] || 0) - (p[o] || 0);
    if (od.total[w.kind] > 0 && left > 0) out.push({ order: Number(o), left, total: od.total[w.kind] });
  }
  out.sort((a, b) => a.order - b.order);
  return out.slice(0, 500);
}

async function myStats(token) {
  const w = await worker(token);
  if (!w) return null;
  return J(w.stats, null) || { months: [], work: [], alts: [] };
}

async function submit(token, rows, pin) {
  const w = await worker(String(token || '').trim());
  if (!w) return { ok: false, msg: 'الرابط غير صالح – Link not valid' };
  const sp = await space(w);
  const orders = sp.orders, pend = pending(sp, w.kind), cutPend = pending(sp, 'CUT');
  const fitCutPend = pendingFit(sp, 'CUT'), myFitPend = pendingFit(sp, w.kind);
  const clean = [], errors = [], want = {}, fits = {};
  (rows || []).forEach(r => {
    const o = orderKey(r.order);
    if (!o) return;
    let fit = r.fit === true || r.fit === 1 || r.fit === 'true';
    const q = Math.floor(Number(r.qty)) || 0;
    if (q < 0 || q > 999 || (q === 0 && !fit)) { errors.push('طلب ' + o + ': العدد؟ / qty?'); return; }
    if (fit && fits[o]) fit = false;
    if (fit) fits[o] = true;
    const pcs = q + (fit ? 1 : 0);
    if (pcs === 0) return;
    want[o] = (want[o] || 0) + pcs;
    clean.push({ o, q: pcs, fit });
  });
  if (!clean.length && !errors.length) return { ok: false, msg: 'اكتب رقم طلب واحد على الأقل – Enter at least one order number' };
  for (const o of Object.keys(want)) {
    const od = orders[o];
    if (!od || !(od.total[w.kind] > 0)) { errors.push('طلب ' + o + ': غير موجود أو مكتمل – not found / finished'); continue; }
    const left = od[w.kind] - (pend[o] || 0);
    if (want[o] > left) errors.push('طلب ' + o + ': المتبقي ' + Math.max(0, left) + ' فقط – only ' + Math.max(0, left) + ' pcs left');
    else if (w.kind === 'STITCH') {
      const avail = cutAvail(o, od, cutPend, pend);
      if (want[o] > avail) errors.push('طلب ' + o + ': المقصوص ' + avail + ' فقط – only ' + avail + ' pcs cut');
    }
    if (fits[o]) {
      const c = fitChoice(w.kind, o, od, fitCutPend, myFitPend);
      if (c === 'waitcut') errors.push('طلب ' + o + ': البروفة لم تُقص بعد – fitting piece not cut yet');
      else if (c !== 'cut' && c !== 'done') errors.push('طلب ' + o + ': لا توجد بروفة أو تمت – no fitting piece / already done');
    }
  }
  if (errors.length) return { ok: false, msg: 'لم يتم التحويل – Nothing saved:\n' + errors.join('\n') };
  const ph = w.pin ? await sha256('tspin:' + w.emp + ':' + String(pin || '').trim()) : null;
  const b = writeBatch(db), d = workDay();
  for (const c of clean) {
    const e = { emp: w.emp, name: w.name, kind: w.kind, o: Number(c.o), q: c.q, fit: c.fit ? 1 : 0, st: 'new', ts: serverTimestamp(), d };
    if (ph) e.ph = ph;
    b.set(doc(collection(db, 'wk', w.token, 'e')), e);
  }
  try { await b.commit(); }
  catch (x) {
    if (w.pin && String(x.code || x.message).includes('permission')) return { ok: false, msg: 'الرقم السري غير صحيح – Wrong PIN', pin: true };
    throw x;
  }
  return { ok: true, msg: 'تم التحويل ✔ Saved', today: await today(w) };
}

// ================================================================ online new-order page (?o=KEY)
async function pinHash(pin) { pin = String(pin || '').trim(); return pin ? sha256('tsorder:' + pin) : ''; }
async function gateVars(coll, key) {
  key = String(key || '').trim();
  if (!/^[0-9a-f]{32}$/.test(key)) return { ok: false, key: '', needPin: false, shop: '' };
  const s = await getDoc(doc(db, coll, key));
  if (!s.exists()) return { ok: false, key: '', needPin: false, shop: '' };
  return { ok: true, key, needPin: !!s.data().pin, shop: s.data().shop || '' };
}
export const orderVars = (key) => gateVars('okk', key);
export const adminVars = (key) => gateVars('akk', key);

const roots = {};
async function root(kind, key, pin) {   // ok/{R} or ak/{R}: found only with the right key + PIN
  key = String(key || '').trim();
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const gate = await getDoc(doc(db, kind === 'ok' ? 'okk' : 'akk', key));
  if (!gate.exists()) return null;
  const ph = gate.data().pin ? await pinHash(pin) : '';
  const id = await sha256(kind + ':' + key + ':' + ph);
  if (roots[id]) return roots[id];
  const s = await getDoc(doc(db, kind, id));
  if (!s.exists()) return null;
  return (roots[id] = { id, ...s.data() });
}

async function oInit(key, pin) {
  const r = await root('ok', key, pin);
  if (!r) return { ok: false };
  const [items, emb] = await Promise.all([getDoc(doc(db, 'ok', r.id, 'd', 'items')), getDoc(doc(db, 'ok', r.id, 'd', 'emb'))]);
  const TH = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  return {
    ok: true,
    emb: J(emb.exists() && emb.data().v, []).map(x => [Number(x[0]), String(x[1]), Number(x[2]) || 0, TH.test(String(x[3] || '')) ? String(x[3]) : '']),
    meta: J(r.meta, null), spec: J(r.spec, null),
    items: J(items.exists() && items.data().v, []).map(x => [Number(x[0]), String(x[1]), String(x[2]), String(x[3]), Number(x[4]) || 0, Number(x[5]) || 0]),
  };
}
async function oImage(key, pin) {
  const r = await root('ok', key, pin);
  if (!r) return '';
  const n = Number(r.imgParts) || 0, parts = [];
  for (let i = 0; i < n; i++) parts.push(getDoc(doc(db, 'ok', r.id, 'd', 'img_' + i)));
  const s = (await Promise.all(parts)).map(x => x.exists() ? x.data().v : '').join('');
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
}
async function oPics(key, pin) {
  const r = await root('ok', key, pin);
  if (!r) return {};
  const n = Number(r.picParts) || 0, out = {};
  for (let i = 0; i < n; i++) {
    const s = await getDoc(doc(db, 'ok', r.id, 'd', 'pics_' + i));
    for (const [f, img] of J(s.exists() && s.data().v, [])) if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(String(img))) out[String(f)] = String(img);
  }
  return out;
}
const custCache = {};
async function customers(r) {
  if (custCache[r.id]) return custCache[r.id];
  const s = await getDocs(collection(db, 'ok', r.id, 'c'));
  const parts = [];
  s.forEach(x => parts.push([Number(x.id), J(x.data().v, [])]));
  parts.sort((a, b) => a[0] - b[0]);
  return (custCache[r.id] = parts.flatMap(p => p[1]));
}
async function oSearch(key, pin, q) {
  const r = await root('ok', key, pin);
  if (!r) return null;
  q = String(q || '').trim();
  const d = digits(q), out = [];
  if (d.length < 3 && q.length < 2) return [];
  const v = await customers(r);
  const byNo = /^#\s*\d+$/.test(q);
  const byMobile = !byNo && d.length >= 3 && /^[\d\s\-+]+$/.test(q);
  const tail = d.replace(/^0+/, '').replace(/^966/, '');
  const lower = q.toLowerCase();
  for (let i = v.length - 1; i >= 0 && out.length < 25; i--) {
    const no = String(v[i][0]), name = String(v[i][1]), mob = String(v[i][2]);
    let hit;
    if (byNo) hit = no === d;
    else if (byMobile) hit = (tail.length >= 3 && digits(mob).indexOf(tail) >= 0) || no === d;
    else hit = name.toLowerCase().indexOf(lower) >= 0;
    if (hit) out.push({ no: Number(no), name, mobile: mob, address: String(v[i][3] || ''), meas: String(v[i][4] || '').length > 2 });
  }
  return out;
}
async function oCustomer(key, pin, no) {
  const r = await root('ok', key, pin);
  if (!r) return null;
  for (const c of await customers(r))
    if (String(c[0]) === String(no))
      return { no: Number(c[0]), name: String(c[1]), mobile: String(c[2]), address: String(c[3] || ''),
               meas: String(c[4] || '').length > 2 ? J(String(c[4]), null) : null };
  return null;
}
async function mineList(r) {
  const s = await getDocs(query(collection(db, 'ok', r.id, 'o'), orderBy('ts', 'desc'), limit(120)));
  const day = riyadh().slice(0, 10), out = [];
  s.forEach(x => {
    const o = x.data(), t = tsStr(o.ts);
    if (out.length >= 40 || (t.slice(0, 10) !== day && o.st !== 'new')) return;
    out.push({ id: x.id, time: t.slice(11, 16), status: o.st, order_no: String(o.order_no || ''), invoice_no: String(o.invoice_no || ''),
               note: String(o.note || ''), by: String(o.by || ''), name: String(o.name || ''), pcs: String(o.pcs), total: String(o.total) });
  });
  return out;
}
async function oMine(key, pin) { const r = await root('ok', key, pin); return r ? mineList(r) : null; }
async function oSubmit(key, pin, order) {
  const r = await root('ok', key, pin);
  if (!r) return { ok: false, msg: 'الرقم السري غير صحيح – Wrong PIN', pin: true };
  const o = order || {}, c = o.customer || {};
  if (!(Number(c.no) > 0) && !String(c.name || '').trim()) return { ok: false, msg: 'اختر العميل أو اكتب اسمه – choose or add the customer' };
  const lines = (o.lines || []).filter(l => Number(l.qty) > 0);
  if (!lines.length) return { ok: false, msg: 'أضف قماش – add at least one fabric' };
  const json = JSON.stringify(o);
  if (json.length > 45000) return { ok: false, msg: 'الطلب كبير جداً – order too big' };
  const pcs = lines.reduce((a, l) => a + Number(l.qty), 0);
  await addDoc(collection(db, 'ok', r.id, 'o'), {
    ts: serverTimestamp(), st: 'new', data: json, by: String(o.by || '').slice(0, 40), name: String(c.name || '').slice(0, 60),
    pcs: Math.round(pcs * 100) / 100, total: Number(o.total) || 0,
  });
  return { ok: true, list: await mineList(r) };
}
async function oDelete(key, pin, id, by) {
  const r = await root('ok', key, pin);
  if (!r) return { ok: false, msg: 'الرقم السري غير صحيح – Wrong PIN', pin: true };
  const ref = doc(db, 'ok', r.id, 'o', String(id));
  const s = await getDoc(ref);
  if (!s.exists()) return { ok: false, msg: 'الطلب غير موجود – not found' };
  const st = s.data().st;
  if (st === 'new' || st === 'error') await updateDoc(ref, { st: 'deleted' });
  else if (st === 'saved') await updateDoc(ref, { st: 'delreq', note: 'del:' + String(by || '').slice(0, 40) });
  return { ok: true, list: await mineList(r) };
}

// ================================================================ admin alerts page (?a=KEY)
async function actList(r) {
  const s = await getDocs(query(collection(db, 'ak', r.id, 'act'), orderBy('ts', 'desc'), limit(300)));
  const day = riyadh().slice(0, 10), out = [];
  s.forEach(x => {
    const a = x.data(), t = tsStr(a.ts);
    if (out.length >= 150 || (t.slice(0, 10) !== day && a.st !== 'new')) return;
    out.push({ id: x.id, time: t.slice(11, 16), status: a.st, receipt_no: String(a.receipt_no || ''), note: String(a.note || ''),
               by: String(a.by || ''), order_no: String(a.order_no), kind: a.kind, amount: Number(a.amount) || 0, qty: Number(a.qty) || 0 });
  });
  return out;
}
async function aFeed(key, pin) {
  const r = await root('ak', key, pin);
  if (!r) return null;
  // fresh copy of the alerts root (the PC rewrites "feed" every few seconds)
  const s = await getDoc(doc(db, 'ak', r.id));
  const feed = J(s.exists() && s.data().feed, { work: [], orders: [] });
  // the online orders straight from the order page (do not wait for the PC)
  let orders = feed.orders || [];
  if (r.r) {
    try { orders = await mineListAll(r.r); } catch (e) { }
  }
  return { now: riyadh().slice(11, 16), work: feed.work || [], orders, acts: await actList(r) };
}
async function mineListAll(okRoot) {
  const s = await getDocs(query(collection(db, 'ok', okRoot, 'o'), orderBy('ts', 'desc'), limit(300)));
  const day = riyadh().slice(0, 10), out = [];
  s.forEach(x => {
    const o = x.data(), t = tsStr(o.ts);
    if (out.length >= 200 || (t.slice(0, 10) !== day && o.st !== 'new')) return;
    out.push({ id: x.id, time: t.slice(11, 16), status: o.st, order_no: String(o.order_no || ''), invoice_no: String(o.invoice_no || ''),
               note: String(o.note || ''), by: String(o.by || ''), name: String(o.name || ''), pcs: String(o.pcs), total: String(o.total) });
  });
  return out;
}
async function aOrders(key, pin) {
  const r = await root('ak', key, pin);
  if (!r) return null;
  const s = await getDocs(collection(db, 'ak', r.id, 'ao'));
  const parts = [];
  s.forEach(x => parts.push([Number(x.id), J(x.data().v, [])]));
  parts.sort((a, b) => a[0] - b[0]);
  const rows = parts.flatMap(p => p[1]).map(x => x.map(v => String(v ?? '')));
  // a balance under 1 SAR (rounding) is not shown as due
  for (const x of rows) if (x.length > 14 && Math.abs(Number(x[14]) || 0) < 1) x[14] = '0';
  const pend = {};
  if (r.s) {
    const sp = await getDoc(doc(db, 'sp', r.s));
    for (const e of J(sp.exists() && sp.data().pend, [])) {
      const o = String(e.o);
      pend[o] = pend[o] || {};
      pend[o][e.kind] = (pend[o][e.kind] || 0) + (Number(e.q) || 0);
    }
  }
  return { rows, pending: pend, conf: J(r.aconf, null) };
}
async function aSearch(key, pin, q) {
  const all = await aOrders(key, pin);
  if (!all) return null;
  q = String(q || '').trim();
  if (!q) return [];
  const d = digits(q), lower = q.toLowerCase(), tail = d.replace(/^0+/, '').replace(/^966/, ''), only = /^[\d\s\-+]+$/.test(q), out = [];
  for (const v of all.rows) {
    if (out.length >= 30) break;
    const no = v[0], name = v[1], mob = v[2];
    const hit = only && no === d ? true : only ? tail.length >= 4 && digits(mob).indexOf(tail) >= 0 : name.toLowerCase().indexOf(lower) >= 0;
    if (!hit) continue;
    const N = (i) => Number(v[i]) || 0;
    out.push({ no, name, mobile: mob, booked: v[3], delivery: v[4], pcs: N(5), cut: N(6), stitched: N(7), hq: N(8), hd: N(9), eq: N(10), ed: N(11),
               delivered: N(12), ready: N(13) === 1, due: N(14), status: v[15], pending: all.pending[no] || {} });
  }
  out.sort((a, b) => (b.no === d) - (a.no === d));
  return out;
}
async function aAct(key, pin, act) {
  const r = await root('ak', key, pin);
  if (!r) return { ok: false, msg: 'الرقم السري غير صحيح – Wrong PIN', pin: true };
  const a = act || {};
  const order = Number(orderKey(a.order)), kind = a.kind === 'DELIVER' ? 'DELIVER' : a.kind === 'PAY' ? 'PAY' : '';
  const amount = Math.round((Number(a.amount) || 0) * 100) / 100, qty = Math.floor(Number(a.qty) || 0);
  if (!order || !kind) return { ok: false, msg: 'طلب غير صحيح – bad request' };
  if (amount < 0 || amount > 1000000 || qty < 0 || qty > 999) return { ok: false, msg: 'المبلغ أو العدد غير صحيح – check the amount / pieces' };
  if (kind === 'PAY' && !(amount > 0)) return { ok: false, msg: 'اكتب المبلغ – enter the amount' };
  if (kind === 'DELIVER' && !(qty > 0)) return { ok: false, msg: 'اكتب عدد القطع – enter the pieces' };
  const clean = { order, kind, amount, method: String(a.method || '').slice(0, 40), ref: String(a.ref || '').slice(0, 80),
                  qty: kind === 'DELIVER' ? qty : 0, by: String(a.by || '').slice(0, 40), force: a.force === true };
  await addDoc(collection(db, 'ak', r.id, 'act'), {
    ts: serverTimestamp(), st: 'new', data: JSON.stringify(clean), by: clean.by, order_no: order, kind, amount, qty: clean.qty,
  });
  return { ok: true, acts: await actList(r) };
}

// ================================================================ admin: work rates (?a=KEY)
const RATE_KINDS = ['CUT', 'STITCH', 'HINGE', 'MEASURE', 'EMBROIDERY'];
async function aRates(key, pin) {
  const r = await root('ak', key, pin);
  if (!r) return null;
  const s = await getDoc(doc(db, 'sys', 'rates'));
  const d = s.exists() ? s.data() : {};
  const rates = {};
  for (const k of RATE_KINDS) rates[k] = Number(d[k]) || 0;
  return { rates, updated: d.at && d.at.toDate ? riyadh(d.at.toDate()) : '' };
}
async function aSetRates(key, pin, rates) {
  const r = await root('ak', key, pin);
  if (!r) return { ok: false, msg: 'الرقم السري غير صحيح – Wrong PIN', pin: true };
  if (!rates || typeof rates !== 'object') return { ok: false, msg: 'بيانات غير صحيحة – invalid data' };
  const clean = { at: serverTimestamp() };
  for (const k of RATE_KINDS) {
    const v = Math.round((Number(rates[k]) || 0) * 100) / 100;
    if (v < 0 || v > 99999) return { ok: false, msg: k + ': المبلغ غير صحيح – invalid amount' };
    clean[k] = v;
  }
  await setDoc(doc(db, 'sys', 'rates'), clean, { merge: true });
  return { ok: true, msg: 'تم الحفظ ✔ Rates saved' };
}

export const SERVER = {
  orderInfo, myToday, waiting, myStats, submit,
  oInit, oImage, oPics, oSearch, oCustomer, oMine, oSubmit, oDelete,
  aFeed, aOrders, aSearch, aAct, aRates, aSetRates,
};
