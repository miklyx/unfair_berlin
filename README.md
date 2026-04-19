# unfair_berlin

Next.js приложение с интерактивной картой Берлина для фиксации мест, где удаляют честные негативные отзывы.

## Run

```bash
npm install
npm run dev
```

Откройте http://localhost:3000.

## Что внутри

- `src/app/page.tsx` — карта, пины, форма отправки, очередь модерации и статистика
- `src/app/globals.css` — стили интерфейса карты и панелей
- `src/app/api/notes/route.ts` — API endpoint `/api/notes`
- `src/lib/db.ts` — инициализация SQLite и запросы
