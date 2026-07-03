/* =========================================================
   Регистрация команды — заявка уходит в Firestore
   со статусом "pending" и появляется в панели admin.html
   для одобрения/отклонения организатором.

   Минимальная защита от ботов/спама (без сторонних сервисов):
   1) honeypot-поле — невидимое человеку, боты часто его заполняют;
   2) time-trap — форма, отправленная быстрее чем за 3 секунды
      после загрузки страницы, считается ботом;
   3) простая математическая проверка (капча);
   4) ограничение частоты отправки с одного браузера (localStorage).
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const statusBox = document.getElementById('register-status');
  const submitBtn = document.getElementById('register-submit');
  if(!form) return;

  /* -----------------------------------------------------
     Подсказка ников: подгружаем зарегистрированных пользователей
     один раз при загрузке страницы (nickname → uid), чтобы:
     1) заполнить <datalist> для автодополнения в полях "ник капитана"
        и полей состава;
     2) при отправке заявки понять, у какого игрока указан ник
        существующего аккаунта, и прикрепить к заявке его uid
        (в "Участниках" тогда появится ссылка на профиль).
  ----------------------------------------------------- */
  const nicknameToUid = new Map(); // ключ — ник в нижнем регистре
  const nicknameDatalist = document.getElementById('known-nicknames');
  const gameSelect = document.getElementById('game');

  (async () => {
    try{
      const games = await loadGamesList();
      if(gameSelect && games.length){
        gameSelect.innerHTML = games.map(g => `<option value="${g}">${gameLabel[g] || g}</option>`).join('');
      }
    }catch(err){
      console.warn('Не удалось загрузить список игр', err);
    }
  })();

  (async () => {
    try{
      const snap = await db.collection('users').limit(500).get();
      const options = [];
      snap.forEach(doc => {
        const nick = (doc.data().nickname || '').trim();
        if(!nick) return;
        nicknameToUid.set(nick.toLowerCase(), doc.id);
        options.push(nick);
      });
      if(nicknameDatalist){
        nicknameDatalist.innerHTML = options.map(n => `<option value="${n}">`).join('');
      }
    }catch(err){
      console.warn('Не удалось загрузить список ников для подсказки:', err);
    }
  })();

  function findUidByNickname(nick){
    const trimmed = (nick || '').trim();
    if(!trimmed) return null;
    return nicknameToUid.get(trimmed.toLowerCase()) || null;
  }

  /* -----------------------------------------------------
     Аватар команды — сжимается в браузере и хранится как
     dataURL в самом документе заявки (см. fileToCompressedDataURL в main.js).
  ----------------------------------------------------- */
  let teamAvatarDataURL = '';
  const teamAvatarFile = document.getElementById('teamAvatarFile');
  const teamAvatarPreview = document.getElementById('team-avatar-preview');
  const teamAvatarRemove = document.getElementById('team-avatar-remove');
  const teamNameInput = document.getElementById('teamName');

  function renderTeamAvatarPreview(){
    if(teamAvatarDataURL){
      teamAvatarPreview.innerHTML = `<img src="${teamAvatarDataURL}" alt="Аватар команды">`;
      teamAvatarRemove.style.display = 'inline-block';
    }else{
      const name = teamNameInput.value.trim();
      teamAvatarPreview.textContent = name ? name.slice(0, 2).toUpperCase() : '?';
      teamAvatarRemove.style.display = 'none';
    }
  }
  teamNameInput.addEventListener('input', () => { if(!teamAvatarDataURL) renderTeamAvatarPreview(); });
  teamAvatarFile.addEventListener('change', async () => {
    const file = teamAvatarFile.files && teamAvatarFile.files[0];
    if(!file) return;
    try{
      teamAvatarDataURL = await fileToCompressedDataURL(file, 360, 0.82);
      renderTeamAvatarPreview();
    }catch(err){
      statusBox.textContent = err.message || 'Не удалось обработать картинку.';
      statusBox.className = 'form-msg error';
    }finally{
      teamAvatarFile.value = '';
    }
  });
  teamAvatarRemove.addEventListener('click', () => {
    teamAvatarDataURL = '';
    renderTeamAvatarPreview();
  });
  renderTeamAvatarPreview();

  /* -----------------------------------------------------
     Состав команды — динамические строки вместо одного textarea.
     Каждая строка = один ник; подсказка автодополнения помогает
     вписать ник уже зарегистрированного игрока.
  ----------------------------------------------------- */
  const rosterRows = document.getElementById('roster-rows');
  const rosterAddBtn = document.getElementById('roster-add');
  let rosterCounter = 0;

  function addRosterRow(value = ''){
    rosterCounter += 1;
    const row = document.createElement('div');
    row.className = 'roster-row';
    row.innerHTML = `
      <div class="form-field">
        <input type="text" class="roster-nick" list="known-nicknames" autocomplete="off"
               maxlength="40" placeholder="Ник игрока ${rosterCounter}" value="${value}">
      </div>
      <button type="button" class="roster-remove" title="Удалить игрока">✕</button>
    `;
    row.querySelector('.roster-remove').addEventListener('click', () => {
      // не даём удалить последнюю оставшуюся строку — состав не может быть пустым
      if(rosterRows.children.length > 1) row.remove();
    });
    rosterRows.appendChild(row);
  }

  // стартовый состав — сразу 3 пустые строки, дальше можно добавлять/убирать
  addRosterRow(); addRosterRow(); addRosterRow();
  rosterAddBtn.addEventListener('click', () => addRosterRow());

  function collectRoster(){
    return Array.from(rosterRows.querySelectorAll('.roster-nick'))
      .map(input => input.value.trim())
      .filter(Boolean)
      .map(nick => ({ nickname: nick, uid: findUidByNickname(nick) }));
  }

  const pageLoadedAt = Date.now();
  const MIN_FILL_TIME_MS = 3000;
  const RATE_LIMIT_MS = 10 * 60 * 1000; // одна заявка раз в 10 минут с браузера
  const RATE_LIMIT_KEY = 'ist_last_register_submit';

  // Капча: два случайных числа, генерируются при каждой загрузке страницы
  const captchaA = Math.floor(Math.random() * 8) + 2;
  const captchaB = Math.floor(Math.random() * 8) + 1;
  const captchaAnswer = captchaA + captchaB;
  const captchaLabel = document.getElementById('captcha-question');
  if(captchaLabel) captchaLabel.textContent = `Проверка: сколько будет ${captchaA} + ${captchaB}?`;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusBox.className = '';
    statusBox.textContent = '';

    // 1) honeypot — если заполнено, тихо считаем спамом
    if(form.website && form.website.value.trim() !== ''){
      statusBox.textContent = 'Заявка отправлена! Она появится на сайте после проверки организатором.';
      statusBox.className = 'form-msg success';
      form.reset();
      return;
    }

    // 2) time-trap — слишком быстрая отправка похожа на бота
    if(Date.now() - pageLoadedAt < MIN_FILL_TIME_MS){
      statusBox.textContent = 'Форма отправлена слишком быстро — попробуй ещё раз.';
      statusBox.className = 'form-msg error';
      return;
    }

    // 3) капча
    const givenAnswer = Number(form.captchaAnswer.value);
    if(givenAnswer !== captchaAnswer){
      statusBox.textContent = 'Неверный ответ на проверочный вопрос — попробуй ещё раз.';
      statusBox.className = 'form-msg error';
      return;
    }

    // 3.5) согласие с правилами сайта и турниров — обязательно
    if(form.agreeRules && !form.agreeRules.checked){
      statusBox.textContent = 'Нужно подтвердить согласие с правилами сайта и турниров, чтобы отправить заявку.';
      statusBox.className = 'form-msg error';
      return;
    }

    // 4) частота отправки с этого браузера
    try{
      const last = Number(localStorage.getItem(RATE_LIMIT_KEY) || 0);
      if(Date.now() - last < RATE_LIMIT_MS){
        const waitMin = Math.ceil((RATE_LIMIT_MS - (Date.now() - last)) / 60000);
        statusBox.textContent = `Заявка с этого устройства уже отправлялась недавно. Попробуй снова через ${waitMin} мин.`;
        statusBox.className = 'form-msg error';
        return;
      }
    }catch(e){ /* localStorage недоступен — пропускаем эту проверку */ }

    const roster = collectRoster();
    const captainName = form.captainName.value.trim();

    const data = {
      teamName: form.teamName.value.trim(),
      teamAvatar: teamAvatarDataURL,
      game: form.game.value,
      captainName,
      captainUid: findUidByNickname(captainName),
      contact: form.contact.value.trim(),
      roster,
      note: form.note.value.trim(),
      agreedRules: true,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if(!data.teamName || !data.captainName || !data.contact || roster.length < 1){
      statusBox.textContent = 'Заполни, пожалуйста, все обязательные поля и укажи хотя бы одного игрока в составе.';
      statusBox.className = 'form-msg error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    try{
      await db.collection('teamApplications').add(data);
      try{ localStorage.setItem(RATE_LIMIT_KEY, String(Date.now())); }catch(e){}
      form.reset();
      teamAvatarDataURL = '';
      renderTeamAvatarPreview();
      rosterRows.innerHTML = '';
      rosterCounter = 0;
      addRosterRow(); addRosterRow(); addRosterRow();
      statusBox.textContent = 'Заявка отправлена! Она появится на сайте после проверки организатором.';
      statusBox.className = 'form-msg success';
    }catch(err){
      console.error(err);
      statusBox.textContent = 'Не получилось отправить заявку. Попробуй ещё раз чуть позже.';
      statusBox.className = 'form-msg error';
    }finally{
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
    }
  });
});
