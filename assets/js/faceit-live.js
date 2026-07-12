/* =========================================================
   ЖИВОЙ СТАТУС МАТЧА ПО FACEIT-КОМНАТЕ
   Если организатор указал FACEIT Match ID/ссылку на комнату в редакторе
   расписания (assets/js/admin.js → колонка "FACEIT-комната"), карточка
   матча на сайте сама:
     — покажет «🔴 Идёт сейчас», пока матч реально идёт на FACEIT;
     — подставит настоящий финальный счёт, как только матч завершится —
       без участия организатора, в дополнение к тому, что он мог
       вписать вручную в поле "Счёт".

   Использует тот же FACEIT_API_KEY и функцию faceitFetch() из
   faceit-stats.js — этот файл должен быть подключён на странице раньше
   (или после — благодаря defer порядок не важен, см. комментарий внизу).
   Если ключ не настроен, всё просто тихо пропускается — расписание
   продолжает работать как раньше, на статусах, которые вручную
   проставил организатор.
========================================================= */

async function fetchFaceitMatchStatus(matchId){
  if(!matchId) return null;
  if(typeof faceitFetch !== 'function') return null;
  if(typeof FACEIT_API_KEY === 'undefined' || !FACEIT_API_KEY || FACEIT_API_KEY.indexOf('ВСТАВЬ_СЮДА') === 0) return null;
  try{
    return await faceitFetch('/matches/' + encodeURIComponent(matchId));
  }catch(err){
    console.warn('Не удалось получить live-статус матча FACEIT ' + matchId, err);
    return null;
  }
}

function faceitScoreFromMatch(match){
  const score = match && match.results && match.results.score;
  if(!score) return null;
  const a = score.faction1, b = score.faction2;
  if(typeof a !== 'number' || typeof b !== 'number') return null;
  return a + ':' + b;
}

async function applyLiveFaceitOverlays(){
  const cards = document.querySelectorAll('[data-faceit-id]');
  if(!cards.length) return;
  await Promise.all(Array.from(cards).map(async (card) => {
    const matchId = card.getAttribute('data-faceit-id');
    const match = await fetchFaceitMatchStatus(matchId);
    if(!match) return;
    const status = String(match.status || '').toUpperCase();
    const statusTag = card.querySelector('.status-tag');

    if(status === 'ONGOING' || status === 'LIVE'){
      if(statusTag){
        statusTag.textContent = 'Идёт сейчас';
        statusTag.classList.remove('upcoming', 'finished');
        statusTag.classList.add('live');
      }
    }else if(status === 'FINISHED'){
      const finalScore = faceitScoreFromMatch(match);
      if(finalScore){
        const scoreEl = card.querySelector('.match-score');
        const vsEl = card.querySelector('.vs');
        if(scoreEl) scoreEl.textContent = finalScore;
        else if(vsEl) vsEl.outerHTML = '<span class="match-score">' + finalScore + '</span>';
      }
      if(statusTag){
        statusTag.textContent = 'Завершён';
        statusTag.classList.remove('upcoming', 'live');
        statusTag.classList.add('finished');
      }
    }
  }));
}

// main.js рисует карточки расписания асинхронно (ждёт ответ Firestore),
// поэтому карточек с data-faceit-id может ещё не быть в DOM в момент
// DOMContentLoaded — ждём их появления вместо жёсткой задержки.
function waitForFaceitCards(maxTries){
  return new Promise((resolve) => {
    let tries = 0;
    (function check(){
      tries++;
      if(document.querySelectorAll('[data-faceit-id]').length || tries >= maxTries){ resolve(); return; }
      setTimeout(check, 400);
    })();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await waitForFaceitCards(12); // максимум ~4.8с ожидания карточек
  applyLiveFaceitOverlays();
  // раз в минуту перепроверяем — пока вкладка открыта, статус матча
  // на сайте обновляется сам, без перезагрузки страницы
  setInterval(applyLiveFaceitOverlays, 60000);
});
