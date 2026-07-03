/* =========================================================
   Публичная страница "Турниры": список сеток (без кнопок
   управления) + таблица рейтинга Эло по играм.
========================================================= */

const gameLabelT = { CS2: 'CS2', Dota2: 'Dota 2', PUBG: 'PUBG' };

function tournamentCardHTML(t){
  const statusBadge = t.status === 'finished'
    ? `<span class="status-tag finished">Завершён</span>`
    : `<span class="status-tag live">Идёт сейчас</span>`;
  const winnerLine = t.status === 'finished' && t.winner
    ? `<div class="tournament-winner">🏆 Победитель — <strong>${t.winner}</strong></div>`
    : '';
  return `
  <div class="card tournament-card">
    <div class="tournament-head">
      <div>
        <span class="game-tag ${(t.game || 'CS2').toLowerCase()}">${gameLabelT[t.game] || t.game}</span>
        <h3>${t.name}</h3>
      </div>
      ${statusBadge}
    </div>
    ${winnerLine}
    ${bracketHTML(t, { isAdmin: false })}
  </div>`;
}

async function renderTournaments(){
  const wrap = document.querySelector('[data-role="tournaments-list"]');
  if(!wrap || typeof db === 'undefined') return;
  try{
    const snap = await db.collection('tournaments').orderBy('createdAt', 'desc').get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    wrap.innerHTML = list.length
      ? list.map(tournamentCardHTML).join('')
      : `<div class="empty-state">Турниров пока нет — загляните позже.</div>`;
  }catch(e){
    console.error(e);
    wrap.innerHTML = `<div class="empty-state">Не удалось загрузить турниры.</div>`;
  }
}

function trophyBadges(trophies){
  if(!trophies || !trophies.length) return '';
  return `<div class="trophy-list">${trophies.map(t => `<span class="trophy-badge" title="${t}">🏆 ${t}</span>`).join('')}</div>`;
}

async function renderLeaderboard(){
  const tabsWrap = document.querySelector('[data-role="leaderboard-tabs"]');
  const tableWrap = document.querySelector('[data-role="leaderboard-table"]');
  if(!tabsWrap || !tableWrap || typeof db === 'undefined') return;

  let teams = [];
  try{
    const snap = await db.collection('teams').get();
    teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    console.error(e);
    tableWrap.innerHTML = `<div class="empty-state">Не удалось загрузить рейтинг.</div>`;
    return;
  }

  const games = ['CS2', 'Dota2', 'PUBG'].filter(g => teams.some(t => t.game === g));
  if(!games.length){
    tabsWrap.innerHTML = '';
    tableWrap.innerHTML = `<div class="empty-state">Рейтинг появится после первого завершённого турнира.</div>`;
    return;
  }

  tabsWrap.innerHTML = games.map((g, i) => `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-game="${g}">${gameLabelT[g]}</button>`).join('');

  function draw(game){
    const rows = teams.filter(t => t.game === game).sort((a, b) => (b.elo || 1000) - (a.elo || 1000));
    tableWrap.innerHTML = `
    <div class="leaderboard-table">
      ${rows.map((t, i) => `
        <div class="leaderboard-row">
          <div class="lb-rank">#${i + 1}</div>
          <div class="lb-name">${t.name}${trophyBadges(t.trophies)}</div>
          <div class="lb-record">${t.wins || 0}W · ${t.losses || 0}L</div>
          <div class="lb-elo">${t.elo || 1000}</div>
        </div>`).join('')}
    </div>`;
  }
  draw(games[0]);

  tabsWrap.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsWrap.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draw(btn.getAttribute('data-game'));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderTournaments();
  renderLeaderboard();
});
