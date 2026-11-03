const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const START_TAB = new URLSearchParams(location.search).get("tab");
const state = { me: null, tab: ["us", "pet", "wishes", "mood", "more", "notes", "goals", "bucket"].includes(START_TAB) ? START_TAB : "us", wishSide: "mine" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `${Number(n || 0).toLocaleString("ru-RU")} ₸`;
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const shortDate = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
const todayIso = () => new Date().toLocaleDateString("sv-SE");
const photoUrl = (id) => `/api/photo/${encodeURIComponent(id)}`;
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

async function api(path, { method = "GET", json, form } = {}) {
  const headers = {};
  if (tg?.initData) headers["X-Init-Data"] = tg.initData;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const r = await fetch(path, { method, headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = typeof data.detail === "string" ? data.detail : "Что-то пошло не так";
    toast(msg);
    throw new Error(msg);
  }
  return data;
}

function toast(text) {
  const t = $("#toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}
const haptic = (type = "light") => tg?.HapticFeedback?.impactOccurred(type);
const success = () => tg?.HapticFeedback?.notificationOccurred("success");

/* ---------- шторка с формой ---------- */
function openSheet(html, onSubmit) {
  const sheet = $("#sheet"), body = $(".sheet-body", sheet);
  body.innerHTML = `<form>${html}<div class="actions"><button type="button" class="ghost" data-close>Отмена</button><button type="submit">Сохранить</button></div></form>`;
  sheet.hidden = false;
  const form = $("form", body);
  const close = () => (sheet.hidden = true);
  $(".sheet-backdrop", sheet).onclick = close;
  $("[data-close]", body).onclick = close;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    try { await onSubmit(form); close(); success(); render(); }
    catch { btn.disabled = false; }
  };
  setTimeout(() => form.querySelector("input,textarea")?.focus(), 250);
}
const confirmAsk = (text) => new Promise((res) => (tg?.isVersionAtLeast?.("6.2") ? tg.showConfirm(text, res) : res(confirm(text))));

function fab(onClick) {
  const b = document.createElement("button");
  b.className = "fab"; b.textContent = "+"; b.onclick = () => { haptic(); onClick(); };
  view.appendChild(b);
}

/* ---------- старт ---------- */
async function boot() {
  try { state.me = await api("/api/me"); }
  catch { view.innerHTML = `<div class="empty">Открой приложение через бота в Telegram</div>`; return; }
  document.title = state.me.title;
  $("#title").textContent = state.me.title;
  if (!state.me.couple || !state.me.partner) return renderOnboarding();
  $("#tabs").hidden = false;
  highlightTab();
  updateBadges();
  updateSubtitle();
  render();
}

function updateSubtitle() {
  const c = state.me.couple;
  $("#subtitle").textContent = c?.days_together
    ? `Вместе ${c.days_together} ${plural(c.days_together, "день", "дня", "дней")}`
    : `${state.me.name} и ${state.me.partner?.name ?? "…"}`;
}

/* ---------- навигация: 4 главные вкладки + «Ещё» ---------- */
// Чтобы добавить новый раздел в меню «Ещё», допиши его сюда и добавь render-функцию в RENDERERS.
const MORE_SECTIONS = [
  { tab: "notes", icon: "letter", title: "Несказанное", desc: "То, что сложно сказать вслух" },
  { tab: "goals", icon: "wallet", title: "Копилка", desc: "Копим вместе на цели" },
  { tab: "bucket", icon: "check", title: "Мечты", desc: "Что хотим сделать вместе" },
];
const MORE_ICONS = {
  letter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>`,
};
const isMoreSection = (tab) => MORE_SECTIONS.some((x) => x.tab === tab);

function highlightTab() {
  const active = isMoreSection(state.tab) ? "more" : state.tab;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x.dataset.tab === active));
  const back = tg?.BackButton;
  if (back && tg.isVersionAtLeast?.("6.1")) isMoreSection(state.tab) ? back.show() : back.hide();
}

function goTo(tab) {
  state.tab = tab;
  highlightTab();
  window.scrollTo(0, 0);
  render();
}

document.querySelectorAll("#tabs button").forEach((b) =>
  b.addEventListener("click", () => { haptic(); goTo(b.dataset.tab); })
);
if (tg?.BackButton && tg.isVersionAtLeast?.("6.1")) tg.BackButton.onClick(() => { haptic(); goTo("more"); });

function renderMore() {
  view.innerHTML = `
    <h2>Ещё</h2>
    <div class="more-grid">
      ${MORE_SECTIONS.map((x) => `<button class="more-item ${x.tab === "notes" && state.me?.unread_notes ? "badge" : ""}" data-go="${x.tab}"><span class="mi">${MORE_ICONS[x.icon]}</span><b>${x.title}</b><small>${x.desc}</small></button>`).join("")}
    </div>`;
  view.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { haptic(); goTo(b.dataset.go); }));
}

// кнопка «← Ещё» вверху разделов из меню (в Telegram есть ещё и системная кнопка «Назад»)
function backLink() {
  if (!isMoreSection(state.tab)) return;
  const a = document.createElement("button");
  a.className = "back-link"; a.textContent = "← Ещё";
  a.onclick = () => { haptic(); goTo("more"); };
  view.prepend(a);
}

const RENDERERS = { us: () => renderUs(), pet: () => renderPet(), wishes: () => renderWishes(), mood: () => renderMood(),
  more: () => renderMore(), notes: () => renderNotes(), goals: () => renderGoals(), bucket: () => renderBucket() };

async function render() {
  const fn = RENDERERS[state.tab] || renderUs;
  try { await fn(); backLink(); } catch (e) { console.error(e); }
}

/* ---------- связка пары ---------- */
function renderOnboarding() {
  const c = state.me.couple;
  if (c) {
    const link = c.invite_link;
    view.innerHTML = `
      <div class="onboard">
        <div class="card center">
          <p>Отправь приглашение второй половинке. Как только она откроет ссылку — вы будете вместе здесь.</p>
          <div class="code">${esc(c.code)}</div>
          <p class="muted">или пусть введёт этот код у себя</p>
          ${link ? `<button id="share" style="width:100%">Отправить приглашение</button>` : ""}
          <button id="refresh" class="ghost" style="width:100%;margin-top:8px">Она уже присоединилась</button>
        </div>
      </div>`;
    $("#share") && ($("#share").onclick = () => {
      const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Присоединяйся к нашему месту")}`;
      tg ? tg.openTelegramLink(url) : window.open(url);
    });
    $("#refresh").onclick = () => location.reload();
    return;
  }
  view.innerHTML = `
    <div class="onboard">
      <div class="card">
        <h3 style="margin:0 0 6px">Привет, ${esc(state.me.name)}!</h3>
        <p class="muted" style="margin:0 0 14px">Это ваше общее пространство. Один создаёт пару, второй присоединяется.</p>
        <button id="create" style="width:100%">Создать нашу пару</button>
        <label>Или введи код приглашения</label>
        <div class="row"><input id="code" maxlength="16" placeholder="A1B2C3" autocapitalize="characters"><button id="join">Войти</button></div>
      </div>
    </div>`;
  $("#create").onclick = async () => { await api("/api/pair/create", { method: "POST" }); boot(); };
  $("#join").onclick = async () => {
    const code = $("#code").value.trim();
    if (!code) return;
    await api("/api/pair/join", { method: "POST", json: { code } });
    success(); boot();
  };
}

