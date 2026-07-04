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
        <span class="game-tag ${gameClass[t.game] || 'custom'}">${gameLabelT[t.game] || t.game}</span>
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

  // Список дисциплин собираем прямо из данных команд, а не из
  // фиксированного массива — так любая игра, добавленная организатором
  // через "Список игр" в admin.html, сразу получает свою вкладку
  // рейтинга наравне с CS2/Dota2/PUBG, без правок кода.
  const knownOrder = ['CS2', 'Dota2', 'PUBG'];
  const allGames = [...new Set(teams.map(t => t.game).filter(Boolean))];
  const games = [
    ...knownOrder.filter(g => allGames.includes(g)),
    ...allGames.filter(g => !knownOrder.includes(g)).sort((a, b) => a.localeCompare(b)),
  ];
  if(!games.length){
    tabsWrap.innerHTML = '';
    tableWrap.innerHTML = `<div class="empty-state">Рейтинг появится после первого завершённого турнира.</div>`;
    return;
  }

  tabsWrap.innerHTML = games.map((g, i) => `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-game="${g}" style="--i:${i}">${gameLabelT[g] || g}</button>`).join('');

  function draw(game){
    const rows = teams.filter(t => t.game === game).sort((a, b) => (b.elo || 1000) - (a.elo || 1000));
    tableWrap.innerHTML = `
    <div class="leaderboard-table">
      ${rows.map((t, i) => {
        const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
        const crown = i === 0 ? `<span class="lb-crown">👑</span>` : '';
        return `
        <div class="leaderboard-row ${rankClass}" style="--i:${i}">
          ${crown}
          <div class="lb-rank">#${i + 1}</div>
          <div class="lb-name">${t.name}${trophyBadges(t.trophies)}</div>
          <div class="lb-record">${t.wins || 0}W · ${t.losses || 0}L</div>
          <div class="lb-elo">${t.elo || 1000}</div>
        </div>`;
      }).join('')}
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
