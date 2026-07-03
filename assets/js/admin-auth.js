/* =========================================================
   Вход организатора (Firebase Authentication) и модерация
   заявок команд (Firestore, коллекция teamApplications).
   Доступ к #admin-content открывается только после успешного
   входа — до этого видна только форма логина.
========================================================= */

const loginSection = document.getElementById('admin-login');
const contentSection = document.getElementById('admin-content');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const logoutBtn = document.getElementById('logout-btn');
const appsList = document.getElementById('applications-list');

let unsubscribeApps = null;

function isAdminUser(user){
  return !!(user && user.email && ADMIN_EMAIL &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

/* Модератор — обычный аккаунт (заведённый на account.html), которому
   организатор выдал role:"moderator" в профиле (users/{uid} в Firestore,
   см. раздел "Аккаунты игроков" в этой панели). Модератор получает доступ
   в панель, но раздел управления аккаунтами видит только организатор. */
async function checkModerator(user){
  if(!user || typeof db === 'undefined') return false;
  try{
    const snap = await db.collection('users').doc(user.uid).get();
    const d = snap.exists ? snap.data() : {};
    return !!(d.role === 'moderator' && !d.banned);
  }catch(e){
    console.warn('Не удалось проверить статус модератора', e);
    return false;
  }
}

let currentPanelRole = null; // 'owner' | 'moderator' | null

auth.onAuthStateChanged(async (user) => {
  const owner = isAdminUser(user);
  const moderator = !owner && (await checkModerator(user));
  currentPanelRole = owner ? 'owner' : (moderator ? 'moderator' : null);

  if(owner || moderator){
    loginSection.style.display = 'none';
    contentSection.style.display = 'block';
    // элементы .reveal внутри панели уже в DOM (просто были скрыты) —
    // показываем их сразу, не дожидаясь скролла
    contentSection.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
    // раздел управления аккаунтами (баны, роли) виден только организатору
    const usersSection = document.getElementById('users-admin-section');
    if(usersSection) usersSection.style.display = owner ? 'block' : 'none';
    startApplicationsListener();
  }else{
    // сюда попадает и гость, и обычный пользователь (создавший аккаунт на
    // account.html), который зашёл на admin.html напрямую по ссылке —
    // им обоим показываем форму входа, без доступа к содержимому панели
    loginSection.style.display = 'block';
    contentSection.style.display = 'none';
    if(unsubscribeApps){ unsubscribeApps(); unsubscribeApps = null; }
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginStatus.textContent = '';
  loginStatus.className = '';
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try{
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const allowed = isAdminUser(cred.user) || (await checkModerator(cred.user));
    if(!allowed){
      await auth.signOut();
      loginStatus.textContent = 'Этот аккаунт не является администраторским или модераторским. Доступ в панель есть только у email из ADMIN_EMAIL и у аккаунтов, которым организатор выдал статус модератора в разделе «Аккаунты игроков».';
      loginStatus.className = 'form-msg error';
    }
  }catch(err){
    console.error('Firebase auth error:', err.code, err.message);
    const messages = {
      'auth/invalid-email': 'Некорректный формат email.',
      'auth/user-not-found': 'Пользователь с таким email не найден. Проверь, что завёл его в Firebase Console → Authentication → Users.',
      'auth/wrong-password': 'Неверный пароль для этого email.',
      'auth/invalid-credential': 'Неверный email или пароль (либо пользователь не создан в Authentication → Users).',
      'auth/invalid-login-credentials': 'Неверный email или пароль (либо пользователь не создан в Authentication → Users).',
      'auth/user-disabled': 'Этот аккаунт отключён в Firebase Console.',
      'auth/too-many-requests': 'Слишком много неудачных попыток входа подряд. Подожди немного и попробуй снова.',
      'auth/network-request-failed': 'Проблема с сетью — проверь интернет-соединение.',
      'auth/unauthorized-domain': 'Этот домен не добавлен в Firebase → Authentication → Settings → Authorized domains.',
      'auth/invalid-api-key': 'Неверный apiKey в assets/js/firebase-config.js — перепроверь, что скопировал ключи из своего проекта.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Неверный apiKey в assets/js/firebase-config.js — перепроверь ключи.',
      'auth/configuration-not-found': 'В Firebase не включён провайдер Email/Password — включи его в Authentication → Sign-in method и нажми Save.',
      'auth/operation-not-allowed': 'Провайдер Email/Password выключен — включи его в Authentication → Sign-in method и нажми Save.',
    };
    loginStatus.textContent = messages[err.code]
      || `Ошибка входа: ${err.code || err.message}. Открой консоль браузера (клавиша F12 → вкладка Console) — там будет точный код ошибки.`;
    loginStatus.className = 'form-msg error';
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

const statusLabels = { pending:'На модерации', approved:'Одобрена', rejected:'Отклонена' };

// Состав хранится как массив {nickname, uid, elo}. У заявок, отправленных
// до этого обновления, роcтер мог остаться строкой — поддерживаем оба формата.
function rosterToText(roster){
  if(Array.isArray(roster)){
    return roster.map(p => {
      if(!p || !p.nickname) return '';
      const linkMark = p.uid ? ' 🔗' : '';
      const eloMark = p.elo ? ` (эло ${p.elo})` : '';
      return p.nickname + linkMark + eloMark;
    }).filter(Boolean).join(', ');
  }
  if(typeof roster === 'string') return roster.replace(/\n/g, ', ');
  return '';
}

function appCardHTML(doc){
  const d = doc.data();
  const id = doc.id;
  const roster = rosterToText(d.roster);
  const initials = (d.teamName || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `
  <div class="card app-card" data-id="${id}">
    <div class="app-top">
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="team-avatar" style="width:36px; height:36px; margin:0; flex:none; font-size:13px;">
          ${d.teamAvatar ? `<img src="${d.teamAvatar}" alt="${d.teamName}">` : initials}
        </div>
        <strong>${d.teamName || '—'}</strong>
      </div>
      <span class="app-status-badge ${d.status}">${statusLabels[d.status] || d.status}</span>
    </div>
    <div style="font-size:13px; color:var(--color-ink-soft);">
      Игра: ${d.game || '—'} · Капитан: ${d.captainName || '—'}${d.captainUid ? ' 🔗' : ''}<br>
      Контакт: ${d.contact || '—'}<br>
      ${d.avgElo ? `Средний эло состава: <strong>${d.avgElo}</strong><br>` : ''}
      Состав: ${roster || '—'}
      ${d.note ? `<br>Комментарий: ${d.note}` : ''}
    </div>
    <div class="app-actions">
      <button class="approve" data-action="approved" ${d.status==='approved' ? 'disabled' : ''}>Одобрить</button>
      <button class="reject" data-action="rejected" ${d.status==='rejected' ? 'disabled' : ''}>Отклонить</button>
      <button class="delete" data-action="delete">Удалить</button>
    </div>
  </div>`;
}

function startApplicationsListener(){
  if(unsubscribeApps) return;
  unsubscribeApps = db.collection('teamApplications')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      if(snap.empty){
        appsList.innerHTML = `<div class="empty-state">Заявок пока нет.</div>`;
        return;
      }
      appsList.innerHTML = snap.docs.map(appCardHTML).join('');
    }, (err) => {
      console.error(err);
      appsList.innerHTML = `<div class="empty-state">Не удалось загрузить заявки.</div>`;
    });
}

appsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const card = btn.closest('.app-card');
  const id = card.getAttribute('data-id');
  const action = btn.getAttribute('data-action');
  btn.disabled = true;
  try{
    if(action === 'delete'){
      if(!confirm('Удалить эту заявку без возможности восстановления?')) { btn.disabled = false; return; }
      await db.collection('teamApplications').doc(id).delete();
    }else{
      await db.collection('teamApplications').doc(id).update({ status: action });
    }
  }catch(err){
    console.error(err);
    alert('Не получилось выполнить действие. Попробуй ещё раз.');
    btn.disabled = false;
  }
});
