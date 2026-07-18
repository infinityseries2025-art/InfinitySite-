/* ==================================================================
   MLT — Multi-page JavaScript
   Firebase Auth + Firestore, compatible with Firebase Spark plan
================================================================== */

// Firebase app/auth/db initialization is done in firebase-config.js
import { auth, db } from "./firebase-config.js";
import { I18N, t as i18nT } from "./i18n.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* --------------------------------------------------------------
   ФОН: анимированная сеть частиц (canvas) + плавное появление
   контента страницы. Работает на всех страницах одинаково — canvas
   создаётся кодом, ничего не нужно менять в HTML. Отключается для
   пользователей с prefers-reduced-motion.
-------------------------------------------------------------- */
(function initBackgroundFX(){
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Плавное появление основного контента после загрузки страницы
  function revealMain(){
    const main = document.querySelector("main");
    if (main) requestAnimationFrame(() => requestAnimationFrame(() => main.classList.add("reveal")));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", revealMain);
  } else {
    revealMain();
  }

  if (reduceMotion) return;

  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "bg-net";
    document.body.prepend(canvas);
    const ctx = canvas.getContext("2d");

    function resize(){
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const COUNT = Math.min(70, Math.round((window.innerWidth * window.innerHeight) / 22000));
    const dots = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28
    }));

    let hidden = document.hidden;
    document.addEventListener("visibilitychange", () => { hidden = document.hidden; });

    function tick(){
      if (!hidden) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dots.forEach(d => {
          ctx.fillStyle = "rgba(74,132,255,0.45)";
          ctx.beginPath();
          ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
          d.x += d.vx; d.y += d.vy;
          if (d.x < 0 || d.x > canvas.width) d.vx *= -1;
          if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
        });
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 130) {
              ctx.strokeStyle = `rgba(74,132,255,${0.16 * (1 - dist / 130)})`;
              ctx.beginPath();
              ctx.moveTo(dots[i].x, dots[i].y);
              ctx.lineTo(dots[j].x, dots[j].y);
              ctx.stroke();
            }
          }
        }
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
})();

/* --------------------------------------------------------------
   STATE
-------------------------------------------------------------- */
let TEAMS = [], PLAYERS = [], MATCHES = [], TOURNAMENTS = [], NEWS = [], REQUESTS = [], USERS = [];
let currentUser = null;
let currentUserDoc = null;
let LANG = localStorage.getItem("mlt_lang") || "ru";
const t = key => i18nT(LANG, key);

// Admin panel: id текущей редактируемой записи (null = режим "создать новую")
let editingTeamId = null;
let editingPlayerId = null;
let editingMatchId = null;
let editingTournamentId = null;
let editingNewsId = null;

// Admin panel state
let adminLoggedIn = false;
let pendingRequestsCount = 0;

/* --------------------------------------------------------------
   CAPTCHA (reCAPTCHA v2 «Я не робот») — форма регистрации аккаунта
   и заявки на турнир. Ключ задаётся в config.js (window.MLT_CONFIG.
   recaptcha.siteKey). Если ключ не задан, виджеты просто не рисуются
   и проверка не блокирует отправку форм (чтобы сайт не сломался у
   тех, кто ещё не завёл себе ключ).
   ВАЖНО: это защита только от отправки через саму HTML-форму — она
   не защищает от прямых запросов к Firebase в обход интерфейса.
   Настоящая защита на уровне Firestore — это Firebase App Check.
-------------------------------------------------------------- */
const RECAPTCHA_SITE_KEY = (window.MLT_CONFIG && window.MLT_CONFIG.recaptcha && window.MLT_CONFIG.recaptcha.siteKey) || "";
let regCaptchaWidgetId = null;
let trCaptchaWidgetId = null;

function renderCaptchaWidgets(){
  if (!RECAPTCHA_SITE_KEY) return;
  if (!(window.grecaptcha && window.grecaptcha.render)) {
    setTimeout(renderCaptchaWidgets, 200);
    return;
  }
  const regBox = document.getElementById("regCaptcha");
  if (regBox && regCaptchaWidgetId === null) {
    regCaptchaWidgetId = window.grecaptcha.render(regBox, { sitekey: RECAPTCHA_SITE_KEY });
  }
  const trBox = document.getElementById("trCaptcha");
  if (trBox && trCaptchaWidgetId === null) {
    trCaptchaWidgetId = window.grecaptcha.render(trBox, { sitekey: RECAPTCHA_SITE_KEY });
  }
}

// Возвращает true, если капчу можно (или не нужно) пропускать дальше.
// Если ключ капчи не настроен в config.js — проверка отключена.
function checkCaptcha(widgetId, noteEl){
  if (!RECAPTCHA_SITE_KEY) return true;
  const ok = widgetId !== null && window.grecaptcha && window.grecaptcha.getResponse(widgetId);
  if (!ok && noteEl) {
    noteEl.style.color = "var(--loss)";
    noteEl.textContent = LANG === "en" ? "Please confirm you're not a robot." : "Подтвердите, что вы не робот.";
  }
  return !!ok;
}

function resetCaptcha(widgetId){
  if (widgetId !== null && window.grecaptcha && window.grecaptcha.reset) window.grecaptcha.reset(widgetId);
}
let pendingAccountsCount = 0;

const teamById = id => TEAMS.find(t => t.id === id);
// Статус модерации команды. Старые команды (без поля status, например
// добавленные админом напрямую) считаются одобренными по умолчанию —
// это сохраняет обратную совместимость с данными, созданными до введения
// модерации.
function teamStatus(team){ return (team && team.status) || "approved"; }
function isTeamApproved(team){ return teamStatus(team) === "approved"; }
const approvedTeams = () => TEAMS.filter(isTeamApproved);
const playerById = id => PLAYERS.find(p => p.id === id);

// Ищет аккаунт пользователя (личный кабинет) со схожим ником, чтобы
// подтянуть в публичный профиль игрока фото, соцсети и Faceit Elo.
function findLinkedUserByNick(nick){
  if (!nick) return null;
  const norm = s => (s || "").trim().toLowerCase();
  const n = norm(nick);
  if (!n) return null;
  return USERS.find(u => norm(u.nickname) === n || norm(u.faceitNickname) === n) || null;
}
const tournamentById = id => TOURNAMENTS.find(t => t.id === id);

function getTopMatchesOfDay(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayMatches = MATCHES.filter(m => {
    const matchDate = new Date(m.startAt);
    return matchDate >= today && matchDate < tomorrow && (m.status === "upcoming" || m.status === "live");
  });

  return todayMatches.map(m => {
    const teamA = teamById(m.teamA);
    const teamB = teamById(m.teamB);
    const combinedRating = (teamA?.rating || 0) + (teamB?.rating || 0);
    return { ...m, combinedRating, teamA, teamB };
  }).sort((a,b) => b.combinedRating - a.combinedRating).slice(0,3);
}

function topMatchCardHTML(m){
  const teamA = teamById(m.teamA);
  const teamB = teamById(m.teamB);
  if (!teamA || !teamB) return "";

  const time = new Date(m.startAt);
  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const combinedRating = (teamA.rating || 0) + (teamB.rating || 0);

  return `
    <div class="top-match-card" onclick="window.location.href='/match-details.html?id=${m.id}'">
      <div class="top-match-teams">
        <span class="top-match-team">${teamA.name}</span>
        <span class="top-match-vs">vs</span>
        <span class="top-match-team">${teamB.name}</span>
      </div>
      <div class="top-match-meta">
        <span>${timeStr}</span>
        <span class="top-match-rating">★ ${combinedRating.toFixed(1)}</span>
      </div>
    </div>
  `;
}

function teamTag(t){
  if (!t || !t.name) return "??";
  const parts = t.name.trim().split(/\s+/);
  return (parts.length > 1 ? parts.map(w=>w[0]).join("") : t.name.slice(0,2)).toUpperCase().slice(0,3);
}

function isAdmin(){ return currentUserDoc && currentUserDoc.role === "admin"; }

/* --------------------------------------------------------------
   IMAGE RESIZING (base64, no Storage needed)
-------------------------------------------------------------- */
function fileToResizedDataURL(file, maxSize = 200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось прочитать изображение."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
        else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* --------------------------------------------------------------
   AUTH
-------------------------------------------------------------- */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    let snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      const anyUsers = await getDocs(collection(db, "users"));
      const role = anyUsers.empty ? "admin" : "user";
      const nickname = user.email.split("@")[0];
      await setDoc(doc(db, "users", user.uid), { email: user.email, nickname, role, teamId: null, createdAt: serverTimestamp() });
      snap = await getDoc(doc(db, "users", user.uid));
    }
    currentUserDoc = { id: user.uid, ...snap.data() };
  } else {
    currentUserDoc = null;
  }
  updateAuthUI();
  renderPageContent();
});

function updateAuthUI(){
  const btn = document.getElementById("openAuth");
  const mobileBtn = document.getElementById("mobileOpenAuth");
  const label = (currentUser && currentUserDoc) ? (currentUserDoc.nickname || currentUser.email) : t("btnLogin");
  btn.textContent = label;
  if (mobileBtn) mobileBtn.textContent = label;
  // Кнопка «Админ-панель» в шапке видна только пользователям с ролью admin
  const adminBtn = document.getElementById("adminPanelBtn");
  if (adminBtn) adminBtn.style.display = isAdmin() ? "" : "none";
  const mobileAdminBtn = document.getElementById("mobileAdminPanelBtn");
  if (mobileAdminBtn) mobileAdminBtn.style.display = isAdmin() ? "" : "none";
}

async function handleRegister(e){
  e.preventDefault();
  const email = document.getElementById("regEmail").value.trim();
  const pass = document.getElementById("regPassword").value;
  const nickname = document.getElementById("regNickname").value.trim() || email.split("@")[0];
  const msg = document.getElementById("authRegisterMsg");
  msg.textContent = ""; msg.style.color = "";
  if (!checkCaptcha(regCaptchaWidgetId, msg)) return false;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const anyUsers = await getDocs(collection(db, "users"));
    const role = anyUsers.size <= 1 ? "admin" : "user";
    await setDoc(doc(db, "users", cred.user.uid), { email, nickname, role, teamId: null, createdAt: serverTimestamp() }, { merge: true });
    document.getElementById("authModal").classList.remove("open");
    resetCaptcha(regCaptchaWidgetId);
  } catch (err) {
    msg.style.color = "var(--loss)";
    msg.textContent = friendlyAuthError(err);
    resetCaptcha(regCaptchaWidgetId);
  }
  return false;
}

async function handleLogin(e){
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value;
  const msg = document.getElementById("authLoginMsg");
  msg.textContent = ""; msg.style.color = "";
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    document.getElementById("authModal").classList.remove("open");
  } catch (err) {
    msg.style.color = "var(--loss)";
    msg.textContent = friendlyAuthError(err);
  }
  return false;
}

function friendlyAuthError(err){
  const code = err && err.code || "";
  const mapRu = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован.",
    "auth/invalid-email": "Некорректный email.",
    "auth/weak-password": "Пароль слишком короткий (минимум 6 символов).",
    "auth/invalid-credential": "Неверный email или пароль.",
    "auth/wrong-password": "Неверный email или пароль.",
    "auth/user-not-found": "Пользователь с таким email не найден.",
  };
  const mapEn = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Invalid email.",
    "auth/weak-password": "Password too short (minimum 6 characters).",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "No user found with this email.",
  };
  const map = LANG === "en" ? mapEn : mapRu;
  return map[code] || ((LANG === "en" ? "Error: " : "Ошибка: ") + code);
}

async function handleLogout(){
  await signOut(auth);
  closeModal("profileModal");
}

/* --------------------------------------------------------------
   ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ / СОЗДАНИЕ КОМАНДЫ / ЗАЯВКА НА ТУРНИР
-------------------------------------------------------------- */
// Если пользователь нажал "Регистрация" на турнире, но у него ещё нет
// команды — запоминаем турнир, чтобы продолжить заявку сразу после
// создания команды в этом же модальном флоу.
let pendingTournamentId = null;

function openProfileModal(){
  if (!currentUser || !currentUserDoc) return;
  document.getElementById("pmNickname").value = currentUserDoc.nickname || "";
  document.getElementById("pmNote").textContent = "";

  // Команда
  const teamBox = document.getElementById("pmTeamBox");
  const myTeam = currentUserDoc.teamId ? teamById(currentUserDoc.teamId) : null;
  if (myTeam) {
    teamBox.innerHTML = `
      <div class="panel-box">
        <h3>${t("myTeamTitle")}</h3>
        <div class="data-row" style="grid-template-columns:1fr auto; cursor:pointer;" onclick="window.location.href='/team-profile.html?id=${myTeam.id}'">
          <span class="d-team">${tagBlock(myTeam, 28)}${myTeam.name}</span>
          <span>${t("btnOpenTeam")}</span>
        </div>
        <button class="btn ghost sm" id="pmEditTeamBtn" type="button" style="margin-top:10px; width:100%;">${t("btnEditRoster")}</button>
      </div>
    `;
    document.getElementById("pmEditTeamBtn")?.addEventListener("click", () => {
      closeModal("profileModal");
      openEditTeamModal(myTeam.id);
    });
  } else {
    teamBox.innerHTML = `
      <div class="panel-box">
        <h3>${t("teamTitleNoTeam")}</h3>
        <p class="form-note" style="margin-bottom:10px;">${t("noTeamYet")}</p>
        <button class="btn primary sm" id="pmCreateTeamBtn" type="button">${t("btnCreateTeam")}</button>
      </div>
    `;
    document.getElementById("pmCreateTeamBtn")?.addEventListener("click", () => {
      closeModal("profileModal");
      openCreateTeamModal();
    });
  }

  // Контакты (Telegram/Discord/Faceit)
  const contactBox = document.getElementById("pmContactBox");
  if (contactBox) {
    const lastUpdated = currentUserDoc.faceitUpdatedAt && currentUserDoc.faceitUpdatedAt.toDate
      ? dateLabel(currentUserDoc.faceitUpdatedAt.toDate().getTime(), false) : null;
    const hasFaceitData = currentUserDoc.faceitElo || currentUserDoc.faceitLevel;
    contactBox.innerHTML = `
      <div class="panel-box">
        <h3>${t("contactsSectionTitle")}</h3>
        <form id="profileContactsForm" style="display:flex; flex-direction:column; gap:12px;">
          <div class="field"><label>${t("labelTelegram")}</label><input type="text" id="pmTelegram" placeholder="@username" value="${currentUserDoc.telegram || ""}"></div>
          <div class="field"><label>${t("labelDiscord")}</label><input type="text" id="pmDiscord" placeholder="username" value="${currentUserDoc.discord || ""}"></div>
          <div class="field"><label>${t("labelFaceitNickname")}</label><input type="text" id="pmFaceitNickname" placeholder="nickname" value="${currentUserDoc.faceitNickname || ""}"></div>
          <button class="btn primary sm" type="submit">${t("btnSaveContacts")}</button>
          <p class="form-note" id="pmContactsNote"></p>
        </form>
        <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line, rgba(255,255,255,0.08));">
          <h3 style="margin-bottom:8px;">${t("faceitBlockTitle")}</h3>
          ${hasFaceitData ? `
            <div class="data-row" style="grid-template-columns:1fr 1fr; cursor:default;">
              <span>${t("labelFaceitElo")}: <strong class="mono">${currentUserDoc.faceitElo ?? "—"}</strong></span>
              <span>${t("labelFaceitLevel")}: <strong class="mono">${currentUserDoc.faceitLevel ?? "—"}</strong></span>
            </div>
            ${lastUpdated ? `<p class="form-note">${t("faceitLastUpdated")}: ${lastUpdated}</p>` : ""}
          ` : `<p class="form-note">${t("faceitNoData")}</p>`}
          <button class="btn ghost sm" id="pmUpdateFaceitBtn" type="button" style="margin-top:10px; width:100%;">${t("btnUpdateFaceit")}</button>
          <p class="form-note" id="pmFaceitNote"></p>
        </div>
      </div>
    `;
    document.getElementById("profileContactsForm")?.addEventListener("submit", submitProfileContacts);
    document.getElementById("pmUpdateFaceitBtn")?.addEventListener("click", requestFaceitUpdate);
  }

  openModal("profileModal");
}

async function submitProfileNickname(e){
  e.preventDefault();
  const nickname = document.getElementById("pmNickname").value.trim();
  const note = document.getElementById("pmNote");
  note.textContent = ""; note.style.color = "";
  if (!nickname) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { nickname });
    currentUserDoc.nickname = nickname;
    updateAuthUI();
    note.style.color = "var(--win)";
    note.textContent = LANG === "en" ? "Nickname saved." : "Никнейм сохранён.";
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

/* --------------------------------------------------------------
   КОНТАКТЫ ПРОФИЛЯ (Telegram/Discord/Faceit) + запрос обновления Elo
   Ключ Faceit Data API НИКОГДА не хранится в этом файле — обновление
   Elo делает отдельный процесс на GitHub Actions по расписанию (см.
   .github/workflows/faceit-elo-sync.yml и FACEIT_SETUP.md). Клиент
   только сохраняет faceitNickname и ставит флаг faceitUpdateRequested;
   воркфлоу подхватывает флаг в своём следующем прогоне и пишет
   faceitElo/faceitLevel/faceitUrl обратно в Firestore.
-------------------------------------------------------------- */
async function submitProfileContacts(e){
  e.preventDefault();
  const telegram = document.getElementById("pmTelegram").value.trim();
  const discord = document.getElementById("pmDiscord").value.trim();
  const faceitNickname = document.getElementById("pmFaceitNickname").value.trim();
  const note = document.getElementById("pmContactsNote");
  note.textContent = ""; note.style.color = "";
  try {
    const patch = { telegram: telegram || null, discord: discord || null, faceitNickname: faceitNickname || null };
    await updateDoc(doc(db, "users", currentUser.uid), patch);
    Object.assign(currentUserDoc, patch);
    note.style.color = "var(--win)";
    note.textContent = LANG === "en" ? "Contacts saved." : "Контакты сохранены.";
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

async function requestFaceitUpdate(){
  const note = document.getElementById("pmFaceitNote");
  note.textContent = ""; note.style.color = "";
  const faceitNickname = (document.getElementById("pmFaceitNickname").value || "").trim();
  if (!faceitNickname) {
    note.style.color = "var(--loss)";
    note.textContent = t("faceitNeedNickname");
    return;
  }
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      faceitNickname,
      faceitUpdateRequested: true,
      faceitUpdateRequestedAt: serverTimestamp()
    });
    currentUserDoc.faceitNickname = faceitNickname;
    note.style.color = "var(--win)";
    note.textContent = t("faceitUpdatePending");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

/* --------------------------------------------------------------
   ЛИЧНЫЙ КАБИНЕТ (account.html) — полноценная страница вместо
   поверхностной модалки «Профиль». Вкладки: Инфо / Моя команда /
   Faceit и контакты. Фото профиля — большая портретная карточка
   (как у референса), а не маленький квадрат с буквой.
-------------------------------------------------------------- */
function renderAccountPage(){
  const gate = document.getElementById("accountGate");
  const shell = document.getElementById("accountShell");
  if (!gate || !shell) return;

  if (!currentUser || !currentUserDoc) {
    gate.style.display = "";
    shell.style.display = "none";
    return;
  }
  gate.style.display = "none";
  shell.style.display = "";

  // Hero: фото, ник, роль, дата регистрации
  const photoBox = document.getElementById("acPhotoBox");
  if (photoBox) {
    photoBox.style.backgroundImage = currentUserDoc.photoUrl ? `url('${currentUserDoc.photoUrl}')` : "none";
    photoBox.classList.toggle("has-photo", !!currentUserDoc.photoUrl);
    const initial = document.getElementById("acPhotoInitial");
    if (initial) initial.textContent = (currentUserDoc.nickname || currentUserDoc.email || "?")[0].toUpperCase();
  }
  const nameEl = document.getElementById("acHeroName");
  if (nameEl) nameEl.textContent = currentUserDoc.nickname || currentUserDoc.email;
  const roleEl = document.getElementById("acHeroRole");
  if (roleEl) roleEl.textContent = currentUserDoc.role === "admin" ? t("accountRoleAdmin") : t("accountRoleUser");
  const sinceEl = document.getElementById("acHeroSince");
  if (sinceEl) {
    const created = currentUserDoc.createdAt && currentUserDoc.createdAt.toDate ? currentUserDoc.createdAt.toDate().getTime() : null;
    sinceEl.textContent = created ? `${t("accountMemberSince")} ${dateLabel(created, false)}` : "";
  }

  // Вкладка «Инфо»
  const nickInput = document.getElementById("acNickname");
  if (nickInput) nickInput.value = currentUserDoc.nickname || "";

  // Вкладка «Моя команда»
  const teamBox = document.getElementById("acTeamBox");
  if (teamBox) {
    const myTeam = currentUserDoc.teamId ? teamById(currentUserDoc.teamId) : null;
    if (myTeam) {
      const st = teamStatus(myTeam);
      const statusBadge = st === "pending" ? `<span class="app-status-badge pending">${t("teamStatusPending")}</span>`
        : st === "rejected" ? `<span class="app-status-badge rejected">${t("teamStatusRejected")}</span>`
        : `<span class="app-status-badge approved">${t("teamStatusApproved")}</span>`;
      const note = st === "pending" ? `<p class="form-note" style="margin-top:10px;">${t("accountTeamStatusPendingNote")}</p>`
        : st === "rejected" ? `<p class="form-note" style="margin-top:10px; color:var(--loss);">${t("accountTeamStatusRejectedNote")}</p>` : "";
      teamBox.innerHTML = `
        <div class="panel-box">
          <div class="data-row" style="grid-template-columns:1fr auto; cursor:pointer;" onclick="window.location.href='/team-profile.html?id=${myTeam.id}'">
            <span class="d-team">${tagBlock(myTeam, 32)}${myTeam.name} ${statusBadge}</span>
            <span>${t("btnOpenTeam")}</span>
          </div>
          ${note}
          <button class="btn ghost sm" id="acEditTeamBtn" type="button" style="margin-top:14px; width:100%;">${t("btnEditRoster")}</button>
        </div>`;
      document.getElementById("acEditTeamBtn")?.addEventListener("click", () => openEditTeamModal(myTeam.id));
    } else {
      teamBox.innerHTML = `
        <div class="panel-box">
          <h3>${t("teamTitleNoTeam")}</h3>
          <p class="form-note" style="margin-bottom:10px;">${t("accountNoTeamDesc")}</p>
          <button class="btn primary sm" id="acCreateTeamBtn" type="button">${t("btnCreateTeam")}</button>
        </div>`;
      document.getElementById("acCreateTeamBtn")?.addEventListener("click", () => openCreateTeamModal());
    }
  }

  // Вкладка «Faceit и контакты»
  const telegramInput = document.getElementById("acTelegram");
  if (telegramInput) telegramInput.value = currentUserDoc.telegram || "";
  const discordInput = document.getElementById("acDiscord");
  if (discordInput) discordInput.value = currentUserDoc.discord || "";
  const faceitInput = document.getElementById("acFaceitNickname");
  if (faceitInput) faceitInput.value = currentUserDoc.faceitNickname || "";
  const faceitStatsBox = document.getElementById("acFaceitStats");
  if (faceitStatsBox) {
    const hasFaceitData = currentUserDoc.faceitElo || currentUserDoc.faceitLevel;
    const lastUpdated = currentUserDoc.faceitUpdatedAt && currentUserDoc.faceitUpdatedAt.toDate
      ? dateLabel(currentUserDoc.faceitUpdatedAt.toDate().getTime(), false) : null;
    faceitStatsBox.innerHTML = hasFaceitData ? `
      <div class="data-row" style="grid-template-columns:1fr 1fr; cursor:default;">
        <span>${t("labelFaceitElo")}: <strong class="mono">${currentUserDoc.faceitElo ?? "—"}</strong></span>
        <span>${t("labelFaceitLevel")}: <strong class="mono">${currentUserDoc.faceitLevel ?? "—"}</strong></span>
      </div>
      ${lastUpdated ? `<p class="form-note">${t("faceitLastUpdated")}: ${lastUpdated}</p>` : ""}
    ` : `<p class="form-note">${t("faceitNoData")}</p>`;
  }
}

async function submitAccountNickname(e){
  e.preventDefault();
  const nickname = document.getElementById("acNickname").value.trim();
  const note = document.getElementById("acNicknameNote");
  note.textContent = ""; note.style.color = "";
  if (!nickname) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { nickname });
    currentUserDoc.nickname = nickname;
    updateAuthUI();
    renderAccountPage();
    note.style.color = "var(--win)";
    note.textContent = LANG === "en" ? "Nickname saved." : "Никнейм сохранён.";
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

async function submitAccountPhoto(e){
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const note = document.getElementById("acPhotoNote");
  if (note) { note.textContent = LANG === "en" ? "Uploading…" : "Загрузка…"; note.style.color = ""; }
  try {
    // Портретный кадр (как у карточки игрока на референсе) — сохраняем
    // с большей стороной 480px, base64 прямо в документ пользователя
    // (без Firebase Storage — он недоступен на бесплатном плане Spark).
    const photoUrl = await fileToResizedDataURL(file, 480, 0.82);
    await updateDoc(doc(db, "users", currentUser.uid), { photoUrl });
    currentUserDoc.photoUrl = photoUrl;
    renderAccountPage();
    if (note) { note.style.color = "var(--win)"; note.textContent = LANG === "en" ? "Photo updated." : "Фото обновлено."; }
  } catch (err) {
    if (note) { note.style.color = "var(--loss)"; note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err); }
  }
}

