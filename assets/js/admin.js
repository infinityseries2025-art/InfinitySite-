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

function rowTemplate(id, m = {}){
  const tr = document.createElement('tr');
  tr.setAttribute('data-id', id || '');
  tr.innerHTML = `
    <td>
      <select class="f-game">
        <option value="CS2" ${m.game==='CS2'?'selected':''}>CS2</option>
        <option value="Dota2" ${m.game==='Dota2'?'selected':''}>Dota 2</option>
        <option value="PUBG" ${m.game==='PUBG'?'selected':''}>PUBG</option>
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

function startScheduleListener(){
  if(scheduleUnsub) return;
  scheduleUnsub = db.collection('schedule').orderBy('date').orderBy('time')
    .onSnapshot((snap) => {
      rowsBody.innerHTML = '';
      snap.forEach(doc => rowsBody.appendChild(rowTemplate(doc.id, doc.data())));
    }, (err) => {
      console.error(err);
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

document.getElementById('add-row').addEventListener('click', async () => {
  try{
    await db.collection('schedule').add({
      game: 'CS2', stage: '', teamA: '', teamB: '',
      date: '', time: '', status: 'upcoming', score: '', stream: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }catch(err){
    console.error(err);
    alert('Не удалось создать новый матч.');
  }
});

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
        <span class="game-tag ${(t.game || 'CS2').toLowerCase()}">${t.game}</span>
        <h3>${t.name}</h3>
      </div>
      ${statusBadge}
    </div>
    ${winnerLine}
    ${bracketHTML(t, { isAdmin: t.status === 'ongoing' })}
    ${winnerReady ? `<button type="button" class="btn finish-tournament" data-tid="${t.id}">Завершить турнир и наградить победителя</button>` : ''}
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
      const tid = finishBtn.getAttribute('data-tid');
      const t = tournamentsCache.find(x => x.id === tid);
      if(!t) return;
      await finishTournament(t);
    }
  });
}

/* Начисляет Эло за каждый сыгранный матч турнира и выдаёт титул
   победителю, например «Обладатели трофея IST Season 1». */
async function finishTournament(t){
  const winnerName = tournamentWinner(t.rounds);
  if(!winnerName) return;
  if(!confirm(`Завершить турнир «${t.name}»?\nПобедитель: ${winnerName}.\nВсем участникам будет пересчитан рейтинг Эло, а победителю выдан титул.`)) return;

  const matches = playedMatches(t.rounds);
  try{
    for(const m of matches){
      const winnerIsA = m.winner === m.teamA;
      const wName = winnerIsA ? m.teamA : m.teamB;
      const lName = winnerIsA ? m.teamB : m.teamA;
      const wRef = db.collection('teams').doc(slugTeam(t.game, wName));
      const lRef = db.collection('teams').doc(slugTeam(t.game, lName));
      await db.runTransaction(async (tx) => {
        const [wSnap, lSnap] = await Promise.all([tx.get(wRef), tx.get(lRef)]);
        const wElo = wSnap.exists && wSnap.data().elo ? wSnap.data().elo : 1000;
        const lElo = lSnap.exists && lSnap.data().elo ? lSnap.data().elo : 1000;
        const { newWinner, newLoser } = eloUpdate(wElo, lElo);
        tx.set(wRef, {
          name: wName, game: t.game, elo: newWinner,
          wins: firebase.firestore.FieldValue.increment(1),
        }, { merge: true });
        tx.set(lRef, {
          name: lName, game: t.game, elo: newLoser,
          losses: firebase.firestore.FieldValue.increment(1),
        }, { merge: true });
      });
    }

    const champRef = db.collection('teams').doc(slugTeam(t.game, winnerName));
    await champRef.set({
      name: winnerName,
      game: t.game,
      trophies: firebase.firestore.FieldValue.arrayUnion(`${TROPHY_PREFIX} ${t.name}`),
    }, { merge: true });

    await db.collection('tournaments').doc(t.id).update({ status: 'finished', winner: winnerName });
  }catch(err){
    console.error(err);
    alert('Не удалось завершить турнир — попробуй ещё раз.');
  }
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

/* Слушатели расписания/турниров включаются только когда организатор
   вошёл в систему (см. admin-auth.js → auth.onAuthStateChanged). */
auth.onAuthStateChanged((user) => {
  if(isAdminUser(user)){
    startScheduleListener();
    startTournamentsListener();
    startNewsListener();
  }else{
    stopScheduleListener();
    stopTournamentsListener();
    stopNewsListener();
  }
});
