/* =========================================================
   Обращения с сайта (форма «Написать нам» на странице «Контакты»),
   коллекция Firestore "messages". Виден организатору и модератору
   во вкладке «📨 Обращения» панели admin.html.
========================================================= */
let messagesUnsub = null;

function fmtMessageTime(ts){
  try{
    if(!ts || !ts.toDate) return '';
    return ts.toDate().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch(e){ return ''; }
}

function messageCardHTML(doc){
  const d = doc.data();
  const isUnread = !d.read;
  const name = escapeHTMLMsg(d.name || 'Без имени');
  const contact = d.contact ? escapeHTMLMsg(d.contact) : '';
  const text = escapeHTMLMsg(d.text || '');
  return `
  <div class="card${isUnread ? ' app-card-glow' : ''}" data-id="${doc.id}" style="padding:18px 20px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
      <strong>${name}</strong>
      <span style="font-size:12px; color:var(--color-ink-soft);">${fmtMessageTime(d.createdAt)}${isUnread ? ' · <span style="color:#FF5C6C;font-weight:700;">новое</span>' : ''}</span>
    </div>
    ${contact ? `<div style="font-size:13px; color:var(--color-ink-soft); margin-bottom:8px;">Связь: ${contact}</div>` : ''}
    <div style="font-size:14px; white-space:pre-wrap; margin-bottom:14px;">${text}</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      ${isUnread ? `<button type="button" class="btn small secondary" data-action="mark-read">Отметить прочитанным</button>` : ''}
      <button type="button" class="btn small secondary" data-action="delete" style="color:#FF5C6C; border-color:rgba(255,92,108,.4);">Удалить</button>
    </div>
  </div>`;
}

function escapeHTMLMsg(str){
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

function updateMessagesBadge(unreadCount){
  const dot = document.getElementById('admin-tab-dot-messages');
  if(dot) dot.style.display = unreadCount > 0 ? 'inline-block' : 'none';
}

function startMessagesListener(){
  if(messagesUnsub) return;
  const wrap = document.getElementById('messages-admin-list');
  if(!wrap || typeof db === 'undefined') return;
  messagesUnsub = db.collection('messages').orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      const unread = snap.docs.filter(d => !d.data().read).length;
      updateMessagesBadge(unread);
      wrap.innerHTML = snap.size
        ? snap.docs.map(messageCardHTML).join('')
        : `<div class="empty-state">Обращений пока нет.</div>`;
    }, (err) => {
      console.error(err);
      wrap.innerHTML = `<div class="empty-state">Не удалось загрузить обращения.</div>`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('messages-admin-list');
  if(!wrap) return;

  wrap.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const card = btn.closest('[data-id]');
    const id = card?.getAttribute('data-id');
    if(!id) return;
    const action = btn.getAttribute('data-action');
    try{
      if(action === 'mark-read'){
        await db.collection('messages').doc(id).update({ read: true });
      }else if(action === 'delete'){
        if(!confirm('Удалить это обращение без возможности восстановить?')) return;
        await db.collection('messages').doc(id).delete();
      }
    }catch(err){
      console.error(err);
      alert('Не получилось выполнить действие. Попробуй ещё раз.');
    }
  });

  const muteBtn = document.getElementById('mute-messages-glow');
  if(muteBtn){
    muteBtn.addEventListener('click', async () => {
      muteBtn.disabled = true;
      try{
        const snap = await db.collection('messages').where('read', '==', false).get();
        const batch = db.batch();
        snap.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
      }catch(err){
        console.error(err);
      }finally{
        muteBtn.disabled = false;
      }
    });
  }
});
