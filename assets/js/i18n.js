/* ==================================================================
   MLT — словарь переводов (RU/EN)
   Пользовательский контент (названия команд/турниров/новостей, ники
   игроков) сюда НЕ входит — он берётся из Firestore как есть.
================================================================== */

export const I18N = {
  ru: {
    // Навигация / шапка / футер
    navHome: "Главная", navMatches: "Матчи", navRankings: "Рейтинги",
    navTournaments: "Турниры", navNews: "Новости", navContacts: "Контакты",
    adminPanelTitle: "Админ-панель", btnLogin: "Войти", footerRights: "All rights reserved — MLT",

    // Главная / hero
    heroEyebrow: "MLT · ESPORTS LEAGUE",
    heroTitleLine1: "Турниры, статистика", heroTitleLine2: "и матчи",
    heroTagline: "в одном месте",
    heroDesc: "Платформа лиги MLT: расписание матчей, автоматическая статистика игроков и команд, турнирные сетки и рейтинги. Всё обновляется само — админ вносит только результат.",
    heroBtnMatches: "Смотреть матчи", heroBtnNext: "Ближайший матч",
    sidePriority: "Приоритет №1",
    eyebrowUpcoming: "Ближайшие матчи", titleMatches: "Матчи", linkMoreMatches: "Все матчи →",
    eyebrowMedia: "Медиа", titleNews: "Последние новости", linkMoreNews: "Все новости →",
    emptyUpcoming: "Нет предстоящих матчей", emptyHomeNews: "Нет новостей",
    loadingMatches: "Загрузка матчей...", loadingNews: "Загрузка новостей...",

    // Матчи
    pageMatchesTitle: "Матчи", tabUpcoming: "Ожидаются", tabLive: "В эфире", tabResults: "Результаты",
    emptyLive: "Сейчас нет матчей в эфире", emptyResults: "Пока нет результатов",

    // Рейтинги
    pageRankingsTitle: "Рейтинги", tabTeams: "Команды", tabPlayers: "Игроки",
    thRank: "#", thTeam: "Команда", thWinrate: "Винрейт", thRating: "Рейтинг", thTrophies: "Трофеи",
    thPlayer: "Игрок", thKD: "K/D", thADR: "ADR", thKAST: "KAST",
    loadingTeamsTable: "Загрузка рейтинга команд...", loadingPlayersTable: "Загрузка рейтинга игроков...",

    // Турниры
    pageTournamentsTitle: "Турниры", tabTourUpcoming: "Идут / скоро", tabTourDone: "Завершены",
    loadingTournaments: "Загрузка турниров...", emptyTournaments: "Пока нет турниров",
    emptyTournamentsDone: "Пока нет завершённых турниров",
    statusLive: "В эфире", statusUpcoming: "Скоро", statusDone: "Завершён",
    btnRegister: "Регистрация", prizeLabel: "Приз", teamsCountSuffix: "команд",

    // Новости
    pageNewsTitle: "Новости", emptyNewsFull: "Пока нет новостей", filterAll: "Все",

    // Контакты
    pageContactsTitle: "Контакты",
    contactsIntro: "По вопросам турниров, регистрации команд, партнёрства и технической поддержки — напишите нам удобным способом или заполните форму ниже.",
    contactUsTitle: "Связаться с нами", labelEmail: "Email", labelTelegram: "Telegram", labelDiscord: "Discord",
    feedbackTitle: "Обратная связь", labelYourName: "Ваше имя", placeholderYourName: "Как к вам обращаться",
    labelReplyEmail: "Email для ответа", placeholderReplyEmail: "you@example.com",
    labelMessage: "Сообщение", placeholderMessage: "Опишите ваш вопрос или предложение",
    btnSendMessage: "Отправить сообщение", msgSending: "Отправка…",
    msgSent: "Сообщение отправлено!", msgSendError: "Произошла ошибка при отправке сообщения.",

    // Auth modal
    authTabLogin: "Вход", authTabRegister: "Регистрация", labelPassword: "Пароль",
    labelNickname: "Никнейм", placeholderNicknameAuto: "Оставьте пустым для автогенерации",
    btnCreateAccount: "Создать аккаунт",

    // Profile modal
    profileTitle: "Профиль", btnSaveNickname: "Сохранить никнейм",
    myTeamTitle: "Моя команда", teamTitleNoTeam: "Команда", noTeamYet: "У вас пока нет своей команды.",
    btnCreateTeam: "Создать команду", btnOpenTeam: "Открыть →", btnEditRoster: "Редактировать состав",
    contactsSectionTitle: "Контакты", labelFaceitNickname: "Ник на Faceit",
    btnSaveContacts: "Сохранить контакты",
    faceitBlockTitle: "Faceit", labelFaceitElo: "Elo", labelFaceitLevel: "Уровень",
    faceitNoData: "Данные ещё не подтягивались.", faceitLastUpdated: "Обновлено",
    btnUpdateFaceit: "Обновить Elo с Faceit",
    faceitUpdatePending: "Запрос принят — обновится в течение ~30 минут.",
    faceitNeedNickname: "Сначала укажите ник на Faceit и сохраните контакты.",
    btnLogout: "Выйти из аккаунта",

    // Create/Edit team modal
    createTeamTitle: "Создать команду", editTeamTitle: "Редактировать состав",
    labelTeamName: "Название команды", labelLogoOptional: "Логотип (необязательно)",
    labelMainRoster: "Основной состав — 5 игроков", labelReserveRoster: "Запасные — до 2 (необязательно)",
    placeholderMainPlayer: "Ник игрока", placeholderReservePlayer: "Ник запасного",
    btnCreateTeamSubmit: "Создать команду", btnSaveTeam: "Сохранить изменения",
    createTeamHintTournament: "Сначала создайте команду — после этого заявка на турнир отправится автоматически.",

    // Tournament reg modal
    tournamentRegTitle: "Заявка на турнир", labelContact: "Контакт для связи (Telegram, Discord и т.п.)",
    btnSubmitRequest: "Подать заявку",

    // Detail pages
    backToMatches: "← Назад к матчам", backToRankings: "← Назад к рейтингам", backToTournaments: "← Назад к турнирам",
    matchDetailsTitle: "Детали матча", playerProfileTitle: "Профиль игрока", teamProfileTitle: "Профиль команды",
    tournamentDetailsTitle: "Турнир",
    loadingMatchDetails: "Загрузка деталей матча...", loadingProfile: "Загрузка профиля...",
    matchNotFound: "Матч не найден", teamNotFound: "Команда не найдена", playerNotFound: "Игрок не найден",
    tournamentNotFound: "Турнир не найден",
    tdTabBracket: "Сетка", tdTabParticipants: "Участники", tdTabMatches: "Матчи", tdTabTop5: "Топ-5 игроков",
    tdNoBracket: "Сетка турнира ещё не сформирована", tdChampion: "Чемпион сетки",
    tdNoParticipants: "Пока нет участников", tdNoMatches: "Пока нет матчей", tdNoTop5: "Пока нет данных по игрокам",
    loadingGeneric: "Загрузка...",
    labelResult: "ИТОГ", labelVs: "VS", resultEnteredLabel: "Результат внесён",
    compositionOf: "состав", noRoster: "Состав не указан",
    mapResultsTitle: "Результаты по картам",
    statHeadPlayer: "Игрок", statHeadK: "K", statHeadD: "D", statHeadA: "A",
    statHeadDMG: "DMG", statHeadADR: "ADR", statHeadKAST: "KAST", statHeadRating: "Rating",
    noStatsData: "Нет данных по составу",
    noTeamShort: "Без команды", matchesOfPlayer: "Матчи игрока", noMatches: "Нет матчей",
    weaponTitle: "Оружие", weaponNotSet: "Не указано",
    formTitle: "Форма (последние матчи)", matchLabelShort: "Матч", noFormData: "Нет данных",
    lastMatches: "Последние матчи", compositionTitle: "Состав", mapStatsTitle: "Статистика по картам",
    winrateLabel: "Винрейт", ratingLabel: "Рейтинг", trophiesLabel: "Трофеи", playersLabel: "Игроков", noTrophiesYet: "Пока нет трофеев",

    // Admin (базовые статические подписи)
    adminAccessDenied: "Доступ только для администраторов.",
    adminLoginRequired: "Войдите как администратор, чтобы получить доступ к панели.",
    adminManaging: "Управление реальными данными сайта (Firestore).",
    adminTabRequests: "Заявки на регистрацию", adminTabTeams: "Команды", adminTabPlayers: "Игроки",
    adminTabMatches: "Матчи", adminTabTournaments: "Турниры", adminTabNews: "Новости",
    adminTabBracket: "Сетка турниров",
    adminNoRequests: "Нет новых заявок", btnAccept: "Принять", btnReject: "Отклонить",
    adminNoTeams: "Пока нет команд", adminNoPlayers: "Пока нет игроков",
    adminNoMatches: "Пока нет матчей", adminNoTournaments: "Пока нет турниров", adminNoNews: "Пока нет новостей",
    btnAddTeamShort: "+ Добавить команду", btnAddPlayerShort: "+ Добавить игрока",
    btnAddMatchShort: "+ Создать матч", btnAddTournamentShort: "+ Создать турнир",
    btnAddNewsShort: "+ Опубликовать",
    adminTabTeamModeration: "Команды на модерации", adminNoTeamModeration: "Нет новых команд на модерации",
    adminAllTeams: "Все команды", teamStatusPending: "На модерации", teamStatusApproved: "Одобрена",
    teamStatusRejected: "Отклонена",

    // Личный кабинет (account.html)
    accountTitle: "Личный кабинет", accountLoginRequired: "Войдите в аккаунт, чтобы открыть личный кабинет.",
    accountBtnLogin: "Войти", accountMemberSince: "На платформе с",
    accountTabInfo: "Инфо", accountTabTeam: "Моя команда", accountTabFaceit: "Faceit и контакты",
    accountUploadPhoto: "Загрузить фото", accountChangePhoto: "Изменить фото",
    accountPhotoHint: "JPG/PNG, автоматически сжимается перед сохранением",
    accountNicknameTitle: "Никнейм", accountRoleAdmin: "Администратор", accountRoleUser: "Игрок",
    accountTeamStatusPendingNote: "Команда отправлена на модерацию. После проверки администратором она появится в общем рейтинге и сможет подавать заявки на турниры.",
    accountTeamStatusRejectedNote: "Заявку на создание команды отклонили. Проверьте состав/название и отправьте заново — при сохранении изменений команда снова уйдёт на модерацию.",
    accountNoTeamDesc: "Создайте команду, чтобы участвовать в турнирах MLT.",
    accountLogoutFull: "Выйти из аккаунта",
    createTeamModerationNote: "После отправки команда будет проверена администратором и появится на сайте после одобрения.",
    teamPendingModerationTitle: "Команда на модерации", teamPendingModerationDesc: "Эта команда ещё не прошла проверку администратора и пока не видна в общем рейтинге.",
    teamRejectedTitle: "Заявка отклонена", teamRejectedDesc: "Администратор отклонил заявку на создание этой команды.",
    tournamentRegNeedApprovedTeam: "Ваша команда ещё на модерации — дождитесь одобрения администратора, чтобы подавать заявки на турниры.",
  },

  en: {
    navHome: "Home", navMatches: "Matches", navRankings: "Rankings",
    navTournaments: "Tournaments", navNews: "News", navContacts: "Contacts",
    adminPanelTitle: "Admin panel", btnLogin: "Log in", footerRights: "All rights reserved — MLT",

    heroEyebrow: "MLT · ESPORTS LEAGUE",
    heroTitleLine1: "Tournaments, stats", heroTitleLine2: "and matches",
    heroTagline: "in one place",
    heroDesc: "The MLT league platform: match schedule, automatic player and team stats, tournament brackets and rankings. Everything updates itself — the admin only enters the result.",
    heroBtnMatches: "Watch matches", heroBtnNext: "Next match",
    sidePriority: "Priority #1",
    eyebrowUpcoming: "Upcoming matches", titleMatches: "Matches", linkMoreMatches: "All matches →",
    eyebrowMedia: "Media", titleNews: "Latest news", linkMoreNews: "All news →",
    emptyUpcoming: "No upcoming matches", emptyHomeNews: "No news yet",
    loadingMatches: "Loading matches...", loadingNews: "Loading news...",

    pageMatchesTitle: "Matches", tabUpcoming: "Upcoming", tabLive: "Live", tabResults: "Results",
    emptyLive: "No matches live right now", emptyResults: "No results yet",

    pageRankingsTitle: "Rankings", tabTeams: "Teams", tabPlayers: "Players",
    thRank: "#", thTeam: "Team", thWinrate: "Winrate", thRating: "Rating", thTrophies: "Trophies",
    thPlayer: "Player", thKD: "K/D", thADR: "ADR", thKAST: "KAST",
    loadingTeamsTable: "Loading team rankings...", loadingPlayersTable: "Loading player rankings...",

    pageTournamentsTitle: "Tournaments", tabTourUpcoming: "Ongoing / upcoming", tabTourDone: "Finished",
    loadingTournaments: "Loading tournaments...", emptyTournaments: "No tournaments yet",
    emptyTournamentsDone: "No finished tournaments yet",
    statusLive: "Live", statusUpcoming: "Soon", statusDone: "Finished",
    btnRegister: "Register", prizeLabel: "Prize", teamsCountSuffix: "teams",

    pageNewsTitle: "News", emptyNewsFull: "No news yet", filterAll: "All",

    pageContactsTitle: "Contacts",
    contactsIntro: "For questions about tournaments, team registration, partnerships or technical support — reach out however is convenient, or fill in the form below.",
    contactUsTitle: "Get in touch", labelEmail: "Email", labelTelegram: "Telegram", labelDiscord: "Discord",
    feedbackTitle: "Feedback", labelYourName: "Your name", placeholderYourName: "How should we address you",
    labelReplyEmail: "Reply email", placeholderReplyEmail: "you@example.com",
    labelMessage: "Message", placeholderMessage: "Describe your question or suggestion",
    btnSendMessage: "Send message", msgSending: "Sending…",
    msgSent: "Message sent!", msgSendError: "An error occurred while sending the message.",

    authTabLogin: "Log in", authTabRegister: "Register", labelPassword: "Password",
    labelNickname: "Nickname", placeholderNicknameAuto: "Leave empty to auto-generate",
    btnCreateAccount: "Create account",

    profileTitle: "Profile", btnSaveNickname: "Save nickname",
    myTeamTitle: "My team", teamTitleNoTeam: "Team", noTeamYet: "You don't have a team yet.",
    btnCreateTeam: "Create team", btnOpenTeam: "Open →", btnEditRoster: "Edit roster",
    contactsSectionTitle: "Contacts", labelFaceitNickname: "Faceit nickname",
    btnSaveContacts: "Save contacts",
    faceitBlockTitle: "Faceit", labelFaceitElo: "Elo", labelFaceitLevel: "Level",
    faceitNoData: "Not fetched yet.", faceitLastUpdated: "Updated",
    btnUpdateFaceit: "Update Elo from Faceit",
    faceitUpdatePending: "Request received — will update within ~30 minutes.",
    faceitNeedNickname: "Enter your Faceit nickname and save contacts first.",
    btnLogout: "Log out",

    createTeamTitle: "Create team", editTeamTitle: "Edit roster",
    labelTeamName: "Team name", labelLogoOptional: "Logo (optional)",
    labelMainRoster: "Main roster — 5 players", labelReserveRoster: "Substitutes — up to 2 (optional)",
    placeholderMainPlayer: "Player nickname", placeholderReservePlayer: "Substitute nickname",
    btnCreateTeamSubmit: "Create team", btnSaveTeam: "Save changes",
    createTeamHintTournament: "Create a team first — the tournament request will be sent automatically afterwards.",

    tournamentRegTitle: "Tournament request", labelContact: "Contact info (Telegram, Discord, etc.)",
    btnSubmitRequest: "Submit request",

    backToMatches: "← Back to matches", backToRankings: "← Back to rankings", backToTournaments: "← Back to tournaments",
    matchDetailsTitle: "Match details", playerProfileTitle: "Player profile", teamProfileTitle: "Team profile",
    tournamentDetailsTitle: "Tournament",
    loadingMatchDetails: "Loading match details...", loadingProfile: "Loading profile...",
    matchNotFound: "Match not found", teamNotFound: "Team not found", playerNotFound: "Player not found",
    tournamentNotFound: "Tournament not found",
    tdTabBracket: "Bracket", tdTabParticipants: "Participants", tdTabMatches: "Matches", tdTabTop5: "Top 5 players",
    tdNoBracket: "The bracket hasn't been set up yet", tdChampion: "Bracket champion",
    tdNoParticipants: "No participants yet", tdNoMatches: "No matches yet", tdNoTop5: "No player data yet",
    loadingGeneric: "Loading...",
    labelResult: "FINAL", labelVs: "VS", resultEnteredLabel: "Result entered",
    compositionOf: "roster", noRoster: "Roster not set",
    mapResultsTitle: "Map results",
    statHeadPlayer: "Player", statHeadK: "K", statHeadD: "D", statHeadA: "A",
    statHeadDMG: "DMG", statHeadADR: "ADR", statHeadKAST: "KAST", statHeadRating: "Rating",
    noStatsData: "No roster data",
    noTeamShort: "No team", matchesOfPlayer: "Player's matches", noMatches: "No matches",
    weaponTitle: "Weapon", weaponNotSet: "Not set",
    formTitle: "Form (recent matches)", matchLabelShort: "Match", noFormData: "No data",
    lastMatches: "Recent matches", compositionTitle: "Roster", mapStatsTitle: "Map stats",
    winrateLabel: "Winrate", ratingLabel: "Rating", trophiesLabel: "Trophies", playersLabel: "Players", noTrophiesYet: "No trophies yet",

    adminAccessDenied: "Admins only.",
    adminLoginRequired: "Log in as an administrator to access the panel.",
    adminManaging: "Managing the site's live data (Firestore).",
    adminTabRequests: "Registration requests", adminTabTeams: "Teams", adminTabPlayers: "Players",
    adminTabMatches: "Matches", adminTabTournaments: "Tournaments", adminTabNews: "News",
    adminTabBracket: "Tournament bracket",
    adminNoRequests: "No new requests", btnAccept: "Accept", btnReject: "Reject",
    adminNoTeams: "No teams yet", adminNoPlayers: "No players yet",
    adminNoMatches: "No matches yet", adminNoTournaments: "No tournaments yet", adminNoNews: "No news yet",
    btnAddTeamShort: "+ Add team", btnAddPlayerShort: "+ Add player",
    btnAddMatchShort: "+ Create match", btnAddTournamentShort: "+ Create tournament",
    btnAddNewsShort: "+ Publish",
    adminTabTeamModeration: "Teams pending moderation", adminNoTeamModeration: "No new teams to review",
    adminAllTeams: "All teams", teamStatusPending: "Pending review", teamStatusApproved: "Approved",
    teamStatusRejected: "Rejected",

    // Account cabinet (account.html)
    accountTitle: "Account", accountLoginRequired: "Sign in to open your account cabinet.",
    accountBtnLogin: "Log in", accountMemberSince: "Member since",
    accountTabInfo: "Info", accountTabTeam: "My team", accountTabFaceit: "Faceit & contacts",
    accountUploadPhoto: "Upload photo", accountChangePhoto: "Change photo",
    accountPhotoHint: "JPG/PNG, compressed automatically before saving",
    accountNicknameTitle: "Nickname", accountRoleAdmin: "Administrator", accountRoleUser: "Player",
    accountTeamStatusPendingNote: "Your team was submitted for moderation. Once an admin approves it, it will appear in public rankings and can apply to tournaments.",
    accountTeamStatusRejectedNote: "Your team application was rejected. Review the name/roster and save changes — saving will resend it for moderation.",
    accountNoTeamDesc: "Create a team to take part in MLT tournaments.",
    accountLogoutFull: "Log out",
    createTeamModerationNote: "After submitting, an admin will review your team — it will go live once approved.",
    teamPendingModerationTitle: "Team pending moderation", teamPendingModerationDesc: "This team hasn't been reviewed by an admin yet and isn't visible in public rankings.",
    teamRejectedTitle: "Application rejected", teamRejectedDesc: "An admin rejected the application to create this team.",
    tournamentRegNeedApprovedTeam: "Your team is still pending moderation — wait for admin approval before applying to tournaments.",
  }
};

export function t(lang, key){
  return (I18N[lang] && I18N[lang][key]) ?? I18N.ru[key] ?? key;
}
