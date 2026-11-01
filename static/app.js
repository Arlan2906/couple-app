const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const START_TAB = new URLSearchParams(location.search).get("tab");
const state = { me: null, tab: ["us", "pet", "wishes", "mood", "more", "goals", "bucket"].includes(START_TAB) ? START_TAB : "us", wishSide: "mine" };

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
  { tab: "goals", icon: "wallet", title: "Копилка", desc: "Копим вместе на цели" },
  { tab: "bucket", icon: "check", title: "Мечты", desc: "Что хотим сделать вместе" },
];
const MORE_ICONS = {
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
      ${MORE_SECTIONS.map((x) => `<button class="more-item" data-go="${x.tab}"><span class="mi">${MORE_ICONS[x.icon]}</span><b>${x.title}</b><small>${x.desc}</small></button>`).join("")}
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
  more: () => renderMore(), goals: () => renderGoals(), bucket: () => renderBucket() };

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
    <h2>Наши моменты <small>${items.length || ""}</small></h2>
    ${items.length ? `<div class="timeline">${items.map(momentCard).join("")}</div>`
      : `<div class="empty">Добавьте первый момент — первое свидание, смешной случай, любое «помнишь?»</div>`}`;
  startTicker();
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
  drawPet(data.pet);
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
    success(); drawPet(d.pet);
  };
}

function drawPet(p) {
  const egg = p.stage === "egg";
  const lvlPct = egg ? Math.min(100, Math.round((p.xp / p.hatch_xp) * 100)) : Math.round((p.level_xp / p.level_need) * 100);
  const btn = (action, label) => {
    const cd = p.cooldowns[action];
    return `<button class="pet-btn ${cd ? "ghost" : ""}" data-act="${action}" ${cd ? "disabled" : ""}>${label}${cd ? `<small>${cdText(cd)}</small>` : ""}</button>`;
  };
  view.innerHTML = `
    <div class="pet-card st-${p.status} sg-${p.stage}">
      <div class="pet-top"><button class="pet-name" id="rename">${esc(p.name)} ✎</button><span class="pet-lvl">${egg ? "яйцо" : `ур. ${p.level} · ${STAGE_NAMES[p.stage]}`}</span></div>
      <div class="pet-stage" id="petTap">
        ${p.stage === "legend" ? `<div class="crown">👑</div>` : ""}
        <div class="pet-emoji">${egg ? "🥚" : p.emoji}</div>
        <div class="shadow"></div>
      </div>
      <div class="pet-status">${esc(p.status_text)}</div>
    </div>
    <div class="card">
      ${egg ? "" : `<div class="stat"><span>Сытость</span><div class="bar"><i style="width:${p.food}%" class="${p.food < 25 ? "low" : ""}"></i></div><b>${p.food}</b></div>
      <div class="stat"><span>Радость</span><div class="bar"><i style="width:${p.joy}%" class="${p.joy < 25 ? "low" : ""}"></i></div><b>${p.joy}</b></div>`}
      <div class="stat"><span>${egg ? "До вылупления" : "Опыт"}</span><div class="bar"><i style="width:${lvlPct}%" class="xp"></i></div><b>${lvlPct}%</b></div>
    </div>
    <div class="pet-actions">
      ${egg ? btn("pet", "Согреть") : btn("feed", "Покормить") + btn("pet", "Погладить")}
    </div>
    <h2>Как ${esc(p.name)} растёт</h2>
    <div class="card muted grow-list">
      <div>Отметить настроение — <b>+10</b> (оба за день — ещё <b>+10</b>)</div>
      <div>Новый момент — <b>+15</b></div>
      <div>Сбывшаяся мечта — <b>+40</b></div>
      <div>Пополнить копилку, новое желание, новая мечта — <b>+5</b></div>
      <div>Покормить, погладить — <b>+3</b> (у каждого своя перезарядка)</div>
    </div>
    ${p.log.length ? `<h2>Недавно</h2><div class="card">${p.log.map((l) => `<div class="row between log"><span>${esc(l.who)} ${ACT_NAMES[l.action] || l.action}</span><span class="muted">${ago(l.ago_min)}</span></div>`).join("")}</div>` : ""}
  `;
  view.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      const d = await api(`/api/pet/${b.dataset.act}`, { method: "POST" });
      success(); hearts(b.dataset.act === "feed" ? "+22 сытость" : "+12 радость", 1);
      setTimeout(() => drawPet(d.pet), 700);
    } catch { b.disabled = false; }
  }));
  $("#petTap").onclick = () => {
    haptic("soft"); const e = $(".pet-emoji"); e.classList.remove("boing"); void e.offsetWidth; e.classList.add("boing");
  };
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

boot();
