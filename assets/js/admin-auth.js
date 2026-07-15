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
const appsListPending = document.getElementById('applications-list-pending');
const appsListApproved = document.getElementById('applications-list-approved');

let unsubscribeApps = null;

/* --- подсветка новых заявок ---
   ID заявок, которые организатор уже "отметил просмотренными" (кнопкой
   "🔕 Скрыть подсветку"), храним в localStorage — подсветка новых заявок
   персональна для этого браузера/устройства. */
function getSeenPendingIds(){
  try{ return new Set(JSON.parse(localStorage.getItem('ist_seen_pending_apps') || '[]')); }
  catch(e){ return new Set(); }
}
function saveSeenPendingIds(set){
  try{ localStorage.setItem('ist_seen_pending_apps', JSON.stringify(Array.from(set))); }catch(e){}
}

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
    // раздел управления аккаунтами (баны, роли) виден только организатору —
    // модератору просто прячем саму кнопку вкладки "Аккаунты", а видимость
    // самой секции дальше управляется общим переключателем вкладок
    const accountsTabBtn = document.querySelector('.admin-tab-btn[data-target="accounts"]');
    if(accountsTabBtn) accountsTabBtn.style.display = owner ? '' : 'none';
    await loadUsersCache();
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

const refreshUsersBtn = document.getElementById('refresh-users-cache');
const refreshUsersStatus = document.getElementById('refresh-users-status');
if(refreshUsersBtn){
  refreshUsersBtn.addEventListener('click', async () => {
    refreshUsersBtn.disabled = true;
    if(refreshUsersStatus) refreshUsersStatus.textContent = 'Обновляем…';
    await loadUsersCache();
    // перерисовываем список селектов свежими данными — проще всего
    // заново дождаться следующего onSnapshot, но он не сработает без
    // изменений в базе, поэтому просто пере-рендерим из уже открытого снапшота
    if(unsubscribeApps){ unsubscribeApps(); unsubscribeApps = null; startApplicationsListener(); }
    refreshUsersBtn.disabled = false;
    if(refreshUsersStatus) refreshUsersStatus.textContent = 'Список обновлён ✓';
    setTimeout(() => { if(refreshUsersStatus) refreshUsersStatus.textContent = ''; }, 2000);
  });
}

const statusLabels = { pending:'На модерации', approved:'Одобрена', rejected:'Отклонена' };

/* ---------------------------------------------------------
   РУЧНАЯ ПРИВЯЗКА АККАУНТОВ К СОСТАВУ КОМАНДЫ.
   Обычно uid проставляется автоматически при подаче заявки (по совпадению
   ника) или самопочинкой при заходе игрока в кабинет (см. account.js).
   Но если ники не совпали дословно (опечатка, другой ник в профиле) —
   организатор может привязать аккаунт вручную здесь, выбрав его из списка
   всех зарегистрированных пользователей.
--------------------------------------------------------- */
let usersCache = []; // [{ uid, nickname }]

async function loadUsersCache(){
  try{
    const snap = await db.collection('users').limit(1000).get();
    usersCache = snap.docs
      .map(d => ({ uid: d.id, nickname: (d.data().nickname || '').trim() }))
      .filter(u => u.nickname)
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
  }catch(err){
    console.warn('Не удалось загрузить список аккаунтов для ручной привязки', err);
    usersCache = [];
  }
}

function userOptionsHTML(selectedUid){
  const opts = ['<option value="">— не привязан —</option>'];
  usersCache.forEach(u => {
    opts.push(`<option value="${u.uid}" ${u.uid === selectedUid ? 'selected' : ''}>${u.nickname}</option>`);
  });
  return opts.join('');
}

// Состав как массив объектов, даже если в старой заявке он ещё хранится строкой.
function normalizeRosterAdmin(roster){
  if(Array.isArray(roster)) return roster;
  if(typeof roster === 'string'){
    return roster.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(nickname => ({ nickname, uid: null }));
  }
  return [];
}

// Кодируем состав в data-атрибут кнопки, чтобы при сохранении не потерять
// поля elo/faceit тех игроков, чей селект вообще не трогали.
function encodeRosterForButton(roster){
  return btoa(unescape(encodeURIComponent(JSON.stringify(roster))));
}
function decodeRosterFromButton(encoded){
  try{ return JSON.parse(decodeURIComponent(escape(atob(encoded)))); }
  catch(err){ return []; }
}

