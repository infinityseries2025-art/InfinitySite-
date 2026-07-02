/* =========================================================
   Публичный список команд-участников — только status: approved
========================================================= */
const gameLabelP = { CS2:'CS2', Dota2:'Dota 2', PUBG:'PUBG' };
const gameClassP = { CS2:'cs2', Dota2:'dota2', PUBG:'pubg' };

function participantCardHTML(t, i){
  const g = gameClassP[t.game] || 'cs2';
  const label = gameLabelP[t.game] || t.game;
  const roster = (t.roster || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
  return `
  <div class="card team-card" style="--i:${i}; text-align:left; padding:20px 22px;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
      <h3 style="margin:0;">${t.teamName}</h3>
      <span class="game-tag ${g}">${label}</span>
    </div>
    <div class="role" style="margin-bottom:10px;">Капитан: ${t.captainName || '—'}</div>
    ${roster.length ? `<ul style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
      ${roster.map(p => `<li style="background:var(--color-primary-soft); border:1px solid var(--color-primary-line); border-radius:999px; padding:4px 10px; font-size:12px;">${p}</li>`).join('')}
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
