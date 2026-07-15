/* =========================================================
   Личный кабинет: создание аккаунта и вход (Firebase Authentication).
   Если email вошедшего совпадает с ADMIN_EMAIL (assets/js/firebase-config.js),
   сайт сразу перенаправляет на admin.html — отдельного "входа для админа"
   заводить не нужно, это тот же самый вход.
========================================================= */

/* ---------------------------------------------------------
   ПУБЛИЧНЫЙ ПРОФИЛЬ (account.html?u=UID) — доступен всем без входа,
   используется как ссылка из состава команды на странице «Участники».
   Если такой параметр есть в адресе, показываем только эту секцию
   и всю логику входа/кабинета ниже вообще не запускаем.
--------------------------------------------------------- */
const profileViewSection = document.getElementById('profile-view-section');
const viewedUid = new URLSearchParams(window.location.search).get('u');

if(viewedUid){
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('cabinet-section').style.display = 'none';
  profileViewSection.style.display = 'block';
  profileViewSection.classList.add('in-view');

  (async () => {
    const nickEl = document.getElementById('pv-nickname');
    const avatarEl = document.getElementById('pv-avatar');
    const descEl = document.getElementById('pv-description');
    const socialsEl = document.getElementById('pv-socials');
    try{
      const snap = await db.collection('users').doc(viewedUid).get();
      if(!snap.exists){
        nickEl.textContent = 'Профиль не найден';
        return;
      }
      const p = snap.data();
      const nickname = p.nickname || 'Без ника';
      nickEl.textContent = nickname;
      avatarEl.innerHTML = p.avatar
        ? `<img src="${p.avatar}" alt="${nickname}">`
        : nickname.slice(0, 2).toUpperCase();
      descEl.textContent = p.description || '';
      const eloEl = document.getElementById('pv-elo');
      if(eloEl) eloEl.textContent = p.faceitElo ? `Эло на Faceit: ${p.faceitElo}` : '';
      const socials = p.socials || {};
      const faceitUrl = socials.vk || ''; // это поле исторически называется "vk", но хранит ссылку на FACEIT (см. форму профиля — поле подписано "Faceit")
      const socialLinks = [];
      if(socials.telegram) socialLinks.push({ label: 'Telegram', href: socials.telegram.startsWith('http') ? socials.telegram : `https://t.me/${socials.telegram.replace(/^@/, '')}` });
      if(socials.discord) socialLinks.push({ label: 'Discord', href: null, text: socials.discord });
      if(faceitUrl) socialLinks.push({ label: 'Faceit ↗', href: faceitUrl.startsWith('http') ? faceitUrl : `https://www.faceit.com/ru/players/${faceitUrl}` });
      if(socials.twitch) socialLinks.push({ label: 'Twitch', href: socials.twitch.startsWith('http') ? socials.twitch : `https://twitch.tv/${socials.twitch}` });
      socialsEl.innerHTML = socialLinks.map(s =>
        s.href ? `<a href="${s.href}" target="_blank" rel="noopener">${s.label}</a>`
               : `<span class="profile-view-socials-item">${s.label}: ${s.text}</span>`
      ).join('');

      const faceitStatsEl = document.getElementById('pv-faceit-stats');
      if(faceitStatsEl && typeof renderFaceitStatsCard === 'function'){
        renderFaceitStatsCard(faceitStatsEl, faceitUrl.startsWith('http') ? faceitUrl : (faceitUrl ? `https://www.faceit.com/ru/players/${faceitUrl}` : ''));
      }

      loadPlayerTeamBadge(viewedUid);
      if(typeof renderFriendActionOnProfileView === 'function'){
        auth.onAuthStateChanged(() => renderFriendActionOnProfileView(viewedUid, nickname));
      }
    }catch(err){
      console.error(err);
      nickEl.textContent = 'Не удалось загрузить профиль';
    }
  })();
}

