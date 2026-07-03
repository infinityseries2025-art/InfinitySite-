/* =========================================================
   Панель организатора:
   1) Редактор расписания — читает/пишет напрямую в Firestore
      (коллекция "schedule"), изменения видны на сайте сразу,
      без скачивания файлов и коммитов в git.
   2) Турниры — создание сетки на выбывание для каждого турнира,
      простановка результатов матчей, автоматическое начисление
      рейтинга Эло командам и титула победителя по завершении.
========================================================= */

/* ---------------------- РАСПИСАНИЕ ---------------------- */
const rowsBody = document.getElementById('admin-rows');
let scheduleUnsub = null;
let gamesListCache = ['CS2', 'Dota2', 'PUBG'];

function gameOptionsHTML(selected){
  return gamesListCache.map(g =>
    `<option value="${g}" ${g === selected ? 'selected' : ''}>${gameLabel[g] || g}</option>`
  ).join('');
}

function rowTemplate(id, m = {}){
  const tr = document.createElement('tr');
  tr.setAttribute('data-id', id || '');
  tr.innerHTML = `
    <td>
      <select class="f-game">
        ${gameOptionsHTML(m.game)}
      </select>
    </td>
    <td><input class="f-stage" type="text" value="${m.stage||''}" placeholder="Групповой этап"></td>
    <td><input class="f-teamA" type="text" value="${m.teamA||''}" placeholder="Команда A"></td>
    <td><input class="f-teamB" type="text" value="${m.teamB||''}" placeholder="Команда B"></td>
    <td><input class="f-date" type="date" value="${m.date||''}"></td>
    <td><input class="f-time" type="time" value="${m.time||''}"></td>
    <td>
      <select class="f-status">
        <option value="upcoming" ${m.status==='upcoming'?'selected':''}>Скоро</option>
        <option value="live" ${m.status==='live'?'selected':''}>Идёт сейчас</option>
        <option value="finished" ${m.status==='finished'?'selected':''}>Завершён</option>
      </select>
    </td>
    <td><input class="f-score" type="text" value="${m.score||''}" placeholder="2:1"></td>
    <td><input class="f-stream" type="text" value="${m.stream||''}" placeholder="https://twitch.tv/..."></td>
    <td><button type="button" class="row-remove" title="Удалить">✕</button></td>
  `;
  return tr;
}

function readRow(tr){
  return {
    game: tr.querySelector('.f-game').value,
    stage: tr.querySelector('.f-stage').value,
    teamA: tr.querySelector('.f-teamA').value,
    teamB: tr.querySelector('.f-teamB').value,
    date: tr.querySelector('.f-date').value,
    time: tr.querySelector('.f-time').value,
    status: tr.querySelector('.f-status').value,
    score: tr.querySelector('.f-score').value,
    stream: tr.querySelector('.f-stream').value,
  };
}

// Матчи без даты/времени (только что созданные, ещё не заполненные)
// всегда уходят в конец списка, а не смешиваются с реальным расписанием.
function sortScheduleDocs(docs){
  return docs.slice().sort((a, b) => {
    const da = a.data().date || '9999-99-99';
    const dbb = b.data().date || '9999-99-99';
    if(da !== dbb) return da < dbb ? -1 : 1;
    const ta = a.data().time || '99:99';
    const tb = b.data().time || '99:99';
    if(ta !== tb) return ta < tb ? -1 : 1;
    return 0;
  });
}

function showScheduleMessage(text){
  rowsBody.innerHTML = `<tr><td colspan="10"><div class="empty-state">${text}</div></td></tr>`;
}

function startScheduleListener(){
  if(scheduleUnsub) return;
  // Без orderBy на нескольких полях сразу — так запросу не нужен
  // составной индекс в Firestore, и таблица не остаётся пустой,
  // если такой индекс не был создан заранее.
  scheduleUnsub = db.collection('schedule')
    .onSnapshot((snap) => {
      rowsBody.innerHTML = '';
      if(snap.empty){
        showScheduleMessage('Матчей пока нет — нажми «+ Добавить матч», чтобы создать первый.');
        return;
      }
      sortScheduleDocs(snap.docs).forEach(doc => rowsBody.appendChild(rowTemplate(doc.id, doc.data())));
    }, (err) => {
      console.error(err);
      showScheduleMessage('Не удалось загрузить расписание. Проверь настройки Firebase (см. FIREBASE_SETUP.md) и консоль браузера (F12).');
    });
}
function stopScheduleListener(){
  if(scheduleUnsub){ scheduleUnsub(); scheduleUnsub = null; }
}