async function submitAccountContacts(e){
  e.preventDefault();
  const telegram = document.getElementById("acTelegram").value.trim();
  const discord = document.getElementById("acDiscord").value.trim();
  const faceitNickname = document.getElementById("acFaceitNickname").value.trim();
  const note = document.getElementById("acContactsNote");
  note.textContent = ""; note.style.color = "";
  try {
    const patch = { telegram: telegram || null, discord: discord || null, faceitNickname: faceitNickname || null };
    await updateDoc(doc(db, "users", currentUser.uid), patch);
    Object.assign(currentUserDoc, patch);
    note.style.color = "var(--win)";
    note.textContent = LANG === "en" ? "Contacts saved." : "Контакты сохранены.";
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

async function requestAccountFaceitUpdate(){
  const note = document.getElementById("acFaceitNote");
  note.textContent = ""; note.style.color = "";
  const faceitNickname = (document.getElementById("acFaceitNickname").value || "").trim();
  if (!faceitNickname) {
    note.style.color = "var(--loss)";
    note.textContent = t("faceitNeedNickname");
    return;
  }
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      faceitNickname,
      faceitUpdateRequested: true,
      faceitUpdateRequestedAt: serverTimestamp()
    });
    currentUserDoc.faceitNickname = faceitNickname;
    note.style.color = "var(--win)";
    note.textContent = t("faceitUpdatePending");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

function openCreateTeamModal(tournamentId){
  pendingTournamentId = tournamentId || null;
  const form = document.getElementById("createTeamForm");
  if (form) form.reset();
  const note = document.getElementById("ctNote");
  note.textContent = pendingTournamentId ? t("createTeamHintTournament") : "";
  document.getElementById("ctFormNote").textContent = "";
  openModal("createTeamModal");
}

async function submitCreateTeamForm(e){
  e.preventDefault();
  if (!currentUser) return;
  const note = document.getElementById("ctFormNote");
  note.textContent = ""; note.style.color = "";
  const name = document.getElementById("ctName").value.trim();
  const main = [0,1,2,3,4].map(i => document.getElementById("ctMain" + i).value.trim()).filter(Boolean);
  const reserve = [0,1].map(i => document.getElementById("ctReserve" + i).value.trim()).filter(Boolean);
  if (main.length < 5) {
    note.style.color = "var(--loss)";
    note.textContent = LANG === "en" ? "Enter a nickname for all 5 main roster players." : "Укажите ник для всех 5 игроков основного состава.";
    return;
  }
  const fileInput = document.getElementById("ctLogo");
  try {
    let logoUrl = null;
    if (fileInput.files && fileInput.files[0]) {
      logoUrl = await fileToResizedDataURL(fileInput.files[0], 200, 0.72);
    }
    const teamRef = doc(collection(db, "teams"));
    await setDoc(teamRef, {
      name, logoUrl: logoUrl || null, ownerUid: currentUser.uid,
      main: main.map(nick => ({ nick })),
      reserve: reserve.map(nick => ({ nick })),
      rating: 0, winrate: 0, trophies: 0, form: [], mapWinrate: {},
      status: "pending",
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "users", currentUser.uid), { teamId: teamRef.id });
    currentUserDoc.teamId = teamRef.id;
    note.style.color = "var(--win)";
    note.textContent = t("createTeamModerationNote");
    setTimeout(() => {
      closeModal("createTeamModal");
      if (pendingTournamentId) {
        pendingTournamentId = null;
      }
      window.location.href = "/account.html";
    }, 1600);
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

/* --------------------------------------------------------------
   РЕДАКТИРОВАНИЕ СОСТАВА СУЩЕСТВУЮЩЕЙ КОМАНДЫ (владелец команды)
   Переиспользует разметку editTeamModal (аналог createTeamModal,
   но предзаполненный).
-------------------------------------------------------------- */
let editingOwnTeamId = null;

function openEditTeamModal(teamId){
  const team = teamById(teamId);
  if (!team || !currentUser || team.ownerUid !== currentUser.uid) return;
  editingOwnTeamId = teamId;
  document.getElementById("etName").value = team.name || "";
  const main = team.main || [], reserve = team.reserve || [];
  [0,1,2,3,4].forEach(i => { document.getElementById("etMain" + i).value = (main[i] && main[i].nick) || ""; });
  [0,1].forEach(i => { document.getElementById("etReserve" + i).value = (reserve[i] && reserve[i].nick) || ""; });
  document.getElementById("etFormNote").textContent = "";
  openModal("editTeamModal");
}

async function submitEditTeamForm(e){
  e.preventDefault();
  if (!currentUser || !editingOwnTeamId) return;
  const team = teamById(editingOwnTeamId);
  if (!team || team.ownerUid !== currentUser.uid) return;
  const note = document.getElementById("etFormNote");
  note.textContent = ""; note.style.color = "";
  const name = document.getElementById("etName").value.trim();
  const main = [0,1,2,3,4].map(i => document.getElementById("etMain" + i).value.trim()).filter(Boolean);
  const reserve = [0,1].map(i => document.getElementById("etReserve" + i).value.trim()).filter(Boolean);
  if (main.length < 5) {
    note.style.color = "var(--loss)";
    note.textContent = LANG === "en" ? "Enter a nickname for all 5 main roster players." : "Укажите ник для всех 5 игроков основного состава.";
    return;
  }
  const fileInput = document.getElementById("etLogo");
  try {
    const patch = {
      name,
      main: main.map(nick => ({ nick })),
      reserve: reserve.map(nick => ({ nick })),
    };
    if (teamStatus(team) === "rejected") patch.status = "pending";
    if (fileInput.files && fileInput.files[0]) {
      patch.logoUrl = await fileToResizedDataURL(fileInput.files[0], 200, 0.72);
    }
    await updateDoc(doc(db, "teams", editingOwnTeamId), patch);
    note.style.color = "var(--win)";
    note.textContent = patch.status === "pending"
      ? t("createTeamModerationNote")
      : (LANG === "en" ? "Team saved." : "Команда сохранена.");
    setTimeout(() => closeModal("editTeamModal"), 1200);
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
  }
}

function openTournamentRegModal(tournamentId){
  const tour = tournamentById(tournamentId);
  if (!tour) return;
  document.getElementById("tournamentRegForm").reset();
  document.getElementById("tournamentRegForm").dataset.tournamentId = tournamentId;
  document.getElementById("trTournamentName").textContent = (LANG === "en" ? "Tournament: " : "Турнир: ") + tour.name;
  document.getElementById("trNote").textContent = "";
  openModal("tournamentRegModal");
}

async function submitTournamentReg(e){
  e.preventDefault();
  const tournamentId = e.target.dataset.tournamentId;
  const contactInfo = document.getElementById("trContact").value.trim();
  const note = document.getElementById("trNote");
  note.textContent = ""; note.style.color = "";
  if (!currentUser || !currentUserDoc || !currentUserDoc.teamId) {
    note.style.color = "var(--loss)";
    note.textContent = LANG === "en" ? "Create a team first." : "Сначала создайте команду.";
    return;
  }
  const myTeam = teamById(currentUserDoc.teamId);
  if (!isTeamApproved(myTeam)) {
    note.style.color = "var(--loss)";
    note.textContent = t("tournamentRegNeedApprovedTeam");
    return;
  }
  if (!checkCaptcha(trCaptchaWidgetId, note)) return;
  try {
    const already = REQUESTS.find(r => r.tournamentId === tournamentId && r.teamId === currentUserDoc.teamId && r.status !== "rejected");
    if (already) {
      note.style.color = "var(--loss)";
      note.textContent = LANG === "en" ? "Your team has already applied to this tournament." : "Заявка от вашей команды на этот турнир уже подана.";
      return;
    }
    await addDoc(collection(db, "teamRegistrations"), {
      tournamentId, teamId: currentUserDoc.teamId, contactInfo,
      status: "pending", createdAt: serverTimestamp()
    });
    note.style.color = "var(--win)";
    note.textContent = LANG === "en" ? "Request sent, awaiting admin approval." : "Заявка отправлена, ожидайте подтверждения от админа.";
    resetCaptcha(trCaptchaWidgetId);
    setTimeout(() => closeModal("tournamentRegModal"), 1200);
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = (LANG === "en" ? "Error: " : "Ошибка: ") + (err.message || err);
    resetCaptcha(trCaptchaWidgetId);
  }
}

function handleRegisterClick(tournamentId){
  if (!currentUser) {
    openModal("authModal");
    return;
  }
  if (!currentUserDoc || !currentUserDoc.teamId) {
    openCreateTeamModal(tournamentId);
    return;
  }
  openTournamentRegModal(tournamentId);
}

/* --------------------------------------------------------------
   FIRESTORE DATA
-------------------------------------------------------------- */
let renderScheduled = false;
function scheduleRender(){
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => { renderScheduled = false; renderPageContent(); });
}

onSnapshot(collection(db, "teams"), snap => {
  TEAMS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});
onSnapshot(collection(db, "players"), snap => {
  PLAYERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});
onSnapshot(collection(db, "matches"), snap => {
  MATCHES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});
onSnapshot(collection(db, "tournaments"), snap => {
  TOURNAMENTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});
onSnapshot(collection(db, "news"), snap => {
  NEWS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});
onSnapshot(collection(db, "teamRegistrations"), snap => {
  REQUESTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});
onSnapshot(collection(db, "users"), snap => {
  USERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  scheduleRender();
});

/* --------------------------------------------------------------
   PAGE-SPECIFIC RENDERING
-------------------------------------------------------------- */
function getCurrentPage(){
  const path = window.location.pathname;
  if (path === '/' || path.endsWith('index.html')) return 'home';
  if (path.endsWith('matches.html')) return 'matches';
  if (path.endsWith('rankings.html')) return 'rankings';
  if (path.endsWith('tournaments.html')) return 'tournaments';
  if (path.endsWith('news.html')) return 'news';
  if (path.endsWith('contacts.html')) return 'contacts';
  if (path.endsWith('admin.html')) return 'admin';
  if (path.endsWith('match-details.html')) return 'match-details';
  if (path.endsWith('player-profile.html')) return 'player-profile';
  if (path.endsWith('team-profile.html')) return 'team-profile';
  if (path.endsWith('tournament-details.html')) return 'tournament-details';
  if (path.endsWith('account.html')) return 'account';
  return 'home';
}

/* --------------------------------------------------------------
   ADMIN PANEL LOGIN (Infinity-style separate login screen)
-------------------------------------------------------------- */
function renderAdminLogin(){
  const loginSection = document.getElementById("admin-login");
  const adminContent = document.getElementById("admin-content");
  
  if (currentUserDoc && currentUserDoc.role === "admin") {
    adminLoggedIn = true;
    loginSection.style.display = "none";
    adminContent.style.display = "block";
    renderAdmin();
  } else {
    adminLoggedIn = false;
    loginSection.style.display = "block";
    adminContent.style.display = "none";
  }
}

function renderPageContent(){
  const page = getCurrentPage();
  
  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === window.location.pathname || 
        (page === 'home' && link.getAttribute('href') === '/')) {
      link.classList.add('active');
    }
  });

  switch(page) {
    case 'home': renderHome(); break;
    case 'matches': renderMatches(); break;
    case 'rankings': renderRankings(); break;
    case 'tournaments': renderTournaments(); break;
    case 'news': renderNews(); break;
    case 'contacts': break; // Static content
    case 'admin': renderAdminLogin(); break;
    case 'match-details': renderMatchDetailsPage(); break;
    case 'player-profile': renderPlayerProfilePage(); break;
    case 'team-profile': renderTeamProfilePage(); break;
    case 'tournament-details': renderTournamentDetailsPage(); break;
    case 'account': renderAccountPage(); break;
  }
}

/* --------------------------------------------------------------
   RENDER FUNCTIONS
-------------------------------------------------------------- */
function renderHome(){
  const upcomingMatches = MATCHES.filter(m => m.status === "upcoming").sort((a,b)=>a.startAt-b.startAt);
  const liveMatches = MATCHES.filter(m => m.status === "live");

  // Top matches of day - based on team ratings
  const topMatches = getTopMatchesOfDay();
  const homeTopMatches = document.getElementById("homeTopMatches");
  if (homeTopMatches) {
    homeTopMatches.innerHTML = topMatches.map(m => topMatchCardHTML(m)).join("") ||
      `<div class="empty-state">${t("emptyMatches")}</div>`;
  }

  const featured = liveMatches[0] || upcomingMatches[0];
  const homeMatchGrid = document.getElementById("homeMatchGrid");
  if (homeMatchGrid) {
    homeMatchGrid.innerHTML = upcomingMatches.slice(0,4).map(m => matchCardHTML(m, false)).join("") ||
      `<div class="empty-state">${t("emptyUpcoming")}</div>`;
  }

  const homeNewsGrid = document.getElementById("homeNewsGrid");
  if (homeNewsGrid) {
    homeNewsGrid.innerHTML = NEWS.slice(0,3).map((n,i) => newsCardHTML(n, i===0)).join("") || 
      `<div class="empty-state">${t("emptyHomeNews")}</div>`;
  }

  bindMatchClicks();
}

function renderMatches(){
  const upcomingMatches = MATCHES.filter(m => m.status === "upcoming").sort((a,b)=>a.startAt-b.startAt);
  const liveMatches = MATCHES.filter(m => m.status === "live");
  const finishedMatches = MATCHES.filter(m => m.status === "finished").sort((a,b)=>b.startAt-a.startAt);

  const upcomingGrid = document.getElementById("upcomingGrid");
  if (upcomingGrid) {
    upcomingGrid.innerHTML = upcomingMatches.map(m => matchCardHTML(m, false)).join("") || 
      `<div class="empty-state">${t("emptyUpcoming")}</div>`;
  }

  const liveGrid = document.getElementById("liveGrid");
  if (liveGrid) {
    liveGrid.innerHTML = liveMatches.map(m => matchCardHTML(m, false)).join("") || 
      `<div class="empty-state">${t("emptyLive")}</div>`;
  }

  const resultsGrid = document.getElementById("resultsGrid");
  if (resultsGrid) {
    resultsGrid.innerHTML = finishedMatches.map(m => matchCardHTML(m, false)).join("") || 
      `<div class="empty-state">${t("emptyResults")}</div>`;
  }

  bindMatchClicks();
}

function renderRankings(){
  const sortedTeams = [...approvedTeams()].sort((a,b) => (b.rating||0) - (a.rating||0));
  const teamsTable = document.getElementById("teamsTable");
  if (teamsTable) {
    teamsTable.innerHTML = `
      <div class="data-row head" style="grid-template-columns:46px 2fr 1fr 1fr 1fr 1fr;"><span>${t("thRank")}</span><span>${t("thTeam")}</span><span>${t("thWinrate")}</span><span>${t("thElo")}</span><span>${t("thRating")}</span><span>${t("thTrophies")}</span></div>
      ${sortedTeams.map((tm,i) => `
        <div class="data-row" style="grid-template-columns:46px 2fr 1fr 1fr 1fr 1fr;" onclick="window.location.href='/team-profile.html?id=${tm.id}'">
          <span class="d-rank">${i+1}</span><span class="d-team">${tagBlock(tm, 30)}${tm.name}</span>
          <span>${tm.winrate||0}%</span><span class="mono">${tm.elo||1000}</span><span class="mono">${(tm.rating||0).toFixed(2)}</span><span>${Array.isArray(tm.trophies) ? tm.trophies.length : (tm.trophies||0)}</span>
        </div>
      `).join("")}
    `;
  }

  const sortedPlayers = [...PLAYERS].sort((a,b) => (b.rating||0) - (a.rating||0));
  const playersTable = document.getElementById("playersTable");
  if (playersTable) {
    playersTable.innerHTML = `
      <div class="data-row head"><span>${t("thRank")}</span><span>${t("thPlayer")}</span><span>${t("thKD")}</span><span>${t("thADR")}</span><span>${t("thKAST")}</span><span>${t("thRating")}</span></div>
      ${sortedPlayers.map((p,i) => `
        <div class="data-row" onclick="window.location.href='/player-profile.html?id=${p.id}'">
          <span class="d-rank">${i+1}</span><span class="d-team">${p.nick} <span class="d-dim">${teamTag(teamById(p.teamId))}</span></span>
          <span class="mono">${(p.kd||0).toFixed(2)}</span><span class="mono">${(p.adr||0).toFixed(1)}</span><span class="mono">${p.kast||0}%</span><span class="mono">${(p.rating||0).toFixed(2)}</span>
        </div>
      `).join("")}
    `;
  }
}

