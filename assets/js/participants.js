/* =========================================================
   Публичный список команд-участников — только status: approved
========================================================= */
const gameLabelP = { CS2:'CS2', Dota2:'Dota 2', PUBG:'PUBG' };
const gameClassP = { CS2:'cs2', Dota2:'dota2', PUBG:'pubg' };

// Состав команды хранится как массив {nickname, uid}. Старые заявки
// (созданные до этого обновления) могли сохранить его строкой —
// на всякий случай поддерживаем и такой формат.
function normalizeRoster(roster){
  if(Array.isArray(roster)) return roster;
  if(typeof roster === 'string'){
    return roster.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(nickname => ({ nickname, uid: null }));
  }
  return [];
}

// Игрок с привязанным аккаунтом — кликабельная ссылка на его публичный
// профиль (account.html?u=UID), иначе — обычная неактивная плашка.
function rosterPillHTML(p){
  const nickname = (p.nickname || '').trim() || '—';
  const dot = p.uid ? `<span class="link-dot"></span>` : '';
  return p.uid
    ? `<a class="roster-pill" href="account.html?u=${p.uid}" title="Открыть профиль ${nickname}">${dot}${nickname}</a>`
    : `<span class="roster-pill">${nickname}</span>`;
}

function participantCardHTML(t, i){
  const g = gameClassP[t.game] || 'custom';
  const label = gameLabelP[t.game] || t.game;
  const roster = normalizeRoster(t.roster);
  const initials = (t.teamName || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const captainLine = t.captainUid
    ? `Капитан: <a href="account.html?u=${t.captainUid}" style="color:var(--color-accent);">${t.captainName || '—'}</a>`
    : `Капитан: ${t.captainName || '—'}`;
  return `
  <div class="card team-card" style="--i:${i}; text-align:left; padding:20px 22px;">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
      <div class="team-avatar" style="width:48px; height:48px; margin:0; flex:none; font-size:16px;">
        ${t.teamAvatar ? `<img src="${t.teamAvatar}" alt="${t.teamName}">` : initials}
      </div>
      <div style="flex:1; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <h3 style="margin:0;">${t.teamName}</h3>
        <span class="game-tag ${g}">${label}</span>
      </div>
    </div>
    <div class="role" style="margin-bottom:10px;">${captainLine}</div>
    ${roster.length ? `<ul style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px; list-style:none; padding:0;">
      ${roster.map(p => `<li>${rosterPillHTML(p)}</li>`).join('')}
    </ul>` : ''}
  </div>`;
}

async function renderParticipants(){
  const wrap = document.querySelector('[data-role="participants-list"]');
  if(!wrap) return;
  try{
    const snap = await db.collection('teamApplications').where('status', '==', 'approved').get();
    const teams = [];
    snap.forEach(doc => teams.push(doc.data()));
    teams.sort((a,b) => (a.teamName||'').localeCompare(b.teamName||''));
    wrap.innerHTML = teams.length
      ? teams.map((t,i) => participantCardHTML(t,i)).join('')
      : `<div class="empty-state">Пока ни одна команда не прошла модерацию — загляните позже.</div>`;
  }catch(err){
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">Не удалось загрузить список команд.</div>`;
  }
  initScrollReveal();
}

document.addEventListener('DOMContentLoaded', renderParticipants);
