/**
 * MLT — файл настроек сайта
 * Меняйте тексты, ссылки и контакты здесь — после сохранения обновите страницу в браузере.
 * При деплое на Firebase Hosting положите этот файл рядом с index.html (в папке public/).
 */
window.MLT_CONFIG = {
  siteTitle: "MLT — Esports Platform",

  /**
   * reCAPTCHA (защита от ботов на форме регистрации аккаунта и заявки
   * на турнир). Получите свой ключ на https://www.google.com/recaptcha/admin
   * — выберите тип "reCAPTCHA v2 — Флажок «Я не робот»" и добавьте туда
   * домен(ы) вашего сайта (и localhost, если тестируете локально).
   * Пока здесь пусто — виджет капчи на сайте не показывается.
   */
  recaptcha: {
    siteKey: "",
  },

  brand: {
    name: "MLT",
    subtitle: "ESPORTS PLATFORM",
  },

  /** Главная — заголовок и описание */
  hero: {
    eyebrow: "MLT · Esports League Platform",
    titleLine1: "Турниры, статистика",
    titleLine2: "и матчи",
    titleAccent: "в одном месте",
    description:
      "Платформа лиги MLT: расписание матчей, автоматическая статистика игроков и команд, турнирные сетки и рейтинги. Всё обновляется само — админ вносит только результат.",
  },

  /** Страница «Контакты» */
  contacts: {
    pageTitle: "Контакты",
    heading: "Связаться с нами",
    intro:
      "По вопросам турниров, регистрации команд, партнёрства и технической поддержки — напишите нам удобным способом или заполните форму ниже.",
    email: "info@mlt-esports.ru",
    emailLabel: "Email",
    telegram: "https://t.me/mlt_esports",
    telegramLabel: "Telegram",
    telegramHandle: "@mlt_esports",
    discord: "https://discord.gg/mlt",
    discordLabel: "Discord",
    discordHandle: "discord.gg/mlt",
    formTitle: "Обратная связь",
    formNote: "Сообщение попадёт администратору сайта.",
    submitButton: "Отправить сообщение",
    nameLabel: "Ваше имя",
    namePlaceholder: "Как к вам обращаться",
    emailLabel: "Email для ответа",
    emailPlaceholder: "you@example.com",
    messageLabel: "Сообщение",
    messagePlaceholder: "Опишите ваш вопрос или предложение",
  },

  /** Ссылки на соцсети (футер и контакты) */
  social: {
    telegram: "https://t.me/mlt_esports",
    discord: "https://discord.gg/mlt",
    youtube: "https://youtube.com/@mlt",
    twitch: "https://twitch.tv/mlt",
    vk: "https://vk.com/mlt",
  },

  footer: {
    copyright: "All rights reserved — MLT",
  },

  /** Навигация — названия разделов */
  navigation: {
    home: "Главная",
    matches: "Матчи",
    rankings: "Рейтинги",
    tournaments: "Турниры",
    news: "Новости",
    contacts: "Контакты",
    admin: "Админ-панель",
    login: "Войти",
  },

  /** Кнопки и действия */
  buttons: {
    seeMatches: "Смотреть матчи",
    tournaments: "Турниры",
    allMatches: "Все матчи →",
    fullRankings: "Весь рейтинг →",
    allNews: "Все новости →",
    registerTeam: "Зарегистрировать команду",
    backToMatches: "← Ко всем матчам",
    backToRankings: "← К рейтингам",
    backToTournaments: "← Ко всем турнирам",
    createTeam: "Создать команду",
    editProfile: "Редактировать профиль игрока",
    logout: "Выйти из аккаунта",
  },

  /** Таблицы и списки */
  tables: {
    topPriority: "Приоритет №1",
    upcomingMatches: "Ближайшие матчи",
    top3Teams: "Топ-3 команды",
    latestNews: "Последние новости",
    upcoming: "Ожидаются",
    live: "В эфире",
    results: "Результаты",
    teams: "Команды",
    players: "Игроки",
  },

  /** Пустые состояния */
  emptyStates: {
    noUpcomingMatches: "Нет предстоящих матчей",
    noLiveMatches: "Сейчас нет матчей в эфире",
    noResults: "Пока нет результатов",
    noNews: "Пока нет новостей",
    noTournaments: "Пока нет турниров",
    noFinishedTournaments: "Пока нет завершённых турниров",
    noPlayerMatches: "У этого игрока пока нет матчей",
    noTeamMatches: "Пока нет завершённых матчей",
  },
};
