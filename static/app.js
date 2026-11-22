const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
// нежно-розовый фон независимо от темы Telegram
try { tg?.setHeaderColor?.("#FFDCE8"); tg?.setBackgroundColor?.("#FFDCE8"); tg?.setBottomBarColor?.("#FFFFFF"); } catch {}

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
function openInfo(html) {
  const sheet = $("#sheet"), body = $(".sheet-body", sheet);
  body.innerHTML = `${html}<div class="actions"><button type="button" data-close>Закрыть</button></div>`;
  sheet.hidden = false;
  const close = () => (sheet.hidden = true);
  $(".sheet-backdrop", sheet).onclick = close;
  $("[data-close]", body).onclick = close;
}
const confirmAsk = (text) => new Promise((res) => (tg?.isVersionAtLeast?.("6.2") ? tg.showConfirm(text, res) : res(confirm(text))));

function fab(onClick) {
  const b = document.createElement("button");
  b.className = "fab"; b.textContent = "+"; b.onclick = () => { haptic(); onClick(); };
  view.appendChild(b);
}

/* ---------- старт ---------- */
async function boot() {
  view.innerHTML = `<div class="boot-loader"><div class="bl-dog">${dogSvg()}</div><div class="bl-t" id="blText">Секунду…</div></div>`;
  const slow = setTimeout(() => { const t = $("#blText"); if (t) t.textContent = "Будим сервер — иногда это до минуты"; }, 3500);
  try { state.me = await api("/api/me"); clearTimeout(slow); }
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
const STORY_SCENES = [["walk", "Прогулка"], ["movie", "Кино дома"], ["cinema", "Кинотеатр"], ["cook", "Готовили"],
  ["cafe", "Кофейня"], ["trip", "Поездка"], ["bench", "Лавочка вечером"], ["flowers", "Цветы"]];
const SCENE_NAME = Object.fromEntries(STORY_SCENES);
const scenePicker = (cur) => `
  <div class="scene-pick">
    <label><input type="radio" name="scene" value="" ${cur ? "" : "checked"}><span>Не добавлять</span></label>
    ${STORY_SCENES.map(([k, n]) => `<label><input type="radio" name="scene" value="${k}" ${cur === k ? "checked" : ""}><span>${n}</span></label>`).join("")}
  </div>`;

async function renderUs() {
  const items = await api("/api/moments");
  const c = state.me.couple;
  const hero = c.days_together
    ? `<div class="big">${c.days_together}</div><div class="lbl">${plural(c.days_together, "день", "дня", "дней")} вместе · с ${fmtDate(c.started_on)}${c.started_time ? `, ${c.started_time}` : ""}</div>
       <div class="ticker" id="ticker">${TICK_UNITS.map((u) => `<div><b data-u="${u[0]}">0</b><span data-l="${u[0]}"></span></div>`).join("")}</div>
       <button class="small" id="setDate">Изменить дату</button>`
    : `<div class="lbl" style="font-size:17px">С какого дня вы вместе?</div><button class="small" id="setDate">Указать дату</button>`;
  const ms = c.milestone;
  const storyCount = items.filter((m) => m.scene).length;
  view.innerHTML = `
    ${ms ? `<div class="milestone"><div class="ms-confetti">${"<i></i>".repeat(14)}</div><span class="ms-ico">${ICO.joy}</span><div><b>${esc(ms.text)}</b><small>С праздником вас. Сегодня и дом питомца нарядный</small></div></div>` : ""}
    <div class="hero">${hero}</div>
    <button class="story-btn" id="story"><span class="sb-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 4.5 2.5-4.5 2.5z" fill="currentColor"/></svg></span><span class="grow"><b>Наш мультик</b><small>${storyCount ? `19 сцен + ${storyCount} ${plural(storyCount, "глава", "главы", "глав")} из ваших моментов` : "История о нас в 19 сценах"}</small></span><span class="sb-go">›</span></button>
    <h2>Наши моменты <small>${items.length || ""}</small></h2>
    ${items.length ? `<div class="timeline">${items.map(momentCard).join("")}</div>`
      : `<div class="empty">Добавьте первый момент — первое свидание, смешной случай, любое «помнишь?»</div>`}`;
  startTicker();
  $("#story").onclick = () => {
    haptic();
    try { sessionStorage.setItem("initData", tg?.initData || ""); } catch {}
    location.href = "/static/story.html?v=3";
  };
  $("#setDate").onclick = () => openSheet(
    `<h3>Начало истории</h3>
     <label>Дата</label><input type="date" name="d" value="${c.started_on || ""}" max="${todayIso()}" required>
     <label>Время (по желанию — для точного счётчика)</label><input type="time" name="t" value="${c.started_time || ""}">`,
    async (f) => {
      await api("/api/couple", { method: "PATCH", json: { started_on: f.d.value, started_time: f.t.value || null } });
      state.me = await api("/api/me"); updateSubtitle();
    }
  );
  view.querySelectorAll("[data-scene-moment]").forEach((b) => (b.onclick = () => {
    haptic();
    openSheet(`<h3>Сцена в мультике</h3><p class="muted" style="margin:0 0 8px">Как нарисовать этот момент? Подписью станет его текст</p>${scenePicker(b.dataset.scene)}`,
      async (f) => {
        await api(`/api/moments/${b.dataset.sceneMoment}`, { method: "PATCH", json: { scene: f.scene.value || null } });
        setTimeout(() => toast(f.scene.value ? "Глава в мультике готова" : "Убрали из мультика"), 400);
      });
  }));
  view.querySelectorAll("[data-del-moment]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAsk("Удалить этот момент?"))) return;
    await api(`/api/moments/${b.dataset.delMoment}`, { method: "DELETE" }); render();
  }));
  fab(() => openSheet(`
    <h3>Новый момент</h3>
    <label>Что было</label><input name="title" maxlength="200" placeholder="Первое свидание" required>
    <label>Когда</label><input type="date" name="happened_on" value="${todayIso()}" max="${todayIso()}" required>
    <label>Пару слов</label><textarea name="text" maxlength="3000" placeholder="Что запомнилось?"></textarea>
    <label>Фото</label><input type="file" name="photo" accept="image/*">
    <label>Добавить в мультик</label>${scenePicker("")}
    <p class="muted" style="margin:6px 0 0;font-size:13px">Момент станет новой главой мультика — с вашей подписью</p>`,
    async (f) => {
      await api("/api/moments", { method: "POST", form: new FormData(f) });
      if (f.scene.value) setTimeout(() => toast("Добавили новую главу в мультик"), 400);
    }
  ));
}

const momentCard = (m) => `
  <div class="card moment">
    <div class="row between"><span class="date">${fmtDate(m.happened_on)}</span><button class="icon" data-del-moment="${m.id}">⋯</button></div>
    <div class="t">${esc(m.title)}</div>
    ${m.text ? `<div class="tx">${esc(m.text)}</div>` : ""}
    ${m.photo ? `<img loading="lazy" src="${photoUrl(m.photo)}" alt="">` : ""}
    <div class="row between mc-foot"><span class="muted">добавил(а) ${esc(m.author)}</span>
      <button class="mc-scene ${m.scene ? "on" : ""}" data-scene-moment="${m.id}" data-scene="${m.scene || ""}">${m.scene ? `В мультике · ${SCENE_NAME[m.scene] || ""}` : "+ В мультик"}</button></div>
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

const moodCal = { open: false, month: null };
const MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CAL_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`;

async function renderMood() {
  const data = await api("/api/moods");
  const p = state.me.partner.name;
  const mine = data.me, theirs = data.partner;
  const replyBox = theirs
    ? theirs.reaction
      ? `<div class="m-reply">Ты ответил(а): ${esc(data.replies[theirs.reaction] || "")}</div>`
      : `<div class="m-replies">${Object.entries(data.replies).map(([k, v]) => `<button class="small ghost" data-reply="${k}">${v}</button>`).join("")}</div>`
    : "";
  view.innerHTML = `
    <h2>Как ты сегодня?</h2>
    <div class="card">
      <div class="emojis">${MOODS.map((e) => `<button data-e="${e}" class="${mine?.emoji === e ? "on" : ""}">${e}</button>`).join("")}</div>
      <label>Пара слов (по желанию)</label>
      <div class="row"><input id="note" maxlength="300" value="${esc(mine?.note || "")}" placeholder="Устал(а) после смены…"><button id="save">${mine ? "Обновить" : "Отметить"}</button></div>
    </div>
    <div class="today-pair">
      <div class="card"><div class="muted">Ты</div><div class="em">${mine ? mine.emoji : "·"}</div><div class="muted">${esc(mine?.note || "")}</div>
        ${mine?.reaction ? `<div class="m-reply warm">${esc(p)} ${esc(data.replied[mine.reaction] || "")}</div>` : ""}</div>
      <div class="card"><div class="muted">${esc(p)}</div><div class="em">${theirs ? theirs.emoji : "·"}</div><div class="muted">${theirs ? esc(theirs.note) : "ещё не отметил(а)"}</div>${replyBox}</div>
    </div>
    <button class="cal-toggle" id="calToggle"><span class="ct-ico">${CAL_ICO}</span><span class="grow"><b>История настроения</b><small>Календарь: что было и когда</small></span><span class="ct-chev ${moodCal.open ? "open" : ""}">›</span></button>
    <div id="cal" class="card cal" ${moodCal.open ? "" : "hidden"}></div>`;
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
  view.querySelectorAll("[data-reply]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      await api(`/api/moods/${theirs.id}/react`, { method: "POST", json: { reaction: b.dataset.reply } });
      success(); toast(`${p} получит`); render();
    } catch { b.disabled = false; }
  }));
  $("#calToggle").onclick = () => {
    haptic(); moodCal.open = !moodCal.open;
    $("#cal").hidden = !moodCal.open;
    $(".ct-chev").classList.toggle("open", moodCal.open);
    if (moodCal.open) drawCal(data);
  };
  if (moodCal.open) drawCal(data);
}

