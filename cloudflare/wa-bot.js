// JAMEEL AL HINDAM – WhatsApp menu bot (Arabic + English). A Cloudflare Worker (free plan, no card) = the WhatsApp Cloud API webhook.
// The customer writes anything → the main menu in Arabic; the 🌐 row switches to English (and back).
// The language rides in every button id ("ar|order"), so nothing has to be stored.
// Order status comes from the shop's own data that ShopSync already uploads (Firestore ds/j_orders + ds/j_work, public read).
// Only the customer's OWN orders (same mobile) are shown.
// Worker settings → Variables. Meta directly: WA_TOKEN, WA_VERIFY, WA_APP_SECRET (Secret), WA_PHONE_ID (Text).
// Through YCloud (number stays on the phone too): YC_API_KEY, YC_SECRET (Secret), YC_FROM (Text, the shop number 9665…). Nothing secret in this file.
let ENV = {};

// ------------------------------------------------------------------ shop texts (edit here)
const MAP = 'https://maps.app.goo.gl/8h2nGbwMjAiqC5r96';
const STAFF = '966544943429';
const T = {
  ar: {
    shop: 'جميل الهندام للخياطة الرجالية',
    hello: 'أهلاً وسهلاً بك في *{shop}* 👋', pick: 'اختر من القائمة 👇', menuBtn: 'القائمة', section: 'القائمة',
    rows: [['order', '📦 طلبي', 'حالة طلبك وموعد الاستلام'], ['hours', '🕒 الدوام والموقع', 'أوقات العمل وموقع المحل'],
           ['fabric', '🧵 الأقمشة والأسعار', 'صيفي وشتوي – قماش المحل أو خارجي'], ['staff', '👤 التحدث مع موظف', 'للطلب الجديد أو أي استفسار'],
           ['lang', '🌐 English', 'Switch to English']],
    home: '🏠 القائمة الرئيسية', back: '🔙 رجوع', staffBtn: '👤 موظف', book: '📅 احجز / اطلب',
    fabric: '🧵 *الأقمشة والأسعار*\nاختر الموسم:', summer: '☀️ صيفي', winter: '❄️ شتوي', summerT: '☀️ *صيفي*', winterT: '❄️ *شتوي*',
    from: 'القماش من:', shopF: '🏪 قماش المحل', outF: '🧵 قماش خارجي',
    prices: {
      s_shop: '☀️ *ثوب صيفي – قماش المحل*\nمن *350* إلى *700* ريال حسب نوع القماش.',
      s_out: '☀️ *ثوب صيفي – قماش خارجي*\nخياطة الثوب بقماشك: *180* ريال.',
      w_shop: '❄️ *ثوب شتوي – قماش المحل*\nيبدأ من *380* ريال، والسعر حسب نوع القماش.',
      w_out: '❄️ *ثوب شتوي – قماش خارجي*\nخياطة الثوب بقماشك: *220* ريال.',
    },
    priceTail: 'للحجز أو السؤال عن الأقمشة تواصل مع الموظف.',
    hours: '🕒 *الدوام*\nالسبت – الخميس: 9:00 ص – 12:00 م ، 4:00 م – 11:00 م\nالجمعة: 4:00 م – 10:30 م\n\n📍 *الموقع*\n',
    staff: '👤 *التحدث مع موظف*\nاضغط على الرابط وسيرد عليك الموظف:\n',
    call: 'أو اتصل: +',
    noOrder: 'لم نجد طلبات مسجلة برقم جوالك هذا.\nإذا سجلت الطلب برقم آخر، تواصل مع الموظف.',
    noThis: 'لم نجد الطلب رقم {n} مسجلاً برقم جوالك هذا.\nتواصل مع الموظف للمساعدة.',
    more: 'هل تحتاج شيئاً آخر؟',
    order: '📦 *طلب رقم {n}*', pcs: 'عدد الثياب: ', due: 'موعد التسليم: ', left: 'المبلغ المتبقي: *{v}* ريال',
    st: { done: '✔️ تم التسليم', ready: '✅ *جاهز للاستلام*', part: ' – تم تسليم {d} من {p}', sti: '🪡 قيد الخياطة – تم خياطة {d} من {p}',
          cut: '✂️ قيد التفصيل – تم قص {d} من {p}', wait: '🕒 في الانتظار – لم يبدأ التفصيل بعد' },
  },
  en: {
    shop: 'Jameel Al Hindam Men\'s Tailoring',
    hello: 'Welcome to *{shop}* 👋', pick: 'Choose from the menu 👇', menuBtn: 'Menu', section: 'Menu',
    rows: [['order', '📦 My order', 'Order status and pickup date'], ['hours', '🕒 Hours & location', 'Opening times and shop location'],
           ['fabric', '🧵 Fabrics & prices', 'Summer / winter – shop or own fabric'], ['staff', '👤 Talk to staff', 'New order or any question'],
           ['lang', '🌐 العربية', 'التحويل إلى العربية']],
    home: '🏠 Main menu', back: '🔙 Back', staffBtn: '👤 Staff', book: '📅 Book / order',
    fabric: '🧵 *Fabrics & prices*\nChoose the season:', summer: '☀️ Summer', winter: '❄️ Winter', summerT: '☀️ *Summer*', winterT: '❄️ *Winter*',
    from: 'Fabric from:', shopF: '🏪 Shop fabric', outF: '🧵 Own fabric',
    prices: {
      s_shop: '☀️ *Summer thobe – shop fabric*\nFrom *350* to *700* SAR, depending on the fabric.',
      s_out: '☀️ *Summer thobe – your own fabric*\nTailoring: *180* SAR.',
      w_shop: '❄️ *Winter thobe – shop fabric*\nFrom *380* SAR, depending on the fabric.',
      w_out: '❄️ *Winter thobe – your own fabric*\nTailoring: *220* SAR.',
    },
    priceTail: 'To book or ask about fabrics, talk to our staff.',
    hours: '🕒 *Opening hours*\nSaturday – Thursday: 9:00 am – 12:00 pm, 4:00 pm – 11:00 pm\nFriday: 4:00 pm – 10:30 pm\n\n📍 *Location*\n',
    staff: '👤 *Talk to staff*\nTap the link and our staff will reply:\n',
    call: 'Or call: +',
    noOrder: 'We found no orders under this mobile number.\nIf you booked with another number, please talk to our staff.',
    noThis: 'We found no order {n} under this mobile number.\nPlease talk to our staff.',
    more: 'Anything else?',
    order: '📦 *Order {n}*', pcs: 'Thobes: ', due: 'Delivery date: ', left: 'Balance due: *{v}* SAR',
    st: { done: '✔️ Delivered', ready: '✅ *Ready for pickup*', part: ' – {d} of {p} collected', sti: '🪡 Stitching – {d} of {p} stitched',
          cut: '✂️ Cutting – {d} of {p} cut', wait: '🕒 Waiting – cutting not started yet' },
  },
};
const f = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