function renderTournaments(){
  const statusLabel = { live: t("statusLive"), upcoming: t("statusUpcoming"), done: t("statusDone") };

  const tournamentUpcomingGrid = document.getElementById("tournamentUpcomingGrid");
  if (tournamentUpcomingGrid) {
    tournamentUpcomingGrid.innerHTML = TOURNAMENTS.filter(tr=>tr.status!=="done").map(tr => `
      <div class="tournament-card notched ${tr.pinned ? 'pinned' : ''}" data-tournament="${tr.id}" ${tr.pinned && tr.bannerUrl ? `style="--tournament-banner:url('${tr.bannerUrl}')"` : ''}>
        <div class="tournament-info"><h3>${tr.name}</h3><span class="tournament-meta">${tr.period||""} · ${(tr.registeredTeamIds||[]).length} ${t("teamsCountSuffix")} · ${t("prizeLabel")}: ${tr.prizePool||"—"}</span></div>
        <div class="tournament-right">${tr.regOpen ? `<button class="btn primary sm" data-register-tournament="${tr.id}">${t("btnRegister")}</button>` : ""}<span class="status-badge ${tr.status}">${statusLabel[tr.status]||tr.status}</span></div>
      </div>
    `).join("") || `<div class="empty-state">${t("emptyTournaments")}</div>`;
  }

  const tournamentDoneGrid = document.getElementById("tournamentDoneGrid");
  if (tournamentDoneGrid) {
    tournamentDoneGrid.innerHTML = TOURNAMENTS.filter(tr=>tr.status==="done").map(tr => `
      <div class="tournament-card notched ${tr.pinned ? 'pinned' : ''}" data-tournament="${tr.id}" ${tr.pinned && tr.bannerUrl ? `style="--tournament-banner:url('${tr.bannerUrl}')"` : ''}>
        <div class="tournament-info"><h3>${tr.name}</h3><span class="tournament-meta">${tr.period||""} · ${(tr.registeredTeamIds||[]).length} ${t("teamsCountSuffix")} · ${t("prizeLabel")}: ${tr.prizePool||"—"}</span></div>
        <div class="tournament-right"><span class="status-badge ${tr.status}">${statusLabel[tr.status]||tr.status}</span></div>
      </div>
    `).join("") || `<div class="empty-state">${t("emptyTournamentsDone")}</div>`;
  }

  bindTournamentCardClicks();
}

// Клик по карточке турнира открывает страницу турнира в отдельной вкладке
// (кнопка «Подать заявку» внутри карточки не должна триггерить переход).
function bindTournamentCardClicks(){
  document.querySelectorAll("[data-tournament]").forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest("[data-register-tournament]")) return;
      window.open(`/tournament-details.html?id=${el.dataset.tournament}`, "_blank", "noopener");
    };
  });
}

function renderNews(){
  const newsGridFull = document.getElementById("newsGridFull");
  if (newsGridFull) {
    newsGridFull.innerHTML = NEWS.map(n => newsCardHTML(n, true)).join("") || 
      `<div class="empty-state">${t("emptyNewsFull")}</div>`;
  }

  const newsFilters = document.getElementById("newsFilters");
  if (newsFilters) {
    const tags = [t("filterAll"), ...new Set(NEWS.map(n => n.tag))];
    newsFilters.innerHTML = tags.map(tag => `<button class="filter-chip">${tag}</button>`).join("");
  }
}

/* --------------------------------------------------------------
   MATCH DETAILS / PLAYER PROFILE / TEAM PROFILE PAGES
-------------------------------------------------------------- */
// Автоконвертация обычной ссылки YouTube/Twitch в embed-формат для
// iframe (админ может вставить обычную ссылку на видео/канал, не
// обязательно уже готовый embed URL). Twitch embed требует параметр
// parent=<домен сайта> — берём его из текущего hostname на клиенте.
function toEmbedStreamUrl(rawUrl){
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parentHost = window.location.hostname || "localhost";

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch" && u.searchParams.get("v")) {
        return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
      }
      if (u.pathname.startsWith("/live/")) {
        return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      }
      if (u.pathname.startsWith("/embed/")) return url; // уже embed
    }
    if (host === "twitch.tv") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "videos" && parts[1]) {
        return `https://player.twitch.tv/?video=${parts[1]}&parent=${parentHost}&autoplay=false`;
      }
      if (parts[0]) {
        return `https://player.twitch.tv/?channel=${parts[0]}&parent=${parentHost}&autoplay=false`;
      }
    }
    if (host === "player.twitch.tv") return url; // уже embed
    return url; // неизвестный формат — используем как есть (пусть будет уже готовый embed)
  } catch (e) {
    return url;
  }
}

function renderMatchDetailsPage(){
  const box = document.getElementById("matchDetails");
  if (!box) return;
  const id = new URLSearchParams(window.location.search).get("id");
  const m = MATCHES.find(x => x.id === id);
  if (!m) { box.innerHTML = `<div class="empty-state">${t("matchNotFound")}</div>`; return; }

  const teamA = teamById(m.teamA), teamB = teamById(m.teamB);
  if (!teamA || !teamB) { box.innerHTML = `<div class="empty-state">${t("loadingGeneric")}</div>`; return; }

  const titleEl = document.getElementById("matchTitle");
  if (titleEl) titleEl.textContent = `${teamA.name} vs ${teamB.name}`;

  const midLabel = m.status === "finished" ? t("labelResult") : (m.status === "live" ? "LIVE" : m.format);
  const midValue = m.score
    ? `<span class="md-score">${m.score[0]} : ${m.score[1]}</span>`
    : `<span class="countdown" data-countdown="${m.startAt}">${formatCountdown(m.startAt - Date.now())}</span>`;

  let html = `
    <div class="md-teams-panel">
      <div class="md-teams-grid">
        <div class="md-team" onclick="window.location.href='/team-profile.html?id=${teamA.id}'">
          ${tagBlock(teamA, 88)}
          <span class="team-name" style="font-size:18px;">${teamA.name}</span>
          ${formPills(teamA.form)}
        </div>
        <div class="md-vs">
          <span>${midLabel}</span>
          ${midValue}
          <span>${dateLabel(m.startAt, false)}</span>
        </div>
        <div class="md-team" onclick="window.location.href='/team-profile.html?id=${teamB.id}'">
          ${tagBlock(teamB, 88)}
          <span class="team-name" style="font-size:18px;">${teamB.name}</span>
          ${formPills(teamB.form)}
        </div>
      </div>
    </div>
  `;

  if ((m.status === "upcoming" || m.status === "live")) {
    const rosterA = PLAYERS.filter(pl => pl.teamId === teamA.id);
    const rosterB = PLAYERS.filter(pl => pl.teamId === teamB.id);
    html += `
      <div class="md-teams-panel">
        <div class="md-teams-grid" style="align-items:start;">
          <div>
            <div class="stat-team-label">${teamA.name} — ${t("compositionOf")}</div>
            <ul class="lineup">${rosterA.map(p => `<li onclick="window.location.href='/player-profile.html?id=${p.id}'">${p.nick}</li>`).join("") || `<li style="cursor:default;">${t("noRoster")}</li>`}</ul>
          </div>
          <div></div>
          <div>
            <div class="stat-team-label">${teamB.name} — ${t("compositionOf")}</div>
            <ul class="lineup">${rosterB.map(p => `<li onclick="window.location.href='/player-profile.html?id=${p.id}'">${p.nick}</li>`).join("") || `<li style="cursor:default;">${t("noRoster")}</li>`}</ul>
          </div>
        </div>
      </div>
    `;
  }

  if (m.status === "finished" && m.maps && m.maps.length) {
    html += `<div class="section-head" style="margin-top:24px;"><h2 style="font-size:19px;">${t("mapResultsTitle")}</h2></div>`;
    html += `<div class="maps-tabs">${m.maps.map(mp => `<span class="map-tab active" style="cursor:default;">${mp.name} — ${mp.score[0]}:${mp.score[1]}</span>`).join("")}</div>`;
    m.maps.forEach(map => {
      if (!map.playerStats) return;
      html += `<div class="stat-table">${statTable(map.playerStats, m.teamA, teamA)}</div>`;
      html += `<div class="stat-table">${statTable(map.playerStats, m.teamB, teamB)}</div>`;
    });
  }

  if (m.streamUrl) {
    const embedUrl = toEmbedStreamUrl(m.streamUrl);
    html += `
      <div class="md-teams-panel" style="margin-top:24px; padding:0; overflow:hidden;">
        <iframe src="${embedUrl}" frameborder="0" allowfullscreen style="width:100%; aspect-ratio:16/9; display:block;"></iframe>
      </div>
    `;
  }

  box.innerHTML = html;
}

function statTable(playerStats, teamId, team){
  const players = PLAYERS.filter(p => p.teamId === teamId);
  const head = `<div class="stat-row head"><span>${t("statHeadPlayer")}</span><span>${t("statHeadK")}</span><span>${t("statHeadD")}</span><span>${t("statHeadA")}</span><span>${t("statHeadDMG")}</span><span>${t("statHeadADR")}</span><span>${t("statHeadKAST")}</span><span>${t("statHeadRating")}</span></div>`;
  const rows = players.map(p => {
    const s = playerStats[p.id] || {};
    return `<div class="stat-row"><span>${p.nick}</span><span>${s.k ?? "—"}</span><span>${s.d ?? "—"}</span><span>${s.a ?? "—"}</span><span>${s.dmg ?? "—"}</span><span>${(s.adr || 0).toFixed(1)}</span><span>${s.kast ?? 0}%</span><span>${(s.rating || 0).toFixed(2)}</span></div>`;
  }).join("") || `<div class="stat-row"><span>${t("noStatsData")}</span></div>`;
  return `<div class="stat-team-label">${team ? team.name : "—"}</div>${head}${rows}`;
}

function renderPlayerProfilePage(){
  const box = document.getElementById("playerProfile");
  if (!box) return;
  const id = new URLSearchParams(window.location.search).get("id");
  const p = playerById(id);
  if (!p) { box.innerHTML = `<div class="empty-state">${t("playerNotFound")}</div>`; return; }

  const team = teamById(p.teamId);
  const nameEl = document.getElementById("playerName");
  if (nameEl) nameEl.textContent = p.nick;

  // Подтягиваем данные из личного кабинета пользователя с совпадающим ником:
  // фото профиля (если у самой карточки игрока фото не задано), контакты
  // (Telegram/Discord) и Elo/уровень Faceit.
  const linkedUser = findLinkedUserByNick(p.nick);
  const photoUrl = p.photoUrl || (linkedUser && linkedUser.photoUrl) || null;
  const avatarStyle = photoUrl ? `background-image:url('${photoUrl}');background-size:cover;background-position:center;` : "";

  const contactChips = [];
  if (linkedUser && linkedUser.telegram) {
    const handle = String(linkedUser.telegram).replace(/^@/, "");
    contactChips.push(`<a class="achv" href="https://t.me/${encodeURIComponent(handle)}" target="_blank" rel="noopener">Telegram: @${handle}</a>`);
  }
  if (linkedUser && linkedUser.discord) {
    contactChips.push(`<span class="achv">Discord: ${linkedUser.discord}</span>`);
  }
  const faceitNick = (linkedUser && linkedUser.faceitNickname) || p.faceitNickname;
  if (faceitNick) {
    contactChips.push(`<a class="achv" href="https://www.faceit.com/en/players/${encodeURIComponent(faceitNick)}" target="_blank" rel="noopener">Faceit: ${faceitNick}</a>`);
  }

  const faceitElo = (linkedUser && linkedUser.faceitElo) || p.faceitElo || null;
  const faceitLevel = (linkedUser && linkedUser.faceitLevel) || p.faceitLevel || null;

  box.innerHTML = `
    <div class="profile-head player-head">
      <div class="player-avatar" style="${avatarStyle}">${photoUrl ? "" : (p.nick || "?")[0]}</div>
      <div class="profile-info">
        <h1>${p.nick}</h1>
        ${team ? `<div class="profile-sub" onclick="window.location.href='/team-profile.html?id=${team.id}'">${team.name}</div>` : `<div class="profile-sub" style="cursor:default;">${t("noTeamShort")}</div>`}
        <div class="achievements">
          ${(p.achievements && p.achievements.length) ? p.achievements.map(a => `<span class="achv">${a}</span>`).join("") : ""}
          ${contactChips.join("")}
        </div>
      </div>
    </div>

    <div class="stat-cards">
      <div class="stat-card"><div class="val">${(p.kd || 0).toFixed(2)}</div><div class="lbl">K/D</div></div>
      <div class="stat-card"><div class="val">${(p.adr || 0).toFixed(1)}</div><div class="lbl">ADR</div></div>
      <div class="stat-card"><div class="val">${p.kast || 0}%</div><div class="lbl">KAST</div></div>
      <div class="stat-card"><div class="val">${(p.rating || 0).toFixed(2)}</div><div class="lbl">Rating</div></div>
      ${faceitElo ? `<div class="stat-card"><div class="val">${faceitElo}${faceitLevel ? ` <span style="font-size:13px; color:var(--ink-dim);">(lvl ${faceitLevel})</span>` : ""}</div><div class="lbl">Faceit Elo</div></div>` : ""}
    </div>

    <div class="two-col">
      <div class="panel-box">
        <h3>${t("matchesOfPlayer")}</h3>
        ${(p.matchIds && p.matchIds.length)
          ? p.matchIds.map(mid => {
              const match = MATCHES.find(x => x.id === mid);
              if (!match) return "";
              const opponent = teamById(match.teamA === p.teamId ? match.teamB : match.teamA);
              const result = match.status === "finished" && match.score ? (match.score[0] > match.score[1] ? "W" : "L") : "—";
              return `<div class="match-history-row" style="cursor:pointer;" onclick="window.location.href='/match-details.html?id=${match.id}'"><span>${opponent ? opponent.name : "—"}</span><span>${result}</span><span>${dateLabel(match.startAt, false)}</span></div>`;
            }).join("") || `<div class="empty-state" style="padding:24px 0;">${t("noMatches")}</div>`
          : `<div class="empty-state" style="padding:24px 0;">${t("noMatches")}</div>`}
      </div>
      <div class="panel-box">
        <h3>${t("weaponTitle")}</h3>
        <div class="weapon-tag">${p.weapon || t("weaponNotSet")}</div>
        <h3 style="margin-top:20px;">${t("formTitle")}</h3>
        ${(p.formGraph && p.formGraph.length)
          ? p.formGraph.map((r, i) => `<div class="map-wr-row"><span style="width:60px;">${t("matchLabelShort")} ${i + 1}</span><div class="map-wr-bar"><div class="map-wr-fill" style="width:${Math.min(100, r * 50)}%;"></div></div><span class="mono">${r.toFixed(2)}</span></div>`).join("")
          : `<div class="empty-state" style="padding:24px 0;">${t("noFormData")}</div>`}
        <h3 style="margin-top:20px;">${t("trophiesLabel")}</h3>
        ${Array.isArray(p.trophies) && p.trophies.length
          ? p.trophies.map(tr => {
              const wonDate = trophyWonDate(tr.wonAt);
              return `<div class="trophy-item" style="padding:8px 0; border-bottom:1px solid var(--line);"><span style="font-weight:600;">🏆 ${tr.tournamentName || "Unknown"}</span><span style="font-size:11px; color:var(--ink-dim);">${wonDate}</span></div>`;
            }).join("")
          : `<div class="empty-state" style="padding:24px 0;">${t("noTrophiesYet")}</div>`}
      </div>
    </div>
  `;
}

function renderTeamProfilePage(){
  const box = document.getElementById("teamProfile");
  if (!box) return;
  const id = new URLSearchParams(window.location.search).get("id");
  const team = teamById(id);
  if (!team) { box.innerHTML = `<div class="empty-state">${t("teamNotFound")}</div>`; return; }

  const nameEl = document.getElementById("teamName");
  if (nameEl) nameEl.textContent = team.name;

  const roster = PLAYERS.filter(p => p.teamId === team.id);
  const avatarStyle = team.logoUrl ? `background-image:url('${team.logoUrl}');background-size:cover;background-position:center;` : "";

  const recentMatches = MATCHES.filter(m => (m.teamA === team.id || m.teamB === team.id) && m.status === "finished")
    .sort((a,b) => b.startAt - a.startAt).slice(0, 10);

  const status = teamStatus(team);
  const statusBanner = status === "pending"
    ? `<div class="panel-box" style="border-color:var(--status-upcoming); margin-bottom:20px;"><h3 style="color:var(--status-upcoming);">⏳ ${t("teamPendingModerationTitle")}</h3><p class="form-note">${t("teamPendingModerationDesc")}</p></div>`
    : status === "rejected"
      ? `<div class="panel-box" style="border-color:var(--status-live); margin-bottom:20px;"><h3 style="color:var(--status-live);">✕ ${t("teamRejectedTitle")}</h3><p class="form-note">${t("teamRejectedDesc")}</p></div>`
      : "";

  box.innerHTML = `
    ${statusBanner}
    <div class="profile-head">
      <div class="avatar" style="${avatarStyle}">${team.logoUrl ? "" : teamTag(team)}</div>
      <div class="profile-info">
        <h1>${team.name}</h1>
        <div class="profile-sub" style="cursor:default;">${t("ratingLabel")} ${(team.rating || 0).toFixed(2)} · Elo ${team.elo || 1000} · ${Array.isArray(team.trophies) ? team.trophies.length : (team.trophies || 0)} 🏆</div>
        <div class="achievements">${formPills(team.form)}</div>
      </div>
    </div>

    <div class="stat-cards">
      <div class="stat-card"><div class="val">${team.winrate || 0}%</div><div class="lbl">${t("winrateLabel")}</div></div>
      <div class="stat-card"><div class="val">${team.elo || 1000}</div><div class="lbl">Elo</div></div>
      <div class="stat-card"><div class="val">${(team.rating || 0).toFixed(2)}</div><div class="lbl">${t("ratingLabel")}</div></div>
      <div class="stat-card"><div class="val">${Array.isArray(team.trophies) ? team.trophies.length : (team.trophies || 0)}</div><div class="lbl">${t("trophiesLabel")}</div></div>
      <div class="stat-card"><div class="val">${roster.length}</div><div class="lbl">${t("playersLabel")}</div></div>
    </div>

    <div class="two-col">
      <div class="panel-box">
        <h3>${t("lastMatches")}</h3>
        ${recentMatches.length ? recentMatches.map(m => {
          const opponent = teamById(m.teamA === team.id ? m.teamB : m.teamA);
          const isWin = m.score && ((m.teamA === team.id && m.score[0] > m.score[1]) || (m.teamB === team.id && m.score[1] > m.score[0]));
          return `<div class="match-history-row" style="cursor:pointer;" onclick="window.location.href='/match-details.html?id=${m.id}'"><span>${opponent ? opponent.name : "—"}</span><span style="color:${isWin ? "var(--win)" : "var(--loss)"};">${isWin ? "W" : "L"}</span><span>${dateLabel(m.startAt, false)}</span></div>`;
        }).join("") : `<div class="empty-state" style="padding:24px 0;">${t("noMatches")}</div>`}
      </div>
      <div class="panel-box">
        <h3>${t("compositionTitle")}</h3>
        <ul class="lineup">
          ${roster.length ? roster.map(p => `<li onclick="window.location.href='/player-profile.html?id=${p.id}'">${p.nick}</li>`).join("") : `<li style="cursor:default;">${t("noRoster")}</li>`}
        </ul>
        <h3 style="margin-top:20px;">${t("trophiesLabel")}</h3>
        ${Array.isArray(team.trophies) && team.trophies.length
          ? team.trophies.map(t => {
              const wonDate = trophyWonDate(t.wonAt);
              return `<div class="trophy-item" style="padding:8px 0; border-bottom:1px solid var(--line);"><span style="font-weight:600;">🏆 ${t.tournamentName || "Unknown"}</span><span style="font-size:11px; color:var(--ink-dim);">${wonDate}</span></div>`;
            }).join("")
          : `<div class="empty-state" style="padding:24px 0;">Нет трофеев</div>`}
      </div>
    </div>
    
    <div class="panel-box" style="margin-top:16px;">
      <h3>${t("mapStatsTitle")}</h3>
      ${(team.mapWinrate && Object.keys(team.mapWinrate).length)
        ? Object.entries(team.mapWinrate).map(([map, s]) => {
            const total = Math.max(1, s.wins + s.losses);
            return `<div class="map-wr-row"><span style="width:80px;">${map}</span><div class="map-wr-bar"><div class="map-wr-fill" style="width:${(s.wins / total) * 100}%;"></div></div><span class="mono">${s.wins}-${s.losses}</span></div>`;
          }).join("")
        : `<div class="empty-state" style="padding:24px 0;">${t("noFormData")}</div>`}
    </div>
  `;
}

/* --------------------------------------------------------------
   СТРАНИЦА ТУРНИРА (tournament-details.html) — открывается по клику
   на карточку турнира в отдельной вкладке. Вкладки: Сетка / Участники /
   Матчи / Топ-5 игроков. Переиспользует .ac-tabs/.ac-tab-panel стили
   и биндинг переключения вкладок из личного кабинета.
-------------------------------------------------------------- */
function renderTournamentDetailsPage(){
  const box = document.getElementById("tournamentDetails");
  if (!box) return;
  const id = new URLSearchParams(window.location.search).get("id");
  const tr = tournamentById(id);
  const nameEl = document.getElementById("tournamentDetailsName");

  if (!tr) {
    if (nameEl) nameEl.textContent = t("tournamentNotFound");
    box.innerHTML = `<div class="empty-state">${t("tournamentNotFound")}</div>`;
    return;
  }
  if (nameEl) nameEl.textContent = tr.name;

  const statusLabel = { live: t("statusLive"), upcoming: t("statusUpcoming"), done: t("statusDone") };
  const teamIds = tr.registeredTeamIds || [];
  const teams = teamIds.map(teamById).filter(Boolean);
  const trMatches = MATCHES.filter(m => m.tournamentId === tr.id).sort((a,b) => b.startAt - a.startAt);
  const top5 = PLAYERS.filter(p => teamIds.includes(p.teamId)).sort((a,b) => (b.rating||0) - (a.rating||0)).slice(0, 5);

  box.innerHTML = `
    ${tr.pinned && tr.bannerUrl ? `<div class="tournament-banner" style="background-image:url('${tr.bannerUrl}');"></div>` : tr.pinned ? `<div class="tournament-banner-placeholder">No Banner</div>` : ''}
    <div class="profile-head" style="padding-top:0;">
      <div class="profile-info">
        <h1>${tr.name}</h1>
        <div class="account-hero-meta" style="margin-top:6px;">
          <span class="status-badge ${tr.status}">${statusLabel[tr.status] || tr.status}</span>
          ${tr.period ? `<span>${tr.period}</span>` : ""}
          <span>${t("prizeLabel")}: ${tr.prizePool || "—"}</span>
          <span>${teamIds.length} ${t("teamsCountSuffix")}</span>
        </div>
      </div>
    </div>

    <div class="ac-tabs">
      <button type="button" class="ac-tab-btn active" data-ac-tab="tdbracket">${t("tdTabBracket")}</button>
      <button type="button" class="ac-tab-btn" data-ac-tab="tdparticipants">${t("tdTabParticipants")}</button>
      <button type="button" class="ac-tab-btn" data-ac-tab="tdmatches">${t("tdTabMatches")}</button>
      <button type="button" class="ac-tab-btn" data-ac-tab="tdtop5">${t("tdTabTop5")}</button>
    </div>

    <div class="ac-tab-panel active" id="ac-tab-tdbracket">${tournamentBracketHTML(tr)}</div>
    <div class="ac-tab-panel" id="ac-tab-tdparticipants">${tournamentParticipantsHTML(teams)}</div>
    <div class="ac-tab-panel" id="ac-tab-tdmatches">${tournamentMatchesHTML(trMatches)}</div>
    <div class="ac-tab-panel" id="ac-tab-tdtop5">${tournamentTop5HTML(top5)}</div>
  `;
  bindMatchClicks();
}

