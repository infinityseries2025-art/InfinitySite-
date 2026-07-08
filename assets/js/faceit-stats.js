/* =========================================================
   ЖИВАЯ СТАТИСТИКА FACEIT ДЛЯ ПРОФИЛЯ УЧАСТНИКА
   Используется на account.html?u=UID (публичный профиль игрока).

   ЧТО НУЖНО СДЕЛАТЬ, ЧТОБЫ ЭТО ЗАРАБОТАЛО:
   1. Зайти на https://developers.faceit.com → войти под своим FACEIT-аккаунтом.
   2. Create new app → любое имя → тип "Server-side app".
   3. Скопировать API key (Server-side / Application key) и вписать его
      вместо строки ниже, между кавычками.

   ВАЖНО про этот ключ: это НЕ секретный ключ вроде пароля от аккаунта —
   он даёт доступ только к ЧТЕНИЮ публичной статистики FACEIT (обычный
   вариант для статических сайтов на GitHub Pages, здесь просто негде
   спрятать ключ на сервере). Риск — что кто-то скопирует его из кода
   страницы и будет тратить лимит запросов FACEIT (у Data API он щедрый,
   на практике для сайта турнира этого достаточно с большим запасом).
========================================================= */
const FACEIT_API_KEY = "ВСТАВЬ_СЮДА_СВОЙ_КЛЮЧ_С_developers.faceit.com";
const FACEIT_API_BASE = "https://open.faceit.com/data/v4";

/* Достаём ник игрока из ссылки на профиль вида
   https://www.faceit.com/ru/players/NICKNAME
   https://www.faceit.com/en/players/NICKNAME/stats/cs2 */
function extractFaceitNickname(url){
  if(!url) return null;
  const m = String(url).match(/faceit\.com\/[a-z-]+\/players\/([^\/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function clamp01(v){ return Math.max(0, Math.min(1, v)); }
function normalizeStat(v, lo, hi){ return clamp01((v - lo) / (hi - lo)); }

/* Собственная "оценка в звёздах" сайта (1-5, с шагом 0.5) — считается
   из K/D, винрейта и % хедшотов. Это НЕ официальный показатель FACEIT
   (у них такой публично через API не отдаётся) — честно подписываем это
   в интерфейсе, чтобы не выдавать за официальные данные. */
function computeFaceitStars({ kd, winRate, hsRate }){
  const nKd = normalizeStat(kd, 0.7, 1.3);
  const nWr = normalizeStat(winRate, 40, 65);
  const nHs = normalizeStat(hsRate, 25, 55);
  const score = nKd * 0.45 + nWr * 0.35 + nHs * 0.20;
  const stars = 1 + score * 4;
  return Math.round(stars * 2) / 2;
}

async function faceitFetch(path){
  const res = await fetch(FACEIT_API_BASE + path, {
    headers: { Authorization: 'Bearer ' + FACEIT_API_KEY }
  });
  if(!res.ok) throw new Error('faceit-api-error-' + res.status);
  return res.json();
}

/* Главная функция: рисует карточку статистики внутри container.
   faceitUrl — ссылка на профиль игрока на faceit.com (как её вписывают
   в форме регистрации команды или в личном профиле пользователя). */
async function renderFaceitStatsCard(container, faceitUrl){
  if(!container) return;
  container.innerHTML = '';
  if(!faceitUrl) return;

  if(!FACEIT_API_KEY || FACEIT_API_KEY.indexOf('ВСТАВЬ_СЮДА') === 0){
    container.innerHTML = '<div class="faceit-stat-error">Чтобы здесь показывалась живая статистика FACEIT, впиши свой API-ключ в assets/js/faceit-stats.js (переменная FACEIT_API_KEY, инструкция в комментарии в начале файла).</div>';
    return;
  }

  const nickname = extractFaceitNickname(faceitUrl);
  if(!nickname){
    container.innerHTML = '<div class="faceit-stat-error">Не получилось распознать ник в ссылке на FACEIT — ожидается ссылка вида faceit.com/ru/players/НИК.</div>';
    return;
  }

  container.innerHTML = '<div class="faceit-stat-loading">Загружаем статистику FACEIT…</div>';

  try{
    const player = await faceitFetch('/players?nickname=' + encodeURIComponent(nickname) + '&game=cs2');
    const game = (player.games && player.games.cs2) || {};

    let life = {};
    try{
      const statsRes = await faceitFetch('/players/' + player.player_id + '/stats/cs2');
      life = (statsRes && statsRes.lifetime) || {};
    }catch(e){ /* у игрока может не быть сыгранных матчей — карточку всё равно покажем */ }

    const kd = parseFloat(life['Average K/D Ratio']);
    const winRate = parseFloat(life['Win Rate %']);
    const hsRate = parseFloat(life['Average Headshots %']);
    const matches = life['Matches'];
    const hasFullStats = Number.isFinite(kd) && Number.isFinite(winRate) && Number.isFinite(hsRate);

    let starsBlock = '';
    if(hasFullStats){
      const stars = computeFaceitStars({ kd, winRate, hsRate });
      const pct = Math.round((stars / 5) * 100);
      starsBlock =
        '<div class="faceit-star-row">' +
          '<span class="star-rating" style="--pct:' + pct + '%">★★★★★</span>' +
          '<span class="faceit-star-value">' + stars.toFixed(1) + '</span>' +
        '</div>' +
        '<div class="faceit-star-note">Оценка сайта на основе K/D, винрейта и % хедшотов — не официальный показатель FACEIT</div>';
    }

    container.innerHTML =
      '<div class="faceit-stat-card">' +
        '<div class="faceit-stat-head">' +
          (player.avatar ? ('<img class="faceit-stat-avatar" src="' + player.avatar + '" alt="' + player.nickname + '">') : '') +
          '<div>' +
            '<div class="faceit-stat-name">' + player.nickname +
              (game.skill_level ? ('<span class="faceit-level">Ур. ' + game.skill_level + '</span>') : '') +
            '</div>' +
            '<div class="faceit-stat-elo">' + (game.faceit_elo ? (game.faceit_elo + ' ELO') : '') + '</div>' +
          '</div>' +
          '<a class="faceit-stat-link" href="' + faceitUrl + '" target="_blank" rel="noopener">FACEIT ↗</a>' +
        '</div>' +
        (hasFullStats ?
          ('<div class="faceit-stat-grid">' +
            '<div class="faceit-stat-item"><span class="faceit-stat-value">' + kd.toFixed(2) + '</span><span class="faceit-stat-label">K/D</span></div>' +
            '<div class="faceit-stat-item"><span class="faceit-stat-value">' + Math.round(winRate) + '%</span><span class="faceit-stat-label">Винрейт</span></div>' +
            '<div class="faceit-stat-item"><span class="faceit-stat-value">' + Math.round(hsRate) + '%</span><span class="faceit-stat-label">ХС</span></div>' +
          '</div>')
          : '<div class="faceit-stat-error" style="margin-top:10px;">У игрока пока нет сыгранных матчей CS2 на FACEIT — детальная статистика появится после первых игр.</div>') +
        starsBlock +
        (matches ? ('<div class="faceit-stat-matches">Матчей: ' + matches + '</div>') : '') +
      '</div>';
  }catch(err){
    console.error('Не удалось загрузить статистику FACEIT:', err);
    container.innerHTML = '<div class="faceit-stat-error">Не удалось загрузить статистику FACEIT для этого профиля (неверная ссылка, неверный API-ключ или временная ошибка). Открой консоль браузера (F12) для подробностей.</div>';
  }
}