// ------------------------------------------------------------------ WhatsApp send
async function send(to, body) {
  const yc = !!ENV.YC_API_KEY;   // YCloud (same number also stays on the phone app) or Meta Cloud API directly
  const msg = Object.assign(yc ? { from: '+' + String(ENV.YC_FROM || '').replace(/\D/g, ''), to: '+' + String(to).replace(/\D/g, '') }
                                : { messaging_product: 'whatsapp', recipient_type: 'individual', to }, body);
  const r = await fetch(yc ? 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly' : 'https://graph.facebook.com/v25.0/' + ENV.WA_PHONE_ID + '/messages', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, yc ? { 'X-API-Key': ENV.YC_API_KEY } : { 'Authorization': 'Bearer ' + ENV.WA_TOKEN }),
    body: JSON.stringify(msg),
  });
  if (!r.ok) console.error('send', r.status, await r.text());
}
const text = (to, t) => send(to, { type: 'text', text: { body: t, preview_url: true } });
// ids carry the language: "ar|order"
const buttons = (to, L, t, list) => send(to, { type: 'interactive', interactive: { type: 'button', body: { text: t },
  action: { buttons: list.map(([id, title]) => ({ type: 'reply', reply: { id: L + '|' + id, title } })) } } });
const menuList = (to, L, t, rows) => send(to, { type: 'interactive', interactive: { type: 'list', body: { text: t },
  action: { button: T[L].menuBtn, sections: [{ title: T[L].section, rows: rows.map(([id, title, description]) => ({ id: L + '|' + id, title, description })) }] } } });

