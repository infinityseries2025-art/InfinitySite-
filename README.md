# MLT Esports Platform

Многостраничный сайт киберспортивной лиги MLT: расписание матчей,
статистика игроков и команд, турнирные сетки, рейтинги, новости.

## Технологии

- Статические HTML-страницы + общий `assets/js/main.js` и `assets/css/style.css`
- База данных: **Firebase Firestore** (+ Firebase Auth для входа)
- Работает на бесплатном плане Firebase **Spark** — Cloud Functions и
  Storage не используются:
  - лого команды и фото профиля — сжимаются на клиенте и хранятся как
    base64 прямо в документе Firestore;
  - обложка турнира и фото новости — тоже base64-файл, загружаемый
    через обычный `<input type="file">` в админке.

## Структура Firestore

```
users/{uid}
  email, nickname, role: "user" | "admin",
  teamId: string|null
  telegram, discord, faceitNickname, faceitElo, faceitLevel
  createdAt

teams/{teamId}
  name, logoUrl, ownerUid, status: "pending"|"approved"|"rejected"
  main: [ {nick, realName?}, ... ]      // 5 основных
  reserve: [ {nick, realName?}, ... ]   // до 2 запасных
  rating, elo, winrate, trophies: [{tournamentId, tournamentName, wonAt}],
  form: ["W","L",...], mapWinrate: { [mapName]: {wins, losses} }

players/{playerId}
  nick, teamId, weapon,
  kd, adr, kast, rating, formGraph, matchIds,
  trophies: [{tournamentId, tournamentName, wonAt}]

tournaments/{tournamentId}
  name, period, prizePool, status: "upcoming"|"live"|"done",
  bannerUrl, pinned: boolean, bracketType: "single"|"bo1"|"bo3"|"bo5"|"swiss"|"league",
  regOpen: boolean, registeredTeamIds: [teamId],
  bracket: { rounds: [...] }, winnerTeamId

matches/{matchId}
  tournamentId, teamA, teamB, format: "BO1"|"BO3"|"BO5",
  startAt, status: "upcoming"|"live"|"finished",
  streamUrl, score: [a,b] | null,
  maps: [ {name, score, rounds, winnerTeamId, playerStats: {...}} ]

news/{newsId}
  title, excerpt, body, tag, imageUrl, publishedAt

teamRegistrations/{regId}
  tournamentId, teamId, contactInfo, status: "pending"|"approved"|"rejected"

messages/{id}
  контактная форма
```

Статистика игроков/команд, Elo и трофеи пересчитываются автоматически
на клиенте при вводе результата матча или завершении турнира —
отдельного бэкенда для этого не требуется.

## Первый запуск

1. В консоли Firebase (Firestore → Rules) вставить содержимое
   `firestore.rules` и опубликовать.
2. Открыть сайт и зарегистрироваться — первый когда-либо
   зарегистрированный пользователь автоматически становится админом.
3. В админ-панели можно импортировать демо-данные (кнопка доступна,
   пока коллекция команд пуста) или сразу вносить свои команды,
   игроков, турниры.
4. Деплой на Firebase Hosting: `firebase login`, затем
   `firebase deploy --only hosting` (см. `deploy-setup.sh`).

## Faceit Elo

Обновление Elo с Faceit работает через GitHub Actions по расписанию
(без Cloud Functions) — подробности и настройка секретов в
`FACEIT_SETUP.md`.

## Известные упрощения

- Первый зарегистрированный пользователь становится админом — нужно
  зарегистрировать администратора сразу после запуска, до того как
  ссылку увидит кто-то ещё.
- Автообновление статуса матча upcoming → live выполняется клиентским
  таймером при заходе на страницу (без серверного планировщика).
- Редактор турнирной сетки: одиночное выбывание строится и
  прогрессирует автоматически из заявок команд; швейцарская система и
  круговая (лиговая) таблица считаются на основе введённых счетов пар.
