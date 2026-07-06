/* =========================================================
   Публичный список команд-участников — только status: approved.
   Плюс: клик по карточке открывает «Кабинет команды» — модальное окно.
   Зарегистрированным на сайте участникам состава (совпадение uid из
   ростера/капитана с вошедшим аккаунтом) там доступны:
   - ссылка на участие в турнире Faceit (поле faceitInvite в заявке,
     организатор указывает его в admin.html при одобрении команды);
   - лента сообщений от лица команды («Участник … пишет: …»).
   Остальным посетителям виден только состав — без ленты и ссылки.
========================================================= */
const gameLabelP = { CS2:'CS2', Dota2:'Dota 2', PUBG:'PUBG' };
const gameClassP = { CS2:'cs2', Dota2:'dota2', PUBG:'pubg' };

const teamsCacheById = new Map();

function normalizeRoster(roster){
  if(Array.isArray(roster)) return roster;
  if(typeof roster === 'string'){
    return roster.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(nickname => ({ nickname, uid: null }));
  }
  return [];
}

function rosterPillHTML(p){
  const nickname = (p.nickname || '').trim() || '—';
  const dot = p.uid ? '<span class="link-dot"></span>' : '';
  const eloSuffix = p.elo ? (' · ' + p.elo) : '';
  const title = p.elo ? ('Эло Faceit: ' + p.elo) : '';
  const pill = p.uid
    ? '<a class="roster-pill" href="account.html?u=' + p.uid + '" title="' + (title || ('Открыть профиль ' + nickname)) + '" onclick="event.stopPropagation();">' + dot + nickname + eloSuffix + '</a>'
    : '<span class="roster-pill" title="' + title + '">' + nickname + eloSuffix + '</span>';
  const faceitLink = p.faceit
    ? '<a class="roster-pill roster-faceit-link" href="' + p.faceit + '" target="_blank" rel="noopener" title="Профиль ' + nickname + ' на Faceit" onclick="event.stopPropagation();">Faceit ↗</a>'
    : '';
  return pill + faceitLink;
}

