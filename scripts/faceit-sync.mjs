/**
 * faceit-sync.mjs
 * ---------------------------------------------------------------
 * Запускается ТОЛЬКО на GitHub Actions (см. ../.github/workflows/
 * faceit-elo-sync.yml), никогда в браузере. Ключ Faceit Data API
 * лежит в секрете репозитория FACEIT_API_KEY и никогда не попадает
 * в код сайта.
 *
 * Логика:
 *  1. Находит в users всех, у кого faceitUpdateRequested == true.
 *  2. Для каждого дергает Faceit Data API v4 по нику.
 *  3. Пишет faceitElo/faceitLevel/faceitUrl/faceitUpdatedAt и
 *     сбрасывает faceitUpdateRequested в false.
 *  4. Если ник не найден (404) или упёрлись в rate limit (429) —
 *     не падает на всей пачке, просто помечает конкретного
 *     пользователя ошибкой (faceitUpdateError) и идёт дальше.
 * --------------------------------------------------------------- */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!FACEIT_API_KEY) {
  console.error("FACEIT_API_KEY не задан (секрет репозитория). Прерываю.");
  process.exit(1);
}
if (!SERVICE_ACCOUNT_JSON) {
  console.error("FIREBASE_SERVICE_ACCOUNT не задан (секрет репозитория). Прерываю.");
  process.exit(1);
}

const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fetchFaceitData(nickname) {
  const res = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}`, {
    headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
  });

  if (res.status === 404) {
    throw new Error("Игрок с таким ником не найден на Faceit.");
  }
  if (res.status === 429) {
    throw new Error("Faceit API: превышен лимит запросов (429), попробуем в следующий раз.");
  }
  if (!res.ok) {
    throw new Error(`Faceit API ответил ${res.status}`);
  }

  const data = await res.json();
  const game = data.games?.cs2 || data.games?.csgo;
  if (!game) {
    throw new Error("У игрока не найдено данных по CS2/CS:GO на Faceit.");
  }

  return {
    faceitUrl: data.faceit_url ? data.faceit_url.replace("{lang}", "en") : null,
    elo: game.faceit_elo ?? null,
    level: game.skill_level ?? null,
  };
}

async function main() {
  console.log("Ищу пользователей с faceitUpdateRequested == true...");
  const snap = await db.collection("users").where("faceitUpdateRequested", "==", true).get();

  if (snap.empty) {
    console.log("Нет заявок на обновление Elo. Готово.");
    return;
  }

  console.log(`Найдено заявок: ${snap.size}`);
  let ok = 0, failed = 0;

  for (const docSnap of snap.docs) {
    const user = docSnap.data();
    const nickname = (user.faceitNickname || "").trim();

    if (!nickname) {
      await docSnap.ref.update({
        faceitUpdateRequested: false,
        faceitUpdateError: "Ник Faceit не указан.",
      });
      failed++;
      continue;
    }

    try {
      const { faceitUrl, elo, level } = await fetchFaceitData(nickname);
      await docSnap.ref.update({
        faceitUrl,
        faceitElo: elo,
        faceitLevel: level,
        faceitUpdatedAt: FieldValue.serverTimestamp(),
        faceitUpdateRequested: false,
        faceitUpdateError: FieldValue.delete(),
      });
      console.log(`OK: ${nickname} -> elo=${elo} level=${level}`);
      ok++;
    } catch (err) {
      console.error(`Ошибка для ${nickname}: ${err.message}`);
      await docSnap.ref.update({
        faceitUpdateRequested: false,
        faceitUpdateError: err.message,
      });
      failed++;
    }

    // небольшая пауза между запросами, чтобы не словить 429 на пачке
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`Готово. Успешно: ${ok}, с ошибкой: ${failed}.`);
}

main().catch((err) => {
  console.error("Критическая ошибка воркфлоу:", err);
  process.exit(1);
});
