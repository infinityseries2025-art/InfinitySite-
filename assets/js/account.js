/* =========================================================
   Личный кабинет: создание аккаунта и вход (Firebase Authentication).
   Если email вошедшего совпадает с ADMIN_EMAIL (assets/js/firebase-config.js),
   сайт сразу перенаправляет на admin.html — отдельного "входа для админа"
   заводить не нужно, это тот же самый вход.
========================================================= */

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

auth.onAuthStateChanged((user) => {
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

  authSection.style.display = 'none';
  cabinetSection.style.display = 'block';
  cabinetSection.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
  cabinetEmail.textContent = user.email || '—';
});