function participantCardHTML(t, i){
  const g = gameClassP[t.game] || 'custom';
  const label = gameLabelP[t.game] || t.game;
  const roster = normalizeRoster(t.roster);
  const initials = (t.teamName || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const captainLine = t.captainUid
    ? 'Капитан: <a href="account.html?u=' + t.captainUid + '" style="color:var(--color-accent);" onclick="event.stopPropagation();">' + (t.captainName || '—') + '</a>'
    : 'Капитан: ' + (t.captainName || '—');
  return '' +
  '<div class="card team-card participant-card" style="--i:' + i + '; text-align:left; padding:20px 22px;" data-team-id="' + t.id + '" tabindex="0" role="button" aria-label="Открыть кабинет команды ' + t.teamName + '">' +
    '<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">' +
      '<div class="team-avatar" style="width:48px; height:48px; margin:0; flex:none; font-size:16px;">' +
        (t.teamAvatar ? ('<img src="' + t.teamAvatar + '" alt="' + t.teamName + '">') : initials) +
      '</div>' +
      '<div style="flex:1; display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
        '<h3 style="margin:0;">' + t.teamName + '</h3>' +
        '<span class="game-tag ' + g + '">' + label + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="role" style="margin-bottom:6px;">' + captainLine + '</div>' +
    (t.avgElo ? ('<div class="role" style="margin-bottom:10px;">Средний эло состава: <strong>' + t.avgElo + '</strong></div>') : '') +
    (roster.length ? ('<ul style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px; list-style:none; padding:0;">' +
      roster.map(function(p){ return '<li>' + rosterPillHTML(p) + '</li>'; }).join('') +
    '</ul>') : '') +
    '<div class="participant-open-hint">' +
      'Открыть кабинет команды' +
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</div>' +
  '</div>';
}

async function renderParticipants(){
  const wrap = document.querySelector('[data-role="participants-list"]');
  if(!wrap) return;
  try{
    const snap = await db.collection('teamApplications').where('status', '==', 'approved').get();
    const teams = [];
    snap.forEach(doc => teams.push(Object.assign({ id: doc.id }, doc.data())));
    teams.sort((a,b) => (a.teamName||'').localeCompare(b.teamName||''));
    teamsCacheById.clear();
    teams.forEach(t => teamsCacheById.set(t.id, t));
    wrap.innerHTML = teams.length
      ? teams.map((t,i) => participantCardHTML(t,i)).join('')
      : '<div class="empty-state">Пока ни одна команда не прошла модерацию — загляните позже.</div>';
  }catch(err){
    console.error(err);
    wrap.innerHTML = '<div class="empty-state">Не удалось загрузить список команд.</div>';
  }
  initScrollReveal();
}

/* =========================================================
   КАБИНЕТ КОМАНДЫ
========================================================= */
const cabinetOverlay = document.getElementById('cabinet-overlay');
const cabinetBody = document.getElementById('cabinet-body');
const cabinetCloseBtn = document.getElementById('cabinet-close');
let cabinetPostsUnsub = null;
let cabinetCurrentTeamId = null;

function isTeamMember(team, uid){
  if(!uid) return false;
  if(team.captainUid === uid) return true;
  const roster = normalizeRoster(team.roster);
  return roster.some(p => p.uid === uid);
}

function escapeHTML(str){
  return (str || '').replace(/[&<>"']/g, function(c){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
}

function fmtPostTime(ts){
  try{
    if(!ts || !ts.toDate) return '';
    return ts.toDate().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch(e){ return ''; }
}

function closeCabinet(){
  cabinetOverlay.classList.remove('open');
  document.body.style.overflow = '';
  if(cabinetPostsUnsub){ cabinetPostsUnsub(); cabinetPostsUnsub = null; }
  cabinetCurrentTeamId = null;
}

cabinetCloseBtn.addEventListener('click', closeCabinet);
cabinetOverlay.addEventListener('click', function(e){
  if(e.target === cabinetOverlay) closeCabinet();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && cabinetOverlay.classList.contains('open')) closeCabinet();
});

function cabinetFeedPostHTML(team, post){
  const nickname = escapeHTML(post.authorNickname || 'Участник');
  return '' +
  '<div class="cabinet-post">' +
    '<div class="cabinet-post-logo">' + (team.teamAvatar ? ('<img src="' + team.teamAvatar + '" alt="' + team.teamName + '">') : (team.teamName||'?').slice(0,2).toUpperCase()) + '</div>' +
    '<div class="cabinet-post-body">' +
      '<div class="cabinet-post-meta"><b>Участник ' + nickname + '</b> · ' + fmtPostTime(post.createdAt) + '</div>' +
      '<div class="cabinet-post-text">' + escapeHTML(post.text) + '</div>' +
    '</div>' +
  '</div>';
}

function renderCabinetShell(team){
  const label = gameLabelP[team.game] || team.game;
  cabinetBody.innerHTML = '' +
    '<div class="cabinet-head">' +
      '<div class="team-avatar" style="width:52px; height:52px; margin:0; flex:none; font-size:17px;">' +
        (team.teamAvatar ? ('<img src="' + team.teamAvatar + '" alt="' + team.teamName + '">') : (team.teamName||'').slice(0,2).toUpperCase()) +
      '</div>' +
      '<div>' +
        '<h2>' + team.teamName + '</h2>' +
        '<div class="cabinet-status-line">' + label + ' · Капитан: ' + (team.captainName || '—') + ' · Команда одобрена организатором ✅</div>' +
      '</div>' +
    '</div>' +
    '<div class="cabinet-section-title">Доступ к кабинету</div>' +
    '<div id="cabinet-access-zone">Проверяем твой аккаунт…</div>';
}

async function renderCabinetAccessZone(team){
  const zone = document.getElementById('cabinet-access-zone');
  if(!zone) return;

  const user = (typeof auth !== 'undefined') ? auth.currentUser : null;

  if(!user){
    zone.innerHTML = '' +
      '<div class="cabinet-locked">' +
        'Этот раздел кабинета — для игроков состава команды «' + escapeHTML(team.teamName) + '». ' +
        'Если ты один из них — <a href="account.html">войди в свой аккаунт</a> (тот же ник, что указан в заявке), ' +
        'и после этого открой карточку команды снова: появится ссылка на участие в турнире Faceit ' +
        'и лента сообщений от лица команды.' +
      '</div>';
    return;
  }

  if(!isTeamMember(team, user.uid)){
    zone.innerHTML = '' +
      '<div class="cabinet-locked">' +
        'Ты вошёл в аккаунт, но он не привязан к составу этой команды (ник в заявке не совпадает с твоим ' +
        'ником профиля). Ссылку на Faceit-турнир и ленту сообщений видят только игроки, вписанные в состав. ' +
        'Если это ошибка — напишите в «Контакты», организатор поможет привязать аккаунт.' +
      '</div>';
    return;
  }

  const faceitLink = team.faceitInvite || '';
  zone.innerHTML = '' +
    '<div class="cabinet-faceit-card">' +
      '<div>' +
        '<p>Ты подтверждённый участник команды — добро пожаловать в кабинет.</p>' +
        '<strong>' + (faceitLink ? 'Ссылка на участие в турнире Faceit готова' : 'Организатор ещё не добавил ссылку на Faceit-турнир') + '</strong>' +
      '</div>' +
      (faceitLink
        ? ('<a class="btn small" href="' + faceitLink + '" target="_blank" rel="noopener">Перейти на Faceit →</a>')
        : '<span style="font-size:12.5px;color:var(--color-ink-soft);max-width:220px;">Загляни сюда чуть позже — она появится, как только организатор её выдаст.</span>') +
    '</div>' +
    '<div class="cabinet-section-title">Сообщения от лица команды</div>' +
    '<div class="cabinet-guide">' +
      '<b>Как это работает:</b> любой игрок состава может оставить короткое сообщение — оно появится в этой ' +
      'ленте с пометкой «Участник (имя)» и логотипом команды. Используйте это, чтобы договориться о созвоне, ' +
      'сообщить о переносе или просто отметиться перед матчем. Сообщение видно всем, кто открывает кабинет ' +
      'этой команды (в том числе организатору), так что пишите по делу и без лишнего — как в общем чате команды.' +
    '</div>' +
    '<div class="cabinet-feed" id="cabinet-feed">Загружаем сообщения…</div>' +
    '<form class="cabinet-post-form" id="cabinet-post-form">' +
      '<textarea id="cabinet-post-text" maxlength="280" placeholder="Например: «Участник Ivan_CS: подтверждаю время матча в субботу в 18:00»"></textarea>' +
      '<div class="cabinet-post-row">' +
        '<span class="cabinet-post-count"><span id="cabinet-post-len">0</span>/280 · подпишется как «Участник ' + escapeHTML(getNickForUser(team, user.uid)) + '»</span>' +
        '<button class="btn small" type="submit">Написать в кабинет</button>' +
      '</div>' +
      '<div id="cabinet-post-status" style="font-size:13px;"></div>' +
    '</form>';

  const textarea = document.getElementById('cabinet-post-text');
  const lenLabel = document.getElementById('cabinet-post-len');
  textarea.addEventListener('input', function(){ lenLabel.textContent = String(textarea.value.length); });

  startCabinetFeedListener(team);

  document.getElementById('cabinet-post-form').addEventListener('submit', async function(e){
    e.preventDefault();
    const statusBox = document.getElementById('cabinet-post-status');
    const text = textarea.value.trim();
    if(!text){
      statusBox.textContent = 'Напиши сообщение перед отправкой.';
      statusBox.className = 'form-msg error';
      return;
    }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try{
      await db.collection('teamApplications').doc(team.id).collection('posts').add({
        authorUid: user.uid,
        authorNickname: getNickForUser(team, user.uid),
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      textarea.value = '';
      lenLabel.textContent = '0';
      statusBox.textContent = 'Сообщение опубликовано в кабинете команды.';
      statusBox.className = 'form-msg success';
    }catch(err){
      console.error(err);
      statusBox.textContent = 'Не удалось отправить сообщение. Попробуй ещё раз.';
      statusBox.className = 'form-msg error';
    }finally{
      submitBtn.disabled = false;
    }
  });
}

function getNickForUser(team, uid){
  if(team.captainUid === uid) return team.captainName || 'Капитан';
  const roster = normalizeRoster(team.roster);
  const found = roster.find(function(p){ return p.uid === uid; });
  return found ? found.nickname : 'Участник';
}

function startCabinetFeedListener(team){
  if(cabinetPostsUnsub) cabinetPostsUnsub();
  const feedEl = document.getElementById('cabinet-feed');
  cabinetPostsUnsub = db.collection('teamApplications').doc(team.id).collection('posts')
    .orderBy('createdAt', 'desc').limit(50)
    .onSnapshot(function(snap){
      if(!feedEl) return;
      if(snap.empty){
        feedEl.innerHTML = '<div class="empty-state" style="padding:20px;">Пока никто не написал — будь первым!</div>';
        return;
      }
      feedEl.innerHTML = snap.docs.map(function(d){ return cabinetFeedPostHTML(team, d.data()); }).join('');
    }, function(err){
      console.error(err);
      if(feedEl) feedEl.innerHTML = '<div class="empty-state" style="padding:20px;">Не удалось загрузить сообщения.</div>';
    });
}

async function openCabinet(teamId){
  const team = teamsCacheById.get(teamId);
  if(!team) return;
  cabinetCurrentTeamId = teamId;
  cabinetOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCabinetShell(team);

  if(typeof auth !== 'undefined'){
    if(auth.currentUser){
      renderCabinetAccessZone(team);
    }else{
      const unsub = auth.onAuthStateChanged(function(user){
        unsub();
        if(cabinetCurrentTeamId === teamId) renderCabinetAccessZone(team);
      });
    }
  }else{
    renderCabinetAccessZone(team);
  }
}

document.addEventListener('DOMContentLoaded', function(){
  renderParticipants().then(function(){
    // Если пришли по ссылке из профиля игрока (account.html?u=...) с параметром
    // ?team=ID — сразу открываем кабинет этой команды.
    const wantedTeamId = new URLSearchParams(window.location.search).get('team');
    if(wantedTeamId && teamsCacheById.has(wantedTeamId)){
      openCabinet(wantedTeamId);
    }
  });

  const listWrap = document.querySelector('[data-role="participants-list"]');
  if(listWrap){
    listWrap.addEventListener('click', function(e){
      const card = e.target.closest('.participant-card');
      if(!card) return;
      openCabinet(card.getAttribute('data-team-id'));
    });
    listWrap.addEventListener('keydown', function(e){
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.participant-card');
      if(!card) return;
      e.preventDefault();
      openCabinet(card.getAttribute('data-team-id'));
    });
  }
});
