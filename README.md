# unfair_berlin

Проект полностью на **Next.js** с базой данных **SQLite**.

## Запуск

```bash
npm install
npm run dev
```

Откройте http://localhost:3000.

## Что внутри

- `src/app/page.tsx` — главная страница с данными из SQLite
- `src/app/api/notes/route.ts` — API маршрут `/api/notes`
- `src/lib/db.ts` — инициализация SQLite и запросы

Файл базы создается автоматически: `data/app.db`.
