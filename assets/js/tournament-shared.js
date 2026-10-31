/* =========================================================
   Общая логика турнирной сетки и рейтинга Эло.
   Используется и в admin.html (создание/управление турнирами),
   и в tournaments.html (публичный просмотр сетки и рейтинга).

   Формат матча в сетке:
   { teamA, teamB, winner, scoreA, scoreB, map }
   - winner        — имя победившей команды или null, пока не сыгран
   - scoreA/scoreB — счёт матча (числа) или null, если не указан
   - map           — название карты или null, если не указана
========================================================= */

const TROPHY_PREFIX = 'Обладатели трофея';

/* Стабильный id команды в коллекции "teams": одна и та же команда
   в одной и той же игре всегда получает один и тот же документ,
   поэтому Эло копится между турнирами. */
function slugTeam(game, name){
  return (game + '__' + String(name).trim().toLowerCase())
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'team';
}

function emptyMatch(teamA, teamB){
  const match = { teamA, teamB, winner: null, scoreA: null, scoreB: null, map: null };
  if(teamA === 'BYE' && teamB !== 'BYE') match.winner = teamB;
  if(teamB === 'BYE' && teamA !== 'BYE') match.winner = teamA;
  return match;
}

/* Строит первый раунд по списку названий команд, в том порядке, в
   котором их ввёл организатор. Если команд не степень двойки —
   недостающие места занимают "BYE" (пропуск раунда). */
function buildFirstRound(teamNames){
  let teams = teamNames.map(t => t.trim()).filter(Boolean);
  let size = 1;
  while(size < teams.length) size *= 2;
  while(teams.length < size) teams.push('BYE');

  const matches = [];
  for(let i = 0; i < teams.length; i += 2){
    matches.push(emptyMatch(teams[i], teams[i + 1]));
  }
  return matches;
}

/* Строит турнир "с нуля" по списку названий команд. */
function buildBracket(teamNames){
  return recomputeRounds(buildFirstRound(teamNames));
}

/* Пересчитывает всю сетку начиная с первого раунда. Нужно и при
   создании турнира, и при правке результата уже сыгранного матча —
   в обоих случаях раунды 2+ строятся заново по победителям раунда 1.

   Если передан previousRounds (сетка ДО правки) — уже отыгранные
   матчи нижестоящих раундов, у которых состав (teamA/teamB) не
   поменялся, переносятся как есть (счёт/карта/победитель сохраняются).
   Как только состав пары в каком-то раунде отличается от старого —
   это и всё, что "растёт" из этого матча дальше по сетке, считается
   заново "с чистого листа" (иначе после правки результата в сетке
   осталась бы победа команды, которая туда уже не должна была попасть). */
function recomputeRounds(firstRoundMatches, previousRounds){
  const rounds = [{ matches: firstRoundMatches.map(m => ({ ...m })) }];
  let prevMatches = rounds[0].matches;
  let ri = 1;
  while(prevMatches.length > 1 && prevMatches.every(m => !!m.winner)){
    const winners = prevMatches.map(m => m.winner);
    const matches = [];
    for(let i = 0; i < winners.length; i += 2){
      const teamA = winners[i], teamB = winners[i + 1];
      const old = previousRounds && previousRounds[ri] && previousRounds[ri].matches[i / 2];
      matches.push(
        old && old.teamA === teamA && old.teamB === teamB ? { ...old } : emptyMatch(teamA, teamB)
      );
    }
    rounds.push({ matches });
    prevMatches = matches;
    ri++;
  }
  return rounds;
}

/* Проставляет/меняет результат конкретного матча (даже если он уже
   был сыгран ранее — используется и для первого ввода счёта, и для
   исправления ошибки) и пересобирает сетку дальше по победителям. */
function setMatchResult(rounds, roundIndex, matchIndex, { winnerSide, scoreA, scoreB, map }){
  const firstRound = rounds[0].matches.map(m => ({ ...m }));
  const target = roundIndex === 0 ? firstRound[matchIndex] : rounds[roundIndex].matches[matchIndex];
  const teamA = target.teamA, teamB = target.teamB;
  const winner = winnerSide === 'A' ? teamA : teamB;
  const updated = {
    teamA, teamB, winner,
    scoreA: scoreA === '' || scoreA === undefined ? null : Number(scoreA),
    scoreB: scoreB === '' || scoreB === undefined ? null : Number(scoreB),
    map: map || null,
  };
  if(roundIndex === 0){
    firstRound[matchIndex] = updated;
    return recomputeRounds(firstRound, rounds);
  }
  // Правка результата в более позднем раунде: первый раунд не меняется,
  // просто пересобираем всё заново от него же, подставив новый результат
  // этого конкретного матча как "текущее" состояние соответствующего раунда.
  const previousRounds = rounds.map(r => ({ matches: r.matches.map(m => ({ ...m })) }));
  previousRounds[roundIndex].matches[matchIndex] = updated;
  return recomputeRounds(firstRound, previousRounds);
}

/* Сбрасывает результат матча (и всё, что выросло из него дальше по сетке). */
function clearMatchResult(rounds, roundIndex, matchIndex){
  const firstRound = rounds[0].matches.map(m => ({ ...m }));
  if(roundIndex === 0){
    const t = firstRound[matchIndex];
    firstRound[matchIndex] = emptyMatch(t.teamA, t.teamB);
    return recomputeRounds(firstRound);
  }
  const previousRounds = rounds.map(r => ({ matches: r.matches.map(m => ({ ...m })) }));
  const t = previousRounds[roundIndex].matches[matchIndex];
  previousRounds[roundIndex].matches[matchIndex] = emptyMatch(t.teamA, t.teamB);
  return recomputeRounds(firstRound, previousRounds);
}