// ------------------------------------------------------------------ menus
const mainMenu = (to, L, hello) => menuList(to, L, (hello ? f(T[L].hello, { shop: T[L].shop }) + '\n\n' : '') + T[L].pick, T[L].rows);
const fabricMenu = (to, L) => buttons(to, L, T[L].fabric, [['summer', T[L].summer], ['winter', T[L].winter], ['menu', T[L].home]]);
const seasonMenu = (to, L, s) => buttons(to, L, (s === 's' ? T[L].summerT : T[L].winterT) + '\n' + T[L].from,
  [[s + '_shop', T[L].shopF], [s + '_out', T[L].outF], ['fabric', T[L].back]]);
const priceAnswer = (to, L, id) => buttons(to, L, T[L].prices[id] + '\n\n' + T[L].priceTail,
  [['staff', T[L].book], [id[0] === 's' ? 'summer' : 'winter', T[L].back], ['menu', T[L].home]]);
const hours = (to, L) => buttons(to, L, T[L].hours + MAP, [['menu', T[L].home]]);
const staff = (to, L) => buttons(to, L, T[L].staff + 'https://wa.me/' + STAFF + '\n\n' + T[L].call + STAFF, [['menu', T[L].home]]);

// ------------------------------------------------------------------ the customer's orders (the shop's data, cached 2 min)
const FS = 'https://firestore.googleapis.com/v1/projects/jameel-a70af/databases/(default)/documents/ds/';
let cache = { t: 0, o: [], w: {} };
async function ds(name) {
  let all = [], tok = '';
  for (let i = 0; i < 20; i++) {
    const r = await fetch(FS + name + '/c?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    if (!r.ok) throw new Error('ds ' + name + ' ' + r.status);
    const j = await r.json();
    for (const d of j.documents || []) { try { all = all.concat(JSON.parse(d.fields.v.stringValue)); } catch (e) { } }
    if (!(tok = j.nextPageToken)) break;
  }
  return all;
}
async function data() {
  if (Date.now() - cache.t < 120000) return cache;
  const [o, w] = await Promise.all([ds('j_orders'), ds('j_work').catch(() => [])]);
  const wk = {};
  for (const r of w) { const k = String(r.order_no); (wk[k] = wk[k] || {})[String(r.kind || '').toUpperCase()] = Number(r.qty) || 0; }
  cache = { t: Date.now(), o, w: wk };
  return cache;
}
const last9 = (m) => String(m || '').replace(/\D/g, '').slice(-9);
const N = (v) => Number(v) || 0;
function status(L, o, w) {
  const S = T[L].st, pcs = N(o.pcs), cut = Math.min(pcs, N(w.CUT)), sti = Math.min(pcs, N(w.STITCH)), dq = N(o.delivered_qty);
  if (pcs > 0 && dq >= pcs) return S.done + (o.delivered_date ? ' (' + String(o.delivered_date).slice(0, 10) + ')' : '');
  if (N(o.ready) === 1) return S.ready + (dq ? f(S.part, { d: dq, p: pcs }) : '');
  if (sti > 0) return f(S.sti, { d: sti, p: pcs });
  if (cut > 0) return f(S.cut, { d: cut, p: pcs });
  return S.wait;
}
function orderText(L, o, w) {
  let t = f(T[L].order, { n: o.order_no }) + '\n' + status(L, o, w) + '\n' + T[L].pcs + N(o.pcs) + '\n' + T[L].due + String(o.delivery_date || '').slice(0, 10);
  // a balance only when there is a Genix invoice (no invoice = free gift / not billed yet)
  const due = String(o.invoice_no || '').trim() && !N(o.free_gift) ? N(o.total) - N(o.paid) : 0;
  if (due >= 1) t += '\n' + f(T[L].left, { v: due.toFixed(2) });
  return t;
}
async function myOrders(to, L, only) {
  const d = await data(), me = last9(to);
  let list = d.o.filter((o) => last9(o.mobile) === me);
  if (only) list = list.filter((o) => String(o.order_no) === String(only));
  if (!list.length) return buttons(to, L, only ? f(T[L].noThis, { n: only }) : T[L].noOrder, [['staff', T[L].staffBtn], ['menu', T[L].home]]);
  // open ones first, then the latest delivered
  list.sort((a, b) => N(b.order_no) - N(a.order_no));
  const open = list.filter((o) => N(o.delivered_qty) < N(o.pcs));
  const show = (open.length ? open : list).slice(0, 5);
  await text(to, show.map((o) => orderText(L, o, d.w[String(o.order_no)] || {})).join('\n\n'));
  return buttons(to, L, T[L].more, [['staff', T[L].staffBtn], ['menu', T[L].home]]);
}

// ------------------------------------------------------------------ one incoming message
async function handle(m) {
  const to = m.from;
  let raw = '';
  if (m.type === 'interactive') raw = (m.interactive.list_reply || m.interactive.button_reply || {}).id || '';
  else if (m.type === 'button') raw = m.button && m.button.payload || '';
  const t = m.type === 'text' ? String(m.text.body || '').trim() : '';
  let [L, id] = raw.includes('|') ? raw.split('|') : ['', raw];
  if (!T[L]) L = 'ar';                                              // typed text: always start in Arabic (🌐 switches to English)
  if (!id && /^\d{3,7}$/.test(t)) return myOrders(to, 'ar', t);       // an order number typed
  switch (id) {
    case 'order': return myOrders(to, L);
    case 'hours': return hours(to, L);
    case 'fabric': return fabricMenu(to, L);
    case 'summer': return seasonMenu(to, L, 's');
    case 'winter': return seasonMenu(to, L, 'w');
    case 's_shop': case 's_out': case 'w_shop': case 'w_out': return priceAnswer(to, L, id);
    case 'staff': return staff(to, L);
    case 'menu': return mainMenu(to, L, false);
    case 'lang': return mainMenu(to, L === 'ar' ? 'en' : 'ar', true);
  }
  return mainMenu(to, L, true);
}

// ------------------------------------------------------------------ the webhook
const seen = new Map();   // Meta may send a message twice
async function hmac(secret, body) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, body))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const cat = (a, b) => { const x = new Uint8Array(a.byteLength + b.byteLength); x.set(new Uint8Array(a)); x.set(new Uint8Array(b), a.byteLength); return x; };
function take(m) {
  if (!m || seen.has(m.id)) return null;
  seen.set(m.id, 1); if (seen.size > 500) seen.delete(seen.keys().next().value);
  return handle(m).catch((x) => console.error('handle', x));
}
export default {
  async fetch(req, env, ctx) {
    ENV = env;
    const u = new URL(req.url);
    if (req.method === 'GET') {           // Meta checks the webhook once
      if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === env.WA_VERIFY) return new Response(u.searchParams.get('hub.challenge'));
      return new Response('JAMEEL bot', { status: 403 });
    }
    if (req.method !== 'POST') return new Response('', { status: 405 });
    const raw = await req.arrayBuffer();
    const jobs = [];
    const ycs = req.headers.get('ycloud-signature');
    if (ycs) {
      // YCloud: "t=TIMESTAMP,s=SIGNATURE", signed over "TIMESTAMP." + body with the endpoint's secret
      const p = Object.fromEntries(ycs.split(',').map((x) => x.trim().split('=')));
      if (!ENV.YC_SECRET || !p.t || p.s !== await hmac(ENV.YC_SECRET, cat(new TextEncoder().encode(p.t + '.').buffer, raw))) return new Response('', { status: 401 });
      const ev = JSON.parse(new TextDecoder().decode(raw));
      if (ev.type === 'whatsapp.inbound_message.received') jobs.push(take(ev.whatsappInboundMessage));
    } else {
      // Meta: the body is signed with the app secret
      if (!env.WA_APP_SECRET || (req.headers.get('x-hub-signature-256') || '') !== 'sha256=' + await hmac(env.WA_APP_SECRET, raw)) return new Response('', { status: 401 });
      const body = JSON.parse(new TextDecoder().decode(raw));
      for (const e of body.entry || []) for (const c of e.changes || []) for (const m of (c.value || {}).messages || []) jobs.push(take(m));
    }
    ctx.waitUntil(Promise.all(jobs));
    return new Response('ok');
  },
};
