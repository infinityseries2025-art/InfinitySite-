const rowsBody = document.getElementById('admin-rows');

function rowTemplate(m = {}){
  const tr = document.createElement('tr');
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
  tr.querySelector('.row-remove').addEventListener('click', () => tr.remove());
  return tr;
}

async function initAdmin(){
  let existing = [];
  try{
    const res = await fetch('data/schedule.json', { cache:'no-store' });
    if(res.ok) existing = await res.json();
  }catch(e){ /* пусто, начнём с чистой таблицы */ }

  if(existing.length){
    existing.forEach(m => rowsBody.appendChild(rowTemplate(m)));
  }else{
    rowsBody.appendChild(rowTemplate());
  }
}

document.getElementById('add-row').addEventListener('click', () => {
  rowsBody.appendChild(rowTemplate());
});

document.getElementById('build-json').addEventListener('click', () => {
  const rows = [...rowsBody.querySelectorAll('tr')];
  const data = rows.map((tr, i) => ({
    id: i + 1,
    game: tr.querySelector('.f-game').value,
    stage: tr.querySelector('.f-stage').value,
    teamA: tr.querySelector('.f-teamA').value,
    teamB: tr.querySelector('.f-teamB').value,
    date: tr.querySelector('.f-date').value,
    time: tr.querySelector('.f-time').value,
    status: tr.querySelector('.f-status').value,
    score: tr.querySelector('.f-score').value,
    stream: tr.querySelector('.f-stream').value,
  }));
  const json = JSON.stringify(data, null, 2);
  document.getElementById('json-output').value = json;

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'schedule.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

initAdmin();