async function drawCal(moodData) {
  const box = $("#cal");
  if (!box) return;
  const today = moodData.today, p = state.me.partner.name;
  moodCal.month ||= today.slice(0, 7);
  const cur = moodCal.month;
  const data = await api(`/api/moods/month?m=${cur}`);
  if (moodCal.month !== cur || !$("#cal")) return;
  const [y, m] = cur.split("-").map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const pad = (n) => String(n).padStart(2, "0");
  const shift = (k) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(`<span class="cd blank"></span>`);
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${cur}-${pad(d)}`, e = data.days[iso];
    cells.push(`<button class="cd ${iso === today ? "today" : ""} ${e ? "has" : ""} ${iso > today ? "future" : ""}" data-day="${iso}" ${e ? "" : "disabled"}>
      <span class="n">${d}</span><span class="es"><i>${e?.me?.emoji || ""}</i><i>${e?.partner?.emoji || ""}</i></span></button>`);
  }
  const marked = Object.keys(data.days).length;
  box.innerHTML = `
    <div class="cal-head"><button class="icon" data-mv="-1">‹</button><b>${MONTHS_FULL[m - 1]} ${y}</b><button class="icon" data-mv="1" ${cur >= today.slice(0, 7) ? "disabled" : ""}>›</button></div>
    <div class="cal-wd">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells.join("")}</div>
    <div class="cal-legend">${marked ? `В клетке: слева ты, справа ${esc(p)}. Нажми на день — покажу подробности` : "В этом месяце отметок нет"}</div>`;
  box.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { haptic(); moodCal.month = shift(Number(b.dataset.mv)); drawCal(moodData); }));
  box.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => {
    haptic();
    const e = data.days[b.dataset.day];
    const part = (who, x, other) => `
      <div class="day-mood">
        <div class="dm-em">${x ? x.emoji : "·"}</div>
        <div class="grow"><b>${esc(who)}</b><div class="muted">${x ? (x.note ? esc(x.note) : "без слов") : "не отметил(а)"}</div>
        ${x?.reaction ? `<div class="m-reply warm">${esc(other)} ${esc(moodData.replied[x.reaction] || "")}</div>` : ""}</div>
      </div>`;
    openInfo(`<h3>${fmtDate(b.dataset.day)}</h3>${part("Ты", e.me, p)}${part(p, e.partner, "Ты")}`);
  }));
}

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
const ACT_NAMES = { feed: "покормил(а)", pet: "погладил(а)", walk_call: "позвал(а) гулять", walk: "пришёл(ла) на прогулку — погуляли вместе",
  carry_kiss: "передал(а) воздушный поцелуй", carry_miss: "передал(а) «скучаю»", carry_hug: "передал(а) обнимашки", carry_love: "передал(а) «люблю»" };
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
  const mode = roomMode();
  const spot = p.status === "sleep" && !egg ? sleepSpot(p) : null;
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
    ["Записка в «Несказанном»", "+10", ""], ["Копилка, желание, новая мечта", "+5", ""], ["Прогулка вдвоём", "+15", "один зовёт, второй подтверждает за час"], ["Покормить, погладить", "+3", "у каждого своя перезарядка"]];
  view.innerHTML = `
    <div class="pet-card room mode-${mode} st-${p.status} sg-${p.stage} ${spot ? "sleep-" + spot : ""}">
      <div class="pc-room">${petRoomSvg(p, mode, spot)}</div>
      <div class="pet-top"><button class="pet-name" id="rename">${esc(p.name)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
        <span class="pet-lvl">${ICO.xp}${egg ? "яйцо" : `ур. ${p.level} · ${STAGE_NAMES[p.stage]}`}</span></div>
      <div class="pet-stage" id="petTap">
        ${p.stage === "legend" && p.kind !== "dog" ? `<div class="crown">👑</div>` : ""}
        ${p.status === "sleep" && spot !== "house" ? `<div class="zzz"><i>z</i><i>z</i><i>Z</i></div>` : ""}
        <div class="pet-emoji ${!egg && p.kind === "dog" ? "dogwrap" : ""} ${spot === "floor" && p.kind === "dog" ? "lying" : ""} ${spot === "house" ? "in-house" : ""}">${egg ? "🥚" : spot === "floor" && p.kind === "dog" ? dogSleepSvg() : petFigure(p)}</div>
        <div class="shadow"></div>
      </div>
      ${p.birthday ? `<div class="pc-bday">${esc(p.birthday.text)}</div>` : ""}
      ${p.letter ? `<button class="letter-pill" id="letterPill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>Письмо для тебя</button>` : ""}
      <div class="pet-status">${esc(p.status_text)}</div>
    </div>
    <div class="card stats-card">
      ${egg ? "" : stat("food", ICO.food, "Сытость", p.food, p.food, p.food < 25) + stat("joy", ICO.joy, "Радость", p.joy, p.joy, p.joy < 25)}
      ${stat("xp", ICO.xp, egg ? "До вылупления" : "Опыт", `${lvlPct}%`, lvlPct, false)}
    </div>
    <div class="pet-actions">
      ${egg ? btn("pet", ICO.sun + "Согреть") : btn("feed", ICO.food + "Покормить") + btn("pet", ICO.joy + "Погладить")}
    </div>
    ${egg ? "" : walkHtml(p)}
    ${egg ? "" : carryHtml(p)}
    ${memoryHtml(p)}
    ${houseHtml(p)}
    ${egg || p.kind !== "dog" ? "" : wardrobeHtml(p)}
    ${egg ? "" : `<h2>Дневник <small>пишет ${esc(p.name)}</small></h2><div class="card diary" id="diary"><p class="muted">Листаю дневник…</p></div>
    <button class="album-btn" id="album"><span class="ab-ico">${ICO.book}</span><span class="grow"><b>Альбом «Как рос ${esc(p.name)}»</b><small>${p.level} ${plural(p.level, "снимок", "снимка", "снимков")} — по одному на каждый уровень</small></span><span class="ct-chev">›</span></button>`}
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
      const fig = wakePet(p);
      fig?.classList.add(`act-${b.dataset.act}`);   // собачка ест из миски / жмурится от удовольствия
      setTimeout(() => refreshHouse(d.pet), fig?.classList.contains("dogwrap") ? 2900 : 700);
    } catch { b.disabled = false; }
  }));
  $("#walk")?.addEventListener("click", async () => {
    const b = $("#walk"); b.disabled = true;
    try {
      const d = await api("/api/pet/walk", { method: "POST" });
      if (d.walked) {
        success(); hearts("+15 опыта", 1);
        wakePet(p)?.classList.add("act-walk");
        toast("Погуляли вместе! +15 опыта и +25 радости");
        setTimeout(() => refreshHouse(d.pet), 2200);
      } else {
        success(); toast(`${state.me.partner.name} получит приглашение`); refreshHouse(d.pet);
      }
    } catch { b.disabled = false; }
  });
  $("#petTap").onclick = () => {
    haptic("soft"); const e = $(".pet-emoji");
    if (spot && !$(".pet-card").classList.contains("awake")) {
      if ($(".bark-bubble")) return;
      const bub = document.createElement("span"); bub.className = "bark-bubble shh"; bub.textContent = "Тсс… спит";
      $("#petTap").appendChild(bub); setTimeout(() => bub.remove(), 1400);
      return;
    }
    if (p.letter && e.classList.contains("dogwrap")) return openLetter();
    if (e.classList.contains("dogwrap") && p.tricks?.length) {
      if (e.dataset.trick) return;
      state.trickIdx = ((state.trickIdx ?? -1) + 1) % p.tricks.length;
      doTrick(p.tricks[state.trickIdx]);
      return;
    }
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
  const openLetter = () => {
    if (!p.letter) return;
    haptic();
    openInfo(`<div class="letter-open"><div class="lt-env"><svg viewBox="0 0 80 56"><rect x="2" y="2" width="76" height="52" rx="7" fill="#FFF8EE" stroke="#E3A9B8" stroke-width="2.4"/><path d="M4 6 L40 32 L76 6" stroke="#E3A9B8" stroke-width="2.4" fill="none" stroke-linejoin="round"/><path d="M40 48 c-9-7-11-12-6.5-15 2.8-2 5.4-.8 6.5 1.2 1.1-2 3.7-3.2 6.5-1.2 4.5 3 2.5 8-6.5 15z" fill="#F0506E"/></svg></div>
      <h3>Письмо для тебя</h3><p class="muted">от: ${esc(p.letter.from)}</p><p class="lt-big">${esc(p.letter.label)}</p><p class="lt-text">${esc(p.letter.text)}</p>
      <p class="muted">${esc(p.name)} донёс его в зубах и не помял</p></div>`);
    api("/api/kulik/letter/open", { method: "POST" }).then((d) => { success(); hearts("♥", 6); setTimeout(() => refreshHouse(d.pet), 600); }).catch(() => {});
  };
  $("#letterPill")?.addEventListener("click", openLetter);
  view.querySelectorAll("[data-carry]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      const d = await api("/api/kulik/carry", { method: "POST", json: { kind: b.dataset.carry } });
      success();
      const env = document.createElement("div"); env.className = "envelope";
      env.innerHTML = `<svg viewBox="0 0 40 28"><rect x="1" y="1" width="38" height="26" rx="4" fill="#fff" stroke="#E8A3B4" stroke-width="2"/><path d="M2 3 L20 16 L38 3" stroke="#E8A3B4" stroke-width="2" fill="none"/><path d="M20 22 c-3-2.4-4-4-2.4-5.2 1-.7 2-.3 2.4.4.4-.7 1.4-1.1 2.4-.4 1.6 1.2.6 2.8-2.4 5.2z" fill="#FF5F7E"/></svg>`;
      $("#petTap").appendChild(env);
      wakePet(p)?.classList.add("act-walk");
      toast(`Конверт в пути — ${state.me.partner.name} скоро получит`);
      setTimeout(() => refreshHouse(d.pet), 2000);
    } catch { b.disabled = false; }
  }));
  view.querySelectorAll("[data-wear]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.lock) return toast(`Откроется на ${b.dataset.lock} уровне`);
    const [slot, item] = b.dataset.wear.split(":");
    haptic();
    const d = await api("/api/kulik/outfit", { method: "PATCH", json: { slot, item: item || null } });
    refreshHouse(d.pet);
  }));
  $("#album")?.addEventListener("click", () => { haptic(); openAlbum(p); });
  fillDiary(p);
  showLevelUp(p);
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

// на время кормления/поглаживания/прогулки питомец просыпается, потом снова засыпает
function wakePet(p) {
  const card = $(".pet-card"), fig = $(".pet-emoji");
  if (!card || !fig) return fig;
  if (card.className.includes("sleep-")) {
    card.classList.add("awake");
    $(".pet-stage .zzz")?.remove();
    fig.classList.remove("lying", "in-house");
    if (p.kind === "dog") fig.innerHTML = dogSvg();
  }
  return fig;
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

const WALK_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="4.5" r="2"/><path d="M9 21l2.5-6.5L14 17v4M7 12.5l2-4 4-1 2.5 3.5 3 1"/><path d="M11.5 14.5L13 9"/></svg>`;
function walkHtml(p) {
  const w = p.walk || { state: "ready" }, partner = esc(state.me.partner.name);
  const [title, sub] = {
    ready: ["Позвать гулять", `${partner} подтвердит за час — и пойдёте вместе. +15 опыта`],
    waiting: [`Ждём ${partner}`, `Приглашение ещё ${w.mins} мин`],
    invited: [`${esc(w.by || "")} зовёт гулять!`, `Нажми, чтобы пойти вместе. Осталось ${w.mins} мин`],
    cooldown: ["Уже погуляли", `${esc(p.name)} отдыхает, снова можно ${cdText((w.mins || 1) * 60)}`],
  }[w.state] || ["Гулять", ""];
  const off = w.state === "waiting" || w.state === "cooldown";
  return `<button class="walk-btn wk-${w.state}" id="walk" ${off ? "disabled" : ""}><span class="wk-ico">${WALK_ICO}</span><span class="grow"><b>${title}</b><small>${sub}</small></span>${off ? "" : `<span class="wk-go">›</span>`}</button>`;
}

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
    frames: h.frames, photo: photoUrl, night: hr < 7 || hr >= 20, festive: !!state.me.couple?.milestone,
  });
  return `
    <h2>Дом <small>${got} из ${total}</small></h2>
    <div class="rooms">${h.rooms.map((r) => `<button data-room="${r.id}" class="${r.id === room.id ? "on" : ""} ${r.unlocked ? "" : "locked"}">${r.unlocked ? "" : LOCK}${esc(r.name)}${r.unlocked ? "" : `<small>ур. ${r.level}</small>`}</button>`).join("")}</div>
    <div class="scene scene-${room.id}">
      ${art}
      <span class="resident ${p.kind === "dog" ? "dogwrap st-" + p.status : ""} ${p.kind === "dog" && p.status === "sleep" ? "lying" : ""}">${p.status === "sleep" ? `<span class="zzz sm"><i>z</i><i>z</i><i>Z</i></span>` : ""}${p.kind === "dog" && p.status === "sleep" ? dogSleepSvg() : petFigure(p)}</span>
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
const REACTIONS = { hug: "Обнять", talk: "Давай поговорим", thanks: "Спасибо, что сказал(а)", kiss: "Поцеловать", handshake: "Пожать руку по-братски" };
const REACTED = { hug: "обнимает тебя", talk: "готов(а) поговорить", thanks: "благодарит, что поделился(лась)", kiss: "целует тебя", handshake: "по-братски жмёт тебе руку" };

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
  return p.kind === "dog" ? dogSvg(outfitOf(p)) : p.emoji;
}

