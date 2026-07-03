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
      const socials = p.socials || {};
      const socialLinks = [];
      if(socials.telegram) socialLinks.push({ label: 'Telegram', href: socials.telegram.startsWith('http') ? socials.telegram : `https://t.me/${socials.telegram.replace(/^@/, '')}` });
      if(socials.discord) socialLinks.push({ label: 'Discord', href: null, text: socials.discord });
      if(socials.faceit) socialLinks.push({ label: 'Faceit', href: socials.faceit.startsWith('http') ? socials.faceit : `https://www.faceit.com/en/players/${socials.faceit}` });
      if(socials.twitch) socialLinks.push({ label: 'Twitch', href: socials.twitch.startsWith('http') ? socials.twitch : `https://twitch.tv/${socials.twitch}` });
      socialsEl.innerHTML = socialLinks.map(s =>
        s.href ? `<a href="${s.href}" target="_blank" rel="noopener">${s.label}</a>`
               : `<span class="profile-view-socials-item">${s.label}: ${s.text}</span>`
      ).join('');
    }catch(err){
      console.error(err);
      nickEl.textContent = 'Не удалось загрузить профиль';
    }
  })();
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
const pTelegram = document.getElementById('pTelegram');
const pDiscord = document.getElementById('pDiscord');
const pFaceit = document.getElementById('pFaceit');
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
    const socials = p.socials || {};
    pTelegram.value = socials.telegram || '';
    pDiscord.value = socials.discord || '';
    pFaceit.value = socials.faceit || '';
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

  profileSubmit.disabled = true;
  profileSubmit.textContent = 'Сохраняем…';
  try{
    await db.collection('users').doc(user.uid).set({
      nickname,
      avatar: currentAvatarDataURL,
      description: pDescription.value.trim(),
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

  const isAdmin = !!(ADMIN_EMAIL && user.email &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

  if(isAdmin){
    window.location.href = 'admin.html';
    return;
  }

  // Забаненный аккаунт: не показываем кабинет, сразу выходим из системы
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
  }catch(err){
    console.warn('Не удалось проверить статус аккаунта', err);
  }

  authSection.style.display = 'none';
  cabinetSection.style.display = 'block';
  cabinetSection.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
  cabinetEmail.textContent = user.email || '—';
  loadProfile(user.uid);
});

} // конец блока "если это не публичный просмотр профиля по ?u="