// Красивая турнирная сетка (только чтение) — раунды в колонках с
// настоящими соединительными линиями между парами (как в классической
// сетке плей-офф). Позиции матчей считаются в пикселях: раунд 0 —
// равномерно, каждый следующий раунд — по центру между "родителями".
function publicStandingsTableHTML(rows, kind){
  const head = kind === "league"
    ? `<div class="data-row head" style="grid-template-columns:40px 2fr 50px 50px 50px 50px 60px 60px;"><span>#</span><span>${t("thTeam")}</span><span>${t("stP")}</span><span>${t("stW")}</span><span>${t("stD")}</span><span>${t("stL")}</span><span>+/-</span><span>${t("stPts")}</span></div>`
    : `<div class="data-row head" style="grid-template-columns:40px 2fr 60px 60px;"><span>#</span><span>${t("thTeam")}</span><span>${t("stW")}</span><span>${t("stL")}</span></div>`;
  const body = rows.map((row, i) => {
    const tm = teamById(row.teamId);
    const name = tm ? tm.name : "?";
    if (kind === "league") {
      return `<div class="data-row" onclick="window.location.href='/team-profile.html?id=${row.teamId}'">
        <span class="d-rank">${i + 1}</span><span class="d-team">${tm ? tagBlock(tm, 24) : ""}${name}</span>
        <span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span>
        <span class="mono">${row.gf - row.ga >= 0 ? "+" : ""}${row.gf - row.ga}</span><span class="mono" style="font-weight:700;">${row.pts}</span>
      </div>`;
    }
    return `<div class="data-row" onclick="window.location.href='/team-profile.html?id=${row.teamId}'">
      <span class="d-rank">${i + 1}</span><span class="d-team">${tm ? tagBlock(tm, 24) : ""}${name}</span>
      <span class="mono">${row.wins}</span><span class="mono">${row.losses}</span>
    </div>`;
  }).join("");
  return `<div class="data-table" style="margin-top:16px;">${head}${body}</div>`;
}