/* ---------- гардероб: вещи на таксе (координаты сидящей таксы 200x220) ---------- */
function headWear(id) {
  switch (id) {
    case "cap": return `<g class="wear"><path d="M70 36 C 70 10, 130 10, 130 36Z" fill="#E2483D"/><path d="M100 13 V36 M84 16 Q86 26 86 36 M116 16 Q114 26 114 36" stroke="#B9322A" stroke-width="1.2" fill="none"/>
      <circle cx="100" cy="13" r="3" fill="#B9322A"/><path d="M72 34 Q100 48 128 34 Q100 40 72 34Z" fill="#B9322A"/><path d="M78 24 Q86 16 96 15" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
    case "glasses": return `<g class="wear"><g fill="rgba(170,215,255,.28)" stroke="#2a1a14" stroke-width="2.6"><circle cx="84" cy="60" r="11.5"/><circle cx="116" cy="60" r="11.5"/></g>
      <path d="M95.5 59 Q100 55 104.5 59 M72.6 57 L64 52 M127.4 57 L136 52" stroke="#2a1a14" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M78 54 l4 -3 M110 54 l4 -3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/></g>`;
    case "santa": return `<g class="wear"><path d="M72 32 C 80 8, 112 -4, 140 4 C 132 10, 128 20, 128 32Z" fill="#D9343F"/><path d="M84 14 C 96 6, 112 2, 126 4" stroke="#fff" stroke-opacity=".25" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="66" y="26" width="68" height="12" rx="6" fill="#FFF8F0"/><circle cx="143" cy="6" r="7" fill="#FFF8F0"/></g>`;
    case "flower": return `<g class="wear" transform="translate(128 34)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-6" rx="4.4" ry="6.4" fill="#FF8FB0" transform="rotate(${a})"/>`).join("")}
      <circle r="4" fill="#FFD25A"/><path d="M-4 6 q-8 4 -12 0 q6 -6 12 0Z" fill="#58B573"/></g>`;
    case "crown": return `<g class="wear"><path d="M76 30 L80 6 L91 20 L100 2 L109 20 L120 6 L124 30Z" fill="#FFD25A" stroke="#C99416" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="75" y="26" width="50" height="8" rx="2" fill="#F2B83A" stroke="#C99416" stroke-width="1.2"/><circle cx="100" cy="30" r="2.6" fill="#E2483D"/><circle cx="86" cy="30" r="2" fill="#4EA6E0"/><circle cx="114" cy="30" r="2" fill="#4EA6E0"/>
      <circle cx="80" cy="6" r="2.2" fill="#FFF3C4"/><circle cx="100" cy="2" r="2.4" fill="#FFF3C4"/><circle cx="120" cy="6" r="2.2" fill="#FFF3C4"/></g>`;
    case "party": return `<g class="wear"><path d="M84 30 L102 -10 L118 30Z" fill="#7FC8F8"/><path d="M90 16 L111 16 M86 24 L116 24 M95 6 L107 6" stroke="#FF8FB0" stroke-width="4"/>
      <circle cx="102" cy="-11" r="5" fill="#FFD25A"/><path d="M84 30 Q100 36 118 30" stroke="#fff" stroke-width="2" fill="none"/></g>`;
    default: return "";
  }
}
function neckWear(id) {
  switch (id) {
    case "bandana": return `<g class="wear"><path d="M72 116 Q100 134 128 116 L100 156Z" fill="#3A7BD5"/><path d="M72 116 Q100 134 128 116 L126 122 Q100 140 74 122Z" fill="#2E62AC"/>
      ${[[92, 132], [106, 132], [99, 144], [86, 124], [114, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join("")}</g>`;
    case "scarf": return `<g class="wear"><path d="M68 112 Q100 136 132 112 L134 124 Q100 150 66 124Z" fill="#E24A5E"/><path d="M71 117 Q100 140 129 117" stroke="#fff" stroke-width="2.2" fill="none" opacity=".8"/>
      <path d="M112 130 l10 -2 l6 34 l-10 2Z" fill="#E24A5E"/><path d="M114 140 l9 -1.6 M116 150 l9 -1.6" stroke="#fff" stroke-width="2" opacity=".8"/><path d="M118 164 v5 M121 163.6 v5 M124 163 v5 M127 162.4 v5" stroke="#E24A5E" stroke-width="1.6" stroke-linecap="round"/></g>`;
    case "bow": return `<g class="wear" transform="translate(100 130)"><path d="M0 0 L-16 -9 Q-20 0 -16 9Z M0 0 L16 -9 Q20 0 16 9Z" fill="#E24A5E"/><path d="M-13 -5 l3 2 M13 -5 l-3 2" stroke="#fff" stroke-width="1.4" opacity=".7"/><rect x="-4" y="-5" width="8" height="10" rx="3" fill="#C2334A"/></g>`;
    case "sweater": return ""; // рисуется отдельно поверх туловища
    default: return "";
  }
}
const SWEATER = `<g class="wear"><path d="M64 142 C 64 118, 80 106, 100 106 C 120 106, 136 118, 136 142 C 138 160, 136 172, 134 182 L66 182 C 64 172, 62 160, 64 142Z" fill="#7C9BE6"/>
  ${[74, 82, 90, 110, 118, 126].map((x) => `<path d="M${x} 122 V180" stroke="#6A88D4" stroke-width="2"/>`).join("")}
  <path d="M100 150 C 90 140 92 132 98 134 L100 136 L102 134 C 108 132 110 140 100 150Z" fill="#FF8FB0"/>
  <path d="M66 176 H134" stroke="#5E7CC8" stroke-width="6"/><path d="M72 112 Q100 132 128 112 L130 122 Q100 142 70 122Z" fill="#5E7CC8"/></g>`;

// что сейчас надето с учётом праздника и погоды
function outfitOf(p) {
  const o = p.outfit || {};
  const cold = p.weather && (p.weather.kind === "snow" || p.weather.temp <= 0);
  return { head: p.birthday ? "party" : o.head, neck: o.neck || (cold ? "scarf" : null), letter: !!p.letter };
}

/* ---------- трюки ---------- */
const TRICK_BUBBLE = { paw: "Лапу!", spin: "Кружусь!", roll: "Опа!", fetch: "Принёс!", beg: "Служу!", dead: "Бах!", dance: "Танцую!", sing: "Ау-у-у!", bow: "Мерси!" };
const PAW_SVG = `<svg viewBox="0 0 40 30"><ellipse cx="20" cy="16" rx="17" ry="12" fill="#F2AE70"/><path d="M12 10 v10 M20 8 v12 M28 10 v10" stroke="#B8582A" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></svg>`;
const BALL_SVG = `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#E8495E"/><path d="M3 12 Q15 20 27 12" stroke="#fff" stroke-width="2.6" fill="none"/><circle cx="10" cy="9" r="3" fill="#fff" opacity=".45"/></svg>`;
function doTrick(t) {
  const stage = $("#petTap"), e = $(".pet-emoji");
  if (!e || e.dataset.trick) return;
  e.dataset.trick = t.id;
  e.classList.add("trick", `trick-${t.id}`);
  const bub = document.createElement("span"); bub.className = "bark-bubble"; bub.textContent = TRICK_BUBBLE[t.id] || "Гав!";
  stage.appendChild(bub);
  const extra = document.createElement("div"); extra.className = `trick-fx fx-${t.id}`;
  extra.innerHTML = t.id === "paw" ? PAW_SVG : t.id === "fetch" ? BALL_SVG : (t.id === "sing" || t.id === "dance") ? "<i>♪</i><i>♫</i><i>♪</i>" : t.id === "bow" ? "<i></i><i></i><i></i><i></i>" : "";
  if (extra.innerHTML) stage.appendChild(extra);
  setTimeout(() => { bub.remove(); extra.remove(); e.classList.remove("trick", `trick-${t.id}`); delete e.dataset.trick; }, 1900);
}

/* ---------- праздник нового уровня ---------- */
function showLevelUp(p) {
  const L = p.levelup;
  if (!L || p.stage === "egg" || $(".lvlup")) return;
  const chips = (title, items, fmt) => items.length ? `<div class="lv-sec"><b>${title}</b><div class="lv-chips">${items.map(fmt).join("")}</div></div>` : "";
  const box = document.createElement("div");
  box.className = "lvlup";
  box.innerHTML = `
    <div class="lv-card">
      <div class="lv-conf">${"<i></i>".repeat(24)}</div>
      <div class="lv-rays"></div>
      <div class="lv-dog">${petFigure(p)}</div>
      <div class="lv-badge">${ICO.xp}<span>${L.to}</span></div>
      <h2>Уровень ${L.to}!</h2>
      <p>${esc(p.name)} ${L.to - L.from > 1 ? `вырос сразу на ${L.to - L.from} ${plural(L.to - L.from, "уровень", "уровня", "уровней")}` : "вырос"}. Вот что открылось:</p>
      ${chips("Новые трюки", L.tricks, (t) => `<span>${esc(t.name)}</span>`)}
      ${chips("В гардеробе", L.clothes, (c) => `<span>${esc(c.name)}</span>`)}
      ${chips("Новые комнаты", L.rooms, (r) => `<span>${esc(r.name)}</span>`)}
      ${!L.tricks.length && !L.clothes.length && !L.rooms.length ? `<p class="muted">Новый трюк и вещи ждут на следующих уровнях</p>` : ""}
      <button class="lv-ok">Ура!</button>
      ${L.tricks.length ? `<small class="muted">Нажми на него в комнате — покажет трюки</small>` : ""}
    </div>`;
  document.body.appendChild(box);
  success();
  box.querySelector(".lv-ok").onclick = async () => {
    box.classList.add("out"); setTimeout(() => box.remove(), 300);
    try { await api("/api/kulik/seen", { method: "POST" }); } catch {}
    p.levelup = null;
  };
}

/* ---------- через Кулика, гардероб, дневник, альбом ---------- */
const CARRY_ICO = {
  kiss: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12c2-3 5-4 8-2 3-2 6-1 8 2-2 3-5 5-8 5s-6-2-8-5z"/><path d="M4 12h16"/></svg>`,
  miss: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 15c1.2-1.2 2.5-1.6 4-1.6s2.8.4 4 1.6M9 9.5h.01M15 9.5h.01"/><path d="M16.5 11.5c.6 1 .6 1.8 0 2.4"/></svg>`,
  hug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 20c0-4 2.5-7 5-7s3 1.5 4 3c1-1.5 1.5-3 4-3s5 3 5 7"/></svg>`,
  love: ICO_HEART_SM(),
};
function ICO_HEART_SM() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.5c0 5.8-7.5 10.4-7.5 10.4z"/></svg>`; }
const CARRY_LABEL = { kiss: "Поцелуй", miss: "Скучаю", hug: "Обнимашки", love: "Люблю" };

function carryHtml(p) {
  return `<h2>${esc(p.name)} — почтальон <small>передаст за вас</small></h2>
    <div class="carry">${Object.keys(CARRY_LABEL).map((k) => `<button data-carry="${k}"><span>${CARRY_ICO[k]}</span>${CARRY_LABEL[k]}</button>`).join("")}</div>`;
}
function wardrobeHtml(p) {
  const o = p.outfit || {};
  const row = (slot, title) => {
    const items = p.wardrobe.filter((w) => w.slot === slot);
    return `<div class="wr-row"><span class="wr-t">${title}</span><div class="wr-items">
      <button class="wr-it ${!o[slot] ? "on" : ""}" data-wear="${slot}:">Ничего</button>
      ${items.map((w) => `<button class="wr-it ${o[slot] === w.id ? "on" : ""} ${w.unlocked ? "" : "locked"}" data-wear="${slot}:${w.id}" ${w.unlocked ? "" : `data-lock="${w.level}"`}>${w.unlocked ? "" : LOCK}${esc(w.name)}${w.unlocked ? "" : `<small>ур. ${w.level}</small>`}</button>`).join("")}
    </div></div>`;
  };
  const hint = [p.birthday ? "сегодня праздник — колпак сверху" : "", outfitOf(p).neck === "scarf" && !o.neck ? "на улице холодно — сам надел шарф" : ""].filter(Boolean).join(", ");
  return `<h2>Гардероб</h2><div class="card wardrobe">${row("head", "На голову")}${row("neck", "На шею")}${hint ? `<p class="muted wr-hint">${hint}</p>` : ""}</div>`;
}
const dayLabel = (iso, today) => {
  const diff = Math.round((Date.parse(today) - Date.parse(iso)) / 864e5);
  return diff === 0 ? "Сегодня" : diff === 1 ? "Вчера" : fmtDate(iso);
};
async function fillDiary(p) {
  const box = $("#diary");
  if (!box) return;
  try {
    const d = await api("/api/kulik/diary");
    if (!$("#diary")) return;
    const today = d.days[0]?.date;
    const html = (list) => list.map((x) => `<div class="dy"><span class="dy-d">${dayLabel(x.date, today)}</span><p>${esc(x.text)}</p></div>`).join("");
    box.innerHTML = d.days.length ? html(d.days.slice(0, 2)) + (d.days.length > 2 ? `<button class="dy-more">Ещё ${d.days.length - 2} ${plural(d.days.length - 2, "день", "дня", "дней")}</button>` : "") : `<p class="muted">Пока пусто</p>`;
    box.querySelector(".dy-more")?.addEventListener("click", () => { haptic(); box.innerHTML = html(d.days); });
  } catch { box.innerHTML = `<p class="muted">Не загрузилось</p>`; }
}
async function openAlbum(p) {
  const d = await api("/api/kulik/album");
  const cards = d.levels.slice().reverse().map((l, i) => `
    <div class="pol" style="--r:${(i % 2 ? 1.6 : -1.4)}deg">
      <div class="pol-ph lv${l.level}"><div class="pol-dog sg-${l.stage}">${dogSvg({ head: l.cloth_id && ["cap", "glasses", "santa", "flower", "crown"].includes(l.cloth_id) ? l.cloth_id : null,
        neck: l.cloth_id && ["bandana", "scarf", "bow", "sweater"].includes(l.cloth_id) ? l.cloth_id : null })}</div></div>
      <b>Уровень ${l.level}</b>
      <small>${l.date ? fmtDate(l.date) : "ещё до альбома"}</small>
      ${l.trick ? `<small class="pol-t">научился: ${esc(l.trick)}</small>` : l.level === 1 ? `<small class="pol-t">вылупился</small>` : ""}
    </div>`).join("");
  openInfo(`<h3>Как рос ${esc(d.name || p.name)}</h3><div class="album">${cards}</div>`);
}