/* ---------------------------------------------------------
   БЕЙДЖ КОМАНДЫ на публичном профиле — ищем среди одобренных
   заявок ту, где этот uid стоит капитаном или в составе, и
   показываем плашку с логотипом/названием команды и ссылкой,
   которая открывает кабинет именно этой команды на «Участники».
--------------------------------------------------------- */
function normalizeRosterPV(roster){
  if(Array.isArray(roster)) return roster;
  if(typeof roster === 'string'){
    return roster.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(nickname => ({ nickname, uid: null }));
  }
  return [];
}

async function loadPlayerTeamBadge(uid){
  const wrap = document.getElementById('pv-team-wrap');
  if(!wrap) return;
  try{
    const snap = await db.collection('teamApplications').where('status', '==', 'approved').get();
    let team = null;
    snap.forEach(doc => {
      if(team) return;
      const d = doc.data();
      const roster = normalizeRosterPV(d.roster);
      if(d.captainUid === uid || roster.some(p => p.uid === uid)){
        team = Object.assign({ id: doc.id }, d);
      }
    });
    if(!team){ wrap.innerHTML = ''; return; }

    const initials = (team.teamName || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    wrap.innerHTML = '' +
      '<a class="pv-team-badge" href="participants.html?team=' + encodeURIComponent(team.id) + '">' +
        '<span class="pv-team-badge-avatar">' +
          (team.teamAvatar ? ('<img src="' + team.teamAvatar + '" alt="' + team.teamName + '">') : initials) +
        '</span>' +
        '<span class="pv-team-badge-text">' +
          '<span class="pv-team-badge-label">Зарегистрирован в команде</span>' +
          '<span class="pv-team-badge-name">' + team.teamName + ' →</span>' +
        '</span>' +
      '</a>';
  }catch(err){
    console.error('Не удалось загрузить команду игрока', err);
  }
}

/* ---------------------------------------------------------
   ВХОД / РЕГИСТРАЦИЯ / ЛИЧНЫЙ КАБИНЕТ — обычный сценарий,
   когда в адресе нет ?u=UID.
--------------------------------------------------------- */
if(!viewedUid){

const authSection = document.getElementById('auth-section');
const cabinetSection = document.getElementById('cabinet-section');
const cabinetEmail = document.getElementById('cabinet-email');
const logoutBtn = document.getElementById('logout-btn');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginStatus = document.getElementById('login-status');
const signupStatus = document.getElementById('signup-status');

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabSignup.classList.remove('active');
  loginForm.style.display = 'block';
  signupForm.style.display = 'none';
});
tabSignup.addEventListener('click', () => {
  tabSignup.classList.add('active');
  tabLogin.classList.remove('active');
  signupForm.style.display = 'block';
  loginForm.style.display = 'none';
});

const authErrorMessages = {
  'auth/invalid-email': 'Некорректный формат email.',
  'auth/user-not-found': 'Пользователь с таким email не найден.',
  'auth/wrong-password': 'Неверный пароль для этого email.',
  'auth/invalid-credential': 'Неверный email или пароль.',
  'auth/invalid-login-credentials': 'Неверный email или пароль.',
  'auth/user-disabled': 'Этот аккаунт отключён.',
  'auth/too-many-requests': 'Слишком много неудачных попыток входа подряд. Подожди немного и попробуй снова.',
  'auth/network-request-failed': 'Проблема с сетью — проверь интернет-соединение.',
  'auth/unauthorized-domain': 'Этот домен не добавлен в Firebase → Authentication → Settings → Authorized domains.',
  'auth/email-already-in-use': 'Аккаунт с таким email уже существует — попробуй войти.',
  'auth/weak-password': 'Пароль слишком простой — минимум 6 символов.',
  'auth/configuration-not-found': 'В Firebase не включён провайдер Email/Password — включи его в Authentication → Sign-in method.',
  'auth/operation-not-allowed': 'Провайдер Email/Password выключен — включи его в Authentication → Sign-in method.',
};

