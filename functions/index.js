// JAMEEL AL HINDAM – WhatsApp menu bot (WhatsApp Cloud API webhook, Firebase project jameel-a70af).
// The customer writes anything → the main menu; every choice answers from here, order status from the shop's own data
// (ds/j_orders + ds/j_work that ShopSync already uploads). Only the customer's OWN orders (same mobile) are shown.
// Secrets (never in this file): WA_TOKEN (Meta permanent token), WA_VERIFY (webhook verify word), WA_APP_SECRET (signature check).
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();
const WA_TOKEN = defineSecret('WA_TOKEN');
const WA_VERIFY = defineSecret('WA_VERIFY');
const WA_APP_SECRET = defineSecret('WA_APP_SECRET');
const WA_PHONE_ID = defineString('WA_PHONE_ID');   // the number's "Phone number ID" from Meta (not secret)

// ------------------------------------------------------------------ shop texts (edit here)
const SHOP = 'جميل الهندام للخياطة الرجالية';
const MAP = 'https://maps.app.goo.gl/8h2nGbwMjAiqC5r96';
const STAFF = '966544943429';
const HOURS = [
  'السبت – الخميس: __ (اكتب الدوام)',
  'الجمعة: 4:00 م – 10:30 م',
];
const PRICES = {
  's_shop': '☀️ *ثوب صيفي – قماش المحل*\nمن *350* إلى *700* ريال حسب نوع القماش.',
  's_out': '☀️ *ثوب صيفي – قماش خارجي*\nخياطة الثوب بقماشك: *180* ريال.',
  'w_shop': '❄️ *ثوب شتوي – قماش المحل*\nيبدأ من *380* ريال، والسعر حسب نوع القماش.',
  'w_out': '❄️ *ثوب شتوي – قماش خارجي*\nخياطة الثوب بقماشك: *220* ريال.',
};

// ------------------------------------------------------------------ WhatsApp send
async function send(to, body) {
  const r = await fetch('https://graph.facebook.com/v21.0/' + WA_PHONE_ID.value() + '/messages', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + WA_TOKEN.value(), 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ messaging_product: 'whatsapp', recipient_type: 'individual', to }, body)),
  });
  if (!r.ok) console.error('send', r.status, await r.text());
}
const text = (to, t) => send(to, { type: 'text', text: { body: t, preview_url: true } });
const buttons = (to, t, list) => send(to, { type: 'interactive', interactive: { type: 'button', body: { text: t },
  action: { buttons: list.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } } });
const menuList = (to, t, btn, rows) => send(to, { type: 'interactive', interactive: { type: 'list', body: { text: t },
  action: { button: btn, sections: [{ title: 'القائمة', rows: rows.map(([id, title, description]) => ({ id, title, description })) }] } } });
const back = [['menu', '🏠 القائمة الرئيسية']];

// ------------------------------------------------------------------ menus
function mainMenu(to, hello) {
  return menuList(to, (hello ? 'أهلاً وسهلاً بك في *' + SHOP + '* 👋\n\n' : '') + 'اختر من القائمة 👇', 'القائمة', [
    ['order', '📦 طلبي', 'حالة طلبك وموعد الاستلام'],
    ['hours', '🕒 الدوام والموقع', 'أوقات العمل وموقع المحل'],
    ['fabric', '🧵 الأقمشة والأسعار', 'صيفي وشتوي – قماش المحل أو خارجي'],
    ['staff', '👤 التحدث مع موظف', 'للطلب الجديد أو أي استفسار'],
  ]);
}
const fabricMenu = (to) => buttons(to, '🧵 *الأقمشة والأسعار*\nاختر الموسم:', [['summer', '☀️ صيفي'], ['winter', '❄️ شتوي'], ['menu', '🏠 القائمة الرئيسية']]);
const seasonMenu = (to, s) => buttons(to, (s === 's' ? '☀️ *صيفي*' : '❄️ *شتوي*') + '\nالقماش من:', [[s + '_shop', '🏪 قماش المحل'], [s + '_out', '🧵 قماش خارجي'], ['fabric', '🔙 رجوع']]);
const priceAnswer = (to, id) => buttons(to, PRICES[id] + '\n\nللحجز أو السؤال عن الأقمشة تواصل مع الموظف.',
  [['staff', '📅 احجز / اطلب'], [id[0] === 's' ? 'summer' : 'winter', '🔙 رجوع'], ['menu', '🏠 القائمة الرئيسية']]);
const hours = (to) => buttons(to, '🕒 *الدوام*\n' + HOURS.join('\n') + '\n\n📍 *الموقع*\n' + MAP, back);
const staff = (to) => buttons(to, '👤 *التحدث مع موظف*\nاضغط على الرابط وسيرد عليك الموظف:\nhttps://wa.me/' + STAFF + '\n\nأو اتصل: +' + STAFF, back);

