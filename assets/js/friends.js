/* =========================================================
   ПОИСК ИГРОКОВ И СИСТЕМА ДРУЗЕЙ

   Хранение — коллекция Firestore "friendRequests". ID документа — это
   отсортированная пара uid двух людей ("uidA_uidB", uidA < uidB по
   алфавиту), поэтому между одними и теми же двумя людьми физически не
   может быть больше одного документа (повторная отправка просто найдёт
   уже существующий).

   Поля документа:
     uids: [uidA, uidB]  — для запроса "все мои заявки/друзья" (array-contains)
     from, to             — кто кому отправил
     fromNickname, toNickname
     status: 'pending' | 'accepted'
     createdAt

   Отклонение / отмена / удаление из друзей — просто удаление документа.

   ВАЖНО: чтобы это заработало на живом сайте, в Firestore Rules должно
   быть разрешено авторизованным пользователям читать и писать коллекцию
   friendRequests (создавать заявки, обновлять статус на accepted только
   если ты — получатель, удалять если ты участник). См. FIREBASE_SETUP.md.
========================================================= */

function friendReqId(uidA, uidB){
  return [uidA, uidB].sort().join('_');
}

async function sendFriendRequest(myUid, myNickname, otherUid, otherNickname){
  const id = friendReqId(myUid, otherUid);
  const ref = db.collection('friendRequests').doc(id);
  const existing = await ref.get();
  if(existing.exists) return existing.data();
  const data = {
    uids: [myUid, otherUid].sort(),
    from: myUid,
    to: otherUid,
    fromNickname: myNickname || '',
    toNickname: otherNickname || '',
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return data;
}

async function respondFriendRequest(id, accept){
  const ref = db.collection('friendRequests').doc(id);
  if(accept) await ref.update({ status: 'accepted' });
  else await ref.delete();
}

async function removeOrCancelFriendRequest(id){
  await db.collection('friendRequests').doc(id).delete();
}

/* Состояние отношений между myUid и otherUid: 'none' | 'outgoing' | 'incoming' | 'friends' */
async function getFriendStatus(myUid, otherUid){
  if(!myUid || !otherUid || myUid === otherUid) return { state: 'self' };
  const id = friendReqId(myUid, otherUid);
  const snap = await db.collection('friendRequests').doc(id).get();
  if(!snap.exists) return { state: 'none', id };
  const d = snap.data();
  if(d.status === 'accepted') return { state: 'friends', id };
  if(d.from === myUid) return { state: 'outgoing', id };
  return { state: 'incoming', id };
}

function friendActionButtonHTML(status, otherUid, otherNickname){
  if(status.state === 'self') return '';
  if(status.state === 'friends'){
    return `<button type="button" class="btn secondary small" data-friend-action="remove" data-req-id="${status.id}">✓ Друзья — удалить</button>`;
  }
  if(status.state === 'outgoing'){
    return `<button type="button" class="btn secondary small" data-friend-action="cancel" data-req-id="${status.id}">Заявка отправлена — отменить</button>`;
  }
  if(status.state === 'incoming'){
    return `
      <button type="button" class="btn small" data-friend-action="accept" data-req-id="${status.id}">Принять заявку</button>
      <button type="button" class="btn secondary small" data-friend-action="decline" data-req-id="${status.id}">Отклонить</button>`;
  }
  return `<button type="button" class="btn small" data-friend-action="add" data-other-uid="${otherUid}" data-other-nickname="${(otherNickname || '').replace(/"/g,'')}">+ Добавить в друзья</button>`;
}

function friendRowHTML(uid, nickname, avatar, extraHTML){
  const initials = (nickname || '?').slice(0, 2).toUpperCase();
  return `
  <div class="friend-row" data-uid="${uid}">
    <a href="account.html?u=${encodeURIComponent(uid)}" class="friend-row-avatar">
      ${avatar ? `<img src="${avatar}" alt="${nickname}">` : initials}
    </a>
    <a href="account.html?u=${encodeURIComponent(uid)}" class="friend-row-name">${nickname || 'Без ника'}</a>
    <span class="friend-row-actions">${extraHTML || ''}</span>
  </div>`;
}

/* ---------------------------------------------------------
   Публичный профиль (account.html?u=UID) — кнопка добавить в друзья.
   Вызывается из account.js после отрисовки профиля, только если
   зритель сам вошёл в аккаунт (иначе просто нет смысла — гостю
   пришлось бы сперва зарегистрироваться).
--------------------------------------------------------- */
async function renderFriendActionOnProfileView(viewedUid, viewedNickname){
  const wrap = document.getElementById('pv-friend-wrap');
  if(!wrap) return;
  const me = auth.currentUser;
  if(!me){ wrap.innerHTML = ''; return; }
  if(me.uid === viewedUid){ wrap.innerHTML = ''; return; }
  try{
    const status = await getFriendStatus(me.uid, viewedUid);
    wrap.innerHTML = friendActionButtonHTML(status, viewedUid, viewedNickname);
  }catch(err){
    console.warn('Не удалось загрузить статус дружбы', err);
  }
}

/* ---------------------------------------------------------
   Раздел "Люди" в личном кабинете: поиск, входящие заявки, список друзей.
--------------------------------------------------------- */
let friendsUsersCache = null; // [{uid, nickname, avatar}] — кэш для поиска, грузится один раз

async function loadFriendsUsersCache(){
  if(friendsUsersCache) return friendsUsersCache;
  try{
    const snap = await db.collection('users').limit(500).get();
    friendsUsersCache = snap.docs
      .map(d => ({ uid: d.id, nickname: (d.data().nickname || '').trim(), avatar: d.data().avatar || '' }))
      .filter(u => u.nickname);
  }catch(err){
    console.warn('Не удалось загрузить список игроков для поиска', err);
    friendsUsersCache = [];
  }
  return friendsUsersCache;
}

async function runFriendSearch(myUid, query){
  const resultsEl = document.getElementById('friend-search-results');
  if(!resultsEl) return;
  const q = query.trim().toLowerCase();
  if(!q){ resultsEl.innerHTML = ''; return; }

  const users = await loadFriendsUsersCache();
  const matches = users.filter(u => u.uid !== myUid && u.nickname.toLowerCase().includes(q)).slice(0, 15);
  if(!matches.length){
    resultsEl.innerHTML = `<div class="empty-state" style="padding:10px 0;">Никого не нашлось.</div>`;
    return;
  }
  resultsEl.innerHTML = matches.map(u => friendRowHTML(u.uid, u.nickname, u.avatar, '<span class="friend-row-loading">…</span>')).join('');
  // статус дружбы для каждого результата подгружаем отдельно и дозаполняем кнопку
  await Promise.all(matches.map(async (u) => {
    const status = await getFriendStatus(myUid, u.uid);
    const row = resultsEl.querySelector(`.friend-row[data-uid="${u.uid}"] .friend-row-actions`);
    if(row) row.innerHTML = friendActionButtonHTML(status, u.uid, u.nickname);
  }));
}

async function loadFriendsSection(myUid){
  const searchInput = document.getElementById('friend-search-input');
  const requestsWrap = document.getElementById('friend-requests-wrap');
  const friendsListEl = document.getElementById('friends-list');
  if(!searchInput || !requestsWrap || !friendsListEl) return;

  if(!searchInput.dataset.bound){
    searchInput.dataset.bound = '1';
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runFriendSearch(myUid, searchInput.value), 300);
    });
  }

  try{
    const snap = await db.collection('friendRequests').where('uids', 'array-contains', myUid).get();
    const incoming = [];
    const friends = [];
    snap.forEach(doc => {
      const d = doc.data();
      if(d.status === 'pending' && d.to === myUid){
        incoming.push({ id: doc.id, uid: d.from, nickname: d.fromNickname });
      }else if(d.status === 'accepted'){
        const otherUid = d.uids.find(u => u !== myUid);
        const otherNickname = otherUid === d.from ? d.fromNickname : d.toNickname;
        friends.push({ id: doc.id, uid: otherUid, nickname: otherNickname });
      }
    });

    requestsWrap.innerHTML = incoming.length
      ? `<h4 style="margin-bottom:10px; font-size:15px;">Заявки в друзья (${incoming.length})</h4>` +
        incoming.map(r => friendRowHTML(r.uid, r.nickname, '',
          `<button type="button" class="btn small" data-friend-action="accept" data-req-id="${r.id}">Принять</button>
           <button type="button" class="btn secondary small" data-friend-action="decline" data-req-id="${r.id}">Отклонить</button>`
        )).join('')
      : '';

    friendsListEl.innerHTML = friends.length
      ? friends.map(f => friendRowHTML(f.uid, f.nickname, '',
          `<button type="button" class="btn secondary small" data-friend-action="remove" data-req-id="${f.id}">Удалить</button>`
        )).join('')
      : `<div class="empty-state" style="padding:10px 0;">Пока никого нет — найди игроков через поиск выше.</div>`;
  }catch(err){
    console.error('Не удалось загрузить друзей/заявки', err);
    requestsWrap.innerHTML = '';
    friendsListEl.innerHTML = `<div class="empty-state" style="padding:10px 0;">Не удалось загрузить список. Возможно, не настроены права доступа в Firestore (см. FIREBASE_SETUP.md).</div>`;
  }
}