function tournamentWinner(rounds){
  const finalRound = rounds[rounds.length - 1];
  if(finalRound && finalRound.matches.length === 1 && finalRound.matches[0].winner){
    return finalRound.matches[0].winner;
  }
  return null;
}

/* Все реально сыгранные матчи турнира (без учёта технических BYE),
   по порядку раундов — используется при начислении Эло и карт-статистики. */
function playedMatches(rounds){
  const out = [];
  rounds.forEach(r => r.matches.forEach(m => {
    if(m.winner && m.teamA !== 'BYE' && m.teamB !== 'BYE'){
      out.push(m);
    }
  }));
  return out;
}

/* Стандартная формула рейтинга Эло, K=32 */
function eloUpdate(ratingWinner, ratingLoser, k = 32){
  const expectedWinner = 1 / (1 + Math.pow(10, (ratingLoser - ratingWinner) / 400));
  const expectedLoser = 1 - expectedWinner;
  return {
    newWinner: Math.round(ratingWinner + k * (1 - expectedWinner)),
    newLoser: Math.round(ratingLoser + k * (0 - expectedLoser)),
  };
}

/* Винрейт в процентах, аккуратно с делением на ноль. */
function winratePct(wins, losses){
  const total = (wins || 0) + (losses || 0);
  if(!total) return null;
  return Math.round(((wins || 0) / total) * 100);
}

function roundTitle(index, total){
  if(total === 1) return 'Финал';
  if(index === total - 1) return 'Финал';
  if(index === total - 2) return '1/2 финала';
  if(index === total - 3) return '1/4 финала';
  return `Раунд ${index + 1}`;
}

/* ---------------------- РЕНДЕР СЕТКИ ----------------------
   opts.isAdmin=true добавляет кнопку "Указать/изменить результат"
   на каждый реальный (не BYE) матч — открывает панель со счётом,
   картой и выбором победителя (обрабатывается в admin.js). Панель
   всегда в разметке (скрыта атрибутом hidden), чтобы обойтись без
   лишних сетевых запросов при открытии/закрытии. */
function matchResultBadge(m){
  if(!m.map) return '';
  return `<div class="bracket-meta"><span class="bracket-map-tag">🗺 ${m.map}</span></div>`;
}

function scoreCellHTML(score, isWinner, hasScore){
  if(!hasScore) return '';
  return `<span class="bracket-score-cell ${isWinner ? 'winner' : ''}">${score ?? 0}</span>`;
}

function resultPanelHTML(t, ri, mi, m, maps){
  const mapOptions = ['<option value="">Без карты</option>']
    .concat((maps || []).map(name => `<option value="${name}" ${m.map === name ? 'selected' : ''}>${name}</option>`))
    .join('');
  return `
  <div class="bracket-result-panel" hidden data-tid="${t.id}" data-round="${ri}" data-match="${mi}">
    <div class="bracket-result-row">
      <label>Счёт
        <div class="bracket-score-inputs">
          <input type="number" min="0" class="rp-scoreA" value="${m.scoreA ?? ''}" placeholder="0">
          <span>:</span>
          <input type="number" min="0" class="rp-scoreB" value="${m.scoreB ?? ''}" placeholder="0">
        </div>
      </label>
      <label>Карта
        <select class="rp-map">${mapOptions}</select>
      </label>
    </div>
    <div class="bracket-result-actions">
      <button type="button" class="btn small bracket-confirm" data-side="A">Победа: ${m.teamA}</button>
      <button type="button" class="btn small secondary bracket-confirm" data-side="B">Победа: ${m.teamB}</button>
      ${m.winner ? `<button type="button" class="btn small ghost bracket-clear">Сбросить результат</button>` : ''}
    </div>
  </div>`;
}

function bracketHTML(t, opts = {}){
  const isAdmin = !!opts.isAdmin;
  const maps = opts.maps || [];
  const total = t.rounds.length;
  const cols = t.rounds.map((round, ri) => {
    const matches = round.matches.map((m, mi) => {
      const isBye = m.teamA === 'BYE' || m.teamB === 'BYE';
      const hasScore = m.scoreA !== null && m.scoreA !== undefined && m.scoreB !== null && m.scoreB !== undefined;
      const teamRow = (name, score, isWinner) => `
        <div class="bracket-team ${isWinner ? 'winner' : ''} ${name === 'BYE' ? 'bye' : ''}">
          ${scoreCellHTML(score, isWinner, hasScore)}
          <span class="bracket-team-name">${name}</span>
          ${isWinner ? `<span class="bracket-win-dot" title="Победитель матча"></span>` : ''}
        </div>`;
      const toggleBtn = (isAdmin && !isBye)
        ? `<button type="button" class="bracket-toggle-panel" data-tid="${t.id}" data-round="${ri}" data-match="${mi}">
             ${m.winner ? 'Изменить результат' : 'Указать результат'}
           </button>`
        : '';
      return `<div class="bracket-slot" data-round="${ri}" data-match="${mi}">
        <div class="bracket-match ${m.winner ? 'decided' : ''}">
          ${teamRow(m.teamA, m.scoreA, !!m.winner && m.winner === m.teamA)}
          ${teamRow(m.teamB, m.scoreB, !!m.winner && m.winner === m.teamB)}
        </div>
        ${matchResultBadge(m)}
        ${toggleBtn}
        ${isAdmin && !isBye ? resultPanelHTML(t, ri, mi, m, maps) : ''}
      </div>`;
    }).join('');
    return `<div class="bracket-round">
      <div class="bracket-round-title">${roundTitle(ri, total)}</div>
      <div class="bracket-round-body">${matches}</div>
    </div>`;
  }).join('');

  return `<div class="bracket" data-tid="${t.id}">${cols}</div>`;
}
