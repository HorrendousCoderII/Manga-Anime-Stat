# Manga-Anime-Stat

Manga and Anime stat visualizer: an analytics dashboard for public MyAnimeList profiles.

Currently implements Milestones 1–2 of the dashboard spec: the rate-limited data layer and the dashboard shell with KPI cards.

## Running

```bash
npm install
npm run dev        # http://localhost:3000/?u=Xinil&m=anime
npm test           # vitest unit tests
npm run typecheck && npm run lint
```

## How data flows

| Data | Source | Cache TTL |
| --- | --- | --- |
| User anime/manga lists | MyAnimeList public list feed (`/animelist/{user}/load.json`, 300 rows/page) | 15 min |
| Profile + statistics (watch days) | Jikan v4 `/users/{user}/full` | 1 h |
| Catalog details (studios, runtimes, themes, magazines, authors) | Jikan v4 `/anime/{id}`, `/manga/{id}` | 7 days |

Jikan discontinued `/users/{username}/animelist` and `/mangalist` in May 2022, so per-user lists come from MAL's own public feed. Everything else goes through Jikan.

All upstream calls run server-side through `ThrottledClient` (`src/lib/http/client.ts`), which layers these steps:

1. **TTL cache** (`FileTtlCache`): an in-memory LRU backed by JSON files in `.cache/`, so it survives dev restarts.
2. **In-flight dedupe** of identical URLs.
3. **`RateLimiter`** (`src/lib/http/rate-limiter.ts`): a FIFO queue that spaces request starts evenly, at 2.5 req/s and at most 55 per rolling minute for Jikan (Jikan's limits are 3/s and 60/min).
4. **Exponential backoff** on `429` (`src/lib/http/backoff.ts`), honouring `Retry-After`. A 429 also pauses the shared queue.
5. **Circuit breaker**: after repeated network failures the client fails fast for 60 s, so a Jikan outage doesn't stall the page.

The browser loads lists first, then enriches completed titles through `/api/details` in small batches, highest-rated first. The KPIs update live as details arrive.

Raw payloads are normalized into the unified `Anime` / `Manga` / `ListEntry` types in `src/lib/types.ts` by `src/lib/normalize.ts`. The KPIs come from `computeKpis` in `src/lib/stats.ts`.

## Known upstream quirks

- Jikan's manga `authors` do not say whether a credit is for story or art, so `Author.role` is `"unknown"` until another source provides it.
- MAL's list feed has no runtimes or themes, and usually no studios or magazines either. Those fill in once Jikan enrichment completes.
- Until enrichment finishes, watch time is estimated at 24 min/episode, and the KPI card shows what share of titles is estimated.
- The list feed returns numeric titles (e.g. `86`) as JSON numbers, and dates as `MM-DD-YY`. The normalizer handles both.