// ------------------------------------------------------------------ the customer's orders (the shop's data, cached 2 min)
let cache = { t: 0, o: [], w: {} };
async function ds(name) {
  const s = await db.collection('ds').doc(name).collection('c').get();
  let all = []; s.forEach((x) => { try { all = all.concat(JSON.parse(x.data().v)); } catch (e) { } });
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
function status(o, w) {
  const pcs = N(o.pcs), cut = Math.min(pcs, N(w.CUT)), sti = Math.min(pcs, N(w.STITCH));
  if (pcs > 0 && N(o.delivered_qty) >= pcs) return '✔️ تم التسليم' + (o.delivered_date ? ' (' + String(o.delivered_date).slice(0, 10) + ')' : '');
  if (N(o.ready) === 1) return '✅ *جاهز للاستلام*' + (N(o.delivered_qty) ? ' – تم تسليم ' + N(o.delivered_qty) + ' من ' + pcs : '');
  if (sti > 0) return '🪡 قيد الخياطة – تم خياطة ' + sti + ' من ' + pcs;
  if (cut > 0) return '✂️ قيد التفصيل – تم قص ' + cut + ' من ' + pcs;
  return '🕒 في الانتظار – لم يبدأ التفصيل بعد';
}
function orderText(o, w) {
  let t = '📦 *طلب رقم ' + o.order_no + '*\n' + status(o, w) + '\nعدد الثياب: ' + N(o.pcs) + '\nموعد التسليم: ' + String(o.delivery_date || '').slice(0, 10);
  // a balance only when there is a Genix invoice (no invoice = free gift / not billed yet)
  const due = String(o.invoice_no || '').trim() && !N(o.free_gift) ? N(o.total) - N(o.paid) : 0;
  if (due >= 1) t += '\nالمبلغ المتبقي: *' + due.toFixed(2) + '* ريال';
  return t;
}
async function myOrders(to, only) {
  const d = await data(), me = last9(to);
  let list = d.o.filter((o) => last9(o.mobile) === me);
  if (only) list = list.filter((o) => String(o.order_no) === String(only));
  if (!list.length) {
    return buttons(to, only ? 'لم نجد الطلب رقم ' + only + ' مسجلاً برقم جوالك هذا.\nتواصل مع الموظف للمساعدة.'
      : 'لم نجد طلبات مسجلة برقم جوالك هذا.\nإذا سجلت الطلب برقم آخر، تواصل مع الموظف.', [['staff', '👤 موظف'], ['menu', '🏠 القائمة الرئيسية']]);
  }
  // open ones first, then the latest delivered
  list.sort((a, b) => N(b.order_no) - N(a.order_no));
  const open = list.filter((o) => N(o.delivered_qty) < N(o.pcs));
  const show = (open.length ? open : list).slice(0, 5);
  await text(to, show.map((o) => orderText(o, d.w[String(o.order_no)] || {})).join('\n\n'));
  return buttons(to, 'هل تحتاج شيئاً آخر؟', [['staff', '👤 موظف'], ['menu', '🏠 القائمة الرئيسية']]);
}

// ------------------------------------------------------------------ one incoming message
async function handle(m) {
  const to = m.from;
  let id = '';
  if (m.type === 'interactive') id = (m.interactive.list_reply || m.interactive.button_reply || {}).id || '';
  else if (m.type === 'button') id = m.button && m.button.payload || '';
  const t = m.type === 'text' ? String(m.text.body || '').trim() : '';
  if (!id && /^\d{3,7}$/.test(t)) return myOrders(to, t);            // an order number typed
  switch (id) {
    case 'order': return myOrders(to);
    case 'hours': return hours(to);
    case 'fabric': return fabricMenu(to);
    case 'summer': return seasonMenu(to, 's');
    case 'winter': return seasonMenu(to, 'w');
    case 's_shop': case 's_out': case 'w_shop': case 'w_out': return priceAnswer(to, id);
    case 'staff': return staff(to);
    case 'menu': return mainMenu(to, false);
  }
  return mainMenu(to, true);
}

exports.wa = onRequest({ secrets: [WA_TOKEN, WA_VERIFY, WA_APP_SECRET], maxInstances: 3 }, async (req, res) => {
  if (req.method === 'GET') {           // Meta checks the webhook once
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WA_VERIFY.value()) return res.status(200).send(req.query['hub.challenge']);
    return res.sendStatus(403);
  }
  if (req.method !== 'POST') return res.sendStatus(405);
  // only Meta: the body is signed with the app secret
  const sig = String(req.get('x-hub-signature-256') || '');
  const want = 'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET.value()).update(req.rawBody).digest('hex');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.sendStatus(401);
  const jobs = [];
  for (const e of req.body.entry || []) for (const c of e.changes || []) {
    const v = c.value || {};
    for (const m of v.messages || []) {
      // every message once (Meta may resend)
      const ref = db.collection('wa_seen').doc(String(m.id).replace(/[^\w.=-]/g, '_').slice(0, 300));
      jobs.push(ref.create({ at: admin.firestore.FieldValue.serverTimestamp() })
        .then(() => handle(m), () => null).catch((x) => console.error('handle', x)));
    }
  }
  await Promise.all(jobs);
  res.sendStatus(200);
});