/* ---------- живой счётчик «сколько мы вместе» ---------- */
const TICK_UNITS = [
  ["y", ["год", "года", "лет"]], ["mo", ["месяц", "месяца", "месяцев"]], ["d", ["день", "дня", "дней"]],
  ["h", ["час", "часа", "часов"]], ["mi", ["минута", "минуты", "минут"]], ["s", ["секунда", "секунды", "секунд"]],
];
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m: 0..11

// Календарная разница: годы, месяцы, дни, часы, минуты, секунды. Всё считается во «времени Алматы».
// Сначала прибавляем к началу максимум целых месяцев (31 янв + 1 мес = 28/29 фев), остаток делим на дни/часы/минуты.
function addMonthsUTC(t, n) {
  const y = t.getUTCFullYear() + Math.floor((t.getUTCMonth() + n) / 12), m = (((t.getUTCMonth() + n) % 12) + 12) % 12;
  const day = Math.min(t.getUTCDate(), daysInMonth(y, m));
  return new Date(Date.UTC(y, m, day, t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()));
}
function togetherDiff(c) {
  const off = (c.tz_offset_min ?? 300) * 60000;
  const [Y, M, D] = c.started_on.split("-").map(Number);
  const [hh, mm] = (c.started_time || "00:00").split(":").map(Number);
  const a = new Date(Date.UTC(Y, M - 1, D, hh, mm, 0));          // начало, локальное время в UTC-полях
  const b = new Date(Date.now() + off);                            // сейчас, тоже в локальных полях
  if (b < a) return { y: 0, mo: 0, d: 0, h: 0, mi: 0, s: 0 };
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  let anchor = addMonthsUTC(a, months);
  while (anchor > b) anchor = addMonthsUTC(a, --months);
  let rest = Math.floor((b - anchor) / 1000);
  const s = rest % 60; rest = Math.floor(rest / 60);
  const mi = rest % 60; rest = Math.floor(rest / 60);
  const h = rest % 24; const d = Math.floor(rest / 24);
  return { y: Math.floor(months / 12), mo: months % 12, d, h, mi, s };
}

function startTicker() {
  clearInterval(startTicker._t);
  const c = state.me.couple;
  if (!c?.started_on || !$("#ticker")) return;
  const tick = () => {
    const el = $("#ticker");
    if (!el) return clearInterval(startTicker._t); // ушли с вкладки
    const v = togetherDiff(c);
    for (const [k, forms] of TICK_UNITS) {
      $(`[data-u="${k}"]`, el).textContent = String(v[k]).padStart(k === "y" || k === "mo" || k === "d" ? 1 : 2, "0");
      $(`[data-l="${k}"]`, el).textContent = plural(v[k], ...forms);
    }
  };
  tick();
  startTicker._t = setInterval(tick, 1000);
}

