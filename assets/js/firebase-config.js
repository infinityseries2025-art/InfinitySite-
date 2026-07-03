/* =========================================================
   НАСТРОЙКА FIREBASE
   Вставь сюда свои ключи из Firebase Console:
   Project settings → General → Your apps → SDK setup and configuration.
   Это НЕ секретные ключи — их можно спокойно хранить в открытом
   коде сайта, реальная защита данных настраивается правилами
   Firestore (см. FIREBASE_SETUP.md в корне проекта).
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyBUzCjDqDmuaKLQY3Q5zhYhgfuOqnPgdak",
  authDomain: "infinity-series-1f4c2.firebaseapp.com",
  projectId: "infinity-series-1f4c2",
  storageBucket: "infinity-series-1f4c2.firebasestorage.app",
  messagingSenderId: "109660304886",
  appId: "1:109660304886:web:a73cf10875e091381c43d7"
};

/* Email аккаунта-администратора (заведённого в Firebase Authentication —
   см. FIREBASE_SETUP.md, шаг 3). Именно по этому email сайт определяет,
   что вошедший человек — организатор, и пускает его в admin.html.
   ВАЖНО: то же самое значение нужно вписать в правила Firestore
   (шаг 2 в FIREBASE_SETUP.md), иначе обычный посетитель, создавший себе
   аккаунт на account.html, сможет менять данные напрямую через консоль
   разработчика в браузере. */
const ADMIN_EMAIL = "infinityseries2025@gmail.com";

// Инициализация (используется на страницах register.html, participants.html, admin.html, account.html)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
