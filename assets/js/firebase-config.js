/* =========================================================
   НАСТРОЙКА FIREBASE
   Вставь сюда свои ключи из Firebase Console:
   Project settings → General → Your apps → SDK setup and configuration.
   Это НЕ секретные ключи — их можно спокойно хранить в открытом
   коде сайта, реальная защита данных настраивается правилами
   Firestore (см. FIREBASE_SETUP.md в корне проекта).
========================================================= */
const firebaseConfig = {
  apiKey: "ВСТАВЬ_СЮДА",
  authDomain: "ВСТАВЬ_СЮДА.firebaseapp.com",
  projectId: "ВСТАВЬ_СЮДА",
  storageBucket: "ВСТАВЬ_СЮДА.appspot.com",
  messagingSenderId: "ВСТАВЬ_СЮДА",
  appId: "ВСТАВЬ_СЮДА"
};

// Инициализация (используется на страницах register.html, participants.html, admin.html)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