/* ---------------------------------------------------------
   Единый делегированный обработчик кликов по кнопкам друзей —
   работает и на публичном профиле, и в разделе "Люди" в кабинете.
--------------------------------------------------------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-friend-action]');
  if(!btn) return;
  const me = auth.currentUser;
  if(!me) return;

  const action = btn.getAttribute('data-friend-action');
  btn.disabled = true;
  try{
    if(action === 'add'){
      const otherUid = btn.getAttribute('data-other-uid');
      const otherNickname = btn.getAttribute('data-other-nickname') || '';
      let myNickname = '';
      try{
        const mySnap = await db.collection('users').doc(me.uid).get();
        myNickname = mySnap.exists ? (mySnap.data().nickname || '') : '';
      }catch(err){ /* не критично */ }
      const data = await sendFriendRequest(me.uid, myNickname, otherUid, otherNickname);
      const status = { state: data.status === 'accepted' ? 'friends' : (data.from === me.uid ? 'outgoing' : 'incoming'), id: friendReqId(me.uid, otherUid) };
      btn.outerHTML = friendActionButtonHTML(status, otherUid, otherNickname);
    }else if(action === 'accept'){
      await respondFriendRequest(btn.getAttribute('data-req-id'), true);
      if(typeof loadFriendsSection === 'function') loadFriendsSection(me.uid);
      const wrap = document.getElementById('pv-friend-wrap');
      if(wrap && wrap.contains(btn)){
        const viewedUid = new URLSearchParams(window.location.search).get('u');
        if(viewedUid) renderFriendActionOnProfileView(viewedUid);
      }
    }else if(action === 'decline' || action === 'cancel' || action === 'remove'){
      await removeOrCancelFriendRequest(btn.getAttribute('data-req-id'));
      if(typeof loadFriendsSection === 'function') loadFriendsSection(me.uid);
      const wrap = document.getElementById('pv-friend-wrap');
      if(wrap && wrap.contains(btn)){
        const viewedUid = new URLSearchParams(window.location.search).get('u');
        if(viewedUid) renderFriendActionOnProfileView(viewedUid);
      }else{
        const row = btn.closest('.friend-row');
        if(row) row.remove();
      }
    }
  }catch(err){
    console.error('Не удалось выполнить действие с друзьями', err);
    alert('Не получилось выполнить действие. Возможно, не настроены права доступа в Firestore (см. FIREBASE_SETUP.md).');
  }finally{
    btn.disabled = false;
  }
});