/* ---------- погода и праздник в комнате ---------- */
function windowWeather(w) {
  if (!w) return "";
  const flakes = (n, cls, mk) => Array.from({ length: n }, (_, i) => mk(i, `${cls}" style="animation-delay:${(i * .37 % 3).toFixed(2)}s;animation-duration:${(2.4 + (i % 4) * .5).toFixed(1)}s`)).join("");
  if (w.kind === "snow") return `<g clip-path="url(#pr-win)">${flakes(18, "wx-snow", (i, c) => `<circle class="${c}" cx="${274 + (i * 23) % 82}" cy="${84 + (i * 13) % 20}" r="${1.4 + (i % 3) * .5}" fill="#fff"/>`)}</g><rect x="262" y="178" width="104" height="4" rx="2" fill="#fff"/>`;
  if (w.kind === "rain" || w.kind === "storm") return `<g clip-path="url(#pr-win)">${w.kind === "storm" ? `<rect class="wx-flash" x="272" y="90" width="84" height="86" fill="#fff"/>` : ""}${flakes(16, "wx-rain", (i, c) => `<path class="${c}" d="M${280 + (i * 19) % 76} ${86 + (i * 11) % 16} l-3 9" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round"/>`)}</g>`;
  if (w.kind === "fog") return `<rect x="272" y="90" width="84" height="86" fill="#fff" opacity=".45"/>`;
  if (w.kind === "cloud") return `<g class="cloud-slow" opacity=".95"><ellipse cx="300" cy="104" rx="16" ry="6" fill="#E6E9F2"/><ellipse cx="314" cy="99" rx="10" ry="6" fill="#E6E9F2"/><ellipse cx="338" cy="120" rx="12" ry="4.6" fill="#DADFEA"/></g>`;
  return "";
}
function bdayCake(b) {
  if (!b) return "";
  const n = b.kind === "year" ? Math.min(b.n, 5) : Math.min(b.n, 5);
  const cs = Array.from({ length: n }, (_, i) => 290 - (n - 1) * 5 + i * 10);
  return `<g class="cake"><ellipse cx="290" cy="236" rx="30" ry="5" fill="rgba(0,0,0,.18)"/><ellipse cx="290" cy="232" rx="28" ry="5" fill="#fff"/>
    <rect x="268" y="206" width="44" height="26" rx="5" fill="#FF9DB4"/><rect x="276" y="192" width="28" height="16" rx="4" fill="#FFC6D3"/>
    <path d="M268 214 q5 5 11 0 t11 0 t11 0 t11 0" stroke="#fff" stroke-width="3" fill="none"/><path d="M276 199 q3.5 4 7 0 t7 0 t7 0 t7 0" stroke="#fff" stroke-width="2.4" fill="none"/>
    ${cs.map((x) => `<rect x="${x - 1.3}" y="182" width="2.6" height="10" fill="#7FC8F8"/><ellipse class="flame" cx="${x}" cy="179" rx="2.4" ry="3.8" fill="#FFC94D"/>`).join("")}
    ${[[256, 226, "#FFD25A"], [322, 228, "#7FC8F8"], [262, 238, "#9BE08A"], [318, 240, "#C9A7FF"]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="4" height="6" rx="1" fill="${c}" transform="rotate(30 ${x} ${y})"/>`).join("")}</g>`;
}

/* ---------- комната в карточке питомца ---------- */
function roomMode(h = new Date().getHours()) {
  return h >= 20 || h < 7 ? "night" : h >= 17 ? "evening" : "day";
}
// где спит сегодня: одна ночь в будке, другая на коврике (одинаково на обоих телефонах)
function sleepSpot(p) {
  if (p.kind !== "dog") return "floor";
  const d = new Date(Date.now() - 7 * 3600e3);             // ночь относится к вечеру, с которого началась
  const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return n % 2 ? "house" : "floor";
}

function dogSleepSvg(v = {}) {
  const P = { ...DOG_DEFAULT, ...v }, I = "dsl";
  if (P.breed === "dachshund") return taxSleepSvg(P);
  const fur = (x, y, dx, dy, op = .32) => `<path d="M${x} ${y} q${dx / 2} ${dy / 2 - 2} ${dx} ${dy}" stroke="${P.shade}" stroke-opacity="${op}" stroke-width="1.3" stroke-linecap="round" fill="none"/>`;
  return `
  <svg class="dog-sleep" viewBox="0 0 240 150" aria-label="собачка спит">
    <defs>
      <radialGradient id="${I}-fur" cx=".42" cy=".22" r=".9"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset=".55" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></radialGradient>
      <radialGradient id="${I}-hip" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset="1" stop-color="${P.fur[1]}"/></radialGradient>
      <radialGradient id="${I}-cream" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${P.cream[0]}"/><stop offset="1" stop-color="${P.cream[1]}"/></radialGradient>
      <linearGradient id="${I}-ear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.ear[0]}"/><stop offset="1" stop-color="${P.ear[1]}"/></linearGradient>
      <radialGradient id="${I}-sh"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="124" cy="138" rx="104" ry="10" fill="url(#${I}-sh)"/>
    <g class="ds-breath">
      <!-- туловище: спина дугой -->
      <path d="M58,132 C46,104 66,60 118,56 C168,52 206,78 210,108 C212,124 204,134 190,136 L70,136 C64,136 60,134 58,132Z" fill="url(#${I}-fur)"/>
      <path d="M76,78 C96,62 140,58 172,70" stroke="#fff" stroke-opacity=".28" stroke-width="5" stroke-linecap="round" fill="none"/>
      ${fur(96, 72, 6, 12)}${fur(120, 66, 4, 13)}${fur(146, 68, 2, 13)}${fur(170, 76, -1, 12)}${fur(190, 90, -3, 11)}
      <!-- бедро задней лапы -->
      <ellipse cx="166" cy="110" rx="36" ry="27" fill="url(#${I}-hip)"/>
      <path d="M138,98 C146,86 168,82 186,90" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round" fill="none"/>
      ${fur(150, 120, 4, 8, .28)}${fur(170, 122, 3, 8, .28)}
      <!-- задняя лапка, поджата -->
      <path d="M140,134 C132,134 126,130 128,124 C130,118 150,118 162,122 C170,126 168,134 160,135Z" fill="url(#${I}-cream)"/>
      <path d="M134,128 v4 M140,127 v6 M146,127 v6" stroke="#C9A67E" stroke-width="1" stroke-linecap="round"/>
      <!-- светлый живот/грудь -->
      <path d="M70,134 C72,118 90,110 108,114 C122,118 128,128 124,136 L72,136Z" fill="url(#${I}-cream)"/>
      <!-- пушистый хвост загнут на спину -->
      <g class="ds-tail">
        <path d="M200,104 C214,100 226,86 222,68 C219,58 208,56 204,64 C210,74 206,88 194,94Z" fill="url(#${I}-fur)"/>
        <path d="M222,68 C219,58 208,56 204,64 C206,68 208,73 208,78 C216,78 224,74 222,68Z" fill="url(#${I}-cream)"/>
        ${fur(212, 88, 6, -8, .35)}${fur(206, 96, 8, -6, .35)}
      </g>
    </g>
    <g class="ds-head">
      <!-- передние лапы под мордой -->
      <path d="M16,132 C14,124 34,122 58,124 C72,126 74,136 62,138 L24,138 C18,138 16,136 16,132Z" fill="url(#${I}-cream)"/>
      <path d="M24,128 v6 M31,127 v7 M38,127 v7" stroke="#C9A67E" stroke-width="1.1" stroke-linecap="round"/>
      <!-- ухо -->
      <path d="M92,86 C98,70 108,60 118,58 C120,70 114,82 104,92Z" fill="${P.ear[1]}"/>
      <g class="ds-ear-l"><path d="M80,84 C82,64 92,50 104,46 C108,60 104,76 96,90Z" fill="url(#${I}-ear)"/><path d="M86,82 C88,68 94,58 101,54 C103,64 100,74 94,84Z" fill="${P.earInner}"/></g>
      <!-- голова в профиль, лежит на лапах -->
      <path d="M100,96 C102,116 88,130 66,130 C52,130 40,128 30,124 C20,120 18,112 24,108 C30,104 40,100 46,92 C54,80 68,74 82,76 C94,78 100,86 100,96Z" fill="url(#${I}-fur)"/>
      <path d="M30,124 C24,120 22,113 26,110 C34,106 46,108 56,112 C66,116 72,124 66,130 C52,130 40,128 30,124Z" fill="url(#${I}-cream)"/>
      <path d="M48,92 C54,86 62,84 70,86 C64,90 58,96 54,102Z" fill="url(#${I}-cream)" opacity=".9"/>
      <path d="M58,80 C68,76 84,76 94,84" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- нос -->
      <path d="M18,110 C16,104 24,102 28,106 C30,109 28,113 24,113 C21,113 19,112 18,110Z" fill="#2a1a17"/>
      <ellipse cx="22" cy="106.4" rx="2.4" ry="1.2" fill="#fff" opacity=".4"/>
      <path d="M26,116 q8,4 16,2" stroke="#2A1A16" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <!-- закрытый глаз -->
      <path d="M58,98 Q65,104 72,99" stroke="#2A1A16" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <path d="M57,98 l-2.6,-1.4 M60.5,101 l-2,1.6" stroke="#2A1A16" stroke-width="1.2" stroke-linecap="round"/>
      <ellipse cx="64" cy="110" rx="7" ry="3.6" fill="#FF8FB0" opacity=".42"/>
      <circle cx="38" cy="114" r=".9" fill="#7B5A44" opacity=".5"/><circle cx="43" cy="116" r=".9" fill="#7B5A44" opacity=".5"/><circle cx="40" cy="119" r=".9" fill="#7B5A44" opacity=".5"/>
      <!-- ошейник -->
      <path d="M96,86 C102,100 102,114 94,126" stroke="${P.collar[0]}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="100" cy="112" r="3.4" fill="#FFD25A" stroke="#C99416" stroke-width="1"/>
    </g>
  </svg>`;
}

function petRoomSvg(p, mode, spot) {
  const N = mode === "night", E = mode === "evening";
  const C = N ? { w1: "#3E3870", w2: "#2E2A58", st: .05, wn: "#3A3466", wl: "#4E4787", bb: "#5A5390", f1: "#6F5049", f2: "#4B3434", pl: "rgba(0,0,0,.28)", rug: "#9A5F86", rugB: "#C27BA6" }
    : E ? { w1: "#F6CDB8", w2: "#E9AE98", st: .2, wn: "#EDBBA6", wl: "#DC9A84", bb: "#FBE6DA", f1: "#CB8F5C", f2: "#A66D44", pl: "rgba(90,45,20,.24)", rug: "#F0A9B9", rugB: "#E27E9A" }
    : { w1: "#FFEDE3", w2: "#F8D2C0", st: .3, wn: "#F8DCCB", wl: "#EBBBA5", bb: "#FFF7F0", f1: "#DDAA74", f2: "#BC8452", pl: "rgba(110,60,25,.22)", rug: "#F7C0CC", rugB: "#EE8FA8" };
  const wk = p.weather?.kind, grey = ["snow", "rain", "storm", "fog", "cloud"].includes(wk);
  const sky = N ? (grey ? ["#1E2340", "#3A3F66"] : ["#121A4A", "#343C86"]) : E ? (grey ? ["#8C86A8", "#C9A79E"] : ["#7A78C6", "#FFB48E"]) : grey ? (wk === "cloud" ? ["#A9C3DE", "#E3ECF5"] : ["#AEB8C8", "#DCE2EA"]) : ["#86C7FF", "#E2F5FF"];
  const win = `
    <rect x="266" y="84" width="96" height="98" rx="5" fill="#FBF3EA" stroke="#D9C2AE" stroke-width="1.4"/>
    <rect x="272" y="90" width="84" height="86" rx="2" fill="url(#pr-sky)"/>
    ${N && !grey ? `${[[284, 104], [300, 132], [322, 100], [346, 120], [292, 160], [338, 150]].map(([x, y], i) => `<circle class="tw" style="animation-delay:${i * .45}s" cx="${x}" cy="${y}" r="1.2" fill="#fff"/>`).join("")}
           <g transform="translate(334 110)" opacity="${grey ? 0 : 1}"><circle r="16" fill="#FFF3C4" opacity=".14"/><path d="M0 -8A8 8 0 1 0 8 3.4A6.4 6.4 0 1 1 0 -8Z" fill="#FFF3C4"/></g>`
      : E ? `<circle cx="300" cy="160" r="20" fill="#FFE1A0" opacity=".35"/><circle cx="300" cy="160" r="11" fill="#FFD27A"/>`
      : grey ? "" : `<circle cx="336" cy="108" r="8" fill="#FFE27A"/><g class="cloud-slow"><ellipse cx="296" cy="116" rx="13" ry="5" fill="#fff"/><ellipse cx="306" cy="111" rx="8" ry="5.4" fill="#fff"/></g>`}
    <path d="M272,176 L282,158 L292,166 L304,150 L318,166 L330,156 L344,168 L356,160 V176Z" fill="${N ? "#1B2152" : E ? "#B07AA0" : "#9ED08C"}"/>
    ${wk === "snow" ? `<path d="M272,176 L282,158 L292,166 L304,150 L318,166 L330,156 L344,168 L356,160 V176Z" fill="#F4F7FB"/>` : ""}
    ${N ? `<g fill="#FFD98A">${[[286, 168], [298, 162], [318, 170], [334, 164], [348, 170]].map(([x, y]) => `<rect x="${x}" y="${y}" width="2.4" height="2.4"/>`).join("")}</g>` : ""}
    <path d="M276,172 L304,94" stroke="#fff" stroke-opacity=".12" stroke-width="10"/>
    ${windowWeather(p.weather)}
    <rect x="312.5" y="90" width="3" height="86" fill="#FBF3EA"/><rect x="272" y="131.5" width="84" height="3" fill="#FBF3EA"/>
    <rect x="260" y="180" width="108" height="6" rx="2" fill="#F4E7D8" stroke="#D9C2AE" stroke-width=".8"/>
    <g><rect x="336" y="168" width="14" height="12" rx="2" fill="#C97B4A"/><path d="M343,168 q-7,-9 -3,-16 q4,6 3,16 M343,168 q7,-8 4,-15 q-5,5 -4,15" fill="#58B573"/></g>
    <path d="M256,78 h9 q7,46 2,108 h-11Z" fill="#F4A6B8"/><path d="M372,78 h-9 q-7,46 -2,108 h11Z" fill="#F4A6B8"/>
    <path d="M260,80 q3,50 0,104 M368,80 q-3,50 0,104" stroke="#E08AA0" stroke-width="1.2" fill="none"/>
    <rect x="250" y="74" width="128" height="4" rx="2" fill="#8A5A3C"/>`;
  const beam = N ? `<path d="M272,176 L356,176 L300,300 L170,300Z" fill="#AFC4FF" opacity=".07"/>`
    : `<path d="M272,176 L356,176 L320,300 L176,300Z" fill="${E ? "#FFB070" : "#FFFFFF"}" opacity="${E ? .16 : .2}"/>`;
  const lampOn = N || E;
  const lamp = `
    ${lampOn ? `<circle class="pr-glow" cx="384" cy="120" r="${N ? 120 : 90}" fill="url(#pr-glow)"/>` : ""}
    <ellipse cx="384" cy="226" rx="12" ry="3.4" fill="#3F322D"/><rect x="382.6" y="128" width="2.8" height="98" fill="#6B5A52"/>
    <path d="M370,128 L398,128 L391,104 L377,104Z" fill="${lampOn ? "#FFE6A6" : "#F3D9B4"}"/><path d="M370,128 L398,128 L395,122 L373,122Z" fill="${lampOn ? "#F7C96B" : "#E2C29A"}"/>`;
  const lights = (N || E) ? `<path d="M0,22 Q120,46 240,20" stroke="#4a3a40" stroke-width="1" fill="none"/>${Array.from({ length: 10 }, (_, i) => { const t = (i + .5) / 10, x = 240 * t, y = (1 - t) * (1 - t) * 22 + 2 * t * (1 - t) * 46 + t * t * 20; return `<circle class="tw" style="animation-delay:${(i * .37) % 2}s" cx="${x.toFixed(1)}" cy="${(y + 3).toFixed(1)}" r="2.6" fill="${["#FFD98A", "#FF9DB4", "#FFE9B8"][i % 3]}"/>`; }).join("")}` : "";
  const frames = `
    <path d="M48,40 L36,46 M48,40 L60,46" stroke="#8A5A3C" stroke-width=".8"/>
    <rect x="24" y="46" width="48" height="40" rx="2" fill="#FFF6EE" stroke="#A9744F" stroke-width="3"/><path d="M48 76 C30 64 36 52 44 56 C46 57 47 58 48 60 C49 58 50 57 52 56 C60 52 66 64 48 76Z" fill="#FF8FA8"/>
    <rect x="80" y="54" width="30" height="34" rx="2" fill="#FFF6EE" stroke="#A9744F" stroke-width="3"/><circle cx="102" cy="64" r="4" fill="#FFC94D"/><path d="M83,85 q7,-12 13,-6 t11,-4 V85Z" fill="#9AD08A"/>`;
  const name = esc((p.name || "").slice(0, 9).toUpperCase());
  const doghouse = p.kind !== "dog" ? `
    <ellipse cx="64" cy="232" rx="50" ry="9" fill="rgba(0,0,0,.18)"/><ellipse cx="64" cy="226" rx="46" ry="12" fill="#B47FC4"/><ellipse cx="64" cy="222" rx="34" ry="7" fill="#D7B0E3"/>` : `
    <ellipse cx="62" cy="230" rx="62" ry="8" fill="rgba(0,0,0,.2)"/>
    <rect x="14" y="150" width="96" height="78" fill="url(#pr-wood)"/>
    ${[166, 182, 198, 214].map((y) => `<path d="M14,${y} H110" stroke="rgba(80,40,12,.3)" stroke-width="1.2"/>`).join("")}
    ${[[40, 150, 166], [84, 150, 166], [30, 166, 182], [94, 166, 182], [44, 182, 198], [80, 182, 198], [26, 198, 214], [98, 198, 214], [52, 214, 228]].map(([x, a, b]) => `<path d="M${x},${a} V${b}" stroke="rgba(80,40,12,.22)"/>`).join("")}
    <rect x="12" y="150" width="6" height="78" fill="#8E4F25"/><rect x="106" y="150" width="6" height="78" fill="#8E4F25"/>
    <path d="M0,160 L62,104 L124,160 L116,166 L62,118 L8,166Z" fill="#B8453A"/>
    <path d="M0,160 L62,104 L62,116 L8,166Z" fill="#fff" opacity=".12"/>
    <path d="M14,154 L62,111 M26,152 L62,120 M110,154 L62,111 M98,152 L62,120" stroke="#8F3029" stroke-width="1" opacity=".55"/>
    <path d="M0,160 L62,104 L124,160" stroke="#8F3029" stroke-width="3" fill="none" stroke-linejoin="round"/>
    <path d="M36,228 V196 a26,26 0 0 1 52,0 V228Z" fill="url(#pr-door)"/>
    <path d="M36,228 V196 a26,26 0 0 1 52,0 V228" stroke="#7A4524" stroke-width="4" fill="none"/>
    ${name ? `<rect x="38" y="152" width="48" height="14" rx="3" fill="#F6E2C6" stroke="#8E4F25" stroke-width="1.4"/><text x="62" y="162.6" text-anchor="middle" font-size="8.6" font-weight="800" fill="#8E4F25" font-family="Nunito, system-ui, sans-serif">${name}</text>` : ""}
    <g transform="translate(62 104)"><path d="M-9,-3 a3.2,3.2 0 1 1 3,-3.2 h12 a3.2,3.2 0 1 1 3,3.2 a3.2,3.2 0 1 1 -3,3.2 h-12 a3.2,3.2 0 1 1 -3,-3.2Z" fill="#F6E2C6" stroke="#8E4F25" stroke-width="1"/></g>
    ${(N || E) ? [[8, 158], [20, 147], [32, 136], [44, 125], [56, 114], [68, 114], [80, 125], [92, 136], [104, 147], [116, 158]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5" fill="${["#FFD98A", "#FF9DB4", "#FFE9B8"][i % 3]}" opacity=".22"/><circle class="tw" style="animation-delay:${(i * .37) % 2}s" cx="${x}" cy="${y}" r="2.4" fill="${["#FFD98A", "#FF9DB4", "#FFE9B8"][i % 3]}"/>`).join("") : ""}
    ${spot === "house" ? houseSleeper(p) : ""}`;
  const toys = `
    <ellipse cx="128" cy="240" rx="9" ry="2.4" fill="rgba(0,0,0,.18)"/><circle cx="128" cy="232" r="8" fill="#E8495E"/><path d="M120.6,229 Q128,234 135.4,229" stroke="#fff" stroke-width="2" fill="none"/><circle cx="125" cy="228" r="2" fill="#fff" opacity=".45"/>
    <g transform="translate(336 238)"><ellipse cx="0" cy="8" rx="20" ry="3.4" fill="rgba(0,0,0,.18)"/><path d="M-18,-2 h36 l-4,10 h-28z" fill="#5E9BE0"/><ellipse cx="0" cy="-2" rx="18" ry="4.6" fill="#7FB4EE"/><ellipse cx="0" cy="-2" rx="13.4" ry="2.8" fill="#B07A4A"/>
      <circle cx="-5" cy="-3.4" r="2.4" fill="#8E5A36"/><circle cx="2" cy="-4" r="2.4" fill="#7B4A2B"/><circle cx="7" cy="-2.6" r="2.2" fill="#9A6038"/></g>
    <g transform="translate(300 258) rotate(-14)"><path d="M-12,-2.6 a3.6,3.6 0 1 1 3.4,-3.6 h17.2 a3.6,3.6 0 1 1 3.4,3.6 a3.6,3.6 0 1 1 -3.4,3.6 h-17.2 a3.6,3.6 0 1 1 -3.4,-3.6Z" fill="#FFF3E2" stroke="#D9B48A" stroke-width="1"/></g>`;
  return `
  <svg class="pr-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="pr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.w1}"/><stop offset="1" stop-color="${C.w2}"/></linearGradient>
      <linearGradient id="pr-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.f1}"/><stop offset="1" stop-color="${C.f2}"/></linearGradient>
      <pattern id="pr-stripe" width="26" height="10" patternUnits="userSpaceOnUse"><rect width="13" height="10" fill="#fff" opacity="${C.st}"/></pattern>
      <linearGradient id="pr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
      <linearGradient id="pr-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B8723C"/><stop offset=".5" stop-color="#D58F55"/><stop offset="1" stop-color="#A9622F"/></linearGradient>
      <radialGradient id="pr-door" cx=".5" cy=".7" r=".8"><stop offset="0" stop-color="#4A2E1E"/><stop offset="1" stop-color="#1C110B"/></radialGradient>
      <radialGradient id="pr-glow"><stop offset="0" stop-color="#FFE3A0" stop-opacity="${N ? .55 : .4}"/><stop offset="1" stop-color="#FFE3A0" stop-opacity="0"/></radialGradient>
      <radialGradient id="pr-vig" cx=".5" cy=".6" r=".8"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${N ? .35 : .14}"/></radialGradient>
      <clipPath id="pr-win"><rect x="272" y="90" width="84" height="86"/></clipPath>
      <linearGradient id="pr-fs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="400" height="300" fill="${C.f2}"/>
    ${[256, 284].map((y) => `<path d="M0,${y} H400" stroke="${C.pl}"/>`).join("")}${[[70, 246, 266], [200, 246, 266], [330, 246, 266], [130, 266, 300], [260, 266, 300]].map(([x, a, b]) => `<path d="M${x},${a} V${b}" stroke="${C.pl}"/>`).join("")}
    <g transform="translate(0 -36)">
    <rect width="400" height="208" fill="url(#pr-wall)"/><rect width="400" height="150" fill="url(#pr-stripe)"/>
    <rect y="150" width="400" height="56" fill="${C.wn}"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${4 + i * 29}" y="160" width="22" height="38" rx="2" fill="none" stroke="${C.wl}" stroke-width="1.2"/>`).join("")}
    <rect y="148" width="400" height="5" fill="${C.bb}"/><rect y="200" width="400" height="8" fill="${C.bb}"/>
    ${win}
    <rect y="206" width="400" height="94" fill="url(#pr-floor)"/>
    ${[220, 236, 256, 280].map((y) => `<path d="M0,${y} H400" stroke="${C.pl}"/>`).join("")}
    ${[[60, 206, 220], [180, 206, 220], [300, 206, 220], [120, 220, 236], [240, 220, 236], [360, 220, 236], [30, 236, 256], [160, 236, 256], [290, 236, 256], [90, 256, 280], [220, 256, 280], [350, 256, 280], [150, 280, 300], [280, 280, 300]].map(([x, a, b]) => `<path d="M${x},${a} V${b}" stroke="${C.pl}"/>`).join("")}
    <rect y="206" width="400" height="16" fill="url(#pr-fs)"/>
    ${beam}${lamp}
    <ellipse cx="204" cy="252" rx="128" ry="25" fill="${C.rug}"/><ellipse cx="204" cy="252" rx="128" ry="25" fill="none" stroke="${C.rugB}" stroke-width="3"/>
    <ellipse cx="204" cy="252" rx="104" ry="19" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="5 5"/>
    ${doghouse}${toys}${bdayCake(p.birthday)}
    </g>
    <rect width="400" height="300" fill="url(#pr-vig)"/>
  </svg>`;
}

function houseSleeper(p) {
  const P = DOG_DEFAULT;
  return `
    <g class="house-sleeper">
      <ellipse cx="62" cy="226" rx="24" ry="4" fill="#000" opacity=".35"/>