/* ---------- Мы ---------- */
async function renderUs() {
  const items = await api("/api/moments");
  const c = state.me.couple;
  const hero = c.days_together
    ? `<div class="big">${c.days_together}</div><div class="lbl">${plural(c.days_together, "день", "дня", "дней")} вместе · с ${fmtDate(c.started_on)}${c.started_time ? `, ${c.started_time}` : ""}</div>
       <div class="ticker" id="ticker">${TICK_UNITS.map((u) => `<div><b data-u="${u[0]}">0</b><span data-l="${u[0]}"></span></div>`).join("")}</div>
       <button class="small" id="setDate">Изменить дату</button>`
    : `<div class="lbl" style="font-size:17px">С какого дня вы вместе?</div><button class="small" id="setDate">Указать дату</button>`;
  view.innerHTML = `
    <div class="hero">${hero}</div>
    <button class="story-btn" id="story"><span class="sb-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 4.5 2.5-4.5 2.5z" fill="currentColor"/></svg></span><span class="grow"><b>Наш мультик</b><small>История о нас в 16 сценах</small></span><span class="sb-go">›</span></button>
    <h2>Наши моменты <small>${items.length || ""}</small></h2>
    ${items.length ? `<div class="timeline">${items.map(momentCard).join("")}</div>`
      : `<div class="empty">Добавьте первый момент — первое свидание, смешной случай, любое «помнишь?»</div>`}`;
  startTicker();
  $("#story").onclick = () => { haptic(); location.href = "/static/story.html"; };
  $("#setDate").onclick = () => openSheet(
    `<h3>Начало истории</h3>
     <label>Дата</label><input type="date" name="d" value="${c.started_on || ""}" max="${todayIso()}" required>
     <label>Время (по желанию — для точного счётчика)</label><input type="time" name="t" value="${c.started_time || ""}">`,
    async (f) => {
      await api("/api/couple", { method: "PATCH", json: { started_on: f.d.value, started_time: f.t.value || null } });
      state.me = await api("/api/me"); updateSubtitle();
    }
  );
  view.querySelectorAll("[data-del-moment]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAsk("Удалить этот момент?"))) return;
    await api(`/api/moments/${b.dataset.delMoment}`, { method: "DELETE" }); render();
  }));
  fab(() => openSheet(`
    <h3>Новый момент</h3>
    <label>Что было</label><input name="title" maxlength="200" placeholder="Первое свидание" required>
    <label>Когда</label><input type="date" name="happened_on" value="${todayIso()}" max="${todayIso()}" required>
    <label>Пару слов</label><textarea name="text" maxlength="3000" placeholder="Что запомнилось?"></textarea>
    <label>Фото</label><input type="file" name="photo" accept="image/*">`,
    async (f) => { await api("/api/moments", { method: "POST", form: new FormData(f) }); }
  ));
}

const momentCard = (m) => `
  <div class="card moment">
    <div class="row between"><span class="date">${fmtDate(m.happened_on)}</span><button class="icon" data-del-moment="${m.id}">⋯</button></div>
    <div class="t">${esc(m.title)}</div>
    ${m.text ? `<div class="tx">${esc(m.text)}</div>` : ""}
    ${m.photo ? `<img loading="lazy" src="${photoUrl(m.photo)}" alt="">` : ""}
    <div class="muted" style="margin-top:6px">добавил(а) ${esc(m.author)}</div>
  </div>`;

/* ---------- Вишлисты ---------- */
async function renderWishes() {
  const data = await api("/api/wishes");
  const p = state.me.partner.name;
  const list = state.wishSide === "mine" ? data.mine : data.partner;
  view.innerHTML = `
    <div class="seg"><button data-side="mine" class="${state.wishSide === "mine" ? "on" : ""}">Мои</button><button data-side="partner" class="${state.wishSide === "partner" ? "on" : ""}">${esc(p)}</button></div>
    <p class="muted center" style="margin:10px 0 4px">${state.wishSide === "mine" ? "Кто что забронировал — не узнаешь, это сюрприз" : `Отметь «беру», и ${esc(p)} не увидит`}</p>
    ${list.length ? list.map((w) => wishCard(w, state.wishSide === "mine")).join("")
      : `<div class="empty">${state.wishSide === "mine" ? "Добавь, что бы тебе хотелось" : "Пока пусто — намекни, что пора заполнить"}</div>`}`;
  view.querySelectorAll("[data-side]").forEach((b) => (b.onclick = () => { state.wishSide = b.dataset.side; haptic(); render(); }));
  view.querySelectorAll("[data-reserve]").forEach((b) => (b.onclick = async () => { await api(`/api/wishes/${b.dataset.reserve}/reserve`, { method: "POST" }); success(); render(); }));
  view.querySelectorAll("[data-received]").forEach((b) => (b.onclick = async () => { await api(`/api/wishes/${b.dataset.received}/received`, { method: "POST" }); render(); }));
  view.querySelectorAll("[data-del-wish]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAsk("Удалить желание?"))) return;
    await api(`/api/wishes/${b.dataset.delWish}`, { method: "DELETE" }); render();
  }));
  view.querySelectorAll("[data-link]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); tg ? tg.openLink(a.dataset.link) : window.open(a.dataset.link); }));
  if (state.wishSide === "mine") fab(() => openSheet(`
    <h3>Хочу…</h3>
    <label>Что</label><input name="title" maxlength="200" placeholder="Плед с рукавами" required>
    <label>Ссылка (необязательно)</label><input name="link" type="url" maxlength="500" placeholder="https://kaspi.kz/…">
    <label>Примерная цена, ₸</label><input name="price" type="number" min="0" inputmode="numeric">`,
    async (f) => { await api("/api/wishes", { method: "POST", json: { title: f.title.value, link: f.link.value, price: f.price.value ? Number(f.price.value) : null } }); }
  ));
}

function wishCard(w, mine) {
  const safeLink = /^https?:\/\//i.test(w.link) ? w.link : "";
  const meta = [w.price ? money(w.price) : "", safeLink ? `<a href="#" data-link="${esc(safeLink)}">ссылка ↗</a>` : ""].filter(Boolean).join(" · ");
  let action;
  if (mine) {
    action = `<button class="small ghost" data-received="${w.id}">${w.received ? "↺" : "Получил(а)"}</button><button class="icon" data-del-wish="${w.id}">✕</button>`;
  } else if (w.received) {
    action = `<span class="tag ok">подарено</span>`;
  } else if (w.reserved_by_me) {
    action = `<button class="small" data-reserve="${w.id}">Беру ✓</button>`;
  } else if (w.reserved) {
    action = `<span class="tag">занято</span>`;
  } else {
    action = `<button class="small ghost" data-reserve="${w.id}">Беру</button>`;
  }
  return `<div class="card wish ${w.received ? "done" : ""}"><div class="row"><div class="grow"><div class="t">${esc(w.title)}</div>${meta ? `<div class="muted">${meta}</div>` : ""}</div>${action}</div></div>`;
}