function authErrorText(err){
  console.error('Firebase auth error:', err.code, err.message);
  return authErrorMessages[err.code]
    || `Ошибка: ${err.code || err.message}. Открой консоль браузера (F12 → Console) — там будет точный код ошибки.`;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginStatus.textContent = '';
  loginStatus.className = '';
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try{
    await auth.signInWithEmailAndPassword(email, password);
    // дальше решает auth.onAuthStateChanged ниже: обычный аккаунт → кабинет,
    // email администратора → редирект на admin.html
  }catch(err){
    loginStatus.textContent = authErrorText(err);
    loginStatus.className = 'form-msg error';
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signupStatus.textContent = '';
  signupStatus.className = '';
  const email = signupForm.email.value.trim();
  const password = signupForm.password.value;
  const password2 = signupForm.password2.value;
  if(password !== password2){
    signupStatus.textContent = 'Пароли не совпадают.';
    signupStatus.className = 'form-msg error';
    return;
  }
  try{
    await auth.createUserWithEmailAndPassword(email, password);
  }catch(err){
    signupStatus.textContent = authErrorText(err);
    signupStatus.className = 'form-msg error';
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

/* ---------------------------------------------------------
   ПРОФИЛЬ: ник, аватар, описание, соцсети — хранится в Firestore
   в коллекции users/{uid}. Аватар превращается в компактный dataURL
   прямо в браузере (см. fileToCompressedDataURL в main.js) и пишется
   в тот же документ — без Firebase Storage.
--------------------------------------------------------- */
const profileForm = document.getElementById('profile-form');
const profileStatus = document.getElementById('profile-status');
const profileSubmit = document.getElementById('profile-submit');
const pNickname = document.getElementById('pNickname');
const pDescription = document.getElementById('pDescription');
const pFaceitElo = document.getElementById('pFaceitElo');
const pTelegram = document.getElementById('pTelegram');
const pDiscord = document.getElementById('pDiscord');
const pVk = document.getElementById('pVk');
const pTwitch = document.getElementById('pTwitch');
const pAvatarFile = document.getElementById('pAvatarFile');
const profileAvatarPreview = document.getElementById('profile-avatar-preview');
const profileAvatarRemove = document.getElementById('profile-avatar-remove');

let currentAvatarDataURL = ''; // текущий аватар (пусто = без аватара)

function renderAvatarPreview(){
  if(currentAvatarDataURL){
    profileAvatarPreview.innerHTML = `<img src="${currentAvatarDataURL}" alt="Аватар">`;
    profileAvatarRemove.style.display = 'inline-block';
  }else{
    const nick = pNickname.value.trim();
    profileAvatarPreview.textContent = nick ? nick.slice(0, 2).toUpperCase() : '?';
    profileAvatarRemove.style.display = 'none';
  }
}

pNickname.addEventListener('input', () => { if(!currentAvatarDataURL) renderAvatarPreview(); });

pAvatarFile.addEventListener('change', async () => {
  const file = pAvatarFile.files && pAvatarFile.files[0];
  if(!file) return;
  try{
    currentAvatarDataURL = await fileToCompressedDataURL(file, 320, 0.82);
    renderAvatarPreview();
  }catch(err){
    profileStatus.textContent = err.message || 'Не удалось обработать картинку.';
    profileStatus.className = 'form-msg error';
  }finally{
    pAvatarFile.value = '';
  }
});

profileAvatarRemove.addEventListener('click', () => {
  currentAvatarDataURL = '';
  renderAvatarPreview();
});

async function loadProfile(uid){
  try{
    const snap = await db.collection('users').doc(uid).get();
    const p = snap.exists ? snap.data() : {};
    pNickname.value = p.nickname || '';
    pDescription.value = p.description || '';
    pFaceitElo.value = p.faceitElo || '';
    const socials = p.socials || {};
    pTelegram.value = socials.telegram || '';
    pDiscord.value = socials.discord || '';
    pVk.value = socials.vk || '';
    pTwitch.value = socials.twitch || '';
    currentAvatarDataURL = p.avatar || '';
    renderAvatarPreview();
  }catch(err){
    console.error(err);
  }
}

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  profileStatus.textContent = '';
  profileStatus.className = '';
  const user = auth.currentUser;
  if(!user) return;

  const nickname = pNickname.value.trim();
  if(!nickname){
    profileStatus.textContent = 'Укажи ник.';
    profileStatus.className = 'form-msg error';
    return;
  }

  const faceitEloValue = Number(pFaceitElo.value);
  if(!pFaceitElo.value || !Number.isFinite(faceitEloValue) || faceitEloValue < 1 || faceitEloValue > 10000){
    profileStatus.textContent = 'Укажи своё текущее эло на Faceit (число от 1 до 10000) — это обязательное поле.';
    profileStatus.className = 'form-msg error';
    return;
  }

  profileSubmit.disabled = true;
  profileSubmit.textContent = 'Сохраняем…';
  try{
    await db.collection('users').doc(user.uid).set({
      nickname,
      avatar: currentAvatarDataURL,
      description: pDescription.value.trim(),
      faceitElo: Math.round(faceitEloValue),
      socials: {
        telegram: pTelegram.value.trim(),
        discord: pDiscord.value.trim(),
        vk: pVk.value.trim(),
        twitch: pTwitch.value.trim(),
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    profileStatus.textContent = 'Профиль сохранён.';
    profileStatus.className = 'form-msg success';
  }catch(err){
    console.error(err);
    profileStatus.textContent = 'Не удалось сохранить профиль. Попробуй ещё раз.';
    profileStatus.className = 'form-msg error';
  }finally{
    profileSubmit.disabled = false;
    profileSubmit.textContent = 'Сохранить профиль';
  }
});

auth.onAuthStateChanged(async (user) => {
  if(!user){
    authSection.style.display = 'block';
    cabinetSection.style.display = 'none';
    return;
  }

  const isOwner = !!(ADMIN_EMAIL && user.email &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  // Владелец обычно сразу улетает в admin.html — но если он специально
  // зашёл по ссылке "Мой аккаунт" из панели (account.html?asUser=1),
  // даём ему полноценно попользоваться обычным кабинетом, как игроку.
  const wantsUserView = new URLSearchParams(window.location.search).get('asUser') === '1';

  if(isOwner && !wantsUserView){
    window.location.href = 'admin.html';
    return;
  }

  // Забаненный аккаунт: не показываем кабинет, сразу выходим из системы.
  // Заодно читаем роль (модератор?), чтобы показать кнопку в панель организатора.
  let role = null;
  try{
    const snap = await db.collection('users').doc(user.uid).get();
    if(snap.exists && snap.data().banned){
      await auth.signOut();
      authSection.style.display = 'block';
      cabinetSection.style.display = 'none';
      loginStatus.textContent = 'Этот аккаунт заблокирован организатором за нарушение правил сайта. Если считаешь это ошибкой — напиши в «Контакты».';
      loginStatus.className = 'form-msg error';
      return;
    }
    if(snap.exists) role = snap.data().role || null;
  }catch(err){
    console.warn('Не удалось проверить статус аккаунта', err);
  }

  authSection.style.display = 'none';
  cabinetSection.style.display = 'block';
  cabinetSection.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
  cabinetEmail.textContent = user.email || '—';
  const toAdminBtn = document.getElementById('to-admin-btn');
  if(toAdminBtn && (isOwner || role === 'moderator')) toAdminBtn.style.display = 'inline-flex';
  loadProfile(user.uid);
  loadApplicationStatus(user.uid);
  if(typeof loadFriendsSection === 'function') loadFriendsSection(user.uid);
});

/* ---------------------------------------------------------
   СТАТУС ЗАЯВКИ КОМАНДЫ — ищем среди всех заявок ту, где этот
   аккаунт указан как капитан или игрок состава (по uid, который
   register.js проставляет по совпадению ника с зарегистрированным
   профилем). Показываем статус и снимаем подсветку кнопки «Аккаунт»
   в шапке (см. checkNavAlert в main.js), как только человек увидел
   свою одобренную заявку здесь.
--------------------------------------------------------- */
function normalizeRosterAcc(roster){
  if(Array.isArray(roster)) return roster;
  if(typeof roster === 'string'){
    return roster.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(nickname => ({ nickname, uid: null }));
  }
  return [];
}

const appStatusIcons = { pending: '⏳', approved: '✅', rejected: '✕' };
const appStatusTitles = {
  pending: 'На модерации',
  approved: 'Команда одобрена!',
  rejected: 'Заявка отклонена',
};

function applicationStatusHTML(app){
  const icon = appStatusIcons[app.status] || '•';
  const title = appStatusTitles[app.status] || app.status;
  let text = '';
  if(app.status === 'pending'){
    text = 'Заявка команды «' + app.teamName + '» отправлена и ожидает решения организатора. Как только модерация пройдёт, здесь и в шапке сайта (кнопка «Аккаунт») появится уведомление.';
  }else if(app.status === 'approved'){
    text = 'Команда «' + app.teamName + '» прошла модерацию и появилась в разделе «Участники». Открой её карточку там — как игрок состава ты увидишь ссылку на участие в турнире Faceit и сможешь писать сообщения от лица команды.';
  }else if(app.status === 'rejected'){
    text = 'Заявка команды «' + app.teamName + '» была отклонена организатором. Если это неожиданно — напиши в «Контакты», чтобы уточнить причину, или подай новую заявку.';
  }
  const link = app.status === 'approved'
    ? '<div style="margin-top:10px;"><a class="btn secondary small" href="participants.html">Открыть «Участники» →</a></div>'
    : '';
  return '' +
    '<div class="status-banner ' + app.status + '">' +
      '<div class="ic">' + icon + '</div>' +
      '<div>' +
        '<h4>' + title + '</h4>' +
        '<p>' + text + '</p>' +
        link +
      '</div>' +
    '</div>';
}

async function loadApplicationStatus(uid){
  const wrap = document.getElementById('application-status-wrap');
  if(!wrap) return;
  try{
    // Свой ник нужен для самопочинки привязки ниже: если аккаунт был создан
    // ПОСЛЕ подачи заявки, register.js не мог сопоставить его по нику в тот
    // момент, и uid в составе/у капитана остался пустым.
    let myNickname = '';
    try{
      const meSnap = await db.collection('users').doc(uid).get();
      myNickname = meSnap.exists ? (meSnap.data().nickname || '').trim() : '';
    }catch(e){ console.warn('Не удалось прочитать свой ник для самопочинки привязки', e); }
    const myNickLower = myNickname.toLowerCase();

    const snap = await db.collection('teamApplications').get();
    const mine = [];
    for(const doc of snap.docs){
      const d = doc.data();
      const roster = normalizeRosterAcc(d.roster);
      let isMember = d.captainUid === uid || roster.some(p => p.uid === uid);

      // Самопочинка: ник в заявке совпадает с ником текущего профиля, но
      // uid там ещё не проставлен — значит аккаунт завели позже подачи
      // заявки. Дозаписываем uid прямо сейчас, без участия организатора.
      if(!isMember && myNickLower){
        const captainMatch = !d.captainUid && (d.captainName || '').trim().toLowerCase() === myNickLower;
        const rosterIdx = roster.findIndex(p => !p.uid && (p.nickname || '').trim().toLowerCase() === myNickLower);

        if(captainMatch || rosterIdx !== -1){
          const patch = {};
          if(captainMatch) patch.captainUid = uid;
          if(rosterIdx !== -1){
            patch.roster = roster.map((p, i) => i === rosterIdx ? Object.assign({}, p, { uid }) : p);
          }
          try{
            await db.collection('teamApplications').doc(doc.id).update(patch);
            Object.assign(d, patch);
            isMember = true;
          }catch(err){
            console.warn('Не удалось автоматически привязать аккаунт к заявке ' + doc.id, err);
          }
        }
      }

      if(isMember) mine.push(Object.assign({ id: doc.id }, d));
    }

    if(!mine.length){
      wrap.innerHTML = '';
      return;
    }

    mine.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

    wrap.innerHTML = mine.map(applicationStatusHTML).join('');

    mine.forEach(app => {
      if(app.status === 'approved'){
        try{ localStorage.setItem('ist_seen_approved_' + app.id, '1'); }catch(e){}
      }
    });
  }catch(err){
    console.error('Не удалось загрузить статус заявки', err);
  }
}

} // конец блока "если это не публичный просмотр профиля по ?u="