function linkBlockHTML(d){
  const roster = normalizeRosterAdmin(d.roster);
  const rosterRows = roster.map((p, i) => `
    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px;">
      <span style="font-size:13px; min-width:120px;">${p.nickname || '—'}:</span>
      <select class="link-roster" data-idx="${i}" style="flex:1; min-width:160px; padding:6px 8px; border-radius:8px; border:1px solid var(--color-primary-line); background:var(--color-surface-alt); color:var(--color-text); font-size:13px;">
        ${userOptionsHTML(p.uid || null)}
      </select>
    </div>`).join('');
  return `
  <div class="app-link-block" style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--color-primary-line);">
    <div style="font-size:12px; color:var(--color-ink-soft); margin-bottom:6px;">
      Привязка аккаунтов вручную (если ник не совпал автоматически):
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px;">
      <span style="font-size:13px; min-width:120px;">Капитан (${d.captainName || '—'}):</span>
      <select class="link-captain" style="flex:1; min-width:160px; padding:6px 8px; border-radius:8px; border:1px solid var(--color-primary-line); background:var(--color-surface-alt); color:var(--color-text); font-size:13px;">
        ${userOptionsHTML(d.captainUid || null)}
      </select>
    </div>
    ${rosterRows}
    <button type="button" class="app-links-save" data-roster="${encodeRosterForButton(roster)}"
      style="padding:8px 14px; border-radius:8px; border:1px solid var(--color-primary-line); background:var(--color-surface-alt); color:var(--color-text); font-size:12.5px; cursor:pointer;">
      Сохранить привязки
    </button>
    <span class="app-links-status" style="font-size:12px; margin-left:8px; color:var(--color-ink-soft);"></span>
  </div>`;
}

// Состав хранится как массив {nickname, uid, elo, faceit}. У заявок, отправленных
// до этого обновления, ростер мог остаться строкой — поддерживаем оба формата.
function rosterToHTML(roster){
  if(Array.isArray(roster)){
    return roster.map(p => {
      if(!p || !p.nickname) return '';
      const linkMark = p.uid ? ' 🔗' : '';
      const eloMark = p.elo ? ` (эло ${p.elo})` : '';
      const faceitMark = p.faceit ? ` — <a href="${p.faceit}" target="_blank" rel="noopener">Faceit ↗</a>` : '';
      return `${p.nickname}${linkMark}${eloMark}${faceitMark}`;
    }).filter(Boolean).join(', ');
  }
  if(typeof roster === 'string') return roster.replace(/\n/g, ', ');
  return '';
}

function appCardHTML(doc, isNew){
  const d = doc.data();
  const id = doc.id;
  const roster = rosterToHTML(d.roster);
  const initials = (d.teamName || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `
  <div class="card app-card${isNew ? ' app-card-glow' : ''}" data-id="${id}">
    <div class="app-top">
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="team-avatar" style="width:36px; height:36px; margin:0; flex:none; font-size:13px;">
          ${d.teamAvatar ? `<img src="${d.teamAvatar}" alt="${d.teamName}">` : initials}
        </div>
        <strong>${d.teamName || '—'}</strong>
      </div>
      <span class="app-status-badge ${d.status}">${statusLabels[d.status] || d.status}${isNew ? ' · новая' : ''}</span>
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
    ${linkBlockHTML(d)}
    ${d.status === 'approved' ? `
    <div class="app-faceit-row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px;">
      <input type="url" class="app-faceit-input" placeholder="Ссылка на участие в турнире Faceit для этой команды" value="${d.faceitInvite || ''}" style="flex:1; min-width:220px; padding:8px 10px; border-radius:8px; border:1px solid var(--color-primary-line); background:var(--color-surface-alt); color:var(--color-text); font-size:13px;">
      <button type="button" class="app-faceit-save" style="padding:8px 14px; border-radius:8px; border:1px solid var(--color-primary-line); background:var(--color-surface-alt); color:var(--color-text); font-size:12.5px; cursor:pointer;">Сохранить ссылку</button>
    </div>
    <div style="font-size:11.5px; color:var(--color-ink-soft);">Эта ссылка появится у участников команды в их кабинете (страница «Участники» → клик по карточке команды).</div>` : ''}
  </div>`;
}

function updatePendingBadges(newCount){
  const dots = [
    document.getElementById('admin-tab-dot-applications'),
    document.getElementById('admin-tab-dot-accounts'),
    document.getElementById('applications-pending-dot'),
  ];
  dots.forEach(dot => { if(dot) dot.style.display = newCount > 0 ? 'inline-block' : 'none'; });
}

function startApplicationsListener(){
  if(unsubscribeApps) return;
  unsubscribeApps = db.collection('teamApplications')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      const seen = getSeenPendingIds();
      const pendingDocs = [];
      const approvedDocs = [];
      snap.docs.forEach(doc => {
        const status = doc.data().status;
        if(status === 'approved') approvedDocs.push(doc);
        else pendingDocs.push(doc); // pending и rejected — всё, что ещё не одобрено
      });

      const newPendingDocs = pendingDocs.filter(doc => doc.data().status === 'pending' && !seen.has(doc.id));
      updatePendingBadges(newPendingDocs.length);

      appsListPending.innerHTML = pendingDocs.length
        ? pendingDocs.map(doc => appCardHTML(doc, doc.data().status === 'pending' && !seen.has(doc.id))).join('')
        : `<div class="empty-state">Новых заявок нет.</div>`;

      appsListApproved.innerHTML = approvedDocs.length
        ? approvedDocs.map(doc => appCardHTML(doc, false)).join('')
        : `<div class="empty-state">Одобренных команд пока нет.</div>`;
    }, (err) => {
      console.error(err);
      appsListPending.innerHTML = `<div class="empty-state">Не удалось загрузить заявки.</div>`;
      appsListApproved.innerHTML = '';
    });
}

