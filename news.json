/* =========================================================
   Общая логика турнирной сетки и рейтинга Эло.
   Используется и в admin.html (создание/управление турнирами),
   и в tournaments.html (публичный просмотр сетки и рейтинга).
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

/* Строит сетку на выбывание (раунд 1) по списку названий команд,
   в том порядке, в котором их ввёл организатор. Если команд не
   степень двойки — недостающие места занимают "BYE" (пропуск раунда). */
function buildBracket(teamNames){
  let teams = teamNames.map(t => t.trim()).filter(Boolean);
  let size = 1;
  while(size < teams.length) size *= 2;
  while(teams.length < size) teams.push('BYE');

  const matches = [];
  for(let i = 0; i < teams.length; i += 2){
    const teamA = teams[i], teamB = teams[i + 1];
    const match = { teamA, teamB, winner: null };
    if(teamA === 'BYE' && teamB !== 'BYE') match.winner = teamB;
    if(teamB === 'BYE' && teamA !== 'BYE') match.winner = teamA;
    matches.push(match);
  }
  return advanceRounds([{ matches }]);
}

function roundIsComplete(round){
  return round.matches.every(m => !!m.winner);
}

/* Достраивает все раунды, которые уже можно построить по имеющимся
   победителям (в т.ч. цепочку авто-побед при BYE). */
function advanceRounds(rounds){
  rounds = rounds.map(r => ({ matches: r.matches.map(m => ({ ...m })) }));
  let last = rounds[rounds.length - 1];
  while(roundIsComplete(last) && last.matches.length > 1){
    const winners = last.matches.map(m => m.winner);
    const matches = [];
    for(let i = 0; i < winners.length; i += 2){
      const teamA = winners[i], teamB = winners[i + 1];
      const match = { teamA, teamB, winner: null };
      if(teamA === 'BYE' && teamB !== 'BYE') match.winner = teamB;
      if(teamB === 'BYE' && teamA !== 'BYE') match.winner = teamA;
      matches.push(match);
    }
    rounds.push({ matches });
    last = rounds[rounds.length - 1];
  }
  return rounds;
}

function tournamentWinner(rounds){
  const finalRound = rounds[rounds.length - 1];
  if(finalRound && finalRound.matches.length === 1 && finalRound.matches[0].winner){
    return finalRound.matches[0].winner;
  }
  return null;
}

/* Все реально сыгранные матчи турнира (без учёта технических BYE),
   по порядку раундов — используется при начислении Эло. */
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

function roundTitle(index, total){
  if(total === 1) return 'Финал';
  if(index === total - 1) return 'Финал';
  if(index === total - 2) return '1/2 финала';
  if(index === total - 3) return '1/4 финала';
  return `Раунд ${index + 1}`;
}

/* Рендер турнирной сетки. opts.isAdmin=true добавляет кнопки выбора
   победителя матча (обрабатываются в admin.js). */
function bracketHTML(t, opts = {}){
  const isAdmin = !!opts.isAdmin;
  const total = t.rounds.length;
  const cols = t.rounds.map((round, ri) => {
    const matches = round.matches.map((m, mi) => {
      const isBye = m.teamA === 'BYE' || m.teamB === 'BYE';
      const teamRow = (name, isWinner) => `
        <div class="bracket-team ${isWinner ? 'winner' : ''} ${name === 'BYE' ? 'bye' : ''}">
          <span>${name}</span>
          ${isAdmin && !m.winner && !isBye
            ? `<button type="button" class="bracket-pick" data-tid="${t.id}" data-round="${ri}" data-match="${mi}" data-team="${name === m.teamA ? 'A' : 'B'}">Победа</button>`
            : ''}
        </div>`;
      return `<div class="bracket-match">
        ${teamRow(m.teamA, !!m.winner && m.winner === m.teamA)}
        ${teamRow(m.teamB, !!m.winner && m.winner === m.teamB)}
      </div>`;
    }).join('');
    return `<div class="bracket-round">
      <div class="bracket-round-title">${roundTitle(ri, total)}</div>
      ${matches}
    </div>`;
  }).join('');

  return `<div class="bracket" data-tid="${t.id}">${cols}</div>`;
}