/* ---------- Настроение ---------- */
const MOODS = ["🥰", "😊", "🙂", "😐", "😔", "😢", "😤", "😴", "🤒", "🥳", "🤯", "🫠"];

async function renderMood() {
  const data = await api("/api/moods");
  const t = data.days[0];
  const p = state.me.partner.name;
  const mine = t.me;
  view.innerHTML = `
    <h2>Как ты сегодня?</h2>
    <div class="card">
      <div class="emojis">${MOODS.map((e) => `<button data-e="${e}" class="${mine?.emoji === e ? "on" : ""}">${e}</button>`).join("")}</div>
      <label>Пара слов (по желанию)</label>
      <div class="row"><input id="note" maxlength="300" value="${esc(mine?.note || "")}" placeholder="Устал(а) после смены…"><button id="save">${mine ? "Обновить" : "Отметить"}</button></div>
    </div>
    <div class="today-pair">
      <div class="card"><div class="muted">Ты</div><div class="em">${mine ? mine.emoji : "·"}</div><div class="muted">${esc(mine?.note || "")}</div></div>
      <div class="card"><div class="muted">${esc(p)}</div><div class="em">${t.partner ? t.partner.emoji : "·"}</div><div class="muted">${t.partner ? esc(t.partner.note) : "ещё не отметил(а)"}</div></div>
    </div>
    <h2>Последние 2 недели</h2>
    <div class="card week">
      <span></span><span class="head">Ты</span><span class="head">${esc(p)}</span>
      ${data.days.slice(1).map((d) => `<span class="d">${shortDate(d.day)}</span>${cell(d.me)}${cell(d.partner)}`).join("")}
    </div>`;
  let picked = mine?.emoji;
  view.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => {
    picked = b.dataset.e; haptic();
    view.querySelectorAll("[data-e]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  $("#save").onclick = async () => {
    if (!picked) return toast("Выбери смайлик");
    await api("/api/moods/today", { method: "PUT", json: { emoji: picked, note: $("#note").value } });
    success(); toast(`${p} увидит`); render();
  };
}
const cell = (m) => `<div class="c">${m ? `${m.emoji}${m.note ? `<small>${esc(m.note)}</small>` : ""}` : `<span class="muted">·</span>`}</div>`;

/* ---------- Копилка ---------- */
async function renderGoals() {
  const goals = await api("/api/goals");
  view.innerHTML = goals.length ? `<h2>Копим вместе</h2>${goals.map(goalCard).join("")}`
    : `<div class="empty">Заведите цель — поездка, подарок, что угодно. Отмечайте, кто сколько отложил.</div>`;
  view.querySelectorAll("[data-dep]").forEach((b) => (b.onclick = () => {
    const sign = b.dataset.sign === "-" ? -1 : 1;
    openSheet(`
      <h3>${sign > 0 ? "Пополнить" : "Снять"}</h3>
      <label>Сумма, ₸</label><input name="amount" type="number" min="1" inputmode="numeric" required>`,
      async (f) => { await api(`/api/goals/${b.dataset.dep}/deposit`, { method: "POST", json: { amount: sign * Number(f.amount.value) } }); });
  }));
  view.querySelectorAll("[data-del-goal]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAsk("Удалить цель вместе с историей?"))) return;
    await api(`/api/goals/${b.dataset.delGoal}`, { method: "DELETE" }); render();
  }));
  fab(() => openSheet(`
    <h3>Новая цель</h3>
    <label>На что копим</label><input name="title" maxlength="200" placeholder="Поездка вдвоём" required>
    <label>Сколько нужно, ₸</label><input name="target" type="number" min="1" inputmode="numeric" required>`,
    async (f) => { await api("/api/goals", { method: "POST", json: { title: f.title.value, target: Number(f.target.value), emoji: "" } }); }
  ));
}

const goalCard = (g) => `
  <div class="card goal">
    <div class="row between"><div class="t">${esc(g.title)}</div><button class="icon" data-del-goal="${g.id}">⋯</button></div>
    <div class="bar"><i style="width:${g.percent}%"></i></div>
    <div class="row between"><span class="sum">${money(g.total)} <span class="muted">из ${money(g.target)}</span></span><span class="progress-line">${g.percent}%</span></div>
    <div class="who muted">${Object.entries(g.by_user).map(([n, s]) => `${esc(n)}: ${money(s)}`).join(" · ") || "пока никто не внёс"}</div>
    <div class="row" style="margin-top:12px"><button class="small" data-dep="${g.id}">+ Пополнить</button><button class="small ghost" data-dep="${g.id}" data-sign="-">− Снять</button></div>
  </div>`;

/* ---------- Мечты (бакет-лист) ---------- */
async function renderBucket() {
  const items = await api("/api/bucket");
  const done = items.filter((i) => i.done).length;
  view.innerHTML = `
    <h2>Наши мечты <small>${items.length ? `${done} из ${items.length}` : ""}</small></h2>
    ${items.length ? items.map(bucketCard).join("") : `<div class="empty">Что вы хотите сделать вместе? Прыгнуть с парашютом, встретить рассвет в горах…</div>`}`;
  view.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => {
    const item = items.find((i) => i.id === Number(b.dataset.toggle));
    if (item.done) { await api(`/api/bucket/${item.id}/toggle`, { method: "POST", form: new FormData() }); return render(); }
    openSheet(`
      <h3>Сбылось!</h3><p class="muted">«${esc(item.title)}»</p>
      <label>Фото на память (по желанию)</label><input type="file" name="photo" accept="image/*">`,
      async (f) => { await api(`/api/bucket/${item.id}/toggle`, { method: "POST", form: new FormData(f) }); });
  }));
  view.querySelectorAll("[data-del-bucket]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAsk("Удалить мечту?"))) return;
    await api(`/api/bucket/${b.dataset.delBucket}`, { method: "DELETE" }); render();
  }));
  fab(() => openSheet(`
    <h3>Новая мечта</h3>
    <label>Что хотим сделать вместе</label><input name="title" maxlength="200" placeholder="Встретить рассвет на Кок-Тобе" required>`,
    async (f) => { await api("/api/bucket", { method: "POST", json: { title: f.title.value } }); }
  ));
}

