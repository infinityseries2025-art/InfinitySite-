# MLT Esports Platform — инструкция по деплою

## Структура проекта

```
index.html, matches.html, rankings.html, tournaments.html,
news.html, contacts.html, account.html, admin.html
match-details.html, player-profile.html, team-profile.html
firebase.json, firestore.rules, config.js, logo.jpg
assets/css/style.css
assets/js/firebase-config.js, assets/js/main.js, assets/js/i18n.js
```

## Деплой на Firebase Hosting

### Вариант 1 — через Cloud Shell

1. Загрузите все файлы проекта в Cloud Shell.
2. Запустите скрипт подготовки:
   ```bash
   chmod +x deploy-setup.sh
   ./deploy-setup.sh
   ```
3. Задеплойте:
   ```bash
   firebase deploy --only hosting
   ```

### Вариант 2 — вручную

1. Создайте структуру папки `public/`:
   ```bash
   mkdir -p public/assets/css
   mkdir -p public/assets/js
   ```
2. Скопируйте файлы:
   - все `*.html` → `public/`
   - `firebase.json`, `.firebaserc`, `config.js`, `firestore.rules`, `logo.jpg` → `public/`
   - `assets/css/style.css` → `public/assets/css/`
   - `assets/js/*.js` → `public/assets/js/`
3. Задеплойте:
   ```bash
   firebase deploy --only hosting
   ```

## Заполнение Firestore демо-данными

Откройте `populate-firestore.html` в браузере (подключается к вашему
проекту Firebase):
- «Populate Data» — добавляет демо-команды, игроков, турнир с сеткой,
  несколько матчей и новостей.
- «Clear All Data» — удаляет все данные.

## Проверка после деплоя

1. Откройте адрес хостинга — на главной должны отображаться логотип,
   топ матчей дня, ближайшие матчи, новости.
2. Проверьте переходы: матч → страница матча, команда/игрок в
   рейтинге → профиль команды/игрока.
3. Проверьте регистрацию/вход — первый зарегистрированный аккаунт
   автоматически становится администратором.
4. Откройте `/admin.html` под этим аккаунтом — должна открыться
   админ-панель со всеми вкладками (заявки, команды, игроки, матчи,
   турниры, новости, сетка, аккаунты).