function swissPublicHTML(tr){
  const bracket = tr.bracket;
  const teamIds = tr.registeredTeamIds || [];
  if (!bracket || !Array.isArray(bracket.rounds) || !bracket.rounds.length) {
    return `<div class="empty-state">${t("tdNoBracket")}</div>`;
  }
  const standings = swissStandings(bracket, teamIds);
  const champId = swissWinnerId(bracket, teamIds);
  const roundsHTML = bracket.rounds.map((round, ri) => `
    <div style="min-width:220px; flex:1;">
      <div class="bracket-round-title">${t("swissRound")} ${ri + 1}</div>
      ${round.matches.map(m => `
        <div class="bracket-match" style="position:static; margin-bottom:12px;">
          <div class="bracket-team ${m.winner === m.teamA ? "winner" : ""}" ${m.teamA !== "BYE" ? `data-bracket-team-link="${m.teamA}"` : ""}>
            <span class="bracket-team-name">${m.teamA !== "BYE" ? tagBlock(teamById(m.teamA), 20) : ""}<span>${bracketTeamLabel(m.teamA)}</span></span>
            ${m.scoreA !== null ? `<span class="bracket-score">${m.scoreA}</span>` : ""}
          </div>
          <div class="bracket-team ${m.winner === m.teamB ? "winner" : ""}" ${m.teamB !== "BYE" ? `data-bracket-team-link="${m.teamB}"` : ""}>
            <span class="bracket-team-name">${m.teamB !== "BYE" ? tagBlock(teamById(m.teamB), 20) : ""}<span>${bracketTeamLabel(m.teamB)}</span></span>
            ${m.scoreB !== null ? `<span class="bracket-score">${m.scoreB}</span>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
  return `
    ${champId ? `<div class="form-note" style="color:var(--win); font-size:14px; margin-bottom:16px;">🏆 ${t("tdChampion")}: <strong>${bracketTeamLabel(champId)}</strong></div>` : ""}
    <div style="display:flex; gap:16px; overflow-x:auto; margin-bottom:8px;">${roundsHTML}</div>
    ${publicStandingsTableHTML(standings, "swiss")}
  `;
}

function leaguePublicHTML(tr){
  const bracket = tr.bracket;
  const teamIds = tr.registeredTeamIds || [];
  const matches = leagueMatches(bracket);
  if (!matches.length) return `<div class="empty-state">${t("tdNoBracket")}</div>`;
  const standings = leagueStandings(bracket, teamIds);
  const champId = leagueWinnerId(bracket, teamIds);
  const matchesHTML = matches.map(m => `
    <div class="bracket-match" style="position:static;">
      <div class="bracket-team ${m.winner === m.teamA ? "winner" : ""}" data-bracket-team-link="${m.teamA}">
        <span class="bracket-team-name">${tagBlock(teamById(m.teamA), 20)}<span>${bracketTeamLabel(m.teamA)}</span></span>
        ${m.scoreA !== null ? `<span class="bracket-score">${m.scoreA}</span>` : ""}
      </div>
      <div class="bracket-team ${m.winner === m.teamB ? "winner" : ""}" data-bracket-team-link="${m.teamB}">
        <span class="bracket-team-name">${tagBlock(teamById(m.teamB), 20)}<span>${bracketTeamLabel(m.teamB)}</span></span>
        ${m.scoreB !== null ? `<span class="bracket-score">${m.scoreB}</span>` : ""}
      </div>
    </div>
  `).join("");
  return `
    ${champId ? `<div class="form-note" style="color:var(--win); font-size:14px; margin-bottom:16px;">🏆 ${t("tdChampion")}: <strong>${bracketTeamLabel(champId)}</strong></div>` : ""}
    ${publicStandingsTableHTML(standings, "league")}
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:12px; margin-top:16px;">${matchesHTML}</div>
  `;
}

function tournamentBracketHTML(tr){
  const bracketType = tr.bracketType || "single";
  if (isSwissBracketType(bracketType)) return swissPublicHTML(tr);
  if (isLeagueBracketType(bracketType)) return leaguePublicHTML(tr);
  const bracket = tr.bracket;
  if (!bracket || !Array.isArray(bracket.rounds) || !bracket.rounds.length) {
    return `<div class="empty-state">${t("tdNoBracket")}</div>`;
  }
  const rounds = bracket.rounds;

  const total = rounds.length;
  const champId = bracketTournamentWinnerId(rounds);

  const MATCH_H = 64, GAP0 = 26, UNIT = MATCH_H + GAP0, ROUND_W = 224, CONNECTOR_W = 32;
  const n0 = rounds[0].matches.length;
  const colHeight = n0 > 0 ? (n0 - 1) * UNIT + MATCH_H : MATCH_H;

  // Вертикальный центр каждого матча по раундам (в px относительно
  // верхней границы колонки с матчами).
  const centers = [];
  centers[0] = rounds[0].matches.map((_, mi) => mi * UNIT + MATCH_H / 2);
  for (let ri = 1; ri < total; ri++) {
    centers[ri] = rounds[ri].matches.map((_, mi) => (centers[ri - 1][2 * mi] + centers[ri - 1][2 * mi + 1]) / 2);
  }

  const teamRow = (id, score, winner) => {
    const tm = id !== "BYE" ? teamById(id) : null;
    const clickable = tm ? `data-bracket-team-link="${tm.id}"` : "";
    return `
      <div class="bracket-team ${winner ? "winner" : ""}" ${clickable}>
        <span class="bracket-team-name">${tm ? tagBlock(tm, 20) : ""}<span>${bracketTeamLabel(id)}</span></span>
        ${score !== null && score !== undefined ? `<span class="bracket-score">${score}</span>` : ""}
      </div>`;
  };

  const roundsHTML = rounds.map((round, ri) => {
    const matchesHTML = round.matches.map((m, mi) => {
      const isBye = m.teamA === "BYE" || m.teamB === "BYE";
      const top = centers[ri][mi] - MATCH_H / 2;
      return `
        <div class="bracket-match ${isBye ? "bye" : ""}" style="top:${top}px; height:${MATCH_H}px;">
          ${teamRow(m.teamA, m.scoreA, m.winner === m.teamA)}
          ${teamRow(m.teamB, m.scoreB, m.winner === m.teamB)}
        </div>`;
    }).join("");
    return `
      <div class="bracket-round" style="width:${ROUND_W}px;">
        <div class="bracket-round-title">${bracketRoundTitle(ri, total)}</div>
        <div class="bracket-round-matches" style="width:${ROUND_W}px; height:${colHeight}px;">${matchesHTML}</div>
      </div>`;
  });

  // Соединители между раундами: горизонтальный отрезок от каждого матча,
  // вертикальный отрезок, объединяющий пару, и горизонтальный отрезок
  // от середины пары до матча следующего раунда (её y-координата
  // совпадает с центром следующего матча по построению centers[]).
  const connectorsHTML = [];
  for (let ri = 0; ri < total - 1; ri++) {
    const lines = [];
    rounds[ri].matches.forEach((m, mi) => {
      const y = centers[ri][mi];
      lines.push(`<line x1="0" y1="${y}" x2="${CONNECTOR_W / 2}" y2="${y}" class="bracket-line"/>`);
    });
    for (let mi = 0; mi < rounds[ri].matches.length; mi += 2) {
      const y1 = centers[ri][mi], y2 = centers[ri][mi + 1], ym = centers[ri + 1][mi / 2];
      lines.push(`<line x1="${CONNECTOR_W / 2}" y1="${y1}" x2="${CONNECTOR_W / 2}" y2="${y2}" class="bracket-line"/>`);
      lines.push(`<line x1="${CONNECTOR_W / 2}" y1="${ym}" x2="${CONNECTOR_W}" y2="${ym}" class="bracket-line"/>`);
    }
    connectorsHTML.push(`<svg class="bracket-connector" width="${CONNECTOR_W}" height="${colHeight}" viewBox="0 0 ${CONNECTOR_W} ${colHeight}">${lines.join("")}</svg>`);
  }

  let gridHTML = "";
  roundsHTML.forEach((r, i) => { gridHTML += r; if (connectorsHTML[i]) gridHTML += connectorsHTML[i]; });

  return `
    ${champId ? `<div class="form-note" style="color:var(--win); font-size:14px; margin-bottom:16px;">🏆 ${t("tdChampion")}: <strong>${bracketTeamLabel(champId)}</strong></div>` : ""}
    <div class="bracket-grid">${gridHTML}</div>
  `;
}

function tournamentParticipantsHTML(teams){
  if (!teams.length) return `<div class="empty-state">${t("tdNoParticipants")}</div>`;
  return `
    <div class="participants-grid">
      ${teams.map(tm => `
        <div class="data-row" style="grid-template-columns:1fr auto; cursor:pointer;" onclick="window.location.href='/team-profile.html?id=${tm.id}'">
          <span class="d-team">${tagBlock(tm, 30)}${tm.name}</span>
          <span class="mono">${(tm.rating || 0).toFixed(2)} RTG</span>
        </div>
      `).join("")}
    </div>
  `;
}

function tournamentMatchesHTML(matches){
  if (!matches.length) return `<div class="empty-state">${t("tdNoMatches")}</div>`;
  return `<div class="tournament-grid">${matches.map(m => matchCardHTML(m, false)).join("")}</div>`;
}

function tournamentTop5HTML(players){
  if (!players.length) return `<div class="empty-state">${t("tdNoTop5")}</div>`;
  const top10 = players.slice(0, 10);
  const showMore = players.length > 10;
  
  const getMedalClass = (rank) => {
    if (rank === 0) return 'gold';
    if (rank === 1) return 'silver';
    if (rank === 2) return 'bronze';
    return '';
  };
  
  const getMedalIcon = (rank) => {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return `#${rank + 1}`;
  };
  
  return `
    <div class="top10-grid">
      ${top10.map((p, i) => `
        <button type="button" class="top10-card ${getMedalClass(i)}" onclick="window.location.href='/player-profile.html?id=${p.id}'">
          <span class="top10-rank">${getMedalIcon(i)}</span>
          <span class="top10-nick">${p.nick}</span>
          <span class="top10-team">${teamTag(teamById(p.teamId))}</span>
          <span class="top10-rating mono">${(p.rating || 0).toFixed(2)}</span>
        </button>
      `).join("")}
    </div>
    ${showMore ? `<button class="btn ghost sm" id="showMorePlayers" style="margin-top:16px; width:100%;">Смотреть больше (${players.length - 10} ещё)</button>` : ''}
    <div id="allPlayersList" style="display:none; margin-top:16px;">
      <div class="data-table">
        ${players.slice(10).map((p, i) => `
          <div class="data-row" onclick="window.location.href='/player-profile.html?id=${p.id}'">
            <span class="d-rank">#${i + 11}</span>
            <span class="d-team">${p.nick} <span class="d-dim">${teamTag(teamById(p.teamId))}</span></span>
            <span class="mono">${(p.rating || 0).toFixed(2)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAdmin(){
  const shell = document.querySelector(".admin-shell");
  const note = document.querySelector(".admin-note");
  if (!isAdmin()) {
    if (shell) shell.style.display = "none";
    if (note) note.textContent = currentUser
      ? t("adminAccessDenied")
      : t("adminLoginRequired");
    return;
  }
  if (shell) shell.style.display = "";
  if (note) note.textContent = t("adminManaging");

  renderAdminRequests();
  renderAdminTeams();
  renderAdminPlayers();
  renderAdminMatches();
  renderAdminTournaments();
  renderAdminNews();
  renderAdminAccounts();
  fillBracketTournamentSelect();
}

/* --------------------------------------------------------------
   ADMIN: ЗАЯВКИ НА РЕГИСТРАЦИЮ (Infinity-style card layout)
-------------------------------------------------------------- */
function renderAdminRequests(){
  const pendingBox = document.getElementById("requests-list-pending");
  const approvedBox = document.getElementById("requests-list-approved");
  if (!pendingBox || !approvedBox) return;

  const pending = REQUESTS.filter(r => r.status === "pending");
  const approved = REQUESTS.filter(r => r.status === "approved");

  pendingBox.innerHTML = pending.map(r => {
    const t = teamById(r.teamId);
    const tour = tournamentById(r.tournamentId);
    return `
    <div class="app-card">
      <div class="app-top">
        <div>
          <span class="app-status-badge pending">Новая заявка</span>
          <div style="margin-top:8px;"><strong>${t ? t.name : "—"}</strong></div>
          <div style="font-size:12px; color:var(--ink-dim);">→ ${tour ? tour.name : "—"}</div>
          <div style="font-size:11px; color:var(--ink-faint); margin-top:4px;">${r.contactInfo || "—"}</div>
        </div>
        <div class="app-actions">
          <button class="approve" data-accept-req="${r.id}">✓ Принять</button>
          <button class="reject" data-reject-req="${r.id}">✕ Отклонить</button>
        </div>
      </div>
    </div>`;
  }).join("") || `<div class="empty-state">Нет новых заявок</div>`;

  approvedBox.innerHTML = approved.map(r => {
    const t = teamById(r.teamId);
    const tour = tournamentById(r.tournamentId);
    return `
    <div class="app-card">
      <div class="app-top">
        <div>
          <span class="app-status-badge approved">Одобрено</span>
          <div style="margin-top:8px;"><strong>${t ? t.name : "—"}</strong></div>
          <div style="font-size:12px; color:var(--ink-dim);">→ ${tour ? tour.name : "—"}</div>
          <div style="font-size:11px; color:var(--ink-faint); margin-top:4px;">${r.contactInfo || "—"}</div>
        </div>
        <div class="app-actions">
          <button class="delete" data-reject-req="${r.id}">✕ Удалить</button>
        </div>
      </div>
    </div>`;
  }).join("") || `<div class="empty-state">Нет одобренных заявок</div>`;

  // Update notification dots
  updateNotificationDots();
}

async function acceptRequest(id){
  const req = REQUESTS.find(r => r.id === id);
  if (!req) return;
  const tour = tournamentById(req.tournamentId);
  if (!tour) { alert("Турнир не найден."); return; }
  const registered = new Set(tour.registeredTeamIds || []);
  registered.add(req.teamId);
  await updateDoc(doc(db, "tournaments", req.tournamentId), { registeredTeamIds: Array.from(registered) });
  await updateDoc(doc(db, "teamRegistrations", id), { status: "approved" });
}

async function rejectRequest(id){
  await updateDoc(doc(db, "teamRegistrations", id), { status: "rejected" });
}

/* --------------------------------------------------------------
   ADMIN: АККАУНТЫ ПОЛЬЗОВАТЕЛЕЙ (Infinity-style card layout)
-------------------------------------------------------------- */
function renderAdminAccounts(){
  const box = document.getElementById("accounts-list");
  if (!box) return;
  
  if (!USERS.length) { box.innerHTML = `<div class="empty-state">Нет зарегистрированных пользователей</div>`; return; }

  box.innerHTML = USERS.map(u => {
    const team = u.teamId ? teamById(u.teamId) : null;
    return `
    <div class="app-card">
      <div class="app-top">
        <div>
          <span class="app-status-badge ${u.role === 'admin' ? 'approved' : 'pending'}">${u.role === 'admin' ? 'Админ' : 'Пользователь'}</span>
          <div style="margin-top:8px;"><strong>${u.nickname || u.email}</strong></div>
          <div style="font-size:12px; color:var(--ink-dim);">${u.email}</div>
          ${team ? `<div style="font-size:11px; color:var(--ink-faint); margin-top:4px;">Команда: ${team.name}</div>` : ''}
        </div>
        <div class="app-actions">
          ${u.role !== 'admin' ? `<button class="approve" data-promote-user="${u.id}">👑 Админ</button>` : ''}
          <button class="delete" data-delete-user="${u.id}">🗑 Удалить</button>
        </div>
      </div>
    </div>`;
  }).join("");

  // Update notification dots
  updateNotificationDots();
}

async function promoteUserToAdmin(id){
  if (!confirm("Выдать этому пользователю права администратора?")) return;
  await updateDoc(doc(db, "users", id), { role: "admin" });
}

async function deleteUser(id){
  if (!confirm("Удалить профиль пользователя безвозвратно?")) return;
  await deleteDoc(doc(db, "users", id));
}

/* --------------------------------------------------------------
   ADMIN: УВЕДОМЛЕНИЯ (notification dots)
-------------------------------------------------------------- */
function updateNotificationDots(){
  const pendingRequests = REQUESTS.filter(r => r.status === "pending").length;
  const mutedAt = localStorage.getItem("mlt_muted_requests");
  const shouldShowDot = pendingRequests > 0 && (!mutedAt || Date.now() - parseInt(mutedAt) > 60000); // Show if new requests or not muted for 1 min

  const requestsDot = document.getElementById("admin-tab-dot-requests");
  const pendingDot = document.getElementById("requests-pending-dot");
  
  if (requestsDot) requestsDot.style.display = shouldShowDot ? "inline-block" : "none";
  if (pendingDot) pendingDot.style.display = shouldShowDot ? "inline-block" : "none";

  const pendingTeams = TEAMS.filter(tm => teamStatus(tm) === "pending").length;
  const teamsMutedAt = localStorage.getItem("mlt_muted_teams");
  const shouldShowTeamsDot = pendingTeams > 0 && (!teamsMutedAt || Date.now() - parseInt(teamsMutedAt) > 60000);

  const teamsDot = document.getElementById("admin-tab-dot-teams");
  const teamsPendingDot = document.getElementById("teams-pending-dot");
  if (teamsDot) teamsDot.style.display = shouldShowTeamsDot ? "inline-block" : "none";
  if (teamsPendingDot) teamsPendingDot.style.display = shouldShowTeamsDot ? "inline-block" : "none";
}

/* --------------------------------------------------------------
   ADMIN: КОМАНДЫ
-------------------------------------------------------------- */
function renderAdminTeams(){
  const pendingBox = document.getElementById("teams-list-pending");
  const allBox = document.getElementById("adminTeamsTable");
  const searchInput = document.getElementById("searchTeams");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (!allBox) return;

  const pending = TEAMS.filter(tm => teamStatus(tm) === "pending");

  if (pendingBox) {
    pendingBox.innerHTML = pending.map(tm => `
      <div class="app-card">
        <div class="app-top">
          <div>
            <span class="app-status-badge pending">${t("teamStatusPending")}</span>
            <div style="margin-top:8px;">${tagBlock(tm, 24)}<strong>${tm.name}</strong></div>
            <div style="font-size:12px; color:var(--ink-dim); margin-top:4px;">${(tm.main || []).map(p => p.nick).join(", ") || "—"}</div>
          </div>
          <div class="app-actions">
            <button class="approve" data-accept-team="${tm.id}">✓ Одобрить</button>
            <button class="reject" data-reject-team="${tm.id}">✕ Отклонить</button>
          </div>
        </div>
      </div>`).join("") || `<div class="empty-state">${t("adminNoTeamModeration")}</div>`;
  }

  const filteredTeams = searchTerm 
    ? TEAMS.filter(tm => tm.name.toLowerCase().includes(searchTerm))
    : TEAMS;
    
  if (!filteredTeams.length) { allBox.innerHTML = `<div class="empty-state">${searchTerm ? "Ничего не найдено" : t("adminNoTeams")}</div>`; return; }
  allBox.innerHTML = `
    <div class="data-row head"><span>Команда</span><span>Статус</span><span>Рейтинг</span><span>Трофеи</span><span></span></div>
    ${filteredTeams.map(tm => {
      const st = teamStatus(tm);
      const badge = st === "pending" ? `<span class="app-status-badge pending">${t("teamStatusPending")}</span>`
        : st === "rejected" ? `<span class="app-status-badge rejected">${t("teamStatusRejected")}</span>`
        : `<span class="app-status-badge approved">${t("teamStatusApproved")}</span>`;
      return `
      <div class="data-row">
        <span class="d-team">${tagBlock(tm, 28)}${tm.name}</span>
        <span>${badge}</span>
        <span class="mono">${(tm.rating || 0).toFixed(2)}</span>
        <span>${Array.isArray(tm.trophies) ? tm.trophies.length : (tm.trophies || 0)}</span>
        <span class="row-actions">
          <button class="btn ghost sm" data-edit-team="${tm.id}">✎</button>
          <button class="btn danger sm" data-del-team="${tm.id}">✕</button>
        </span>
      </div>
    `; }).join("")}
  `;

  updateNotificationDots();
}

async function acceptTeam(id){
  await updateDoc(doc(db, "teams", id), { status: "approved" });
}

async function rejectTeam(id){
  await updateDoc(doc(db, "teams", id), { status: "rejected" });
}

function openAddTeam(){
  editingTeamId = null;
  document.getElementById("adminTeamForm").reset();
  document.getElementById("atModalTitle").textContent = "Добавить команду";
  document.getElementById("atSubmitBtn").textContent = "Добавить";
  openModal("adminTeamModal");
}

function openEditTeam(id){
  const t = teamById(id);
  if (!t) return;
  editingTeamId = id;
  document.getElementById("adminTeamForm").reset();
  document.getElementById("atName").value = t.name || "";
  document.getElementById("atModalTitle").textContent = "Редактировать команду";
  document.getElementById("atSubmitBtn").textContent = "Сохранить";
  openModal("adminTeamModal");
}

async function deleteTeam(id){
  if (!confirm("Удалить команду безвозвратно? Игроки этой команды останутся, но потеряют привязку.")) return;
  await deleteDoc(doc(db, "teams", id));
}

async function submitTeamForm(e){
  e.preventDefault();
  const name = document.getElementById("atName").value.trim();
  const fileInput = document.getElementById("atLogo");
  const note = document.getElementById("atNote");
  note.textContent = ""; note.style.color = "";
  try {
    let logoUrl = null;
    if (fileInput.files && fileInput.files[0]) {
      logoUrl = await fileToResizedDataURL(fileInput.files[0], 200, 0.72);
    }
    if (editingTeamId) {
      const patch = { name };
      if (logoUrl) patch.logoUrl = logoUrl;
      await updateDoc(doc(db, "teams", editingTeamId), patch);
    } else {
      await setDoc(doc(collection(db, "teams")), {
        name, logoUrl: logoUrl || null, ownerUid: null,
        main: [], reserve: [], rating: 0, winrate: 0, trophies: 0,
        form: [], mapWinrate: {}, status: "approved", createdAt: serverTimestamp()
      });
    }
    closeModal("adminTeamModal");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = "Ошибка: " + (err.message || err);
  }
}

/* --------------------------------------------------------------
   ADMIN: ИГРОКИ
-------------------------------------------------------------- */
function renderAdminPlayers(){
  const box = document.getElementById("adminPlayersTable");
  const searchInput = document.getElementById("searchPlayers");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (!box) return;
  
  const filteredPlayers = searchTerm 
    ? PLAYERS.filter(p => p.nick.toLowerCase().includes(searchTerm))
    : PLAYERS;
    
  if (!filteredPlayers.length) { box.innerHTML = `<div class="empty-state">${searchTerm ? "Ничего не найдено" : "Пока нет игроков"}</div>`; return; }
  box.innerHTML = `
    <div class="data-row head"><span>Игрок</span><span>K/D</span><span>ADR</span><span>Рейтинг</span><span></span></div>
    ${filteredPlayers.map(p => `
      <div class="data-row">
        <span class="d-team">${p.nick} <span class="d-dim">${teamTag(teamById(p.teamId))}</span></span>
        <span class="mono">${(p.kd || 0).toFixed(2)}</span>
        <span class="mono">${(p.adr || 0).toFixed(1)}</span>
        <span class="mono">${(p.rating || 0).toFixed(2)}</span>
        <span class="row-actions">
          <button class="btn ghost sm" data-edit-player="${p.id}">✎</button>
          <button class="btn danger sm" data-del-player="${p.id}">✕</button>
        </span>
      </div>
    `).join("")}
  `;
}

function openAddPlayer(){
  editingPlayerId = null;
  document.getElementById("adminPlayerForm").reset();
  fillTeamSelect(document.getElementById("apTeam"));
  document.getElementById("apModalTitle").textContent = "Добавить игрока";
  document.getElementById("apSubmitBtn").textContent = "Добавить";
  openModal("adminPlayerModal");
}

function openEditPlayer(id){
  const p = playerById(id);
  if (!p) return;
  editingPlayerId = id;
  fillTeamSelect(document.getElementById("apTeam"), p.teamId);
  document.getElementById("apNick").value = p.nick || "";
  document.getElementById("apWeapon").value = p.weapon || "";
  document.getElementById("apModalTitle").textContent = "Редактировать игрока";
  document.getElementById("apSubmitBtn").textContent = "Сохранить";
  openModal("adminPlayerModal");
}

async function deletePlayer(id){
  if (!confirm("Удалить игрока безвозвратно?")) return;
  await deleteDoc(doc(db, "players", id));
}

async function submitPlayerForm(e){
  e.preventDefault();
  const nick = document.getElementById("apNick").value.trim();
  const teamId = document.getElementById("apTeam").value;
  const weapon = document.getElementById("apWeapon").value.trim();
  const note = document.getElementById("apNote");
  note.textContent = ""; note.style.color = "";
  try {
    if (editingPlayerId) {
      await updateDoc(doc(db, "players", editingPlayerId), { nick, teamId, weapon: weapon || null });
    } else {
      await setDoc(doc(collection(db, "players")), {
        nick, teamId, weapon: weapon || null,
        kd: 0, adr: 0, kast: 0, rating: 0,
        achievements: [], formGraph: [], matchIds: [],
        createdAt: serverTimestamp()
      });
    }
    closeModal("adminPlayerModal");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = "Ошибка: " + (err.message || err);
  }
}

/* --------------------------------------------------------------
   ADMIN: МАТЧИ
-------------------------------------------------------------- */
function renderAdminMatches(){
  const box = document.getElementById("adminMatchesTable");
  if (!box) return;
  if (!MATCHES.length) { box.innerHTML = `<div class="empty-state">Пока нет матчей</div>`; return; }
  const sorted = [...MATCHES].sort((a, b) => b.startAt - a.startAt);
  const statusLabel = { upcoming: "Ожидается", live: "В эфире", finished: "Завершён" };
  box.innerHTML = `
    <div class="data-row head"><span>Матч</span><span>Формат</span><span>Дата</span><span>Статус</span><span></span></div>
    ${sorted.map(m => {
      const a = teamById(m.teamA), b = teamById(m.teamB);
      const label = a && b ? `${a.name} vs ${b.name}` : "—";
      return `
      <div class="data-row">
        <span class="d-team">${label}</span>
        <span>${m.format}</span>
        <span>${dateLabel(m.startAt, false)}</span>
        <span>${statusLabel[m.status] || m.status}</span>
        <span class="row-actions">
          <button class="btn ghost sm" data-result-match="${m.id}">Результат</button>
          <button class="btn ghost sm" data-stream-match="${m.id}">Трансляция</button>
          <button class="btn ghost sm" data-edit-match="${m.id}">✎</button>
          <button class="btn danger sm" data-del-match="${m.id}">✕</button>
        </span>
      </div>`;
    }).join("")}
  `;
}

function openAddMatch(){
  editingMatchId = null;
  document.getElementById("adminMatchForm").reset();
  fillTeamSelect(document.getElementById("amTeamA"));
  fillTeamSelect(document.getElementById("amTeamB"));
  fillTournamentSelect(document.getElementById("amTournament"), "", true);
  document.getElementById("amModalTitle").textContent = "Создать матч";
  document.getElementById("amSubmitBtn").textContent = "Создать";
  openModal("adminMatchModal");
}

function openEditMatch(id){
  const m = MATCHES.find(x => x.id === id);
  if (!m) return;
  editingMatchId = id;
  fillTeamSelect(document.getElementById("amTeamA"), m.teamA);
  fillTeamSelect(document.getElementById("amTeamB"), m.teamB);
  fillTournamentSelect(document.getElementById("amTournament"), m.tournamentId || "", true);
  document.getElementById("amFormat").value = m.format;
  const d = new Date(m.startAt);
  const pad = n => String(n).padStart(2, "0");
  document.getElementById("amWhen").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById("amModalTitle").textContent = "Редактировать матч";
  document.getElementById("amSubmitBtn").textContent = "Сохранить";
  openModal("adminMatchModal");
}

async function deleteMatch(id){
  if (!confirm("Удалить матч безвозвратно?")) return;
  await deleteDoc(doc(db, "matches", id));
}

async function setMatchStream(id){
  const m = MATCHES.find(x => x.id === id);
  if (!m) return;
  const url = prompt("Ссылка на трансляцию (обычная ссылка YouTube/Twitch, конвертируется в embed автоматически; оставьте пустым чтобы убрать):", m.streamUrl || "");
  if (url === null) return; // отмена
  await updateDoc(doc(db, "matches", id), { streamUrl: url.trim() || null });
}

async function submitMatchForm(e){
  e.preventDefault();
  const teamA = document.getElementById("amTeamA").value;
  const teamB = document.getElementById("amTeamB").value;
  const tournamentId = document.getElementById("amTournament").value || null;
  const format = document.getElementById("amFormat").value;
  const whenStr = document.getElementById("amWhen").value;
  const note = document.getElementById("amNote");
  note.textContent = ""; note.style.color = "";
  if (teamA === teamB) { note.style.color = "var(--loss)"; note.textContent = "Команда не может играть сама с собой."; return; }
  const startAt = new Date(whenStr).getTime();
  try {
    if (editingMatchId) {
      await updateDoc(doc(db, "matches", editingMatchId), { teamA, teamB, tournamentId, format, startAt });
    } else {
      await setDoc(doc(collection(db, "matches")), {
        teamA, teamB, tournamentId, format, startAt,
        status: "upcoming", streamUrl: null, score: null, maps: [],
        createdAt: serverTimestamp()
      });
    }
    closeModal("adminMatchModal");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = "Ошибка: " + (err.message || err);
  }
}

/* --------------------------------------------------------------
   ADMIN: ТУРНИРЫ
-------------------------------------------------------------- */
function renderAdminTournaments(){
  const box = document.getElementById("adminTournamentsTable");
  const searchInput = document.getElementById("searchTournaments");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (!box) return;
  
  const filteredTournaments = searchTerm 
    ? TOURNAMENTS.filter(t => t.name.toLowerCase().includes(searchTerm))
    : TOURNAMENTS;
    
  if (!filteredTournaments.length) { box.innerHTML = `<div class="empty-state">${searchTerm ? "Ничего не найдено" : "Пока нет турниров"}</div>`; return; }
  const statusLabel = { upcoming: "Скоро", live: "В эфире", done: "Завершён" };
  box.innerHTML = `
    <div class="data-row head"><span>Турнир</span><span>Период</span><span>Статус</span><span>Команд</span><span></span></div>
    ${filteredTournaments.map(t => `
      <div class="data-row">
        <span class="d-team">${t.name}</span>
        <span>${t.period || "—"}</span>
        <span>${statusLabel[t.status] || t.status}</span>
        <span>${(t.registeredTeamIds || []).length}</span>
        <span class="row-actions">
          <button class="btn ghost sm" data-edit-tournament="${t.id}">✎</button>
          <button class="btn danger sm" data-del-tournament="${t.id}">✕</button>
        </span>
      </div>
    `).join("")}
  `;
}

function openAddTournament(){
  editingTournamentId = null;
  document.getElementById("adminTournamentForm").reset();
  document.getElementById("attModalTitle").textContent = "Создать турнир";
  document.getElementById("attSubmitBtn").textContent = "Создать";
  openModal("adminTournamentModal");
}

function openEditTournament(id){
  const t = tournamentById(id);
  if (!t) return;
  editingTournamentId = id;
  document.getElementById("attName").value = t.name || "";
  document.getElementById("attPeriod").value = t.period || "";
  document.getElementById("attPrize").value = t.prizePool || "";
  document.getElementById("attBanner").value = ""; // File input can't be set programmatically
  document.getElementById("attBracketType").value = t.bracketType || "single";
  document.getElementById("attPinned").checked = !!t.pinned;
  document.getElementById("attRegOpen").checked = !!t.regOpen;
  document.getElementById("attModalTitle").textContent = "Редактировать турнир";
  document.getElementById("attSubmitBtn").textContent = "Сохранить";
  openModal("adminTournamentModal");
}

async function deleteTournament(id){
  if (!confirm("Удалить турнир безвозвратно?")) return;
  await deleteDoc(doc(db, "tournaments", id));
}

async function submitTournamentForm(e){
  e.preventDefault();
  const name = document.getElementById("attName").value.trim();
  const period = document.getElementById("attPeriod").value.trim();
  const prizePool = document.getElementById("attPrize").value.trim();
  const bannerInput = document.getElementById("attBanner");
  const bracketType = document.getElementById("attBracketType").value;
  const pinned = document.getElementById("attPinned").checked;
  const regOpen = document.getElementById("attRegOpen").checked;
  const note = document.getElementById("attNote");
  note.textContent = ""; note.style.color = "";
  try {
    let bannerUrl = null;
    if (bannerInput.files && bannerInput.files[0]) {
      bannerUrl = await fileToResizedDataURL(bannerInput.files[0], 800, 0.75);
    } else if (editingTournamentId) {
      const existing = tournamentById(editingTournamentId);
      bannerUrl = existing?.bannerUrl || null;
    }

    if (editingTournamentId) {
      await updateDoc(doc(db, "tournaments", editingTournamentId), { name, period, prizePool, bannerUrl, bracketType, pinned, regOpen });
    } else {
      await setDoc(doc(collection(db, "tournaments")), {
        name, period, prizePool, bannerUrl, bracketType, pinned, regOpen,
        status: "upcoming", registeredTeamIds: [], bracket: { rounds: [] }, winnerTeamId: null,
        createdAt: serverTimestamp()
      });
    }
    closeModal("adminTournamentModal");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = "Ошибка: " + (err.message || err);
  }
}

/* --------------------------------------------------------------
   ADMIN: НОВОСТИ
-------------------------------------------------------------- */
function renderAdminNews(){
  const box = document.getElementById("adminNewsTable");
  if (!box) return;
  if (!NEWS.length) { box.innerHTML = `<div class="empty-state">Пока нет новостей</div>`; return; }
  box.innerHTML = `
    <div class="data-row head"><span>Заголовок</span><span>Тег</span><span>Дата</span><span></span><span></span></div>
    ${NEWS.map(n => `
      <div class="data-row">
        <span class="d-team">${n.title}</span>
        <span>${n.tag}</span>
        <span>${newsDateLabel(n) || "—"}</span>
        <span></span>
        <span class="row-actions">
          <button class="btn ghost sm" data-edit-news="${n.id}">✎</button>
          <button class="btn danger sm" data-del-news="${n.id}">✕</button>
        </span>
      </div>
    `).join("")}
  `;
}

function openAddNews(){
  editingNewsId = null;
  document.getElementById("adminNewsForm").reset();
  document.getElementById("anModalTitle").textContent = "Опубликовать новость";
  document.getElementById("anSubmitBtn").textContent = "Опубликовать";
  openModal("adminNewsModal");
}

function openEditNews(id){
  const n = NEWS.find(x => x.id === id);
  if (!n) return;
  editingNewsId = id;
  document.getElementById("anTitle").value = n.title || "";
  document.getElementById("anTag").value = n.tag || "Новость";
  document.getElementById("anExcerpt").value = n.excerpt || "";
  document.getElementById("anBody").value = n.body || "";
  document.getElementById("anImage").value = ""; // File input can't be set programmatically
  document.getElementById("anModalTitle").textContent = "Редактировать новость";
  document.getElementById("anSubmitBtn").textContent = "Сохранить";
  openModal("adminNewsModal");
}

async function deleteNews(id){
  if (!confirm("Удалить новость безвозвратно?")) return;
  await deleteDoc(doc(db, "news", id));
}

async function submitNewsForm(e){
  e.preventDefault();
  const title = document.getElementById("anTitle").value.trim();
  const tag = document.getElementById("anTag").value;
  const excerpt = document.getElementById("anExcerpt").value.trim();
  const body = document.getElementById("anBody").value.trim();
  const imageInput = document.getElementById("anImage");
  const note = document.getElementById("anNote");
  note.textContent = ""; note.style.color = "";
  try {
    let imageUrl = null;
    if (imageInput.files && imageInput.files[0]) {
      imageUrl = await fileToResizedDataURL(imageInput.files[0], 800, 0.75);
    } else if (editingNewsId) {
      const existing = NEWS.find(n => n.id === editingNewsId);
      imageUrl = existing?.imageUrl || null;
    }

    if (editingNewsId) {
      await updateDoc(doc(db, "news", editingNewsId), { title, tag, excerpt, body, imageUrl });
    } else {
      await setDoc(doc(collection(db, "news")), {
        title, tag, excerpt, body, imageUrl, publishedAt: serverTimestamp()
      });
    }
    closeModal("adminNewsModal");
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = "Ошибка: " + (err.message || err);
  }
}

/* --------------------------------------------------------------
   ADMIN: РЕДАКТОР СЕТКИ ТУРНИРА (bracket)
   В отличие от старой версии: слоты сетки хранят ID реальных команд
   (не свободный текст), сетка строится автоматически из заявок
   (с BYE для не-степени-двойки), а победитель раунда сам подставляется
   в следующий раунд при сохранении счёта. По завершении турнира
   реально сыгранные матчи сетки конвертируются в обычные документы
   коллекции "matches" и статистика команд пересчитывается той же
   функцией recalcTeamStats(), что и для обычных матчей — единая
   логика статистики на весь сайт, как и просили ("слаженно").

   Формат bracket: { rounds: [ { matches: [
     { teamA, teamB, scoreA, scoreB, winner }  // teamA/teamB: id команды или "BYE"
   ] } ] }
-------------------------------------------------------------- */
let bracketWorking = null;
let bracketTournamentId = null;
let bracketSelectedTeamIds = [];

function fillBracketTournamentSelect(){
  const sel = document.getElementById("beTournament");
  if (!sel) return;
  sel.innerHTML = `<option value="">— выберите турнир —</option>` +
    TOURNAMENTS.map(t => `<option value="${t.id}" ${t.id === bracketTournamentId ? "selected" : ""}>${t.name}</option>`).join("");
}

function bracketTeamLabel(id){
  if (!id) return "?";
  if (id === "BYE") return "BYE";
  const tm = teamById(id);
  return tm ? tm.name : "?";
}

function emptyBracketMatch(teamA, teamB){
  const m = { teamA: teamA || "BYE", teamB: teamB || "BYE", scoreA: null, scoreB: null, winner: null };
  if (m.teamA === "BYE" && m.teamB !== "BYE") m.winner = m.teamB;
  if (m.teamB === "BYE" && m.teamA !== "BYE") m.winner = m.teamA;
  return m;
}

function buildBracketFirstRound(teamIds){
  let teams = teamIds.slice();
  let size = 1;
  while (size < teams.length) size *= 2;
  while (teams.length < size) teams.push("BYE");
  const matches = [];
  for (let i = 0; i < teams.length; i += 2) matches.push(emptyBracketMatch(teams[i], teams[i + 1]));
  return matches;
}

// Пересобирает раунды 2+ по победителям раунда 1. Уже сыгранные пары,
// состав которых не поменялся, переносятся как есть (счёт сохраняется).
function recomputeBracketRounds(firstRoundMatches, previousRounds){
  const rounds = [{ matches: firstRoundMatches.map(m => ({ ...m })) }];
  let prevMatches = rounds[0].matches;
  let ri = 1;
  while (prevMatches.length > 1 && prevMatches.every(m => !!m.winner)) {
    const winners = prevMatches.map(m => m.winner);
    const matches = [];
    for (let i = 0; i < winners.length; i += 2) {
      const teamA = winners[i], teamB = winners[i + 1];
      const old = previousRounds && previousRounds[ri] && previousRounds[ri].matches[i / 2];
      matches.push(old && old.teamA === teamA && old.teamB === teamB ? { ...old } : emptyBracketMatch(teamA, teamB));
    }
    rounds.push({ matches });
    prevMatches = matches;
    ri++;
  }
  return rounds;
}

function buildBracketFromTeamIds(teamIds){
  return recomputeBracketRounds(buildBracketFirstRound(teamIds));
}

function setBracketMatchScore(rounds, ri, mi, scoreAraw, scoreBraw){
  const firstRound = rounds[0].matches.map(m => ({ ...m }));
  const target = ri === 0 ? firstRound[mi] : rounds[ri].matches[mi];
  const scoreA = scoreAraw === "" || scoreAraw === null || scoreAraw === undefined ? null : Number(scoreAraw);
  const scoreB = scoreBraw === "" || scoreBraw === null || scoreBraw === undefined ? null : Number(scoreBraw);
  const winner = (scoreA !== null && scoreB !== null && scoreA !== scoreB) ? (scoreA > scoreB ? target.teamA : target.teamB) : null;
  const updated = { teamA: target.teamA, teamB: target.teamB, scoreA, scoreB, winner };
  if (ri === 0) {
    firstRound[mi] = updated;
    return recomputeBracketRounds(firstRound, rounds);
  }
  const previousRounds = rounds.map(r => ({ matches: r.matches.map(m => ({ ...m })) }));
  previousRounds[ri].matches[mi] = updated;
  return recomputeBracketRounds(firstRound, previousRounds);
}

function clearBracketMatchResult(rounds, ri, mi){
  const firstRound = rounds[0].matches.map(m => ({ ...m }));
  if (ri === 0) {
    const t = firstRound[mi];
    firstRound[mi] = emptyBracketMatch(t.teamA, t.teamB);
    return recomputeBracketRounds(firstRound);
  }
  const previousRounds = rounds.map(r => ({ matches: r.matches.map(m => ({ ...m })) }));
  const t = previousRounds[ri].matches[mi];
  previousRounds[ri].matches[mi] = emptyBracketMatch(t.teamA, t.teamB);
  return recomputeBracketRounds(firstRound, previousRounds);
}

function bracketTournamentWinnerId(rounds){
  if (!rounds || !rounds.length) return null;
  const final = rounds[rounds.length - 1];
  if (final && final.matches.length === 1 && final.matches[0].winner) return final.matches[0].winner;
  return null;
}

// Реально сыгранные пары (без технических BYE) — то, что уходит
// в коллекцию "matches" и пересчёт статистики при завершении турнира.
function bracketPlayedMatches(rounds){
  const out = [];
  (rounds || []).forEach(r => r.matches.forEach(m => {
    if (m.winner && m.teamA !== "BYE" && m.teamB !== "BYE") out.push(m);
  }));
  return out;
}

function bracketRoundTitle(ri, total){
  if (total === 1 || ri === total - 1) return "Финал";
  if (ri === total - 2) return "1/2 финала";
  if (ri === total - 3) return "1/4 финала";
  return `Раунд ${ri + 1}`;
}

// Семейство типов сетки: одиночное выбывание — единственный тип, где
// матчи каскадом переносятся в следующий раунд (rounds строятся из
// пар предыдущего раунда). "single"/"bo1"/"bo3"/"bo5" отличаются только
// форматом матча (сколько побед нужно на серию) — сама структура сетки
// одна и та же, поэтому они используют один и тот же движок.
function isElimBracketType(bt){ return !bt || bt === "single" || bt === "bo1" || bt === "bo3" || bt === "bo5"; }
function isSwissBracketType(bt){ return bt === "swiss"; }
function isLeagueBracketType(bt){ return bt === "league"; }
function bracketTypeLabel(bt){
  const map = { single: "Обычная (Single Elimination)", bo1: "BO1", bo3: "BO3", bo5: "BO5", swiss: "Швейцарская система", league: "Лиговая таблица" };
  return map[bt] || map.single;
}

/* ================================================================
   ШВЕЙЦАРСКАЯ СИСТЕМА
   Хранится в том же поле bracket.rounds — каждый раунд просто список
   пар (тот же формат матча {teamA,teamB,scoreA,scoreB,winner}), но
   раунды НЕ каскадируются автоматически: следующий раунд формируется
   вручную кнопкой «Сгенерировать след. раунд» после того как все пары
   текущего раунда сыграны, на основе счёта побед (без повторных пар,
   насколько это возможно).
================================================================ */
function swissPairKey(a, b){ return [a, b].sort().join("__"); }

function swissAlreadyPlayedPairs(rounds){
  const set = new Set();
  (rounds || []).forEach(r => r.matches.forEach(m => {
    if (m.teamA !== "BYE" && m.teamB !== "BYE") set.add(swissPairKey(m.teamA, m.teamB));
  }));
  return set;
}

function pairTeamsForSwissRound(orderedTeamIds, playedPairs){
  const remaining = orderedTeamIds.slice();
  const matches = [];
  while (remaining.length){
    const team = remaining.shift();
    if (!remaining.length){ matches.push(emptyBracketMatch(team, "BYE")); break; }
    let idx = remaining.findIndex(op => !playedPairs.has(swissPairKey(team, op)));
    if (idx === -1) idx = 0; // не осталось свежих соперников — приходится ставить повтор
    const opp = remaining.splice(idx, 1)[0];
    matches.push(emptyBracketMatch(team, opp));
  }
  return matches;
}

function swissTotalRounds(teamCount){
  return Math.max(3, Math.ceil(Math.log2(Math.max(2, teamCount))));
}

function buildSwissBracket(teamIds){
  const totalRounds = swissTotalRounds(teamIds.length);
  const round1 = pairTeamsForSwissRound(teamIds, new Set());
  return { rounds: [{ matches: round1 }], totalRounds };
}

// wins засчитывается и за технический BYE (автопроход = победа).
function swissStandings(bracket, teamIds){
  const stats = {};
  (teamIds || []).forEach(id => { stats[id] = { teamId: id, wins: 0, losses: 0 }; });
  (bracket?.rounds || []).forEach(r => r.matches.forEach(m => {
    if (!m.winner) return;
    const loser = m.winner === m.teamA ? m.teamB : m.teamA;
    if (!stats[m.winner]) stats[m.winner] = { teamId: m.winner, wins: 0, losses: 0 };
    stats[m.winner].wins++;
    if (loser !== "BYE"){
      if (!stats[loser]) stats[loser] = { teamId: loser, wins: 0, losses: 0 };
      stats[loser].losses++;
    }
  }));
  return Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

function swissRoundComplete(bracket){
  if (!bracket || !bracket.rounds.length) return false;
  const last = bracket.rounds[bracket.rounds.length - 1];
  return last.matches.every(m => !!m.winner);
}

function swissIsFinished(bracket){
  return !!bracket && bracket.rounds.length >= (bracket.totalRounds || 0) && swissRoundComplete(bracket);
}

function swissWinnerId(bracket, teamIds){
  if (!swissIsFinished(bracket)) return null;
  const standings = swissStandings(bracket, teamIds);
  return standings.length ? standings[0].teamId : null;
}

function generateNextSwissRound(bracket, teamIds){
  const standings = swissStandings(bracket, teamIds);
  const order = standings.map(s => s.teamId);
  const playedPairs = swissAlreadyPlayedPairs(bracket.rounds);
  const matches = pairTeamsForSwissRound(order, playedPairs);
  return { ...bracket, rounds: [...bracket.rounds, { matches }] };
}

/* ================================================================
   ЛИГОВАЯ ТАБЛИЦА (круговой турнир, как в футболе)
   Хранится как один "раунд" со всеми парами команд — свой список
   матчей, без каскадирования и с поддержкой ничьих.
================================================================ */
function buildLeagueBracket(teamIds){
  const matches = [];
  for (let i = 0; i < teamIds.length; i++){
    for (let j = i + 1; j < teamIds.length; j++){
      matches.push({ teamA: teamIds[i], teamB: teamIds[j], scoreA: null, scoreB: null, winner: null });
    }
  }
  return { rounds: [{ matches }] };
}

function leagueMatches(bracket){ return (bracket?.rounds && bracket.rounds[0]) ? bracket.rounds[0].matches : []; }

function setLeagueMatchScore(bracket, mi, scoreAraw, scoreBraw){
  const matches = leagueMatches(bracket).map(m => ({ ...m }));
  const scoreA = scoreAraw === "" || scoreAraw === null || scoreAraw === undefined ? null : Number(scoreAraw);
  const scoreB = scoreBraw === "" || scoreBraw === null || scoreBraw === undefined ? null : Number(scoreBraw);
  const winner = (scoreA !== null && scoreB !== null) ? (scoreA > scoreB ? matches[mi].teamA : (scoreB > scoreA ? matches[mi].teamB : null)) : null;
  matches[mi] = { ...matches[mi], scoreA, scoreB, winner };
  return { ...bracket, rounds: [{ matches }] };
}

function leagueStandings(bracket, teamIds){
  const stats = {};
  (teamIds || []).forEach(id => { stats[id] = { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 }; });
  leagueMatches(bracket).forEach(m => {
    if (m.scoreA === null || m.scoreB === null) return;
    [m.teamA, m.teamB].forEach(id => { if (!stats[id]) stats[id] = { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 }; });
    stats[m.teamA].played++; stats[m.teamB].played++;
    stats[m.teamA].gf += m.scoreA; stats[m.teamA].ga += m.scoreB;
    stats[m.teamB].gf += m.scoreB; stats[m.teamB].ga += m.scoreA;
    if (m.scoreA > m.scoreB){ stats[m.teamA].wins++; stats[m.teamA].pts += 3; stats[m.teamB].losses++; }
    else if (m.scoreB > m.scoreA){ stats[m.teamB].wins++; stats[m.teamB].pts += 3; stats[m.teamA].losses++; }
    else { stats[m.teamA].draws++; stats[m.teamB].draws++; stats[m.teamA].pts++; stats[m.teamB].pts++; }
  });
  return Object.values(stats).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

function leagueIsFinished(bracket){
  const matches = leagueMatches(bracket);
  return matches.length > 0 && matches.every(m => m.scoreA !== null && m.scoreB !== null);
}

function leagueWinnerId(bracket, teamIds){
  if (!leagueIsFinished(bracket)) return null;
  const standings = leagueStandings(bracket, teamIds);
  return standings.length ? standings[0].teamId : null;
}

/* ================================================================
   Обобщённые обёртки — используются в finishBracketTournament и на
   публичной странице турнира, чтобы не дублировать if/else по типу
   сетки в нескольких местах.
================================================================ */
function anyBracketWinnerId(bracketType, bracket, teamIds){
  if (isSwissBracketType(bracketType)) return swissWinnerId(bracket, teamIds);
  if (isLeagueBracketType(bracketType)) return leagueWinnerId(bracket, teamIds);
  return bracketTournamentWinnerId(bracket?.rounds);
}

function anyBracketPlayedMatches(bracketType, bracket){
  if (isLeagueBracketType(bracketType)) return leagueMatches(bracket).filter(m => m.scoreA !== null && m.scoreB !== null);
  return bracketPlayedMatches(bracket?.rounds);
}

function loadBracketForTournament(id){
  bracketTournamentId = id || null;
  if (!bracketTournamentId) { bracketWorking = null; renderBracketPicker(); renderBracketEditor(); return; }
  const t = tournamentById(bracketTournamentId);
  bracketSelectedTeamIds = (t && t.registeredTeamIds && t.registeredTeamIds.length)
    ? t.registeredTeamIds.slice()
    : [];
  const b = (t && t.bracket && Array.isArray(t.bracket.rounds)) ? t.bracket : { rounds: [] };
  bracketWorking = JSON.parse(JSON.stringify(b));
  renderBracketPicker();
  renderBracketEditor();
}

// Чек-лист команд для сборки сетки: по умолчанию отмечены команды,
// уже одобренные на турнир (registeredTeamIds), но админ может
// довручную добавить/убрать любую команду из общего списка TEAMS.
function renderBracketPicker(){
  const box = document.getElementById("bePicker");
  if (!box) return;
  if (!bracketTournamentId) { box.innerHTML = ""; return; }
  if (!TEAMS.length) { box.innerHTML = `<div class="empty-state">Сначала добавьте команды в разделе «Команды»</div>`; return; }
  box.innerHTML = `
    <div class="form-note" style="margin-bottom:6px;">Участники сетки (по умолчанию — одобренные заявки на турнир):</div>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${TEAMS.map(tm => `
        <label style="display:flex; align-items:center; gap:5px; font-size:12px; border:1px solid var(--line); border-radius:6px; padding:4px 8px; cursor:pointer;">
          <input type="checkbox" data-be-pick-team="${tm.id}" ${bracketSelectedTeamIds.includes(tm.id) ? "checked" : ""}>
          ${tm.name}
        </label>
      `).join("")}
    </div>
  `;
}

function currentBracketType(){
  const tr = bracketTournamentId ? tournamentById(bracketTournamentId) : null;
  return (tr && tr.bracketType) || "single";
}

function standingsTableHTML(rows, kind){
  // kind: "swiss" (W/L) или "league" (P/W/D/L/+-/Pts)
  const head = kind === "league"
    ? `<div class="data-row head" style="grid-template-columns:40px 2fr 50px 50px 50px 50px 60px 60px;"><span>#</span><span>Команда</span><span>И</span><span>В</span><span>Н</span><span>П</span><span>+/-</span><span>Очки</span></div>`
    : `<div class="data-row head" style="grid-template-columns:40px 2fr 60px 60px;"><span>#</span><span>Команда</span><span>Победы</span><span>Пораж.</span></div>`;
  const body = rows.map((row, i) => {
    const tm = teamById(row.teamId);
    const name = tm ? tm.name : "?";
    if (kind === "league") {
      return `<div class="data-row" style="grid-template-columns:40px 2fr 50px 50px 50px 50px 60px 60px; cursor:default;">
        <span>${i + 1}</span><span class="d-team">${tm ? tagBlock(tm, 24) : ""}${name}</span>
        <span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span>
        <span class="mono">${row.gf - row.ga >= 0 ? "+" : ""}${row.gf - row.ga}</span><span class="mono" style="font-weight:700;">${row.pts}</span>
      </div>`;
    }
    return `<div class="data-row" style="grid-template-columns:40px 2fr 60px 60px; cursor:default;">
      <span>${i + 1}</span><span class="d-team">${tm ? tagBlock(tm, 24) : ""}${name}</span>
      <span class="mono">${row.wins}</span><span class="mono">${row.losses}</span>
    </div>`;
  }).join("");
  return `<div class="data-table admin-table" style="margin-top:14px;">${head}${body}</div>`;
}

function roundMatchEditorRowHTML(m, ri, mi, scoreAttr, allowDraw){
  const isBye = m.teamA === "BYE" || m.teamB === "BYE";
  const rowStyle = (id) => `padding:6px 8px; border-radius:6px; ${m.winner === id ? "background:rgba(80,200,120,0.12); font-weight:600;" : ""}`;
  return `
    <div style="border:1px solid var(--line); border-radius:var(--radius); padding:10px; margin-bottom:12px;">
      <div style="${rowStyle(m.teamA)}">${bracketTeamLabel(m.teamA)}</div>
      <div style="${rowStyle(m.teamB)}">${bracketTeamLabel(m.teamB)}</div>
      ${isBye ? `<div class="form-note" style="margin-top:6px;">Автопроход (BYE)</div>` : `
        <div style="display:flex; gap:6px; align-items:center; margin-top:8px;">
          <input type="number" min="0" placeholder="—" style="width:56px;" value="${m.scoreA ?? ""}" data-${scoreAttr}="A" data-round="${ri}" data-match="${mi}">
          <span>:</span>
          <input type="number" min="0" placeholder="—" style="width:56px;" value="${m.scoreB ?? ""}" data-${scoreAttr}="B" data-round="${ri}" data-match="${mi}">
          ${allowDraw ? `<span class="form-note" style="margin:0;">(ничья возможна)</span>` : ""}
        </div>
      `}
    </div>`;
}

function renderBracketEditor(){
  const box = document.getElementById("beRounds");
  const finishBtn = document.getElementById("beFinish");
  const swissNextBtn = document.getElementById("beSwissNextRound");
  if (!box) return;
  if (swissNextBtn) swissNextBtn.style.display = "none";
  if (!bracketTournamentId || !bracketWorking) {
    box.innerHTML = `<div class="empty-state">Выберите турнир для редактирования сетки</div>`;
    if (finishBtn) finishBtn.disabled = true;
    return;
  }
  if (!bracketWorking.rounds.length) {
    box.innerHTML = `<div class="empty-state">Сетки пока нет — отметьте команды выше и нажмите «Собрать сетку из заявок»</div>`;
    if (finishBtn) finishBtn.disabled = true;
    return;
  }

  const bracketType = currentBracketType();
  const teamIds = bracketSelectedTeamIds;

  if (isSwissBracketType(bracketType)) {
    const standings = swissStandings(bracketWorking, teamIds);
    const champId = swissWinnerId(bracketWorking, teamIds);
    const roundComplete = swissRoundComplete(bracketWorking);
    const roundsLeft = (bracketWorking.totalRounds || 0) - bracketWorking.rounds.length;
    box.innerHTML = `
      ${champId ? `<div class="form-note" style="color:var(--win); margin-bottom:10px;">🏆 Победитель швейцарки: ${bracketTeamLabel(champId)}. Нажмите «Завершить турнир».</div>` : `<div class="form-note" style="margin-bottom:10px;">Швейцарская система · раунд ${bracketWorking.rounds.length} из ${bracketWorking.totalRounds}${roundComplete ? "" : " · заполните счёт всех пар текущего раунда"}</div>`}
      <div style="display:flex; gap:16px; overflow-x:auto;">
      ${bracketWorking.rounds.map((round, ri) => `
        <div style="min-width:240px; flex:1;">
          <div style="font-weight:600; margin-bottom:10px;">Раунд ${ri + 1}</div>
          ${round.matches.map((m, mi) => roundMatchEditorRowHTML(m, ri, mi, "be-swiss-score", false)).join("")}
        </div>
      `).join("")}
      </div>
      ${standingsTableHTML(standings, "swiss")}
    `;
    if (finishBtn) finishBtn.disabled = !champId;
    if (swissNextBtn) {
      swissNextBtn.style.display = "";
      swissNextBtn.disabled = !roundComplete || roundsLeft <= 0 || !!champId;
    }
    return;
  }

  if (isLeagueBracketType(bracketType)) {
    const matches = leagueMatches(bracketWorking);
    const standings = leagueStandings(bracketWorking, teamIds);
    const champId = leagueWinnerId(bracketWorking, teamIds);
    box.innerHTML = `
      ${champId ? `<div class="form-note" style="color:var(--win); margin-bottom:10px;">🏆 Победитель лиги: ${bracketTeamLabel(champId)}. Нажмите «Завершить турнир».</div>` : `<div class="form-note" style="margin-bottom:10px;">Круговой турнир (лига) · внесите счёт всех пар, чтобы определить победителя</div>`}
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px,1fr)); gap:12px;">
        ${matches.map((m, mi) => roundMatchEditorRowHTML(m, 0, mi, "be-league-score", true)).join("")}
      </div>
      ${standingsTableHTML(standings, "league")}
    `;
    if (finishBtn) finishBtn.disabled = !champId;
    return;
  }

  // --- Одиночное выбывание (single/bo1/bo3/bo5) ---
  const total = bracketWorking.rounds.length;
  const champId = bracketTournamentWinnerId(bracketWorking.rounds);
  box.innerHTML = `
    ${champId ? `<div class="form-note" style="color:var(--win); margin-bottom:10px;">🏆 Чемпион сетки: ${bracketTeamLabel(champId)}. Нажмите «Завершить турнир», чтобы начислить трофей и статистику.</div>` : ""}
    <div style="display:flex; gap:16px; overflow-x:auto;">
    ${bracketWorking.rounds.map((round, ri) => `
      <div style="min-width:240px; flex:1;">
        <div style="font-weight:600; margin-bottom:10px;">${bracketRoundTitle(ri, total)}</div>
        ${round.matches.map((m, mi) => {
          const isBye = m.teamA === "BYE" || m.teamB === "BYE";
          const rowStyle = (id) => `padding:6px 8px; border-radius:6px; ${m.winner === id ? "background:rgba(80,200,120,0.12); font-weight:600;" : ""}`;
          return `
          <div style="border:1px solid var(--line); border-radius:var(--radius); padding:10px; margin-bottom:12px;">
            <div style="${rowStyle(m.teamA)}">${bracketTeamLabel(m.teamA)}</div>
            <div style="${rowStyle(m.teamB)}">${bracketTeamLabel(m.teamB)}</div>
            ${isBye ? `<div class="form-note" style="margin-top:6px;">Автопроход (BYE)</div>` : `
              <div style="display:flex; gap:6px; align-items:center; margin-top:8px;">
                <input type="number" min="0" placeholder="—" style="width:56px;" value="${m.scoreA ?? ""}" data-be-score="A" data-round="${ri}" data-match="${mi}">
                <span>:</span>
                <input type="number" min="0" placeholder="—" style="width:56px;" value="${m.scoreB ?? ""}" data-be-score="B" data-round="${ri}" data-match="${mi}">
                ${m.winner ? `<button type="button" class="btn ghost sm" data-be-clear-match data-round="${ri}" data-match="${mi}">Сбросить</button>` : ""}
              </div>
            `}
          </div>`;
        }).join("")}
      </div>
    `).join("")}
    </div>
  `;
  if (finishBtn) finishBtn.disabled = !champId;
}

// Общая функция начисления трофея — команде (как раньше) и КАЖДОМУ
// игроку основного/резервного состава из коллекции "players", у кого
// teamId указывает на команду-победителя. Трофеи показывают, какой
// именно турнир выигран, а не просто их количество.
async function awardTournamentTrophy(winnerId, tournamentId){
  const tournament = tournamentById(tournamentId);
  // Важно: FieldValue.serverTimestamp() нельзя использовать внутри
  // массива (Firestore отклоняет такую запись целиком) — trophies это
  // массив, поэтому здесь обычный клиентский timestamp (Date.now()),
  // а не serverTimestamp().
  const trophyEntry = {
    tournamentId, tournamentName: tournament ? tournament.name : "Unknown", wonAt: Date.now()
  };
  const teamDoc = await getDoc(doc(db, "teams", winnerId));
  const currentTeamTrophies = (teamDoc.exists() && teamDoc.data().trophies) || [];
  await updateDoc(doc(db, "teams", winnerId), { trophies: [...currentTeamTrophies, trophyEntry] });

  const playersSnap = await getDocs(collection(db, "players"));
  const winnerPlayers = playersSnap.docs.filter(d => d.data().teamId === winnerId);
  for (const pDoc of winnerPlayers) {
    const currentPlayerTrophies = pDoc.data().trophies || [];
    await updateDoc(doc(db, "players", pDoc.id), { trophies: [...currentPlayerTrophies, trophyEntry] });
  }
}

async function finishBracketTournament(){
  const note = document.getElementById("beNote");
  if (note) { note.textContent = ""; note.style.color = ""; }
  if (!bracketTournamentId || !bracketWorking) return;
  const bracketType = currentBracketType();
  const winnerId = anyBracketWinnerId(bracketType, bracketWorking, bracketSelectedTeamIds);
  if (!winnerId) { alert("Сетка/таблица ещё не доиграна до победителя."); return; }
  const winnerTeam = teamById(winnerId);
  if (!confirm(`Завершить турнир? Победитель: ${winnerTeam ? winnerTeam.name : "?"}.\nВсем участникам сыгранных матчей пересчитается статистика, победителю (команде и игрокам) начислится трофей.`)) return;

  try {
    const played = anyBracketPlayedMatches(bracketType, bracketWorking);
    const touchedTeamIds = new Set();
    const seriesFormat = { single: "BO1", bo1: "BO1", bo3: "BO3", bo5: "BO5", swiss: "BO1", league: "BO1" }[bracketType] || "BO1";
    for (const m of played) {
      await setDoc(doc(collection(db, "matches")), {
        teamA: m.teamA, teamB: m.teamB,
        tournamentId: bracketTournamentId,
        format: seriesFormat,
        startAt: Date.now(),
        status: "finished",
        score: [m.scoreA, m.scoreB],
        streamUrl: null, maps: [],
        fromBracket: true,
        createdAt: serverTimestamp()
      });
      touchedTeamIds.add(m.teamA);
      touchedTeamIds.add(m.teamB);
    }
    for (const tid of touchedTeamIds) {
      await recalcTeamStats(tid);
    }
    await recalcAllTeamElo();
    await awardTournamentTrophy(winnerId, bracketTournamentId);
    await updateDoc(doc(db, "tournaments", bracketTournamentId), {
      status: "done", winnerTeamId: winnerId, regOpen: false, bracket: bracketWorking
    });
    if (note) { note.style.color = "var(--win)"; note.textContent = "Турнир завершён, статистика, Elo и трофеи начислены."; }
  } catch (err) {
    if (note) { note.style.color = "var(--loss)"; note.textContent = "Ошибка: " + (err.message || err); }
  }
}

/* --------------------------------------------------------------
   ADMIN: ВНЕСЕНИЕ РЕЗУЛЬТАТА МАТЧА + АВТОМАТИЧЕСКИЙ ПЕРЕСЧЁТ СТАТИСТИКИ
-------------------------------------------------------------- */
let resultMatchId = null;
let resultMaps = [];

function emptyMap(){ return { name: "", scoreA: null, scoreB: null, rounds: null, stats: {} }; }

function resultModalLineup(){
  const m = MATCHES.find(x => x.id === resultMatchId);
  if (!m) return { a: [], b: [], teamA: null, teamB: null };
  return {
    a: PLAYERS.filter(p => p.teamId === m.teamA),
    b: PLAYERS.filter(p => p.teamId === m.teamB),
    teamA: teamById(m.teamA),
    teamB: teamById(m.teamB)
  };
}

function openResultModal(matchId){
  const m = MATCHES.find(x => x.id === matchId);
  if (!m) return;
  resultMatchId = matchId;
  const a = teamById(m.teamA), b = teamById(m.teamB);
  document.getElementById("arTitle").textContent = `Результат: ${a ? a.name : "?"} vs ${b ? b.name : "?"}`;
  if (m.maps && m.maps.length) {
    resultMaps = m.maps.map(mp => ({
      name: mp.name || "",
      scoreA: mp.score ? mp.score[0] : null,
      scoreB: mp.score ? mp.score[1] : null,
      rounds: mp.rounds || null,
      stats: JSON.parse(JSON.stringify(mp.playerStats || {}))
    }));
  } else {
    resultMaps = [emptyMap()];
  }
  document.getElementById("arNote").textContent = "";
  renderResultMaps();
  openModal("adminResultModal");
}

function playerStatRow(mIdx, p, mp){
  const s = mp.stats[p.id] || {};
  return `
  <div style="display:grid; grid-template-columns:1.4fr 55px 55px 55px 65px 70px; gap:6px; align-items:center; margin-bottom:4px;">
    <span style="font-size:13px;">${p.nick}</span>
    <input type="number" placeholder="K" value="${s.k ?? ""}" data-stat-field="k" data-map="${mIdx}" data-player="${p.id}">
    <input type="number" placeholder="D" value="${s.d ?? ""}" data-stat-field="d" data-map="${mIdx}" data-player="${p.id}">
    <input type="number" placeholder="A" value="${s.a ?? ""}" data-stat-field="a" data-map="${mIdx}" data-player="${p.id}">
    <input type="number" placeholder="DMG" value="${s.dmg ?? ""}" data-stat-field="dmg" data-map="${mIdx}" data-player="${p.id}">
    <input type="number" placeholder="KAST%" value="${s.kast ?? ""}" data-stat-field="kast" data-map="${mIdx}" data-player="${p.id}">
  </div>`;
}

function renderResultMaps(){
  const box = document.getElementById("arMapsList");
  if (!box) return;
  const { a, b, teamA, teamB } = resultModalLineup();
  box.innerHTML = resultMaps.map((mp, mIdx) => `
    <div style="border:1px solid var(--line); border-radius:var(--radius); padding:14px;">
      <div style="display:grid; grid-template-columns:2fr 80px 80px 90px; gap:8px; margin-bottom:12px;">
        <input type="text" placeholder="Карта (напр. Mirage)" value="${mp.name}" data-map-field="name" data-map="${mIdx}">
        <input type="number" placeholder="Счёт A" value="${mp.scoreA ?? ""}" data-map-field="scoreA" data-map="${mIdx}">
        <input type="number" placeholder="Счёт B" value="${mp.scoreB ?? ""}" data-map-field="scoreB" data-map="${mIdx}">
        <input type="number" placeholder="Раунды" value="${mp.rounds ?? ""}" data-map-field="rounds" data-map="${mIdx}">
      </div>
      <div style="font-size:12px; color:var(--ink-dim); margin-bottom:6px;">${teamA ? teamA.name : "Команда A"}</div>
      ${a.map(p => playerStatRow(mIdx, p, mp)).join("") || `<div class="empty-state" style="padding:8px 0;">В команде нет игроков</div>`}
      <div style="font-size:12px; color:var(--ink-dim); margin:10px 0 6px;">${teamB ? teamB.name : "Команда B"}</div>
      ${b.map(p => playerStatRow(mIdx, p, mp)).join("") || `<div class="empty-state" style="padding:8px 0;">В команде нет игроков</div>`}
    </div>
  `).join("");
}

/* HLTV 3.0 Rating System - упрощённая реализация
   Формула учитывает:
   - Kill Rating (KPR)
   - Survival Rating (выживание)
   - KAST Rating
   - Impact Rating (ADR + clutch contributions)
   Средний рейтинг ≈ 1.00 */
function calcMapRating({ k, d, a, dmg, rounds, kast }){
  const r = rounds || 1;
  const kpr = k / r;
  const dpr = d / r;
  const apr = a / r;
  const adr = dmg / r;
  const kastFrac = (kast || 0) / 100;
  
  // Kill Rating: нормализованный KPR (0.7 - базовый уровень)
  const killRating = (kpr / 0.7) * 0.6;
  
  // Survival Rating: чем меньше смертей, тем лучше
  const survivalRating = ((1 - dpr) / 0.7) * 0.3;
  
  // KAST Rating: прямая зависимость
  const kastRating = kastFrac * 0.2;
  
  // Impact Rating: ADR + assist contributions
  const impactRating = (adr / 80) * 0.15 + (apr / 0.3) * 0.05;
  
  const rating = killRating + survivalRating + kastRating + impactRating;
  return Math.max(0, +rating.toFixed(2));
}

async function recalcPlayersFromMatch(mapsPayload, matchDoc){
  const mergedMatches = MATCHES.map(x => x.id === matchDoc.id
    ? { ...x, status: "finished", maps: mapsPayload }
    : x);
  if (!mergedMatches.find(x => x.id === matchDoc.id)) {
    mergedMatches.push({ ...matchDoc, status: "finished", maps: mapsPayload });
  }

  const affectedPlayerIds = new Set();
  mapsPayload.forEach(mp => Object.keys(mp.playerStats || {}).forEach(pid => affectedPlayerIds.add(pid)));

  for (const pid of affectedPlayerIds) {
    const allStats = [];
    const matchIds = [];
    mergedMatches.forEach(mt => {
      if (mt.status !== "finished" || !mt.maps) return;
      let appeared = false;
      mt.maps.forEach(mp => {
        if (mp.playerStats && mp.playerStats[pid]) { allStats.push(mp.playerStats[pid]); appeared = true; }
      });
      if (appeared) matchIds.push(mt.id);
    });
    if (!allStats.length) continue;
    const totalK = allStats.reduce((s, x) => s + x.k, 0);
    const totalD = allStats.reduce((s, x) => s + x.d, 0);
    const avgAdr = +(allStats.reduce((s, x) => s + x.adr, 0) / allStats.length).toFixed(1);
    const avgKast = Math.round(allStats.reduce((s, x) => s + x.kast, 0) / allStats.length);
    const avgRating = +(allStats.reduce((s, x) => s + x.rating, 0) / allStats.length).toFixed(2);
    const kd = totalD > 0 ? +(totalK / totalD).toFixed(2) : totalK;
    const formGraph = allStats.slice(-10).map(x => x.rating);
    await updateDoc(doc(db, "players", pid), { kd, adr: avgAdr, kast: avgKast, rating: avgRating, formGraph, matchIds });
  }
}

async function recalcTeamStats(teamId){
  const matchesSnap = await getDocs(collection(db, "matches"));
  const allMatches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const teamMatches = allMatches
    .filter(mt => mt.status === "finished" && mt.score && (mt.teamA === teamId || mt.teamB === teamId))
    .sort((a, b) => a.startAt - b.startAt);
  if (!teamMatches.length) return;

  let wins = 0;
  const mapWinrate = {};
  const form = [];
  teamMatches.forEach(mt => {
    const isA = mt.teamA === teamId;
    const scoreMine = isA ? mt.score[0] : mt.score[1];
    const scoreTheirs = isA ? mt.score[1] : mt.score[0];
    if (scoreMine > scoreTheirs) wins++;
    form.push(scoreMine > scoreTheirs ? "W" : "L");
    (mt.maps || []).forEach(mp => {
      if (!mp.name) return;
      if (!mapWinrate[mp.name]) mapWinrate[mp.name] = { wins: 0, losses: 0 };
      if (mp.winnerTeamId === teamId) mapWinrate[mp.name].wins++;
      else if (mp.winnerTeamId) mapWinrate[mp.name].losses++;
    });
  });
  const winrate = Math.round((wins / teamMatches.length) * 100);

  const playersSnap = await getDocs(collection(db, "players"));
  const teamPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.teamId === teamId);
  const playerRating = teamPlayers.length
    ? +(teamPlayers.reduce((s, p) => s + (p.rating || 0), 0) / teamPlayers.length).toFixed(2)
    : 0;

  await updateDoc(doc(db, "teams", teamId), { winrate, form: form.slice(-5), mapWinrate, rating: playerRating });
}

/* --------------------------------------------------------------
   ELO КОМАНД — пересчитывается ГЛОБАЛЬНО одним проходом по всем
   сыгранным матчам всех команд в хронологическом порядке.
   Раньше elo команды пересчитывалось по одной команде за раз и брало
   "текущий" (уже сохранённый в Firestore) elo соперника вместо elo
   соперника НА МОМЕНТ того матча — из-за этого числа расходились и
   сама привязка команда↔elo была бессмысленной (посчиталось и никуда
   не шло). Здесь elo всех команд считается вместе, в одной
   последовательной симуляции по датам матчей — единственный корректный
   способ посчитать Elo с "живым" K-фактором, и результат используется
   в рейтингах/профиле команды.
-------------------------------------------------------------- */
async function recalcAllTeamElo(){
  const matchesSnap = await getDocs(collection(db, "matches"));
  const allMatches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(mt => mt.status === "finished" && Array.isArray(mt.score) && mt.teamA && mt.teamB && mt.teamA !== "BYE" && mt.teamB !== "BYE")
    .sort((a, b) => (a.startAt || 0) - (b.startAt || 0));

  const K = 32;
  const eloMap = {};
  const teamOf = id => (eloMap[id] === undefined ? (eloMap[id] = 1000) : eloMap[id]);

  allMatches.forEach(mt => {
    const eloA = teamOf(mt.teamA);
    const eloB = teamOf(mt.teamB);
    const [scoreA, scoreB] = mt.score;
    if (scoreA === scoreB) return; // ничья по картам в BO — пропускаем, не должно случаться
    const resultA = scoreA > scoreB ? 1 : 0;
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const delta = K * (resultA - expectedA);
    eloMap[mt.teamA] = eloA + delta;
    eloMap[mt.teamB] = eloB - delta;
  });

  const updates = Object.keys(eloMap).map(teamId =>
    updateDoc(doc(db, "teams", teamId), { elo: Math.round(eloMap[teamId]) }).catch(() => {})
  );
  await Promise.all(updates);
}

async function submitMatchResult(){
  const note = document.getElementById("arNote");
  note.textContent = ""; note.style.color = "";
  const m = MATCHES.find(x => x.id === resultMatchId);
  if (!m) return;

  const validMaps = resultMaps.filter(mp => mp.name && mp.scoreA !== null && mp.scoreB !== null);
  if (!validMaps.length) {
    note.style.color = "var(--loss)";
    note.textContent = "Заполните хотя бы одну карту (название + счёт обеих команд).";
    return;
  }

  try {
    let mapsWonA = 0, mapsWonB = 0;
    const mapsPayload = validMaps.map(mp => {
      if (mp.scoreA > mp.scoreB) mapsWonA++; else if (mp.scoreB > mp.scoreA) mapsWonB++;
      const rounds = mp.rounds || (mp.scoreA + mp.scoreB) || 1;
      const playerStats = {};
      Object.entries(mp.stats).forEach(([pid, s]) => {
        if (s.k == null && s.d == null && s.a == null && s.dmg == null) return;
        const k = s.k || 0, d = s.d || 0, a = s.a || 0, dmg = s.dmg || 0, kast = s.kast || 0;
        const adr = rounds ? +(dmg / rounds).toFixed(1) : 0;
        const rating = calcMapRating({ k, d, a, dmg, rounds, kast });
        playerStats[pid] = { k, d, a, dmg, adr, kast, rating };
      });
      const winnerTeamId = mp.scoreA > mp.scoreB ? m.teamA : (mp.scoreB > mp.scoreA ? m.teamB : null);
      return { name: mp.name, score: [mp.scoreA, mp.scoreB], rounds, winnerTeamId, playerStats };
    });

    const score = [mapsWonA, mapsWonB];
    await updateDoc(doc(db, "matches", resultMatchId), { status: "finished", score, maps: mapsPayload });

    await recalcPlayersFromMatch(mapsPayload, { ...m, score });
    await recalcTeamStats(m.teamA);
    await recalcTeamStats(m.teamB);
    await recalcAllTeamElo();

    note.style.color = "var(--win)";
    note.textContent = "Результат сохранён, статистика пересчитана автоматически.";
    setTimeout(() => closeModal("adminResultModal"), 900);
  } catch (err) {
    note.style.color = "var(--loss)";
    note.textContent = "Ошибка: " + (err.message || err);
  }
}

/* --------------------------------------------------------------
   HELPER FUNCTIONS
-------------------------------------------------------------- */
function tagBlock(team, size){
  return team.logoUrl
    ? `<div class="tag-block notched" style="width:${size}px;height:${size}px;background-image:url('${team.logoUrl}');background-size:cover;background-position:center;"></div>`
    : `<div class="tag-block notched" style="width:${size}px;height:${size}px;font-size:${size*0.36}px;">${teamTag(team)}</div>`;
}

function formPills(form){ return `<div class="form">${(form||[]).map(r => `<span class="form-pill ${r==="W"?"win":"loss"}">${r}</span>`).join("")}</div>`; }

// Дата трофея: обычно это число (Date.now(), т.к. serverTimestamp()
// нельзя использовать внутри массива), но на всякий случай поддержан
// и формат Firestore Timestamp с .toDate() — если он когда-то был
// записан другим путём.
function trophyWonDate(wonAt){
  if (!wonAt) return "";
  const ms = typeof wonAt === "object" && wonAt.toDate ? wonAt.toDate().getTime() : wonAt;
  return dateLabel(ms, false);
}

function dateLabel(ts, long){
  if (!ts) return "—";
  const opts = long
    ? { weekday:"long", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" }
    : { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" };
  return new Date(ts).toLocaleString(LANG === "en" ? "en-US" : "ru-RU", opts);
}

function formatCountdown(diff){
  if (diff <= 0) return LANG === "en" ? "LIVE" : "В ЭФИРЕ";
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");
  const dayLetter = LANG === "en" ? "d" : "Д";
  return d > 0 ? `${d}${dayLetter} ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function tournamentName(id){ const t = tournamentById(id); return t ? t.name : "—"; }

function matchCardHTML(m, featured){
  const a = teamById(m.teamA), b = teamById(m.teamB);
  if (!a || !b) return "";
  const size = featured ? 56 : 44;
  let middle;
  if (m.status === "live") {
    const sc = m.score || [0,0];
    middle = `<div class="vs-block"><span class="live-tag"><span class="live-dot"></span>LIVE</span><span class="score-big">${sc[0]} : ${sc[1]}</span></div>`;
  } else if (m.status === "finished") {
    middle = `<div class="vs-block"><span class="vs-label">${t("labelResult")}</span><span class="score-big">${m.score[0]} : ${m.score[1]}</span></div>`;
  } else {
    middle = `<div class="vs-block"><span class="vs-label">${t("labelVs")}</span><span class="countdown" data-countdown="${m.startAt}">${formatCountdown(m.startAt - Date.now())}</span></div>`;
  }
  return `
    <button class="match-card notched ${featured ? "featured" : ""}" data-match="${m.id}">
      <div class="match-top">
        <span class="eyebrow" style="color:var(--ink-dim);">${tournamentName(m.tournamentId)}</span>
        <span class="format-tag">${m.format}</span>
      </div>
      <div class="match-body">
        <div class="match-team"> ${tagBlock(a, size)} <span class="team-name">${a.name}</span> ${formPills(a.form)} </div>
        ${middle}
        <div class="match-team"> ${tagBlock(b, size)} <span class="team-name">${b.name}</span> ${formPills(b.form)} </div>
      </div>
      <div class="match-bottom"><span>${dateLabel(m.startAt, false)}</span>${m.status==="finished" ? `<span>${t("resultEnteredLabel")}</span>`:""}</div>
    </button>
  `;
}

function newsThumbHTML(n){
  return n.imageUrl
    ? `<div class="news-thumb notched" style="background-image:url('${n.imageUrl}');"></div>`
    : `<div class="news-thumb notched news-thumb-placeholder"><span>${n.tag}</span></div>`;
}

function newsDateLabel(n){
  if (n.publishedAt && n.publishedAt.toDate) return n.publishedAt.toDate().toLocaleDateString(LANG==="en"?"en-US":"ru-RU", {day:"numeric",month:"short"});
  return "";
}

function newsCardHTML(n, withExcerpt){
  return `
  <article class="news-card notched">
    ${newsThumbHTML(n)}
    <div class="news-card-body">
      <span class="news-tag">${n.tag}</span><h3>${n.title}</h3>${withExcerpt ? `<p>${n.excerpt}</p>` : ""}<span class="news-date">${newsDateLabel(n)}</span>
    </div>
  </article>`;
}

function openModal(id){ const el = document.getElementById(id); if (el) el.classList.add("open"); }
function closeModal(id){ const el = document.getElementById(id); if (el) el.classList.remove("open"); }

function fillTeamSelect(sel, selected){
  if (!sel) return;
  sel.innerHTML = TEAMS.map(t => `<option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.name}</option>`).join("");
}
function fillTournamentSelect(sel, selected, withEmpty){
  if (!sel) return;
  sel.innerHTML = (withEmpty ? `<option value="">— без турнира —</option>` : "") +
    TOURNAMENTS.map(t => `<option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.name}</option>`).join("");
}

function bindMatchClicks(){
  document.querySelectorAll("[data-match]").forEach(el => {
    el.onclick = () => {
      window.location.href = `/match-details.html?id=${el.dataset.match}`;
    };
  });
}

/* --------------------------------------------------------------
   EVENT BINDING
-------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderCaptchaWidgets();
  const openAuthBtn = document.getElementById("openAuth");
  if (openAuthBtn) {
    openAuthBtn.addEventListener("click", () => {
      if (currentUser) {
        window.location.href = "/account.html";
      } else {
        document.getElementById("authModal").classList.add("open");
      }
    });
  }

  document.getElementById("profileNicknameForm")?.addEventListener("submit", submitProfileNickname);
  document.getElementById("pmLogout")?.addEventListener("click", handleLogout);
  document.getElementById("createTeamForm")?.addEventListener("submit", submitCreateTeamForm);
  document.getElementById("editTeamForm")?.addEventListener("submit", submitEditTeamForm);
  document.getElementById("tournamentRegForm")?.addEventListener("submit", submitTournamentReg);

  // Личный кабинет (account.html)
  document.getElementById("acNicknameForm")?.addEventListener("submit", submitAccountNickname);
  document.getElementById("acPhotoInput")?.addEventListener("change", submitAccountPhoto);
  document.getElementById("acContactsForm")?.addEventListener("submit", submitAccountContacts);
  document.getElementById("acUpdateFaceitBtn")?.addEventListener("click", requestAccountFaceitUpdate);
  document.getElementById("acLogoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("acOpenAuthBtn")?.addEventListener("click", () => document.getElementById("authModal").classList.add("open"));
  // Делегирование клика на документ: вкладки .ac-tab-btn могут быть
  // как статичными (account.html), так и добавленными позже динамически
  // (tournament-details.html рендерится асинхронно после загрузки данных
  // из Firestore, уже после DOMContentLoaded) — прямой addEventListener
  // на querySelectorAll в этот момент их не находил, и клики по вкладкам
  // "Матчи"/"Участники"/"Топ" на странице турнира не работали.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".ac-tab-btn");
    if (!btn) return;
    const scope = btn.closest(".ac-tabs")?.parentElement || document;
    scope.querySelectorAll(".ac-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    scope.querySelectorAll(".ac-tab-panel").forEach(p => p.classList.remove("active"));
    scope.querySelector("#ac-tab-" + btn.dataset.acTab)?.classList.add("active");
  });

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => document.getElementById(btn.dataset.closeModal).classList.remove("open"));
  });

  document.querySelectorAll(".modal-backdrop").forEach(bd => bd.addEventListener("click", () => bd.classList.remove("open")));

  document.querySelectorAll(".auth-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      const modal = tabBtn.closest(".modal") || document;
      modal.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("active", b===tabBtn));
      modal.querySelectorAll(".auth-panel").forEach(p => p.classList.toggle("active", p.id === tabBtn.dataset.authPanel + "Panel"));
    });
  });

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  const registerForm = document.getElementById("registerForm");
  if (registerForm) registerForm.addEventListener("submit", handleRegister);

  // Search inputs for admin panel
  document.getElementById("searchTeams")?.addEventListener("input", renderAdminTeams);
  document.getElementById("searchPlayers")?.addEventListener("input", renderAdminPlayers);
  document.getElementById("searchTournaments")?.addEventListener("input", renderAdminTournaments);

  // Show more players button in tournament details
  document.addEventListener("click", (e) => {
    if (e.target.id === "showMorePlayers") {
      const allPlayersList = document.getElementById("allPlayersList");
      if (allPlayersList) {
        allPlayersList.style.display = allPlayersList.style.display === "none" ? "block" : "none";
        e.target.textContent = allPlayersList.style.display === "none" ? "Смотреть больше" : "Скрыть";
      }
    }
  });

  // Mobile menu toggle
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  const closeMobileMenu = () => {
    mobileMenuBtn?.classList.remove("active");
    mobileMenu?.classList.remove("open");
  };
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      mobileMenuBtn.classList.toggle("active");
      mobileMenu.classList.toggle("open");
    });
    // Закрыть меню при клике на пункт навигации
    mobileMenu.querySelectorAll(".mobile-nav-link").forEach(link => {
      link.addEventListener("click", closeMobileMenu);
    });
    // Закрыть меню при клике вне его
    document.addEventListener("click", (e) => {
      if (mobileMenu.classList.contains("open") && !mobileMenu.contains(e.target) && e.target !== mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
        closeMobileMenu();
      }
    });
    // Закрыть меню по Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobileMenu();
    });
  }

  // Mobile auth button
  const mobileOpenAuth = document.getElementById("mobileOpenAuth");
  if (mobileOpenAuth) {
    mobileOpenAuth.addEventListener("click", () => {
      if (currentUser) {
        window.location.href = "/account.html";
      } else {
        document.getElementById("authModal").classList.add("open");
        closeMobileMenu();
      }
    });
  }

  // Mobile language toggle
  const mobileLangToggle = document.getElementById("mobileLangToggle");
  if (mobileLangToggle) {
    mobileLangToggle.addEventListener("click", () => {
      toggleLanguage();
    });
  }

  // Tab switching
  document.querySelectorAll(".tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      const group = tabBtn.dataset.tab, value = tabBtn.dataset.value;
      document.querySelectorAll(`.tab[data-tab="${group}"]`).forEach(b => b.classList.toggle("active", b === tabBtn));
      document.querySelectorAll(`[data-tab-panel="${group}"]`).forEach(panel => { panel.style.display = panel.dataset.value === value ? "" : "none"; });
    });
  });

  // Language toggle
  const langToggle = document.getElementById("langToggle");
  if (langToggle) {
    langToggle.addEventListener("click", () => {
      LANG = LANG === "ru" ? "en" : "ru";
      applyLanguage();
    });
  }

  /* ---------------- ADMIN PANEL BINDINGS (существуют только на admin.html) ---------------- */

  // Переключение вкладок админки
  document.querySelectorAll(".admin-link").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-link").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.toggle("active", p.id === "admin-" + btn.dataset.admin));
    });
  });

  // Кнопки "+ Добавить..."
  document.getElementById("btnAddTeam")?.addEventListener("click", openAddTeam);
  document.getElementById("btnAddPlayer")?.addEventListener("click", openAddPlayer);
  document.getElementById("btnAddMatch")?.addEventListener("click", openAddMatch);
  document.getElementById("btnAddTournament")?.addEventListener("click", openAddTournament);
  document.getElementById("btnAddNews")?.addEventListener("click", openAddNews);

  // Отправка форм
  document.getElementById("adminTeamForm")?.addEventListener("submit", submitTeamForm);
  document.getElementById("adminPlayerForm")?.addEventListener("submit", submitPlayerForm);
  document.getElementById("adminMatchForm")?.addEventListener("submit", submitMatchForm);
  document.getElementById("adminTournamentForm")?.addEventListener("submit", submitTournamentForm);
  document.getElementById("adminNewsForm")?.addEventListener("submit", submitNewsForm);

  // Внесение результата матча
  document.getElementById("arAddMap")?.addEventListener("click", () => {
    if (resultMaps.length >= 5) { alert("Максимум 5 карт."); return; }
    resultMaps.push(emptyMap());
    renderResultMaps();
  });
  document.getElementById("arRemoveMap")?.addEventListener("click", () => {
    if (resultMaps.length > 1) { resultMaps.pop(); renderResultMaps(); }
  });
  document.getElementById("arSubmit")?.addEventListener("click", submitMatchResult);

  // Редактор турнирной сетки
  document.getElementById("beTournament")?.addEventListener("change", (e) => loadBracketForTournament(e.target.value));

  // Чек-лист участников (клик по чекбоксу команды)
  document.getElementById("bePicker")?.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-be-pick-team]");
    if (!cb) return;
    const id = cb.dataset.bePickTeam;
    if (cb.checked) { if (!bracketSelectedTeamIds.includes(id)) bracketSelectedTeamIds.push(id); }
    else { bracketSelectedTeamIds = bracketSelectedTeamIds.filter(x => x !== id); }
  });

  document.getElementById("beAutoBuild")?.addEventListener("click", () => {
    if (!bracketTournamentId) { alert("Сначала выберите турнир."); return; }
    if (bracketSelectedTeamIds.length < 2) { alert("Отметьте минимум 2 команды."); return; }
    if (bracketWorking && bracketWorking.rounds.length && !confirm("Сетка уже есть — собрать заново? Текущий прогресс сотрётся.")) return;
    const bracketType = currentBracketType();
    if (isSwissBracketType(bracketType)) {
      bracketWorking = buildSwissBracket(bracketSelectedTeamIds);
    } else if (isLeagueBracketType(bracketType)) {
      bracketWorking = buildLeagueBracket(bracketSelectedTeamIds);
    } else {
      bracketWorking = { rounds: buildBracketFromTeamIds(bracketSelectedTeamIds) };
    }
    renderBracketEditor();
  });
  document.getElementById("beSwissNextRound")?.addEventListener("click", () => {
    if (!bracketWorking || !swissRoundComplete(bracketWorking)) { alert("Сначала заполните счёт всех пар текущего раунда."); return; }
    bracketWorking = generateNextSwissRound(bracketWorking, bracketSelectedTeamIds);
    renderBracketEditor();
  });
  document.getElementById("beClear")?.addEventListener("click", () => {
    if (!bracketTournamentId) return;
    if (!confirm("Очистить всю сетку турнира?")) return;
    bracketWorking = { rounds: [] };
    renderBracketEditor();
  });
  document.getElementById("beSave")?.addEventListener("click", async () => {
    const note = document.getElementById("beNote");
    if (!bracketTournamentId) { note.style.color = "var(--loss)"; note.textContent = "Выберите турнир."; return; }
    try {
      await updateDoc(doc(db, "tournaments", bracketTournamentId), { bracket: bracketWorking || { rounds: [] } });
      note.style.color = "var(--win)";
      note.textContent = "Сетка сохранена.";
    } catch (err) {
      note.style.color = "var(--loss)";
      note.textContent = "Ошибка: " + (err.message || err);
    }
  });
  document.getElementById("beFinish")?.addEventListener("click", finishBracketTournament);

  // Admin login form handler
  document.getElementById("admin-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-login-email").value.trim();
    const pass = document.getElementById("admin-login-password").value;
    const status = document.getElementById("admin-login-status");
    status.textContent = ""; status.style.color = "";
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      status.textContent = "";
    } catch (err) {
      status.style.color = "var(--loss)";
      status.textContent = friendlyAuthError(err);
    }
  });

  // Admin logout handler
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await signOut(auth);
  });

  // Admin subtabs (заявки на турниры + модерация команд)
  document.querySelectorAll(".admin-subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".admin-subtabs");
      if (!group) return;
      group.querySelectorAll(".admin-subtab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.subtab) {
        const subtab = btn.dataset.subtab;
        document.getElementById("requests-list-pending").style.display = subtab === "pending" ? "grid" : "none";
        document.getElementById("requests-list-approved").style.display = subtab === "approved" ? "grid" : "none";
      } else if (btn.dataset.teamsSubtab) {
        const subtab = btn.dataset.teamsSubtab;
        document.getElementById("teams-list-pending").style.display = subtab === "pending" ? "grid" : "none";
        document.getElementById("adminTeamsTable").style.display = subtab === "all" ? "block" : "none";
      }
    });
  });

  // Mute requests glow
  document.getElementById("mute-requests-glow")?.addEventListener("click", () => {
    localStorage.setItem("mlt_muted_requests", Date.now().toString());
    updateNotificationDots();
  });
  document.getElementById("mute-teams-glow")?.addEventListener("click", () => {
    localStorage.setItem("mlt_muted_teams", Date.now().toString());
    updateNotificationDots();
  });

  // Делегирование кликов по динамически создаваемым кнопкам (строки таблиц, сетка)
  document.addEventListener("click", (e) => {
    const editTeam = e.target.closest("[data-edit-team]"); if (editTeam) return openEditTeam(editTeam.dataset.editTeam);
    const delTeam = e.target.closest("[data-del-team]"); if (delTeam) return void deleteTeam(delTeam.dataset.delTeam);
    const editPlayer = e.target.closest("[data-edit-player]"); if (editPlayer) return openEditPlayer(editPlayer.dataset.editPlayer);
    const delPlayer = e.target.closest("[data-del-player]"); if (delPlayer) return void deletePlayer(delPlayer.dataset.delPlayer);
    const resultMatch = e.target.closest("[data-result-match]"); if (resultMatch) return openResultModal(resultMatch.dataset.resultMatch);
    const streamMatch = e.target.closest("[data-stream-match]"); if (streamMatch) return void setMatchStream(streamMatch.dataset.streamMatch);
    const editMatch = e.target.closest("[data-edit-match]"); if (editMatch) return openEditMatch(editMatch.dataset.editMatch);
    const delMatch = e.target.closest("[data-del-match]"); if (delMatch) return void deleteMatch(delMatch.dataset.delMatch);
    const editTournament = e.target.closest("[data-edit-tournament]"); if (editTournament) return openEditTournament(editTournament.dataset.editTournament);
    const delTournament = e.target.closest("[data-del-tournament]"); if (delTournament) return void deleteTournament(delTournament.dataset.delTournament);
    const editNews = e.target.closest("[data-edit-news]"); if (editNews) return openEditNews(editNews.dataset.editNews);
    const delNews = e.target.closest("[data-del-news]"); if (delNews) return void deleteNews(delNews.dataset.delNews);
    const acceptReq = e.target.closest("[data-accept-req]"); if (acceptReq) return void acceptRequest(acceptReq.dataset.acceptReq);
    const rejectReq = e.target.closest("[data-reject-req]"); if (rejectReq) return void rejectRequest(rejectReq.dataset.rejectReq);
    const acceptTeamBtn = e.target.closest("[data-accept-team]"); if (acceptTeamBtn) return void acceptTeam(acceptTeamBtn.dataset.acceptTeam);
    const rejectTeamBtn = e.target.closest("[data-reject-team]"); if (rejectTeamBtn) return void rejectTeam(rejectTeamBtn.dataset.rejectTeam);
    const promoteUser = e.target.closest("[data-promote-user]"); if (promoteUser) return void promoteUserToAdmin(promoteUser.dataset.promoteUser);
    const delUserBtn = e.target.closest("[data-delete-user]"); if (delUserBtn) return void deleteUser(delUserBtn.dataset.deleteUser);
    const regTournament = e.target.closest("[data-register-tournament]"); if (regTournament) return handleRegisterClick(regTournament.dataset.registerTournament);
    const bracketTeamLink = e.target.closest("[data-bracket-team-link]"); if (bracketTeamLink) return void (window.location.href = `/team-profile.html?id=${bracketTeamLink.dataset.bracketTeamLink}`);
    const beClearMatch = e.target.closest("[data-be-clear-match]");
    if (beClearMatch && bracketWorking) {
      const ri = Number(beClearMatch.dataset.round), mi = Number(beClearMatch.dataset.match);
      bracketWorking.rounds = clearBracketMatchResult(bracketWorking.rounds, ri, mi);
      renderBracketEditor();
      return;
    }
  });

  // Делегирование ввода в динамические поля (сетка турнира + карты/статистика результата матча)
  document.addEventListener("input", (e) => {
    const beScore = e.target.closest("[data-be-score]");
    if (beScore && bracketWorking) {
      const ri = Number(beScore.dataset.round), mi = Number(beScore.dataset.match);
      const match = ri === 0 ? bracketWorking.rounds[0].matches[mi] : bracketWorking.rounds[ri]?.matches[mi];
      if (!match) return;
      const scoreA = beScore.dataset.beScore === "A" ? beScore.value : match.scoreA;
      const scoreB = beScore.dataset.beScore === "B" ? beScore.value : match.scoreB;
      bracketWorking.rounds = setBracketMatchScore(bracketWorking.rounds, ri, mi, scoreA, scoreB);
      renderBracketEditor();
      // Возвращаем фокус в то же поле счёта после перерендера (сброс фокуса иначе мешал бы вводу)
      const again = document.querySelector(`[data-be-score="${beScore.dataset.beScore}"][data-round="${ri}"][data-match="${mi}"]`);
      if (again) { again.focus(); const v = again.value; again.value = ""; again.value = v; }
      return;
    }
    const swissScore = e.target.closest("[data-be-swiss-score]");
    if (swissScore && bracketWorking) {
      const ri = Number(swissScore.dataset.round), mi = Number(swissScore.dataset.match);
      const match = bracketWorking.rounds[ri]?.matches[mi];
      if (!match) return;
      const scoreA = swissScore.dataset.beSwissScore === "A" ? swissScore.value : match.scoreA;
      const scoreB = swissScore.dataset.beSwissScore === "B" ? swissScore.value : match.scoreB;
      const sA = scoreA === "" || scoreA === null ? null : Number(scoreA);
      const sB = scoreB === "" || scoreB === null ? null : Number(scoreB);
      const winner = (sA !== null && sB !== null && sA !== sB) ? (sA > sB ? match.teamA : match.teamB) : null;
      bracketWorking.rounds[ri].matches[mi] = { ...match, scoreA: sA, scoreB: sB, winner };
      renderBracketEditor();
      const again2 = document.querySelector(`[data-be-swiss-score="${swissScore.dataset.beSwissScore}"][data-round="${ri}"][data-match="${mi}"]`);
      if (again2) { again2.focus(); const v = again2.value; again2.value = ""; again2.value = v; }
      return;
    }
    const leagueScore = e.target.closest("[data-be-league-score]");
    if (leagueScore && bracketWorking) {
      const mi = Number(leagueScore.dataset.match);
      const match = leagueMatches(bracketWorking)[mi];
      if (!match) return;
      const scoreA = leagueScore.dataset.beLeagueScore === "A" ? leagueScore.value : match.scoreA;
      const scoreB = leagueScore.dataset.beLeagueScore === "B" ? leagueScore.value : match.scoreB;
      bracketWorking = setLeagueMatchScore(bracketWorking, mi, scoreA, scoreB);
      renderBracketEditor();
      const again3 = document.querySelector(`[data-be-league-score="${leagueScore.dataset.beLeagueScore}"][data-match="${mi}"]`);
      if (again3) { again3.focus(); const v = again3.value; again3.value = ""; again3.value = v; }
      return;
    }
    const mapField = e.target.closest("[data-map-field]");
    if (mapField) {
      const idx = Number(mapField.dataset.map), field = mapField.dataset.mapField;
      let val = mapField.value;
      if (field !== "name") val = val === "" ? null : Number(val);
      if (resultMaps[idx]) resultMaps[idx][field] = val;
      return;
    }
    const statField = e.target.closest("[data-stat-field]");
    if (statField) {
      const idx = Number(statField.dataset.map), pid = statField.dataset.player, field = statField.dataset.statField;
      const val = statField.value === "" ? null : Number(statField.value);
      if (!resultMaps[idx]) return;
      if (!resultMaps[idx].stats[pid]) resultMaps[idx].stats[pid] = {};
      resultMaps[idx].stats[pid][field] = val;
      return;
    }
  });
});

/* --------------------------------------------------------------
   CONFIG.JS (window.MLT_CONFIG) — соцсети в футере
-------------------------------------------------------------- */
function applyConfig(){
  const cfg = window.MLT_CONFIG;
  if (!cfg || !cfg.social) return;
  document.querySelectorAll("[data-social]").forEach(el => {
    const url = cfg.social[el.dataset.social];
    if (url) el.href = url;
  });
}

/* --------------------------------------------------------------
   LANGUAGE
-------------------------------------------------------------- */
function applyStaticI18n(){
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

function applyLanguage(){
  document.documentElement.lang = LANG;
  applyStaticI18n();
  renderPageContent();
  updateAuthUI();
  document.getElementById("langToggle").textContent = LANG === "ru" ? "EN" : "RU";
  const mobileLangBtn = document.getElementById("mobileLangToggle");
  if (mobileLangBtn) mobileLangBtn.textContent = LANG === "ru" ? "EN" : "RU";
  localStorage.setItem("mlt_lang", LANG);
}

/* --------------------------------------------------------------
   TIMERS
-------------------------------------------------------------- */
setInterval(() => {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    const start = Number(el.dataset.countdown);
    el.textContent = formatCountdown(start - Date.now());
  });
}, 1000);

/* --------------------------------------------------------------
   CONTACT FORM
-------------------------------------------------------------- */
const contactForm = document.getElementById("contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("contactFormNote");
    const name = document.getElementById("contactName").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const message = document.getElementById("contactMessage").value.trim();
    
    if (!name || !email || !message) return;
    
    note.textContent = t("msgSending");
    note.style.color = "";
    
    try {
      await addDoc(collection(db, "messages"), {
        name, email, message,
        createdAt: serverTimestamp()
      });
      note.style.color = "var(--win)";
      note.textContent = t("msgSent");
      contactForm.reset();
    } catch (err) {
      note.style.color = "var(--loss)";
      note.textContent = t("msgSendError");
    }
  });
}

/* --------------------------------------------------------------
   INITIALIZE
-------------------------------------------------------------- */
document.documentElement.lang = LANG;
const initialLangToggle = document.getElementById("langToggle");
if (initialLangToggle) initialLangToggle.textContent = LANG === "ru" ? "EN" : "RU";
applyStaticI18n();
applyConfig();
renderPageContent();