// Сохраняем изменения поля сразу, как только организатор его поправил
rowsBody.addEventListener('change', async (e) => {
  const tr = e.target.closest('tr');
  if(!tr) return;
  const id = tr.getAttribute('data-id');
  if(!id) return; // ещё не сохранённая (только что созданная) строка — пропустить
  try{
    await db.collection('schedule').doc(id).update(readRow(tr));
  }catch(err){
    console.error(err);
    alert('Не удалось сохранить изменение. Попробуй ещё раз.');
  }
});

rowsBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.row-remove');
  if(!btn) return;
  const tr = btn.closest('tr');
  const id = tr.getAttribute('data-id');
  if(!confirm('Удалить этот матч из расписания?')) return;
  try{
    if(id) await db.collection('schedule').doc(id).delete();
    else tr.remove();
  }catch(err){
    console.error(err);
    alert('Не удалось удалить матч.');
  }
});

const addRowBtn = document.getElementById('add-row');
addRowBtn.addEventListener('click', async () => {
  if(addRowBtn.disabled) return; // защита от повторного клика, пока идёт сохранение
  addRowBtn.disabled = true;
  const originalLabel = addRowBtn.textContent;
  addRowBtn.textContent = 'Добавляю…';

  // Убираем сообщение-заглушку "матчей пока нет", если оно есть в таблице
  if(rowsBody.querySelector('.empty-state')) rowsBody.innerHTML = '';

  const draft = {
    game: 'CS2', stage: '', teamA: '', teamB: '',
    date: '', time: '', status: 'upcoming', score: '', stream: '',
  };

  try{
    const ref = await db.collection('schedule').add({
      ...draft,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Не ждём onSnapshot — сразу показываем новую строку, чтобы клик
    // ощущался мгновенным, даже если сеть отвечает медленно.
    if(!rowsBody.querySelector(`tr[data-id="${ref.id}"]`)){
      const tr = rowTemplate(ref.id, draft);
      tr.classList.add('row-just-added');
      rowsBody.appendChild(tr);
    }
    const newRow = rowsBody.querySelector(`tr[data-id="${ref.id}"]`);
    if(newRow){
      newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      newRow.querySelector('.f-stage')?.focus();
    }
  }catch(err){
    console.error(err);
    alert('Не удалось создать новый матч. Проверь подключение к Firebase (см. FIREBASE_SETUP.md) и консоль браузера (F12) — там будет точная причина.');
  }finally{
    addRowBtn.disabled = false;
    addRowBtn.textContent = originalLabel;
  }
});

/* ---------------------- СПИСОК ИГР ---------------------- */
const tGameSelect = document.getElementById('tGame');
const newGameInput = document.getElementById('newGameName');
const addGameBtn = document.getElementById('add-game-btn');

async function refreshGamesList(){
  gamesListCache = await loadGamesList();
  if(tGameSelect){
    const current = tGameSelect.value;
    tGameSelect.innerHTML = gameOptionsHTML(gamesListCache.includes(current) ? current : gamesListCache[0]);
  }
  // у уже отрисованных строк расписания список игр не трогаем — только у новых
}

if(addGameBtn){
  addGameBtn.addEventListener('click', async () => {
    const name = (newGameInput.value || '').trim();
    if(!name){ alert('Введи название игры.'); return; }
    if(gamesListCache.some(g => g.toLowerCase() === name.toLowerCase())){
      alert('Такая игра уже есть в списке.');
      return;
    }
    addGameBtn.disabled = true;
    try{
      await addCustomGame(name);
      await refreshGamesList();
      if(tGameSelect) tGameSelect.value = name;
      newGameInput.value = '';
    }catch(err){
      console.error(err);
      alert('Не удалось добавить игру. Попробуй ещё раз.');
    }finally{
      addGameBtn.disabled = false;
    }
  });
}

/* ---------------------- ТУРНИРЫ И ЭЛО ---------------------- */
const tournamentForm = document.getElementById('tournament-form');
const tournamentsWrap = document.getElementById('tournaments-admin-list');
let tournamentsCache = [];
let tournamentsUnsub = null;

function tournamentAdminCardHTML(t){
  const winnerReady = t.status === 'ongoing' && tournamentWinner(t.rounds);
  const statusBadge = t.status === 'finished'
    ? `<span class="status-tag finished">Завершён</span>`
    : `<span class="status-tag live">Идёт сейчас</span>`;
  const winnerLine = t.status === 'finished' && t.winner
    ? `<div class="tournament-winner">🏆 Победитель — <strong>${t.winner}</strong> (титул и Эло уже начислены)</div>`
    : '';
  return `
  <div class="card tournament-card">
    <div class="tournament-head">
      <div>
        <span class="game-tag ${gameClass[t.game] || 'custom'}">${t.game}</span>
        <h3>${t.name}</h3>
      </div>
      ${statusBadge}
    </div>
    ${winnerLine}
    ${bracketHTML(t, { isAdmin: t.status === 'ongoing' })}
    <div class="admin-actions" style="margin-top:14px;">
      ${winnerReady ? `<button type="button" class="btn finish-tournament" data-tid="${t.id}">Завершить турнир и наградить победителя</button>` : ''}
      <button type="button" class="btn secondary delete-tournament" data-tid="${t.id}">Удалить турнир</button>
    </div>
  </div>`;
}

function startTournamentsListener(){
  if(tournamentsUnsub || !tournamentsWrap) return;
  tournamentsUnsub = db.collection('tournaments').orderBy('createdAt', 'desc')
    .onSnapshot((snap) => {
      tournamentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      tournamentsWrap.innerHTML = tournamentsCache.length
        ? tournamentsCache.map(tournamentAdminCardHTML).join('')
        : `<div class="empty-state">Турниров пока нет — создай первый выше.</div>`;
    }, (err) => console.error(err));
}
function stopTournamentsListener(){
  if(tournamentsUnsub){ tournamentsUnsub(); tournamentsUnsub = null; }
}

if(tournamentForm){
  tournamentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = tournamentForm.tName.value.trim();
    const game = tournamentForm.tGame.value;
    const teamNames = tournamentForm.tTeams.value.split('\n').map(s => s.trim()).filter(Boolean);
    if(!name || teamNames.length < 2){
      alert('Укажи название турнира и минимум 2 команды (по одной на строке).');
      return;
    }
    const rounds = buildBracket(teamNames);
    try{
      await db.collection('tournaments').add({
        name, game, rounds,
        status: 'ongoing',
        winner: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      tournamentForm.reset();
    }catch(err){
      console.error(err);
      alert('Не удалось создать турнир.');
    }
  });
}

if(tournamentsWrap){
  tournamentsWrap.addEventListener('click', async (e) => {
    const pickBtn = e.target.closest('.bracket-pick');
    if(pickBtn){
      const tid = pickBtn.getAttribute('data-tid');
      const ri = Number(pickBtn.getAttribute('data-round'));
      const mi = Number(pickBtn.getAttribute('data-match'));
      const team = pickBtn.getAttribute('data-team');
      const t = tournamentsCache.find(x => x.id === tid);
      if(!t) return;
      const rounds = t.rounds.map(r => ({ matches: r.matches.map(m => ({ ...m })) }));
      const match = rounds[ri].matches[mi];
      match.winner = team === 'A' ? match.teamA : match.teamB;
      const advanced = advanceRounds(rounds);
      try{
        await db.collection('tournaments').doc(tid).update({ rounds: advanced });
      }catch(err){
        console.error(err);
        alert('Не удалось сохранить результат матча.');
      }
      return;
    }

    const finishBtn = e.target.closest('.finish-tournament');
    if(finishBtn){
      if(finishBtn.disabled) return; // защита от повторного клика (двойное начисление Эло)
      const tid = finishBtn.getAttribute('data-tid');
      const t = tournamentsCache.find(x => x.id === tid);
      if(!t) return;
      finishBtn.disabled = true;
      try{
        await finishTournament(t);
      }finally{
        finishBtn.disabled = false; // если сработал catch внутри и турнир не завершился
      }
      return;
    }

    const deleteBtn = e.target.closest('.delete-tournament');
    if(deleteBtn){
      const tid = deleteBtn.getAttribute('data-tid');
      const t = tournamentsCache.find(x => x.id === tid);
      if(!confirm(`Удалить турнир «${t ? t.name : ''}» без возможности восстановления?\nСетка и данные турнира будут удалены. Уже начисленный Эло командам не отменится.`)) return;
      deleteBtn.disabled = true;
      try{
        await db.collection('tournaments').doc(tid).delete();
      }catch(err){
        console.error(err);
        alert('Не удалось удалить турнир. Попробуй ещё раз.');
        deleteBtn.disabled = false;
      }
    }
  });
}

/* Начисляет Эло за все сыгранные матчи турнира и выдаёт титул
   победителю, например «Обладатели трофея IST Season 1».

   Важно: каждый матч считается от рейтинга, который был у команды
   ДО начала турнира, а не от рейтинга, уже изменённого её же
   предыдущей игрой в этой же сетке. Иначе итог зависит от порядка
   матчей (кто раньше сыграл в сетке) — команда получает "перекос"
   Эло от собственных промежуточных побед/поражений внутри одного
   турнира, что и выглядело как "странный, несправедливый" рейтинг.
   Все изменения по турниру считаются от одной и той же стартовой
   точки и применяются одним разом — результат воспроизводим и не
   зависит от очерёдности матчей в сетке. */
async function finishTournament(t){
  const winnerName = tournamentWinner(t.rounds);
  if(!winnerName) return;
  if(!confirm(`Завершить турнир «${t.name}»?\nПобедитель: ${winnerName}.\nВсем участникам будет пересчитан рейтинг Эло, а победителю выдан титул.`)) return;

  const matches = playedMatches(t.rounds);
  // Все команды, которых касается этот турнир: реально сыгравшие матчи,
  // плюс сам победитель (на случай, если он прошёл в финал только
  // за счёт BYE и ни разу не встретился с реальным соперником — титул
  // всё равно должен быть выдан).
  const names = [...new Set([...matches.flatMap(m => [m.teamA, m.teamB]), winnerName])];

  try{
    await db.runTransaction(async (tx) => {
      const refs = {}, baseline = {}, delta = {}, wins = {}, losses = {};
      for(const name of names){
        const ref = db.collection('teams').doc(slugTeam(t.game, name));
        const snap = await tx.get(ref);
        refs[name] = ref;
        baseline[name] = snap.exists && typeof snap.data().elo === 'number' ? snap.data().elo : 1000;
        delta[name] = 0; wins[name] = 0; losses[name] = 0;
      }

      matches.forEach(m => {
        const winnerIsA = m.winner === m.teamA;
        const wName = winnerIsA ? m.teamA : m.teamB;
        const lName = winnerIsA ? m.teamB : m.teamA;
        // Считаем от стартового (до турнира) Эло обеих команд —
        // не от уже изменённого их собственными матчами внутри сетки.
        const { newWinner, newLoser } = eloUpdate(baseline[wName], baseline[lName]);
        delta[wName] += newWinner - baseline[wName];
        delta[lName] += newLoser - baseline[lName];
        wins[wName] += 1;
        losses[lName] += 1;
      });

      names.forEach(name => {
        const payload = {
          name, game: t.game,
          elo: Math.round(baseline[name] + delta[name]),
          wins: firebase.firestore.FieldValue.increment(wins[name]),
          losses: firebase.firestore.FieldValue.increment(losses[name]),
        };
        if(name === winnerName){
          payload.trophies = firebase.firestore.FieldValue.arrayUnion(`${TROPHY_PREFIX} ${t.name}`);
        }
        tx.set(refs[name], payload, { merge: true });
      });
    });

    await db.collection('tournaments').doc(t.id).update({ status: 'finished', winner: winnerName });
  }catch(err){
    console.error(err);
    alert('Не удалось завершить турнир — попробуй ещё раз.');
  }
}

/* ---------------------- РЕЙТИНГ КОМАНД (ЭЛО) ---------------------- */
const teamsTabsWrap = document.getElementById('teams-admin-tabs');
const teamsRowsBody = document.getElementById('teams-admin-rows');
let teamsUnsub = null;
let teamsCache = [];
let teamsActiveGame = null;

function teamRowHTML(team){
  return `
    <tr data-id="${team.id}">
      <td>${team.name || team.id}</td>
      <td><input class="t-elo" type="number" step="1" value="${typeof team.elo === 'number' ? team.elo : 1000}" style="width:90px;"></td>
      <td>${team.wins || 0}</td>
      <td>${team.losses || 0}</td>
      <td style="white-space:nowrap;">
        <button type="button" class="btn secondary team-save" data-id="${team.id}">Сохранить</button>
        <button type="button" class="btn secondary team-delete" data-id="${team.id}">Удалить</button>
      </td>
    </tr>`;
}

function drawTeamsTable(){
  if(!teamsRowsBody) return;
  const games = [...new Set(teamsCache.map(x => x.game).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if(!games.length){
    if(teamsTabsWrap) teamsTabsWrap.innerHTML = '';
    teamsRowsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Рейтинг пока пуст.</div></td></tr>`;
    return;
  }
  if(!teamsActiveGame || !games.includes(teamsActiveGame)) teamsActiveGame = games[0];
  if(teamsTabsWrap){
    teamsTabsWrap.innerHTML = games.map(g =>
      `<button type="button" class="btn ${g === teamsActiveGame ? '' : 'secondary'} teams-tab" data-game="${g}">${g}</button>`
    ).join('');
  }
  const rows = teamsCache.filter(x => x.game === teamsActiveGame).sort((a, b) => (b.elo || 1000) - (a.elo || 1000));
  teamsRowsBody.innerHTML = rows.length
    ? rows.map(teamRowHTML).join('')
    : `<tr><td colspan="5"><div class="empty-state">Для этой игры пока нет команд с рейтингом.</div></td></tr>`;
}

function startTeamsListener(){
  if(teamsUnsub || !teamsRowsBody) return;
  teamsUnsub = db.collection('teams').onSnapshot((snap) => {
    teamsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    drawTeamsTable();
  }, (err) => console.error(err));
}
function stopTeamsListener(){
  if(teamsUnsub){ teamsUnsub(); teamsUnsub = null; }
}

if(teamsTabsWrap){
  teamsTabsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.teams-tab');
    if(!btn) return;
    teamsActiveGame = btn.getAttribute('data-game');
    drawTeamsTable();
  });
}

if(teamsRowsBody){
  teamsRowsBody.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.team-save');
    if(saveBtn){
      const id = saveBtn.getAttribute('data-id');
      const tr = saveBtn.closest('tr');
      const val = Number(tr.querySelector('.t-elo').value);
      if(!Number.isFinite(val)){ alert('Эло должно быть числом.'); return; }
      saveBtn.disabled = true;
      try{
        await db.collection('teams').doc(id).update({ elo: Math.round(val) });
      }catch(err){
        console.error(err);
        alert('Не удалось сохранить рейтинг.');
      }finally{
        saveBtn.disabled = false;
      }
      return;
    }
    const delBtn = e.target.closest('.team-delete');
    if(delBtn){
      const id = delBtn.getAttribute('data-id');
      const team = teamsCache.find(x => x.id === id);
      if(!confirm(`Удалить команду «${team ? team.name : id}» из рейтинга насовсем?\nЭто не отменит результаты уже сыгранных турниров — уберётся только карточка рейтинга.`)) return;
      delBtn.disabled = true;
      try{
        await db.collection('teams').doc(id).delete();
      }catch(err){
        console.error(err);
        alert('Не удалось удалить команду.');
        delBtn.disabled = false;
      }
    }
  });
}

/* ---------------------- НОВОСТИ ---------------------- */
const newsForm = document.getElementById('news-form');
const newsList = document.getElementById('news-admin-list');
const newsIdField = document.getElementById('nId');
const newsFormTitle = document.getElementById('news-form-title');
const newsSubmitBtn = document.getElementById('news-submit-btn');
const newsCancelBtn = document.getElementById('news-cancel-edit');
let newsUnsub = null;
let newsCache = [];

function newsAdminCardHTML(n){
  return `
  <div class="card news-card" data-id="${n.id}">
    <div class="thumb">${n.image ? `<img src="${n.image}" alt="${n.title}">` : 'Infinity Series Tournaments'}</div>
    <div class="body">
      <div class="date">${n.date || ''}</div>
      <h3>${n.title || ''}</h3>
      <p>${n.excerpt || ''}</p>
      <div class="app-actions" style="margin-top:10px;">
        <button type="button" class="news-edit" data-id="${n.id}">Редактировать</button>
        <button type="button" class="news-delete" data-id="${n.id}">Удалить</button>
      </div>
    </div>
  </div>`;
}

function startNewsListener(){
  if(newsUnsub || !newsList) return;
  newsUnsub = db.collection('news').orderBy('date', 'desc')
    .onSnapshot((snap) => {
      newsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      newsList.innerHTML = newsCache.length
        ? newsCache.map(newsAdminCardHTML).join('')
        : `<div class="empty-state">Новостей пока нет — добавь первую выше.</div>`;
    }, (err) => {
      console.error(err);
      newsList.innerHTML = `<div class="empty-state">Не удалось загрузить новости.</div>`;
    });
}
function stopNewsListener(){
  if(newsUnsub){ newsUnsub(); newsUnsub = null; }
}

function resetNewsForm(){
  newsForm.reset();
  newsIdField.value = '';
  newsFormTitle.textContent = 'Добавить новость';
  newsSubmitBtn.textContent = 'Опубликовать';
  newsCancelBtn.style.display = 'none';
}

if(newsForm){
  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = newsIdField.value;
    const data = {
      title: document.getElementById('nTitle').value.trim(),
      date: document.getElementById('nDate').value,
      image: document.getElementById('nImage').value.trim(),
      excerpt: document.getElementById('nExcerpt').value.trim(),
      content: document.getElementById('nContent').value.trim(),
    };
    if(!data.title || !data.date || !data.excerpt || !data.content){
      alert('Заполни заголовок, дату, короткое описание и текст новости.');
      return;
    }
    try{
      if(id){
        await db.collection('news').doc(id).update(data);
      }else{
        await db.collection('news').add({
          ...data,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      resetNewsForm();
    }catch(err){
      console.error(err);
      alert('Не удалось сохранить новость. Попробуй ещё раз.');
    }
  });
}

if(newsCancelBtn){
  newsCancelBtn.addEventListener('click', resetNewsForm);
}

if(newsList){
  newsList.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.news-edit');
    if(editBtn){
      const n = newsCache.find(x => x.id === editBtn.getAttribute('data-id'));
      if(!n) return;
      newsIdField.value = n.id;
      document.getElementById('nTitle').value = n.title || '';
      document.getElementById('nDate').value = n.date || '';
      document.getElementById('nImage').value = n.image || '';
      document.getElementById('nExcerpt').value = n.excerpt || '';
      document.getElementById('nContent').value = n.content || '';
      newsFormTitle.textContent = 'Редактировать новость';
      newsSubmitBtn.textContent = 'Сохранить';
      newsCancelBtn.style.display = 'inline-block';
      newsForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const delBtn = e.target.closest('.news-delete');
    if(delBtn){
      if(!confirm('Удалить эту новость без возможности восстановления?')) return;
      try{
        await db.collection('news').doc(delBtn.getAttribute('data-id')).delete();
        if(newsIdField.value === delBtn.getAttribute('data-id')) resetNewsForm();
      }catch(err){
        console.error(err);
        alert('Не удалось удалить новость.');
      }
    }
  });
}

/* ---------------------- АККАУНТЫ ИГРОКОВ (баны, роль модератора) ----------------------
   Видно и доступно только организатору (ADMIN_EMAIL) — см. admin-auth.js,
   который скрывает #users-admin-section для модераторов. */
const usersList = document.getElementById('users-admin-list');
let usersUnsub = null;

function userAdminCardHTML(u){
  const nickname = u.nickname || '(без ника)';
  const roleBadge = u.role === 'moderator' ? `<span class="app-status-badge approved">Модератор</span>` : '';
  const banBadge = u.banned ? `<span class="app-status-badge rejected">Забанен</span>` : '';
  return `
  <div class="card app-card" data-id="${u.id}">
    <div class="app-top">
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="team-avatar" style="width:36px; height:36px; margin:0; flex:none; font-size:13px;">
          ${u.avatar ? `<img src="${u.avatar}" alt="${nickname}">` : nickname.slice(0,2).toUpperCase()}
        </div>
        <strong>${nickname}</strong>
      </div>
      <div style="display:flex; gap:6px;">${roleBadge}${banBadge}</div>
    </div>
    <div style="font-size:12.5px; color:var(--color-ink-soft); word-break:break-all;">UID: ${u.id}</div>
    <div class="app-actions">
      <button type="button" class="toggle-mod" data-id="${u.id}" data-value="${u.role === 'moderator' ? '' : 'moderator'}">
        ${u.role === 'moderator' ? 'Снять модератора' : 'Сделать модератором'}
      </button>
      <button type="button" class="toggle-ban" data-id="${u.id}" data-value="${u.banned ? '' : '1'}">
        ${u.banned ? 'Разбанить' : 'Забанить'}
      </button>
      <button type="button" class="delete-user" data-id="${u.id}">Удалить профиль</button>
    </div>
  </div>`;
}

function startUsersListener(){
  if(usersUnsub || !usersList) return;
  usersUnsub = db.collection('users').onSnapshot((snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    usersList.innerHTML = list.length
      ? list.map(userAdminCardHTML).join('')
      : `<div class="empty-state">Пока никто не создал профиль на сайте.</div>`;
  }, (err) => {
    console.error(err);
    usersList.innerHTML = `<div class="empty-state">Не удалось загрузить аккаунты.</div>`;
  });
}
function stopUsersListener(){
  if(usersUnsub){ usersUnsub(); usersUnsub = null; }
}

if(usersList){
  usersList.addEventListener('click', async (e) => {
    const modBtn = e.target.closest('.toggle-mod');
    const banBtn = e.target.closest('.toggle-ban');
    const delBtn = e.target.closest('.delete-user');

    if(modBtn){
      const uid = modBtn.getAttribute('data-id');
      const value = modBtn.getAttribute('data-value');
      modBtn.disabled = true;
      try{
        await db.collection('users').doc(uid).set({ role: value || firebase.firestore.FieldValue.delete() }, { merge: true });
      }catch(err){
        console.error(err);
        alert('Не удалось изменить роль.');
      }finally{
        modBtn.disabled = false;
      }
      return;
    }

    if(banBtn){
      const uid = banBtn.getAttribute('data-id');
      const value = banBtn.getAttribute('data-value') === '1';
      if(value && !confirm('Забанить этот аккаунт? Он не сможет заходить в личный кабинет, пока бан не снят.')) return;
      banBtn.disabled = true;
      try{
        await db.collection('users').doc(uid).set({ banned: value }, { merge: true });
      }catch(err){
        console.error(err);
        alert('Не удалось изменить статус бана.');
      }finally{
        banBtn.disabled = false;
      }
      return;
    }

    if(delBtn){
      const uid = delBtn.getAttribute('data-id');
      if(!confirm('Удалить профиль этого игрока без возможности восстановления?\nНик, аватар и описание будут удалены. Сам email/вход в Firebase Authentication при этом останется — его можно отключить вручную в Firebase Console → Authentication → Users.')) return;
      delBtn.disabled = true;
      try{
        await db.collection('users').doc(uid).delete();
      }catch(err){
        console.error(err);
        alert('Не удалось удалить профиль.');
        delBtn.disabled = false;
      }
    }
  });
}

/* Слушатели расписания/турниров включаются только когда организатор
   вошёл в систему (см. admin-auth.js → auth.onAuthStateChanged). */
auth.onAuthStateChanged(async (user) => {
  if(isAdminUser(user) || await checkModerator(user)){
    gamesListCache = await loadGamesList();
    if(tGameSelect) tGameSelect.innerHTML = gameOptionsHTML(gamesListCache[0]);
    startScheduleListener();
    startTournamentsListener();
    startNewsListener();
    if(isAdminUser(user)) startUsersListener();
  }else{
    stopScheduleListener();
    stopTournamentsListener();
    stopNewsListener();
    stopUsersListener();
  }
});