${P.breed === "dachshund" ? taxHouseHead(P) : `      <g class="hs-head">
        <path d="M47,206 C40,198 38,190 40,184 C47,186 53,192 55,198Z M77,206 C84,198 86,190 84,184 C77,186 71,192 69,198Z" fill="${P.ear[1]}"/>
        <path d="M48,203 C44,197 43,192 44,189 C48,191 51,194 53,198Z M76,203 C80,197 81,192 80,189 C76,191 73,194 71,198Z" fill="${P.earInner}"/>
        <ellipse cx="62" cy="210" rx="19" ry="15.5" fill="${P.fur[1]}"/>
        <ellipse cx="58" cy="203" rx="9" ry="5" fill="${P.fur[0]}" opacity=".6"/>
        <path d="M62,195 C59,200 59.6,206 62,211 C64.4,206 65,200 62,195Z" fill="${P.cream[0]}"/>
        <ellipse cx="62" cy="217" rx="11" ry="8" fill="${P.cream[0]}"/>
        <path d="M51,207 Q55,211 59,207 M65,207 Q69,211 73,207" stroke="#2A1A16" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        <path d="M58,213 C58,210.4 66,210.4 66,213 C66,215 64,216.4 62,216.4 C60,216.4 58,215 58,213Z" fill="#2a1a17"/>
        <ellipse cx="50" cy="214" rx="3.4" ry="2" fill="#FF8FB0" opacity=".45"/><ellipse cx="74" cy="214" rx="3.4" ry="2" fill="#FF8FB0" opacity=".45"/>
      </g>`}
      <ellipse cx="53" cy="226" rx="8" ry="4" fill="${P.cream[0]}"/><ellipse cx="71" cy="226" rx="8" ry="4" fill="${P.cream[0]}"/>
      <path d="M50,224 v3.4 M53,223.6 v4 M56,224 v3.4 M68,224 v3.4 M71,223.6 v4 M74,224 v3.4" stroke="#C9A67E" stroke-width=".9" stroke-linecap="round"/>
      <g class="zs" fill="#fff" font-family="Nunito, system-ui, sans-serif" font-weight="800">
        <text x="88" y="186" font-size="10">z</text><text x="96" y="176" font-size="13">z</text><text x="106" y="164" font-size="17">Z</text>
      </g>
    </g>`;
}

const DOG_DEFAULT = {   // такса (рыжая); окрас можно поменять в TAX_COLORS
  id: "dg", breed: "dachshund", fur: ["#E3904F", "#BC5E2C", "#7C3717"], cream: ["#F2AE70", "#D4834A"], ear: ["#A9522A", "#62260E"],
  iris: ["#C98A45", "#7A4219", "#3C1E0C"], shade: "#6A2A10", brow: "#5A240C", browSpot: null, collar: ["#2FB67C", "#8FE6BF"],
  ears: "floppy", mask: null, spots: [], earInner: "#C8703C",
};
const TAX_COLORS = {
  red: { fur: ["#E3904F", "#BC5E2C", "#7C3717"], cream: ["#F2AE70", "#D4834A"], ear: ["#A9522A", "#62260E"], browSpot: null, shade: "#6A2A10", earInner: "#C8703C" },
  blacktan: { fur: ["#55443F", "#2E2320", "#141010"], cream: ["#E0A062", "#B8733A"], ear: ["#2E2320", "#0F0B0A"], browSpot: "#D99254", shade: "#000", earInner: "#3A2C28" },
};

// такса сидит, вид спереди. Группы и центры совпадают с корги, чтобы работали все анимации.
const LETTER_SVG = `<g class="letter-mouth"><g transform="rotate(-9 100 120)"><rect x="82" y="108" width="36" height="25" rx="3.5" fill="#FFF8EE" stroke="#E3A9B8" stroke-width="1.6"/><path d="M83 110 L100 123 L117 110" stroke="#E3A9B8" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M100 129 c-4.4-3.4-5.4-5.8-3.2-7.4 1.4-1 2.7-.4 3.2.6.5-1 1.8-1.6 3.2-.6 2.2 1.6 1.2 4-3.2 7.4z" fill="#F0506E"/></g>
  <path d="M80 114 Q84 118 88 115 M112 116 Q116 118 120 113" stroke="#2A1A16" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>`;
function taxSvg(P) {
  const I = P.id, ink = "#2A1A16";
  return `
  <svg class="dog tax" viewBox="0 0 200 220" aria-label="такса">
    <defs>
      <radialGradient id="${I}-fur" cx=".4" cy=".28" r=".85"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset=".55" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></radialGradient>
      <linearGradient id="${I}-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.fur[2]}"/><stop offset=".42" stop-color="${P.fur[0]}"/><stop offset=".7" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></linearGradient>
      <linearGradient id="${I}-leg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.fur[2]}"/><stop offset=".45" stop-color="${P.fur[0]}"/><stop offset="1" stop-color="${P.fur[2]}"/></linearGradient>
      <radialGradient id="${I}-cream" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${P.cream[0]}"/><stop offset="1" stop-color="${P.cream[1]}"/></radialGradient>
      <linearGradient id="${I}-ear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.ear[0]}"/><stop offset="1" stop-color="${P.ear[1]}"/></linearGradient>
      <radialGradient id="${I}-nose" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#5A4540"/><stop offset="1" stop-color="#1B1210"/></radialGradient>
      <radialGradient id="${I}-iris" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${P.iris[0]}"/><stop offset=".6" stop-color="${P.iris[1]}"/><stop offset="1" stop-color="${P.iris[2]}"/></radialGradient>
      <radialGradient id="${I}-shadow"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse class="dog-shadow" cx="100" cy="207" rx="64" ry="9" fill="url(#${I}-shadow)"/>

    <g class="tail">
      <path d="M128 190 C 162 190, 178 164, 174 130 C 173 124, 167 124, 167 130 C 168 160, 156 178, 126 180Z" fill="url(#${I}-fur)"/>
      <path d="M172 138 C 172 154, 166 170, 150 180" stroke="#fff" stroke-opacity=".2" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>

    <g class="body">
      <ellipse cx="62" cy="190" rx="22" ry="15" fill="url(#${I}-fur)"/>
      <ellipse cx="138" cy="190" rx="22" ry="15" fill="url(#${I}-fur)"/>
      <ellipse cx="44" cy="205" rx="12" ry="5" fill="url(#${I}-cream)"/><ellipse cx="156" cy="205" rx="12" ry="5" fill="url(#${I}-cream)"/>
      <path d="M100 98 C 132 98, 142 138, 138 176 C 135 200, 65 200, 62 176 C 58 138, 68 98, 100 98Z" fill="url(#${I}-body)"/>
      <path d="M74 120 C 72 140, 72 158, 76 176" stroke="#fff" stroke-opacity=".22" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M100 112 C 86 116, 82 146, 88 180 C 94 188, 106 188, 112 180 C 118 146, 114 116, 100 112Z" fill="url(#${I}-cream)"/>
      ${P.neck === "sweater" ? SWEATER : ""}
      <path d="M85 170 C 81 184, 81 194, 84 204 H 98 C 99 194, 99 184, 97 170Z" fill="url(#${I}-leg)"/>
      <path d="M115 170 C 119 184, 119 194, 116 204 H 102 C 101 194, 101 184, 103 170Z" fill="url(#${I}-leg)"/>
      <ellipse cx="88" cy="205" rx="11" ry="5.4" fill="url(#${I}-cream)"/><ellipse cx="112" cy="205" rx="11" ry="5.4" fill="url(#${I}-cream)"/>
      <path d="M84 202 v5 M89 201 v6 M94 202 v5 M106 202 v5 M111 201 v6 M116 202 v5" stroke="${P.shade}" stroke-opacity=".35" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M76 120 Q100 138 124 120" stroke="${P.collar[0]}" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M76 117.6 Q100 135.6 124 117.6" stroke="${P.collar[1]}" stroke-opacity=".7" stroke-width="2" stroke-linecap="round" fill="none"/>
      <g class="tag"><circle cx="100" cy="135" r="6" fill="#FFD25A" stroke="#C99416" stroke-width="1.3"/><circle cx="98" cy="133" r="1.9" fill="#fff" opacity=".7"/></g>
      ${neckWear(P.neck)}
    </g>

    <g class="bowl bowl-back">
      <ellipse cx="100" cy="190" rx="33" ry="7" fill="#9E2F57"/>
      <ellipse cx="100" cy="190.6" rx="29.5" ry="5.2" fill="#4E2616"/>
      ${[[82, 190, "#8B5A36", .9], [90, 187.5, "#A56C42", 1.1], [99, 186, "#7B4A2B", 1.3], [108, 187.5, "#9A6038", 1.5], [117, 190, "#8B5A36", 1.7], [95, 190.5, "#B27748", 1.95], [106, 190.5, "#7B4A2B", 2.15]]
        .map(([x, y, c, d]) => `<circle class="kib" style="--d:${d}s" cx="${x}" cy="${y}" r="4.2" fill="${c}"/>`).join("")}
    </g>
    <g class="head">
      <g class="ear-l">
        <path d="M68 32 C 42 34, 30 70, 33 110 C 35 134, 50 146, 61 134 C 70 122, 74 88, 74 60 C 74 46, 72 36, 68 32Z" fill="url(#${I}-ear)"/>
        <path d="M60 46 C 46 60, 40 90, 43 118" stroke="#fff" stroke-opacity=".18" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M36 120 q6 8 14 6 M34 106 q4 2 6 0" stroke="${P.shade}" stroke-opacity=".3" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      </g>
      <g class="ear-r">
        <path d="M132 32 C 158 34, 170 70, 167 110 C 165 134, 150 146, 139 134 C 130 122, 126 88, 126 60 C 126 46, 128 36, 132 32Z" fill="url(#${I}-ear)"/>
        <path d="M140 46 C 154 60, 160 90, 157 118" stroke="#fff" stroke-opacity=".18" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M164 120 q-6 8 -14 6 M166 106 q-4 2 -6 0" stroke="${P.shade}" stroke-opacity=".3" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M100 22 C 128 22, 140 40, 138 60 C 137 74, 128 82, 122 90 C 120 106, 111 118, 100 118 C 89 118, 80 106, 78 90 C 72 82, 63 74, 62 60 C 60 40, 72 22, 100 22Z" fill="url(#${I}-fur)"/>
      <path d="M78 32 C 88 26, 112 26, 122 32" stroke="#fff" stroke-opacity=".25" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M84 78 C 86 68, 94 66, 100 66 C 106 66, 114 68, 116 78 C 118 98, 110 117, 100 117 C 90 117, 82 98, 84 78Z" fill="url(#${I}-cream)"/>
      ${P.browSpot ? `<ellipse cx="84" cy="47" rx="4.6" ry="3" fill="${P.browSpot}"/><ellipse cx="116" cy="47" rx="4.6" ry="3" fill="${P.browSpot}"/>` : ""}
      ${[[92, 98], [89, 102], [94, 104], [108, 98], [111, 102], [106, 104]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".85" fill="#5B3A28" opacity=".5"/>`).join("")}
      <ellipse class="blush" cx="74" cy="80" rx="7" ry="4" fill="#FF8FB0" opacity=".3"/>
      <ellipse class="blush" cx="126" cy="80" rx="7" ry="4" fill="#FF8FB0" opacity=".3"/>
      <g class="eyes-open">
        <ellipse cx="84" cy="60" rx="7.8" ry="8.2" fill="#241410"/>
        <ellipse cx="84" cy="60.5" rx="6.2" ry="6.8" fill="url(#${I}-iris)"/>
        <circle cx="84" cy="61" r="3.3" fill="#0E0705"/>
        <circle cx="87" cy="57" r="2.4" fill="#fff"/><circle cx="81" cy="64" r="1.1" fill="#fff" opacity=".8"/>
        <path d="M75.6 55 Q84 48.6 92.4 55" stroke="${P.shade}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="116" cy="60" rx="7.8" ry="8.2" fill="#241410"/>
        <ellipse cx="116" cy="60.5" rx="6.2" ry="6.8" fill="url(#${I}-iris)"/>
        <circle cx="116" cy="61" r="3.3" fill="#0E0705"/>
        <circle cx="119" cy="57" r="2.4" fill="#fff"/><circle cx="113" cy="64" r="1.1" fill="#fff" opacity=".8"/>
        <path d="M107.6 55 Q116 48.6 124.4 55" stroke="${P.shade}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </g>
      <g class="eyes-happy" stroke="${ink}" stroke-width="3.2" stroke-linecap="round" fill="none">
        <path d="M76 62 Q84 53 92 62"/><path d="M108 62 Q116 53 124 62"/>
      </g>
      <g class="brows" stroke="${P.brow}" stroke-width="3" stroke-linecap="round">
        <path d="M75 49 L91 43"/><path d="M125 49 L109 43"/>
      </g>
      <path d="M89 96 C 89 89, 111 89, 111 96 C 111 102, 105 106, 100 106 C 95 106, 89 102, 89 96Z" fill="url(#${I}-nose)"/>
      <ellipse cx="95" cy="93" rx="4.2" ry="1.9" fill="#fff" opacity=".4"/>
      <path d="M95 99 q-1.6 1.6 0 3 M105 99 q1.6 1.6 0 3" stroke="#0A0605" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      <g class="mouth-smile" stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none">
        <path d="M100 106 L100 110"/><path d="M100 110 Q94 116 88 112"/><path d="M100 110 Q106 116 112 112"/>
      </g>
      <path class="mouth-sad" d="M91 118 Q100 110 109 118" stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path class="mouth-open" d="M90 108 Q100 105 110 108 Q108 124 100 126 Q92 124 90 108Z" fill="#5A1F26"/>
      <path class="tongue" d="M94 112 Q100 132 106 112 Q100 109 94 112Z" fill="#F4708F"/>
      ${P.letter ? LETTER_SVG : ""}
      ${headWear(P.head)}
    </g>
    <g class="bowl bowl-front">
      <ellipse cx="100" cy="213.5" rx="34" ry="3.4" fill="rgba(0,0,0,.18)"/>
      <path d="M67 190 Q100 200 133 190 L125 211 Q124 213 121 213 H79 Q76 213 75 211Z" fill="#E8497A"/>
      <path d="M72 200 Q100 207 128 200" stroke="#fff" stroke-opacity=".32" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M68 190.6 Q100 199.4 132 190.6" stroke="#FF9DBB" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g fill="#fff" opacity=".85"><circle cx="100" cy="204" r="2.6"/><circle cx="94" cy="201" r="1.3"/><circle cx="98" cy="199.5" r="1.3"/><circle cx="102" cy="199.5" r="1.3"/><circle cx="106" cy="201" r="1.3"/></g>
      ${[[88, 182, -10, .95], [112, 182, 12, 1.2], [96, 180, -6, 1.5], [106, 181, 8, 1.8], [118, 184, 14, 2.05]]
        .map(([x, y, dx, d]) => `<circle class="crumb" style="--d:${d}s;--x:${dx}px" cx="${x}" cy="${y}" r="1.7" fill="#A56C42"/>`).join("")}
    </g>
  </svg>`;
}

// такса спит на боку: длинная, на коротких лапках, ухо свисает, морда на лапах
function taxSleepSvg(P) {
  const I = "tsl";
  return `
  <svg class="dog-sleep tax" viewBox="0 0 260 130" aria-label="такса спит">
    <defs>
      <radialGradient id="${I}-fur" cx=".45" cy=".2" r=".9"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset=".55" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></radialGradient>
      <linearGradient id="${I}-bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset=".6" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></linearGradient>
      <radialGradient id="${I}-cream" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${P.cream[0]}"/><stop offset="1" stop-color="${P.cream[1]}"/></radialGradient>
      <linearGradient id="${I}-ear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.ear[0]}"/><stop offset="1" stop-color="${P.ear[1]}"/></linearGradient>
      <radialGradient id="${I}-sh"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="136" cy="119" rx="122" ry="9" fill="url(#${I}-sh)"/>
    <g class="ds-tail"><path d="M232,96 C246,98 254,106 258,114 C252,115 242,110 230,104Z" fill="url(#${I}-fur)"/></g>
    <g class="ds-breath">
      <path d="M76,104 C68,82 84,62 112,60 L196,60 C224,60 240,76 238,94 C236,108 224,114 210,114 L90,114 C82,114 78,110 76,104Z" fill="url(#${I}-bd)"/>
      <path d="M100,66 C130,62 180,62 214,66" stroke="#fff" stroke-opacity=".3" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M96,112 C120,104 170,104 200,112 L200,114 L96,114Z" fill="url(#${I}-cream)" opacity=".85"/>
      <ellipse cx="206" cy="96" rx="25" ry="19" fill="url(#${I}-fur)"/>
      <path d="M186,86 C194,78 212,76 224,84" stroke="#fff" stroke-opacity=".28" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <ellipse cx="192" cy="114" rx="11" ry="4.4" fill="url(#${I}-cream)"/><ellipse cx="216" cy="115" rx="10" ry="4" fill="url(#${I}-cream)"/>
      <path d="M186,112 v4 M191,111.4 v5 M196,112 v4" stroke="${P.shade}" stroke-opacity=".3" stroke-width="1" stroke-linecap="round"/>
    </g>
    <g class="ds-head">
      <path d="M70,104 C60,104 50,108 40,112 C34,114 34,120 42,120 L80,120 C88,120 92,114 86,108Z" fill="url(#${I}-fur)"/>
      <ellipse cx="40" cy="117" rx="10" ry="4.6" fill="url(#${I}-cream)"/><ellipse cx="54" cy="119" rx="10" ry="4.4" fill="url(#${I}-cream)"/>
      <path d="M34,115 v4 M39,114.4 v5 M44,115 v4" stroke="${P.shade}" stroke-opacity=".3" stroke-width="1" stroke-linecap="round"/>
      <path d="M102,92 C104,108 90,114 74,114 C56,114 38,112 24,108 C14,105 12,98 20,95 C32,92 46,90 56,82 C64,74 76,70 86,72 C96,74 102,82 102,92Z" fill="url(#${I}-fur)"/>
      <path d="M24,108 C16,105 14,99 20,96 C32,93 46,94 58,98 C66,101 70,108 64,113 C50,113 36,111 24,108Z" fill="url(#${I}-cream)"/>
      ${P.browSpot ? `<ellipse cx="74" cy="80" rx="4" ry="2.4" fill="${P.browSpot}"/>` : ""}
      <path d="M62,78 C72,72 86,72 96,78" stroke="#fff" stroke-opacity=".3" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M14,100 C12,94 20,92 24,96 C26,99 24,103 20,103 C17,103 15,102 14,100Z" fill="#2a1a17"/>
      <ellipse cx="18" cy="96.6" rx="2.2" ry="1" fill="#fff" opacity=".4"/>
      <path d="M24,106 q8,3 16,1" stroke="#2A1A16" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      <path d="M64,88 Q71,94 78,89" stroke="#2A1A16" stroke-width="2.3" stroke-linecap="round" fill="none"/>
      <path d="M63,88 l-2.6,-1.3 M66.5,91 l-2,1.5" stroke="#2A1A16" stroke-width="1.1" stroke-linecap="round"/>
      <ellipse cx="66" cy="99" rx="6" ry="3.2" fill="#FF8FB0" opacity=".4"/>
      <g class="ds-ear-l"><path d="M84,74 C100,72 108,86 106,104 C104,118 92,122 84,114 C78,104 76,86 84,74Z" fill="url(#${I}-ear)"/>
        <path d="M90,80 C98,84 102,96 100,108" stroke="#fff" stroke-opacity=".18" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>
      <path d="M104,80 C110,92 110,104 104,114" stroke="${P.collar[0]}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="109" cy="99" r="3.2" fill="#FFD25A" stroke="#C99416" stroke-width="1"/>
    </g>
  </svg>`;
}

function taxHouseHead(P) {
  return `
      <g class="hs-head">
        <path d="M46,200 C38,204 36,220 42,228 C48,232 54,226 54,216Z M78,200 C86,204 88,220 82,228 C76,232 70,226 70,216Z" fill="${P.ear[0]}"/>
        <path d="M62,192 C76,192 82,200 80,210 C79,216 72,222 69,228 C67,232 64,234 62,234 C60,234 57,232 55,228 C52,222 45,216 44,210 C42,200 48,192 62,192Z" fill="${P.fur[1]}"/>
        <path d="M55,214 C56,209 59,208 62,208 C65,208 68,209 69,214 C70,224 66,233 62,233 C58,233 54,224 55,214Z" fill="${P.cream[0]}"/>
        ${P.browSpot ? `<ellipse cx="55" cy="200" rx="2.6" ry="1.6" fill="${P.browSpot}"/><ellipse cx="69" cy="200" rx="2.6" ry="1.6" fill="${P.browSpot}"/>` : ""}
        <path d="M51,205 Q55,209 59,205 M65,205 Q69,209 73,205" stroke="#2A1A16" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        <path d="M58,226 C58,223 66,223 66,226 C66,228.4 64,229.6 62,229.6 C60,229.6 58,228.4 58,226Z" fill="#2a1a17"/>
        <ellipse cx="51" cy="214" rx="3" ry="1.8" fill="#FF8FB0" opacity=".4"/><ellipse cx="73" cy="214" rx="3" ry="1.8" fill="#FF8FB0" opacity=".4"/>
      </g>`;
}


function dogSvg(v = {}) {
  const P = { ...DOG_DEFAULT, ...v }, I = P.id;
  if (P.breed === "dachshund") return taxSvg(P);
  const ink = "#2A1A16";
  // шерсть: штрихи по корпусу, чтобы выглядела не плоской заливкой
  const strands = (pts, col, op = .35, w = 1.4) => pts.map(([x, y, dx, dy]) =>
    `<path d="M${x} ${y} q${dx / 2 + 1.5} ${dy / 2} ${dx} ${dy}" stroke="${col}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`).join("");
  const flank = strands([[60, 150, -4, 22], [66, 144, -3, 26], [54, 160, -3, 20], [72, 140, -2, 24], [140, 150, 4, 22], [134, 144, 3, 26], [146, 160, 3, 20], [128, 140, 2, 24],
    [62, 176, -5, 14], [138, 176, 5, 14], [70, 170, -3, 16], [130, 170, 3, 16]], P.shade, .35);
  const chestFur = strands([[88, 118, 1, 14], [94, 120, 1, 18], [100, 121, 0, 20], [106, 120, -1, 18], [112, 118, -1, 14], [84, 132, 2, 16], [116, 132, -2, 16],
    [90, 140, 1, 18], [100, 142, 0, 18], [110, 140, -1, 18]], "#D9B48A", .6, 1.3);
  const cheekL = `<path d="M53 88 L47 94 L54 94 L50 101 L60 98 L58 106 L65 99Z" fill="url(#${I}-fur)"/>`;
  const cheekR = `<path d="M147 88 L153 94 L146 94 L150 101 L140 98 L142 106 L135 99Z" fill="url(#${I}-fur)"/>`;
  const whiskerDots = [[84, 94], [88, 98], [82, 99], [90, 93], [116, 94], [112, 98], [118, 99], [110, 93]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#7B5A44" opacity=".55"/>`).join("");
  return `
  <svg class="dog" viewBox="0 0 200 220" aria-label="собачка">
    <defs>
      <radialGradient id="${I}-fur" cx=".4" cy=".28" r=".85"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset=".5" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></radialGradient>
      <linearGradient id="${I}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.fur[0]}"/><stop offset=".6" stop-color="${P.fur[1]}"/><stop offset="1" stop-color="${P.fur[2]}"/></linearGradient>
      <linearGradient id="${I}-leg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.fur[2]}"/><stop offset=".45" stop-color="${P.fur[0]}"/><stop offset="1" stop-color="${P.fur[2]}"/></linearGradient>
      <radialGradient id="${I}-cream" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${P.cream[0]}"/><stop offset="1" stop-color="${P.cream[1]}"/></radialGradient>
      <linearGradient id="${I}-ear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.ear[0]}"/><stop offset="1" stop-color="${P.ear[1]}"/></linearGradient>
      <radialGradient id="${I}-nose" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#5A4540"/><stop offset="1" stop-color="#1B1210"/></radialGradient>
      <radialGradient id="${I}-iris" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${P.iris[0]}"/><stop offset=".6" stop-color="${P.iris[1]}"/><stop offset="1" stop-color="${P.iris[2]}"/></radialGradient>
      <radialGradient id="${I}-shadow"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse class="dog-shadow" cx="100" cy="207" rx="70" ry="10" fill="url(#${I}-shadow)"/>

    <g class="tail">
      <path d="M134 178 C 174 176, 192 142, 176 108 C 171 99, 160 101, 162 112 C 168 134, 158 154, 132 162Z" fill="url(#${I}-fur)"/>
      <path d="M176 108 C 171 99, 160 101, 162 112 C 164 118, 165 122, 165 126 C 171 124, 178 118, 176 108Z" fill="url(#${I}-cream)"/>
      ${strands([[150, 160, 12, -16], [156, 152, 12, -20], [160, 142, 10, -22], [164, 132, 6, -20], [146, 168, 14, -10]], P.shade, .4)}
      ${strands([[168, 140, 3, -14], [172, 130, 2, -14], [170, 120, 0, -10]], "#fff", .35, 1.2)}
    </g>

    <g class="body">
      <!-- задние лапы-бёдра -->
      <ellipse cx="56" cy="184" rx="32" ry="22" fill="url(#${I}-body)"/>
      <ellipse cx="144" cy="184" rx="32" ry="22" fill="url(#${I}-body)"/>
      <path d="M34 178 C 38 160, 58 156, 72 166" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M166 178 C 162 160, 142 156, 128 166" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- туловище -->
      <path d="M100 96 C 146 96, 158 150, 150 188 C 142 206, 58 206, 50 188 C 42 150, 54 96, 100 96Z" fill="url(#${I}-body)"/>
      ${flank}
      <!-- грудь -->
      <path d="M100 110 C 76 114, 68 150, 74 182 C 88 192, 112 192, 126 182 C 132 150, 124 114, 100 110Z" fill="url(#${I}-cream)"/>
      ${chestFur}
      <path d="M78 180 C 90 188, 110 188, 122 180" stroke="#D9B48A" stroke-opacity=".7" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- передние лапы -->
      <path d="M78 148 C 76 170, 76 190, 78 202 H 98 C 99 186, 98 166, 96 148Z" fill="url(#${I}-leg)"/>
      <path d="M104 148 C 102 166, 101 186, 102 202 H 122 C 124 190, 124 170, 122 148Z" fill="url(#${I}-leg)"/>
      <path d="M97 152 V 200" stroke="${P.shade}" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M103 152 V 200" stroke="${P.shade}" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>
      <!-- лапки -->
      <path d="M74 200 C 74 191, 98 191, 100 200 C 101 208, 74 208, 74 200Z" fill="url(#${I}-cream)"/>
      <path d="M100 200 C 102 191, 126 191, 126 200 C 126 208, 99 208, 100 200Z" fill="url(#${I}-cream)"/>
      <path d="M82 196 v6 M88 195 v7 M94 196 v6 M106 196 v6 M112 195 v7 M118 196 v6" stroke="#C9A67E" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M24 198 C 24 188, 52 188, 54 198 C 55 207, 24 208, 24 198Z" fill="url(#${I}-cream)"/>
      <path d="M146 198 C 148 188, 176 188, 176 198 C 176 208, 145 207, 146 198Z" fill="url(#${I}-cream)"/>
      <path d="M32 194 v6 M38 193 v7 M44 194 v6 M156 194 v6 M162 193 v7 M168 194 v6" stroke="#C9A67E" stroke-width="1.2" stroke-linecap="round"/>
      ${P.spots.filter((s) => s[3] === "b").map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .85}" fill="#1E1A1A" opacity=".92"/>`).join("")}
      <!-- ошейник -->
      <path d="M66 106 Q100 130 134 106" stroke="${P.collar[0]}" stroke-width="10" stroke-linecap="round" fill="none"/>
      <path d="M66 103 Q100 127 134 103" stroke="${P.collar[1]}" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <g class="tag"><circle cx="100" cy="125" r="7" fill="#FFD25A" stroke="#C99416" stroke-width="1.4"/><circle cx="98" cy="123" r="2.2" fill="#fff" opacity=".7"/><path d="M96 128h8" stroke="#C99416" stroke-width="1.2" stroke-linecap="round"/></g>
    </g>

    <g class="bowl bowl-back">
      <ellipse cx="100" cy="190" rx="33" ry="7" fill="#9E2F57"/>
      <ellipse cx="100" cy="190.6" rx="29.5" ry="5.2" fill="#4E2616"/>
      ${[[82, 190, "#8B5A36", .9], [90, 187.5, "#A56C42", 1.1], [99, 186, "#7B4A2B", 1.3], [108, 187.5, "#9A6038", 1.5], [117, 190, "#8B5A36", 1.7], [95, 190.5, "#B27748", 1.95], [106, 190.5, "#7B4A2B", 2.15]]
        .map(([x, y, c, d]) => `<circle class="kib" style="--d:${d}s" cx="${x}" cy="${y}" r="4.2" fill="${c}"/>`).join("")}
    </g>
    <g class="head">
      ${P.ears === "pointy" ? `
      <g class="ear-l">
        <path d="M54 58 C 44 34, 48 12, 58 4 C 76 12, 90 30, 94 48Z" fill="url(#${I}-ear)"/>
        <path d="M61 46 C 56 32, 58 20, 63 13 C 73 20, 81 31, 83 43Z" fill="${P.earInner}"/>
      </g>
      <g class="ear-r">
        <path d="M146 58 C 156 34, 152 12, 142 4 C 124 12, 110 30, 106 48Z" fill="url(#${I}-ear)"/>
        <path d="M139 46 C 144 32, 142 20, 137 13 C 127 20, 119 31, 117 43Z" fill="${P.earInner}"/>
      </g>` : `
      <g class="ear-l">
        <path d="M62 40 C 32 44, 20 98, 36 128 C 46 140, 66 122, 72 92 C 74 70, 72 52, 62 40Z" fill="url(#${I}-ear)"/>
        <path d="M58 52 C 42 62, 36 96, 44 118" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round" fill="none"/>
        ${strands([[50, 100, -2, 22], [58, 96, -1, 24], [44, 108, -2, 16], [64, 92, 0, 22]], "#1a0a02", .4)}
      </g>
      <g class="ear-r">
        <path d="M138 40 C 168 44, 180 98, 164 128 C 154 140, 134 122, 128 92 C 126 70, 128 52, 138 40Z" fill="url(#${I}-ear)"/>
        <path d="M142 52 C 158 62, 164 96, 156 118" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round" fill="none"/>
        ${strands([[150, 100, 2, 22], [142, 96, 1, 24], [156, 108, 2, 16], [136, 92, 0, 22]], "#1a0a02", .4)}
      </g>`}
      <!-- голова -->
      <path d="M100 26 C 138 26, 154 52, 152 78 C 150 104, 126 118, 100 118 C 74 118, 50 104, 48 78 C 46 52, 62 26, 100 26Z" fill="url(#${I}-fur)"/>
      ${cheekL}${cheekR}
      ${P.mask ? `<path d="M100 26 C 138 26 154 50 152 72 C 140 62 124 58 112 58 L100 74 L88 58 C 76 58 60 62 48 72 C 46 50 62 26 100 26Z" fill="${P.mask}" opacity=".92"/>` : ""}
      ${P.spots.filter((s) => s[3] === "h").map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .85}" fill="#1E1A1A"/>`).join("")}
      <path d="M100 28 C 92 40, 93 56, 100 70 C 107 56, 108 40, 100 28Z" fill="url(#${I}-cream)" opacity=".92"/>
      <path d="M72 38 C 82 30, 118 30, 128 38" stroke="#fff" stroke-opacity=".25" stroke-width="4" stroke-linecap="round" fill="none"/>
      <!-- морда -->
      <path d="M70 90 C 70 74, 86 68, 100 68 C 114 68, 130 74, 130 90 C 130 108, 116 120, 100 120 C 84 120, 70 108, 70 90Z" fill="url(#${I}-cream)"/>
      ${whiskerDots}
      <ellipse class="blush" cx="64" cy="90" rx="8" ry="4.5" fill="#FF8FB0" opacity=".3"/>
      <ellipse class="blush" cx="136" cy="90" rx="8" ry="4.5" fill="#FF8FB0" opacity=".3"/>
      <!-- брови-пятнышки -->
      <ellipse cx="80" cy="50" rx="5" ry="2.6" fill="${P.browSpot}" opacity=".85"/><ellipse cx="120" cy="50" rx="5" ry="2.6" fill="${P.browSpot}" opacity=".85"/>
      <!-- глаза -->
      <g class="eyes-open">
        <ellipse cx="80" cy="64" rx="8.2" ry="8.6" fill="#241410"/>
        <ellipse cx="80" cy="64.5" rx="6.6" ry="7.2" fill="url(#${I}-iris)"/>
        <circle cx="80" cy="65" r="3.5" fill="#0E0705"/>
        <circle cx="83" cy="61" r="2.5" fill="#fff"/><circle cx="77" cy="68" r="1.1" fill="#fff" opacity=".8"/>
        <path d="M71 59 Q80 52 89 59" stroke="#3C1E0C" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        <ellipse cx="120" cy="64" rx="8.2" ry="8.6" fill="#241410"/>
        <ellipse cx="120" cy="64.5" rx="6.6" ry="7.2" fill="url(#${I}-iris)"/>
        <circle cx="120" cy="65" r="3.5" fill="#0E0705"/>
        <circle cx="123" cy="61" r="2.5" fill="#fff"/><circle cx="117" cy="68" r="1.1" fill="#fff" opacity=".8"/>
        <path d="M111 59 Q120 52 129 59" stroke="#3C1E0C" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </g>
      <g class="eyes-happy" stroke="${ink}" stroke-width="3.4" stroke-linecap="round" fill="none">
        <path d="M72 66 Q80 57 88 66"/><path d="M112 66 Q120 57 128 66"/>
      </g>
      <g class="brows" stroke="${P.brow}" stroke-width="3" stroke-linecap="round">
        <path d="M71 53 L88 47"/><path d="M129 53 L112 47"/>
      </g>
      <!-- нос -->
      <path d="M86 80 C 86 72, 114 72, 114 80 C 114 87, 106 92, 100 92 C 94 92, 86 87, 86 80Z" fill="url(#${I}-nose)"/>
      <ellipse cx="94" cy="77" rx="5" ry="2.2" fill="#fff" opacity=".4"/>
      <path d="M93 83 q-2 2 0 3.4M107 83 q2 2 0 3.4" stroke="#0A0605" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <!-- рот -->
      <g class="mouth-smile" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" fill="none">
        <path d="M100 92 L100 98"/><path d="M100 98 Q92 107 83 101"/><path d="M100 98 Q108 107 117 101"/>
      </g>
      <path class="mouth-sad" d="M88 108 Q100 98 112 108" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      <path class="mouth-open" d="M86 98 Q100 94 114 98 Q112 118 100 120 Q88 118 86 98Z" fill="#5A1F26"/>
      <path class="tongue" d="M92 102 Q100 126 108 102 Q100 98 92 102Z" fill="#F4708F"/>
    </g>
    <g class="bowl bowl-front">
      <ellipse cx="100" cy="213.5" rx="34" ry="3.4" fill="rgba(0,0,0,.18)"/>
      <path d="M67 190 Q100 200 133 190 L125 211 Q124 213 121 213 H79 Q76 213 75 211Z" fill="#E8497A"/>
      <path d="M72 200 Q100 207 128 200" stroke="#fff" stroke-opacity=".32" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M68 190.6 Q100 199.4 132 190.6" stroke="#FF9DBB" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g fill="#fff" opacity=".85"><circle cx="100" cy="204" r="2.6"/><circle cx="94" cy="201" r="1.3"/><circle cx="98" cy="199.5" r="1.3"/><circle cx="102" cy="199.5" r="1.3"/><circle cx="106" cy="201" r="1.3"/></g>
      ${[[88, 182, -10, .95], [112, 182, 12, 1.2], [96, 180, -6, 1.5], [106, 181, 8, 1.8], [118, 184, 14, 2.05]]
        .map(([x, y, dx, d]) => `<circle class="crumb" style="--d:${d}s;--x:${dx}px" cx="${x}" cy="${y}" r="1.7" fill="#A56C42"/>`).join("")}
    </g>
  </svg>`;
}

boot();