/* --- переключение вкладок панели и подвкладок "Заявки" --- */
document.getElementById('admin-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-tab-btn');
  if(!btn) return;
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const target = btn.getAttribute('data-target');
  document.querySelectorAll('[data-admin-tab]').forEach(sec => {
    sec.style.display = sec.getAttribute('data-admin-tab') === target ? '' : 'none';
  });
});

document.getElementById('applications-subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-subtab-btn');
  if(!btn) return;
  document.querySelectorAll('.admin-subtab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const sub = btn.getAttribute('data-subtab');
  appsListPending.style.display = sub === 'pending' ? '' : 'none';
  appsListApproved.style.display = sub === 'approved' ? '' : 'none';
});

document.getElementById('mute-pending-glow').addEventListener('click', () => {
  const seen = getSeenPendingIds();
  document.querySelectorAll('#applications-list-pending .app-card').forEach(card => {
    seen.add(card.getAttribute('data-id'));
    card.classList.remove('app-card-glow');
  });
  saveSeenPendingIds(seen);
  updatePendingBadges(0);
});

async function handleAppsListClick(e){
  const linksSaveBtn = e.target.closest('.app-links-save');
  if(linksSaveBtn){
    const card = linksSaveBtn.closest('.app-card');
    const id = card.getAttribute('data-id');
    const statusEl = card.querySelector('.app-links-status');
    const captainSel = card.querySelector('.link-captain');
    const roster = decodeRosterFromButton(linksSaveBtn.getAttribute('data-roster'));
    card.querySelectorAll('.link-roster').forEach(sel => {
      const idx = Number(sel.getAttribute('data-idx'));
      if(roster[idx]) roster[idx] = Object.assign({}, roster[idx], { uid: sel.value || null });
    });
    const patch = { captainUid: captainSel.value || null, roster };

    linksSaveBtn.disabled = true;
    const original = linksSaveBtn.textContent;
    linksSaveBtn.textContent = 'Сохраняем…';
    try{
      await db.collection('teamApplications').doc(id).update(patch);
      if(statusEl) statusEl.textContent = 'Сохранено ✓';
    }catch(err){
      console.error(err);
      if(statusEl) statusEl.textContent = 'Ошибка сохранения';
      alert('Не удалось сохранить привязки. Попробуй ещё раз.');
    }finally{
      linksSaveBtn.disabled = false;
      linksSaveBtn.textContent = original;
    }
    return;
  }

  const saveFaceitBtn = e.target.closest('.app-faceit-save');
  if(saveFaceitBtn){
    const card = saveFaceitBtn.closest('.app-card');
    const id = card.getAttribute('data-id');
    const input = card.querySelector('.app-faceit-input');
    const link = input.value.trim();
    saveFaceitBtn.disabled = true;
    const original = saveFaceitBtn.textContent;
    saveFaceitBtn.textContent = 'Сохраняем…';
    try{
      await db.collection('teamApplications').doc(id).update({ faceitInvite: link });
      saveFaceitBtn.textContent = 'Сохранено ✓';
      setTimeout(() => { saveFaceitBtn.textContent = original; saveFaceitBtn.disabled = false; }, 1500);
    }catch(err){
      console.error(err);
      alert('Не удалось сохранить ссылку. Попробуй ещё раз.');
      saveFaceitBtn.textContent = original;
      saveFaceitBtn.disabled = false;
    }
    return;
  }
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
}
appsListPending.addEventListener('click', handleAppsListClick);
appsListApproved.addEventListener('click', handleAppsListClick);
