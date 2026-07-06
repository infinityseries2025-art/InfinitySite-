/* =========================================================
   Infinity Series Tournaments — общий скрипт сайта
   Ничего в этом файле редактировать НЕ нужно, чтобы:
   - поменять лого/фон  → data/config.json
   - поменять расписание → через admin.html (хранится в Firebase)
   - поменять новости     → через admin.html (хранится в Firebase);
                             data/news.json остался только как запасной
                             вариант, пока в Firebase новостей ещё нет
   - поменять состав команды → data/team.json
========================================================= */

const DATA_PATH = getBasePath() + 'data/';

function getBasePath(){
  // позволяет открывать страницы из подпапок без поломки путей
  return '';
}

async function loadJSON(name){
  try{
    const res = await fetch(DATA_PATH + name + '.json', { cache: 'no-cache' });
    if(!res.ok) throw new Error('not ok');
    return await res.json();
  }catch(e){
    console.warn('Не удалось загрузить', name, e);
    return null;
  }
}

function tryImage(url){
  return new Promise((resolve) => {
    if(!url){ resolve(false); return; }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function fmtDate(iso){
  try{
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' });
  }catch(e){ return iso; }
}

const gameLabel = { CS2:'CS2', Dota2:'Dota 2', PUBG:'PUBG' };
const gameClass = { CS2:'cs2', Dota2:'dota2', PUBG:'pubg' };

/* ---------- список игр: базовые + добавленные организатором/модератором ----------
   Хранится в Firestore, коллекция "settings", документ "games", поле "list".
   Так организатор или модератор может добавить новую дисциплину прямо
   из панели, без правки кода сайта. ---------- */
const DEFAULT_GAMES = ['CS2', 'Dota2', 'PUBG'];
async function loadGamesList(){
  if(typeof db === 'undefined') return DEFAULT_GAMES.slice();
  try{
    const snap = await db.collection('settings').doc('games').get();
    const custom = (snap.exists && Array.isArray(snap.data().list)) ? snap.data().list : [];
    const extra = custom.filter(g => g && !DEFAULT_GAMES.includes(g));
    return DEFAULT_GAMES.concat(extra);
  }catch(e){
    console.warn('Не удалось загрузить список игр', e);
    return DEFAULT_GAMES.slice();
  }
}
async function addCustomGame(name){
  name = (name || '').trim();
  if(!name || typeof db === 'undefined') return false;
  await db.collection('settings').doc('games').set({
    list: firebase.firestore.FieldValue.arrayUnion(name),
  }, { merge: true });
  return true;
}
const statusLabel = { upcoming:'Скоро', live:'Идёт сейчас', finished:'Завершён' };

/* ---------- шапка сайта: лого + фон + активная ссылка ---------- */
async function initChrome(config){
  // логотип в шапке
  const logoUrl = config?.logo || 'assets/images/logo.png';
  const logoOk = await tryImage(logoUrl);
  document.querySelectorAll('[data-role="brand-mark"]').forEach(el => {
    if(logoOk){ el.innerHTML = `<img src="${logoUrl}" alt="Логотип турнира">`; }
  });
  document.querySelectorAll('[data-role="hero-mark"]').forEach(el => {
    if(logoOk){ el.innerHTML = `<div class="hero-mark-inner"><img src="${logoUrl}" alt="Логотип турнира"></div>`; }
  });
  document.querySelectorAll('[data-role="site-name"]').forEach(el => {
    if(config?.siteName) el.textContent = config.siteName;
  });
  document.querySelectorAll('[data-role="tagline"]').forEach(el => {
    if(config?.tagline) el.textContent = config.tagline;
  });
  document.title = (document.title ? document.title + ' — ' : '') + (config?.siteName || 'Турнирный сайт');

  // фоновая картинка сайта
  const bgUrl = config?.background || '';
  const bgOk = await tryImage(bgUrl);
  if(bgOk){
    document.body.style.setProperty('--user-bg-image', `url('${bgUrl}')`);
    document.body.classList.add('has-bg-image');
  }

  // подсветка активного пункта меню
  const current = document.body.getAttribute('data-page');
  document.querySelectorAll('.nav-links a').forEach(a => {
    if(a.getAttribute('data-page') === current) a.classList.add('active');
  });

  // мобильное меню
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if(toggle && links){
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // контакты в футере
  if(config?.contacts){
    document.querySelectorAll('[data-role="footer-email"]').forEach(el => {
      el.textContent = config.contacts.email || '';
      el.href = 'mailto:' + (config.contacts.email || '');
    });
  }
}

/* ---------- аватарки: превращаем выбранный файл в компактный dataURL
   и храним прямо в документе Firestore (без Firebase Storage —
   сайт специально обходится без платных/дополнительных сервисов).
   maxDim — сторона, до которой уменьшаем картинку, quality — качество JPEG. ---------- */
function fileToCompressedDataURL(file, maxDim = 320, quality = 0.82){
  return new Promise((resolve, reject) => {
    if(!file) { resolve(''); return; }
    if(!file.type || !file.type.startsWith('image/')){
      reject(new Error('Выбери файл-картинку (JPG, PNG, WEBP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не удалось открыть картинку.'));
      img.onload = () => {
        let { width, height } = img;
        if(width > height && width > maxDim){ height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if(height > maxDim){ width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- rendere: плавное появление секций при скролле ---------- */
function initScrollReveal(){
  const els = document.querySelectorAll('.reveal');
  if(!els.length) return;
  if(!('IntersectionObserver' in window)){
    els.forEach(el => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
}

/* ---------- рендер карточки матча ---------- */
function matchCardHTML(m, i){
  const g = gameClass[m.game] || 'custom';
  const label = gameLabel[m.game] || m.game;
  const sLabel = statusLabel[m.status] || m.status;
  return `
  <div class="card match-card" style="--i:${i}">
    <div class="match-top">
      <span class="game-tag ${g}">${label}</span>
      <span class="status-tag ${m.status}">${sLabel}</span>
    </div>
    <div class="match-teams">
      <span>${m.teamA}</span>
      ${m.status === 'finished' && m.score ? `<span class="match-score">${m.score}</span>` : `<span class="vs">VS</span>`}
      <span>${m.teamB}</span>
    </div>
    <div class="match-meta">
      <span>${m.stage || ''} · ${fmtDate(m.date)}, ${m.time}</span>
      ${m.stream ? `<a href="${m.stream}" target="_blank" rel="noopener">Трансляция →</a>` : ''}
    </div>
  </div>`;
}

/* ---------- расписание: теперь хранится в Firebase (Firestore),
   коллекция "schedule" — редактируется прямо из admin.html,
   без правок кода и коммитов в git. ---------- */
async function loadSchedule(){
  if(typeof db === 'undefined') return [];
  try{
    const snap = await db.collection('schedule').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    console.warn('Не удалось загрузить расписание из Firebase', e);
    return [];
  }
}

/* ---------- новости: теперь хранятся в Firebase (Firestore), коллекция
   "news" — добавляются/редактируются прямо из admin.html. Пока в Firestore
   ничего нет (или страница открыта без настроенного Firebase), сайт
   показывает старый data/news.json, чтобы ничего не сломалось. ---------- */
async function loadNews(){
  if(typeof db !== 'undefined'){
    try{
      const snap = await db.collection('news').orderBy('date', 'desc').get();
      if(!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }catch(e){
      console.warn('Не удалось загрузить новости из Firebase', e);
    }
  }
  return (await loadJSON('news')) || [];
}

const LOADING_HTML = `<div class="empty-state">Загрузка…</div>`;

/* ---------- страница: главная ---------- */
async function renderHomePreview(){
  const upcomingWrap = document.querySelector('[data-role="home-upcoming"]');
  const newsWrap = document.querySelector('[data-role="home-news"]');
  if(upcomingWrap) upcomingWrap.innerHTML = LOADING_HTML;
  if(newsWrap) newsWrap.innerHTML = LOADING_HTML;

  const [schedule, news] = await Promise.all([loadSchedule(), loadNews()]);

  if(upcomingWrap){
    const upcoming = (schedule || []).filter(m => m.status !== 'finished').slice(0,3);
    upcomingWrap.innerHTML = upcoming.length
      ? upcoming.map((m,i) => matchCardHTML(m,i)).join('')
      : `<div class="empty-state">Ближайших матчей пока нет — загляните позже.</div>`;
  }

  if(newsWrap){
    const items = (news || []).slice(0,3);
    newsWrap.innerHTML = items.length
      ? items.map((n,i) => newsCardHTML(n,i)).join('')
      : `<div class="empty-state">Новостей пока нет.</div>`;
  }
}

/* ---------- страница: расписание ---------- */
async function renderSchedulePage(){
  const wrap = document.querySelector('[data-role="schedule-list"]');
  if(!wrap) return;
  wrap.innerHTML = LOADING_HTML;
  const schedule = (await loadSchedule()) || [];
  schedule.sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));

  function draw(filter){
    const filtered = filter === 'all' ? schedule : schedule.filter(m => m.game === filter);
    wrap.innerHTML = filtered.length
      ? filtered.map((m,i) => matchCardHTML(m,i)).join('')
      : `<div class="empty-state">Матчей по этому фильтру нет.</div>`;
  }
  draw('all');

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draw(btn.getAttribute('data-filter'));
    });
  });
}

/* ---------- страница: новости ---------- */
function newsCardHTML(n, i){
  return `
  <div class="card news-card" style="--i:${i}">
    <div class="thumb">${n.image ? `<img src="${n.image}" alt="${n.title}">` : 'Infinity Series Tournaments'}</div>
    <div class="body">
      <div class="date">${fmtDate(n.date)}</div>
      <h3>${n.title}</h3>
      <p>${n.excerpt || ''}</p>
    </div>
  </div>`;
}
async function renderNewsPage(){
  const wrap = document.querySelector('[data-role="news-list"]');
  if(!wrap) return;
  wrap.innerHTML = LOADING_HTML;
  const news = (await loadNews()) || [];
  news.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  wrap.innerHTML = news.length ? news.map((n,i) => newsCardHTML(n,i)).join('') : `<div class="empty-state">Новостей пока нет.</div>`;
}

/* ---------- страница: команда ---------- */
function teamCardHTML(t, i){
  const initials = (t.name || '').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  return `
  <div class="card team-card" style="--i:${i}">
    <div class="team-avatar"><div class="team-avatar-inner">${t.photo ? `<img src="${t.photo}" alt="${t.name}">` : initials}</div></div>
    <h3>${t.name}</h3>
    <div class="role">${t.role || ''}</div>
    <div class="socials">
      ${t.socials?.faceit ? `<a href="${t.socials.faceit}" target="_blank" rel="noopener">FACEIT</a>` : ''}
      ${t.socials?.telegram ? `<a href="${t.socials.telegram}" target="_blank" rel="noopener">TG</a>` : ''}
      ${t.socials?.vk ? `<a href="${t.socials.vk}" target="_blank" rel="noopener">VK</a>` : ''}
      ${t.socials?.twitch ? `<a href="${t.socials.twitch}" target="_blank" rel="noopener">TWITCH</a>` : ''}
    </div>
  </div>`;
}
async function renderTeamPage(){
  const wrap = document.querySelector('[data-role="team-list"]');
  if(!wrap) return;
  const team = (await loadJSON('team')) || [];
  wrap.innerHTML = team.length ? team.map((t,i) => teamCardHTML(t,i)).join('') : `<div class="empty-state">Состав скоро появится.</div>`;
}

/* ---------- страница: контакты ---------- */
async function renderContactsPage(config){
  const wrap = document.querySelector('[data-role="contacts-list"]');
  if(!wrap || !config) return;
  const c = config.contacts || {};
  const rows = [
    c.email ? ['✉️', 'Email', `<a href="mailto:${c.email}">${c.email}</a>`] : null,
    c.phone ? ['📞', 'Телефон', `<a href="tel:${c.phone.replace(/\s/g,'')}">${c.phone}</a>`] : null,
    c.telegram ? ['💬', 'Telegram', `<a href="${c.telegram}" target="_blank" rel="noopener">${c.telegram}</a>`] : null,
    c.discord ? ['🎮', 'Discord', `<a href="${c.discord}" target="_blank" rel="noopener">${c.discord}</a>`] : null,
    c.vk ? ['🔵', 'VK', `<a href="${c.vk}" target="_blank" rel="noopener">${c.vk}</a>`] : null,
    c.youtube ? ['▶️', 'YouTube', `<a href="${c.youtube}" target="_blank" rel="noopener">${c.youtube}</a>`] : null,
    c.twitch ? ['🟣', 'Twitch', `<a href="${c.twitch}" target="_blank" rel="noopener">${c.twitch}</a>`] : null,
    c.faceit ? ['🏆', 'Faceit турнир', `<a href="${c.faceit}" target="_blank" rel="noopener">${c.faceit}</a>`] : null,
  ].filter(Boolean);
  wrap.innerHTML = rows.map(([ic,label,val]) => `
    <div class="contact-row">
      <div class="ic">${ic}</div>
      <div><div style="font-size:12px;color:var(--color-ink-soft)">${label}</div><span>${val}</span></div>
    </div>`).join('');
}

/* ---------- подсветка кнопки «Аккаунт»: сигнал об одобренной заявке ----------
   Работает на всех страницах, где подключён Firebase (везде, кроме
   contacts.html и team.html — там его просто нет, поэтому функция
   безопасно ничего не делает). Как только человек открывает свой
   кабинет и видит статус заявки (см. loadApplicationStatus в account.js),
   она помечает одобренные заявки как «увиденные» в localStorage —
   и подсветка гаснет на всех страницах при следующей загрузке. */
function normalizeRosterNav(roster){
  if(Array.isArray(roster)) return roster;
  if(typeof roster === 'string'){
    return roster.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(nickname => ({ nickname, uid: null }));
  }
  return [];
}

function checkNavAlert(){
  if(typeof auth === 'undefined' || typeof db === 'undefined') return;
  const accountLink = document.querySelector('.nav-links a[data-page="account"]');
  if(!accountLink) return;

  auth.onAuthStateChanged(async (user) => {
    accountLink.classList.remove('nav-alert');
    if(!user) return;
    try{
      const snap = await db.collection('teamApplications')
        .where('status', '==', 'approved')
        .get();
      let hasUnseen = false;
      snap.forEach(doc => {
        const d = doc.data();
        const roster = normalizeRosterNav(d.roster);
        const isMember = d.captainUid === user.uid || roster.some(p => p.uid === user.uid);
        if(!isMember) return;
        let seen = false;
        try{ seen = localStorage.getItem('ist_seen_approved_' + doc.id) === '1'; }catch(e){}
        if(!seen) hasUnseen = true;
      });
      if(hasUnseen) accountLink.classList.add('nav-alert');
    }catch(err){
      console.warn('Не удалось проверить статус заявок для подсветки кнопки «Аккаунт»', err);
    }
  });
}

/* ---------- инициализация страницы ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadJSON('config');
  await initChrome(config);
  await Promise.all([
    renderHomePreview(),
    renderSchedulePage(),
    renderNewsPage(),
    renderTeamPage(),
    renderContactsPage(config),
  ]);
  initScrollReveal();
  checkNavAlert();

  const form = document.querySelector('#contact-form');
  if(form){
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = config?.contacts?.email || 'info@example.com';
      const name = form.querySelector('[name="name"]').value;
      const msg = form.querySelector('[name="message"]').value;
      window.location.href = `mailto:${email}?subject=${encodeURIComponent('Сообщение с сайта от ' + name)}&body=${encodeURIComponent(msg)}`;
    });
  }
});