const bucketCard = (b) => `
  <div class="card bucket ${b.done ? "done" : ""}">
    <div class="row">
      <button class="check" data-toggle="${b.id}">${b.done ? "✓" : ""}</button>
      <div class="grow"><div class="t">${esc(b.title)}</div><div class="muted">${b.done ? `сбылось ${fmtDate(b.done_on)}` : `предложил(а) ${esc(b.author)}`}</div></div>
      <button class="icon" data-del-bucket="${b.id}">✕</button>
    </div>
    ${b.photo ? `<img loading="lazy" src="${photoUrl(b.photo)}" alt="">` : ""}
  </div>`;

/* ---------- Питомец ---------- */
const KIND_NAMES = { cat: "Котик", dog: "Пёсик", fox: "Лисёнок", panda: "Панда", bunny: "Зайка", hamster: "Хомяк", penguin: "Пингвин", dragon: "Дракоша" };
const STAGE_NAMES = { egg: "яйцо", baby: "малыш", kid: "подросток", adult: "взрослый", legend: "легенда" };
const ACT_NAMES = { feed: "покормил(а)", pet: "погладил(а)" };
const ago = (m) => (m < 1 ? "только что" : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.floor(m / 60)} ч назад` : `${Math.floor(m / 1440)} дн назад`);
const cdText = (sec) => (sec >= 3600 ? `через ${Math.floor(sec / 3600)} ч ${Math.ceil((sec % 3600) / 60)} мин` : `через ${Math.max(1, Math.ceil(sec / 60))} мин`);

async function renderPet() {
  const data = await api("/api/pet");
  if (!data.pet) return renderPetPicker(data.kinds);
  state.house = await api("/api/pet/house").catch(() => null);
  drawPet(data.pet);
}

async function refreshHouse(p) {
  state.house = await api("/api/pet/house").catch(() => state.house);
  if (state.tab === "pet") drawPet(p);
}

function renderPetPicker(kinds) {
  let picked = "cat";
  view.innerHTML = `
    <div class="card pet-new">
      <div class="egg-big">🥚</div>
      <h3>Заведите общего питомца</h3>
      <p class="muted">Он вылупится из яйца и будет расти от всего, что вы делаете вместе: настроение, моменты, мечты. Его нужно кормить и гладить — вдвоём.</p>
      <label>Кто будет?</label>
      <div class="kinds">${Object.entries(kinds).map(([k, e]) => `<button data-kind="${k}" class="${k === picked ? "on" : ""}"><span>${e}</span>${KIND_NAMES[k] || k}</button>`).join("")}</div>
      <label>Как назовём?</label>
      <input id="petName" maxlength="40" placeholder="Пончик">
      <button id="petCreate" style="width:100%;margin-top:14px">Получить яйцо</button>
    </div>`;
  view.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => {
    picked = b.dataset.kind; haptic();
    view.querySelectorAll("[data-kind]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  $("#petCreate").onclick = async () => {
    const name = $("#petName").value.trim();
    if (!name) return toast("Придумайте имя");
    const d = await api("/api/pet", { method: "POST", json: { kind: picked, name } });
    success(); refreshHouse(d.pet);
  };
}

function drawPet(p) {
  const egg = p.stage === "egg";
  const lvlPct = egg ? Math.min(100, Math.round((p.xp / p.hatch_xp) * 100)) : Math.round((p.level_xp / p.level_need) * 100);
  const btn = (action, label) => {
    const cd = p.cooldowns[action];
    return `<button class="pet-btn ${cd ? "ghost" : ""}" data-act="${action}" ${cd ? "disabled" : ""}>${label}${cd ? `<small>${cdText(cd)}</small>` : ""}</button>`;
  };
  const stat = (cls, ico, label, val, pct, low) => `
    <div class="stat2 ${cls}">
      <span class="s-ico">${ico}</span>
      <div class="s-main"><div class="s-top"><span>${label}</span><b>${val}</b></div>
      <div class="bar"><i style="width:${pct}%" class="${low ? "low" : ""}"></i></div></div>
    </div>`;
  const GROW = [["Отметить настроение", "+10", "оба за день — ещё +10"], ["Новый момент", "+15", ""], ["Сбывшаяся мечта", "+40", ""],
    ["Записка в «Несказанном»", "+10", ""], ["Копилка, желание, новая мечта", "+5", ""], ["Покормить, погладить", "+3", "у каждого своя перезарядка"]];
  view.innerHTML = `
    <div class="pet-card st-${p.status} sg-${p.stage}">
      <div class="pc-deco"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="pet-top"><button class="pet-name" id="rename">${esc(p.name)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
        <span class="pet-lvl">${ICO.xp}${egg ? "яйцо" : `ур. ${p.level} · ${STAGE_NAMES[p.stage]}`}</span></div>
      <div class="pet-stage" id="petTap">
        ${p.stage === "legend" ? `<div class="crown">👑</div>` : ""}
        <div class="pet-emoji ${!egg && p.kind === "dog" ? "dogwrap" : ""}">${egg ? "🥚" : petFigure(p)}</div>
        <div class="shadow"></div>
      </div>
      <div class="pet-status">${esc(p.status_text)}</div>
    </div>
    <div class="card stats-card">
      ${egg ? "" : stat("food", ICO.food, "Сытость", p.food, p.food, p.food < 25) + stat("joy", ICO.joy, "Радость", p.joy, p.joy, p.joy < 25)}
      ${stat("xp", ICO.xp, egg ? "До вылупления" : "Опыт", `${lvlPct}%`, lvlPct, false)}
    </div>
    <div class="pet-actions">
      ${egg ? btn("pet", ICO.sun + "Согреть") : btn("feed", ICO.food + "Покормить") + btn("pet", ICO.joy + "Погладить")}
    </div>
    ${memoryHtml(p)}
    ${houseHtml(p)}
    <h2>Как ${esc(p.name)} растёт</h2>
    <div class="card grow-list">
      ${GROW.map(([t, v, n]) => `<div class="g-row"><span class="g-t">${t}${n ? `<small>${n}</small>` : ""}</span><b class="g-v">${v}</b></div>`).join("")}
    </div>
    ${p.log.length ? `<h2>Недавно</h2><div class="card log-card">${p.log.map((l) => `<div class="log"><span class="l-dot"></span><span class="grow">${esc(l.who)} ${ACT_NAMES[l.action] || l.action}</span><span class="muted">${ago(l.ago_min)}</span></div>`).join("")}</div>` : ""}
  `;
  view.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      const d = await api(`/api/pet/${b.dataset.act}`, { method: "POST" });
      success(); hearts(b.dataset.act === "feed" ? "+22 сытость" : "+12 радость", 1);
      const fig = $(".pet-emoji");
      fig?.classList.add(`act-${b.dataset.act}`);   // собачка ест из миски / жмурится от удовольствия
      setTimeout(() => refreshHouse(d.pet), fig?.classList.contains("dogwrap") ? 2200 : 700);
    } catch { b.disabled = false; }
  }));
  $("#petTap").onclick = () => {
    haptic("soft"); const e = $(".pet-emoji");
    if (e.classList.contains("dogwrap")) {
      if (e.classList.contains("bark")) return;
      e.classList.add("bark");
      const bub = document.createElement("span"); bub.className = "bark-bubble"; bub.textContent = "Гав!";
      $("#petTap").appendChild(bub); setTimeout(() => bub.remove(), 900);
      setTimeout(() => e.classList.remove("bark"), 700);
      return;
    }
    e.classList.remove("boing"); void e.offsetWidth; e.classList.add("boing");
  };
  view.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => {
    const r = state.house?.house?.rooms.find((x) => x.id === b.dataset.room);
    if (!r?.unlocked) return toast(`Откроется на ${r.level} уровне`);
    haptic(); state.room = r.id; drawPet(p);
  }));
  $("#rename").onclick = () => openSheet(
    `<h3>Новое имя</h3><label>Имя</label><input name="n" maxlength="40" value="${esc(p.name)}" required>`,
    async (f) => { await api("/api/pet", { method: "PATCH", json: { name: f.n.value } }); }
  );
}

function hearts(ch, n = 5) {
  const stage = $("#petTap");
  if (!stage) return;
  for (let i = 0; i < n; i++) {
    const h = document.createElement("span");
    h.className = "heart"; h.textContent = ch;
    h.style.left = "50%"; h.style.animationDelay = `${i * 90}ms`;
    stage.appendChild(h); setTimeout(() => h.remove(), 1400);
  }
}

/* ---------- дом питомца и воспоминания ---------- */
const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ICO = {
  food: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 8c0-1.6 1-1.6 1-3.2M12 8c0-1.6 1-1.6 1-3.2M16 8c0-1.6 1-1.6 1-3.2"/></svg>`,
  joy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.5c0 5.8-7.5 10.4-7.5 10.4z"/></svg>`,
  xp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2 6.6 20.1l1-6.1L3.2 9.7l6.1-.9z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>`,
};

function memoryHtml(p) {
  const m = state.house?.memory;
  if (!m || p.stage === "egg") return "";
  return `
    <div class="card memory">
      ${m.photo ? `<img src="${photoUrl(m.photo)}" alt="">` : `<span class="mem-ico">${ICO.book}</span>`}
      <div><div class="mem-who">${esc(p.name)} вспоминает</div><div class="mem-text">${esc(m.text)}</div></div>
    </div>`;
}

function houseHtml(p) {
  const h = state.house?.house;
  if (!h) return "";
  if (p.stage === "egg") return `<h2>Дом</h2><div class="card muted">Дом откроется, когда ${esc(p.name)} вылупится.</div>`;
  const room = h.rooms.find((r) => r.id === state.room && r.unlocked) || h.rooms[0];
  state.room = room.id;
  const items = room.items;
  const got = items.filter((i) => i.unlocked).length + (room.id === "living" ? h.frames.filter((f) => f.unlocked).length : 0);
  const total = items.length + (room.id === "living" ? h.frames.length : 0);
  const hr = new Date().getHours();
  const art = SCENE.render(room.id, {
    has: (id) => items.some((i) => i.id === id && i.unlocked),
    frames: h.frames, photo: photoUrl, night: hr < 7 || hr >= 20,
  });
  return `
    <h2>Дом <small>${got} из ${total}</small></h2>
    <div class="rooms">${h.rooms.map((r) => `<button data-room="${r.id}" class="${r.id === room.id ? "on" : ""} ${r.unlocked ? "" : "locked"}">${r.unlocked ? "" : LOCK}${esc(r.name)}${r.unlocked ? "" : `<small>ур. ${r.level}</small>`}</button>`).join("")}</div>
    <div class="scene scene-${room.id}">
      ${art}
      <span class="resident ${p.kind === "dog" ? "dogwrap st-" + p.status : ""}">${petFigure(p)}</span>
    </div>
    <div class="items-list">
      ${room.id === "living" ? h.frames.map((f) => itemRow(f.name, f.unlocked, f.hint)).join("") : ""}
      ${items.map((i) => itemRow(i.name, i.unlocked, i.hint, i.progress, i.need)).join("")}
    </div>`;
}

const itemRow = (name, unlocked, hint, progress, need) => `
  <div class="item-row ${unlocked ? "have" : "locked"}">
    <span class="ir-ico">${unlocked ? CHECK : LOCK}</span>
    <div class="ir-body">
      <span class="ir-name">${esc(name)}</span>
      ${unlocked ? "" : `<span class="ir-hint">${esc(hint)}</span>${need > 1 ? `<div class="ir-bar"><i style="width:${Math.round((progress / need) * 100)}%"></i></div>` : ""}`}
    </div>
    ${unlocked ? "" : need > 1 ? `<span class="ir-num">${progress}/${need}</span>` : ""}
  </div>`;

/* ---------- Несказанное ---------- */
const NOTE_KINDS = { thanks: "Благодарность", worry: "Переживание", talk: "Хочу обсудить", other: "Просто так" };
const REACTIONS = { hug: "Обнять", talk: "Давай поговорим", thanks: "Спасибо, что сказал(а)" };
const REACTED = { hug: "обнимает тебя", talk: "готов(а) поговорить", thanks: "благодарит, что поделился(лась)" };

async function renderNotes() {
  const data = await api("/api/notes");
  const p = state.me.partner.name;
  state.notesSide = state.notesSide || (data.inbox.some((n) => !n.read) ? "inbox" : "inbox");
  const list = state.notesSide === "inbox" ? data.inbox : data.sent;
  const unread = data.inbox.filter((n) => !n.read).length;
  view.innerHTML = `
    <h2>Несказанное</h2>
    <p class="muted intro">То, что сложно сказать вслух: благодарность, переживание или то, что давно хотелось обсудить. Записку увидит только ${esc(p)}.</p>
    <div class="seg"><button data-nside="inbox" class="${state.notesSide === "inbox" ? "on" : ""}">Мне${unread ? ` · ${unread}` : ""}</button><button data-nside="sent" class="${state.notesSide === "sent" ? "on" : ""}">Мои</button></div>
    <div style="margin-top:10px">
      ${list.length ? list.map((n) => (n.inbox ? inboxNote(n, p) : sentNote(n, p))).join("")
        : `<div class="empty">${state.notesSide === "inbox" ? `Пока пусто. Когда ${esc(p)} что-то напишет, придёт уведомление.` : "Ты ещё ничего не написал(а)."}</div>`}
    </div>`;
  view.querySelectorAll("[data-nside]").forEach((b) => (b.onclick = () => { haptic(); state.notesSide = b.dataset.nside; render(); }));
  view.querySelectorAll("[data-open]").forEach((b) => (b.onclick = async () => {
    await api(`/api/notes/${b.dataset.open}/read`, { method: "POST" });
    haptic("medium"); state.me = await api("/api/me"); updateBadges(); render();
  }));
  view.querySelectorAll("[data-react]").forEach((b) => (b.onclick = async () => {
    const [id, r] = b.dataset.react.split(":");
    await api(`/api/notes/${id}/react`, { method: "POST", json: { reaction: r } });
    success(); toast(`${p} получит ответ`); render();
  }));
  view.querySelectorAll("[data-del-note]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAsk("Удалить записку? Она исчезнет и у второго человека."))) return;
    await api(`/api/notes/${b.dataset.delNote}`, { method: "DELETE" }); render();
  }));
  fab(() => {
    openSheet(`
      <h3>Новая записка</h3>
      <label>О чём</label>
      <div class="chips">${Object.entries(NOTE_KINDS).map(([k, v], i) => `<label class="chip"><input type="radio" name="kind" value="${k}" ${i === 0 ? "checked" : ""}><span>${v}</span></label>`).join("")}</div>
      <label>Текст</label><textarea name="text" maxlength="4000" rows="6" placeholder="Можно не подбирать слова — просто напиши как есть" required></textarea>
      <p class="muted" style="margin:8px 0 0">${esc(p)} получит уведомление без текста и откроет записку, когда будет спокойная минута.</p>`,
      async (f) => { await api("/api/notes", { method: "POST", json: { kind: f.kind.value, text: f.text.value } }); state.notesSide = "sent"; });
  });
}

const noteDate = (iso) => fmtDate(iso.slice(0, 10));

function inboxNote(n, p) {
  if (!n.read) return `
    <div class="card note sealed">
      <div class="row between"><span class="tag">${esc(n.kind_name)}</span><span class="muted">${noteDate(n.created_at)}</span></div>
      <div class="seal">Тебе записка</div>
      <button style="width:100%" data-open="${n.id}">Открыть</button>
    </div>`;
  return `
    <div class="card note">
      <div class="row between"><span class="tag">${esc(n.kind_name)}</span><span class="muted">${noteDate(n.created_at)}</span></div>
      <div class="note-text">${esc(n.text)}</div>
      ${n.reaction ? `<div class="muted">Ты ответил(а): ${REACTIONS[n.reaction]}</div>`
        : `<div class="reacts">${Object.entries(REACTIONS).map(([k, v]) => `<button class="small ghost" data-react="${n.id}:${k}">${v}</button>`).join("")}</div>`}
    </div>`;
}

function sentNote(n, p) {
  const status = n.reaction ? `${esc(p)} ${REACTED[n.reaction]}` : n.read ? "Прочитано" : "Ещё не прочитано";
  return `
    <div class="card note">
      <div class="row between"><span class="tag">${esc(n.kind_name)}</span><span class="row"><span class="muted">${noteDate(n.created_at)}</span><button class="icon" data-del-note="${n.id}">✕</button></span></div>
      <div class="note-text">${esc(n.text)}</div>
      <div class="note-status ${n.reaction ? "warm" : ""}">${status}</div>
    </div>`;
}

function updateBadges() {
  const n = state.me?.unread_notes || 0;
  const more = document.querySelector('#tabs button[data-tab="more"]');
  more?.classList.toggle("badge", n > 0);
}

/* ---------- рисованная собачка ---------- */
// Каждая часть тела — отдельная группа, её двигает CSS (.dog .tail, .head, .ear-l …).
// Поведение зависит от классов на обёртке: st-happy / st-hungry / st-sad / st-bored, act-feed, act-pet, bark.
function petFigure(p) {
  return p.kind === "dog" ? dogSvg() : p.emoji;
}

function dogSvg() {
  const fur = "#EC9148", furDark = "#C86F2C", cream = "#FCE4C8", ear = "#A2501F", ink = "#3B2A26";
  return `
  <svg class="dog" viewBox="0 0 200 220" aria-label="собачка">
    <ellipse class="dog-shadow" cx="100" cy="208" rx="62" ry="8" fill="rgba(0,0,0,.13)"/>
    <g class="tail"><path d="M136 170 C 166 164, 178 132, 163 113 C 158 107, 150 111, 153 118 C 161 134, 152 151, 132 158 Z" fill="${fur}" stroke="${furDark}" stroke-width="2"/>
      <path d="M160 112 C 166 118, 168 124, 167 130" stroke="${cream}" stroke-width="5" stroke-linecap="round" fill="none"/></g>
    <g class="body">
      <ellipse cx="60" cy="190" rx="28" ry="18" fill="${fur}"/>
      <ellipse cx="140" cy="190" rx="28" ry="18" fill="${fur}"/>
      <path d="M100 98 C 142 98, 154 150, 148 188 C 142 204, 58 204, 52 188 C 46 150, 58 98, 100 98 Z" fill="${fur}"/>
      <ellipse cx="100" cy="148" rx="25" ry="36" fill="${cream}"/>
      <rect x="79" y="146" width="17" height="54" rx="8.5" fill="${fur}"/>
      <rect x="104" y="146" width="17" height="54" rx="8.5" fill="${fur}"/>
      <ellipse cx="87.5" cy="200" rx="11.5" ry="6.5" fill="${cream}"/>
      <ellipse cx="112.5" cy="200" rx="11.5" ry="6.5" fill="${cream}"/>
      <ellipse cx="44" cy="200" rx="12" ry="6" fill="${cream}"/>
      <ellipse cx="156" cy="200" rx="12" ry="6" fill="${cream}"/>
      <path d="M68 108 Q100 128 132 108" stroke="#FF5C8A" stroke-width="9" stroke-linecap="round" fill="none"/>
      <circle class="tag" cx="100" cy="124" r="6.5" fill="#FFC94D" stroke="#E0A92A" stroke-width="1.5"/>
    </g>
    <g class="bowl">
      <path d="M150 188 h46 l-7 16 h-32 z" fill="#FF5C8A"/>
      <ellipse cx="173" cy="188" rx="23" ry="4" fill="#d94a74"/>
      <circle cx="165" cy="185" r="4" fill="#8a5a3c"/><circle cx="174" cy="183" r="4" fill="#9c6743"/><circle cx="182" cy="186" r="4" fill="#8a5a3c"/>
    </g>
    <g class="head">
      <g class="ear-l"><path d="M60 46 C 38 50, 28 92, 40 112 C 48 122, 62 110, 68 84 Z" fill="${ear}"/></g>
      <g class="ear-r"><path d="M140 46 C 162 50, 172 92, 160 112 C 152 122, 138 110, 132 84 Z" fill="${ear}"/></g>
      <ellipse cx="100" cy="70" rx="46" ry="41" fill="${fur}"/>
      <path d="M100 30 C 92 40, 92 54, 100 62 C 108 54, 108 40, 100 30 Z" fill="${cream}" opacity=".9"/>
      <ellipse cx="100" cy="90" rx="26" ry="18" fill="${cream}"/>
      <ellipse class="blush" cx="68" cy="88" rx="8" ry="4.5" fill="#FF8FB0" opacity=".45"/>
      <ellipse class="blush" cx="132" cy="88" rx="8" ry="4.5" fill="#FF8FB0" opacity=".45"/>
      <g class="eyes-open">
        <ellipse cx="81" cy="68" rx="6" ry="7.5" fill="${ink}"/><circle cx="83" cy="65" r="2.2" fill="#fff"/>
        <ellipse cx="119" cy="68" rx="6" ry="7.5" fill="${ink}"/><circle cx="121" cy="65" r="2.2" fill="#fff"/>
      </g>
      <g class="eyes-happy" stroke="${ink}" stroke-width="3.5" stroke-linecap="round" fill="none">
        <path d="M74 70 Q81 62 88 70"/><path d="M112 70 Q119 62 126 70"/>
      </g>
      <g class="brows" stroke="${ink}" stroke-width="3" stroke-linecap="round">
        <path d="M73 59 L87 54"/><path d="M127 59 L113 54"/>
      </g>
      <ellipse cx="100" cy="82" rx="8.5" ry="6" fill="${ink}"/><ellipse cx="97.5" cy="80" rx="2.6" ry="1.6" fill="#fff" opacity=".7"/>
      <g class="mouth-smile" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" fill="none">
        <path d="M100 88 L100 94"/><path d="M100 94 Q93 101 86 96"/><path d="M100 94 Q107 101 114 96"/>
      </g>
      <path class="mouth-sad" d="M88 101 Q100 93 112 101" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <ellipse class="mouth-open" cx="100" cy="99" rx="8" ry="7" fill="${ink}"/>
      <path class="tongue" d="M94 97 Q100 116 106 97 Z" fill="#FF6F91"/>
    </g>
  </svg>`;
}

boot();
