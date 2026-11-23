# Manga-Anime-Stat

Manga and Anime stat visualizer: an analytics dashboard for public MyAnimeList profiles.

Currently implements Milestones 1–3 of the dashboard spec: the rate-limited data layer, the dashboard shell with KPI cards, and the interactive charts (taste scatter, genre breakdown, studio/magazine comparison) with release-year, length and status filters.

## Running

```bash
npm install
cp .env.example .env.local   # optional: set MAL_CLIENT_ID
npm run dev                  # http://localhost:3000/?u=Xinil&m=anime
npm test                     # vitest unit tests
npm run typecheck && npm run lint
```

`MAL_CLIENT_ID` is the client ID of an official MyAnimeList API app ([register one](https://myanimelist.net/apiconfig)). It is read server-side only and sent as the `X-MAL-CLIENT-ID` header. Without it the app still runs, using the fallbacks below.

## How data flows

| Data | Primary | Fallback | Cache TTL |
| --- | --- | --- | --- |
| User anime/manga lists | MAL API v2 `/users/{user}/{anime,manga}list` with `list_status` and nested title fields, 1000 rows/page | MAL public list feed `/{anime,manga}list/{user}/load.json` | 15 min |
| Title details | MAL API v2 `/{anime,manga}/{id}` | Jikan v4 `/{anime,manga}/{id}` | 7 days |
| Profile + statistics (watch days) | Jikan v4 `/users/{user}/full` | none (MAL v2 has no public profile endpoint) | 1 h |

The fallback is used when `MAL_CLIENT_ID` is unset or the MAL API request fails. The dashboard shows which list source was used.

With the MAL API, list rows already include studios, runtimes and authors, so anime needs no extra per-title requests. Manga rows lack magazines (see quirks below) and feed rows lack all of these, so the browser enriches completed titles through `/api/details`, which tries MAL first and then Jikan.

MAL returns genres, themes and demographics in one `genres` list. `src/lib/mal/genres.ts` splits them by name, because MAL's numeric IDs differ between anime and manga. It also drops promotional tags MAL mixes into that list (e.g. "Eligible Titles for You Should Read This").

All upstream calls run server-side through `ThrottledClient` (`src/lib/http/client.ts`), which layers these steps:

1. **TTL cache** (`FileTtlCache`): an in-memory LRU backed by JSON files in `.cache/`, so it survives dev restarts.
2. **In-flight dedupe** of identical URLs.
3. **`RateLimiter`** (`src/lib/http/rate-limiter.ts`): a FIFO queue that spaces request starts evenly. Each upstream has its own: Jikan runs at 2.5 req/s and at most 55/min (Jikan's limits are 3/s and 60/min), the MAL API at 2 req/s and 55/min (MAL publishes no limits), and the list feed at 1 req/s and 30/min.
4. **Exponential backoff** on `429` (`src/lib/http/backoff.ts`), honouring `Retry-After`. A 429 also pauses the shared queue.
5. **Circuit breaker**: after repeated network failures the client fails fast for 60 s, so an outage doesn't stall the page.

Raw payloads are normalized into the unified `Anime` / `Manga` / `ListEntry` types in `src/lib/types.ts` by `src/lib/mal/normalize.ts` (MAL API v2) and `src/lib/normalize.ts` (Jikan and the list feed). The KPIs come from `computeKpis` in `src/lib/stats.ts`. Chart aggregations (score bias, tag breakdown, studio/magazine stats, filters) live in `src/lib/analytics/` and are rendered with Recharts.

## Known upstream quirks

- MAL API list endpoints leave out NSFW titles unless you pass `nsfw=true`, which the client always does.
- The MAL API manga list endpoint silently drops `serialization` even when requested; only `/manga/{id}` returns it. Magazines therefore fill in as completed manga are enriched.
- MAL API counts of `0` (episodes, chapters, volumes) mean unknown or ongoing. Dates can be partial (`"2017"` or `"2017-10"`).
- MAL returns 403 when no client ID is sent, and 400 `Invalid client id` for a bad one. Either one triggers the fallback.
- Jikan's manga `authors` do not say whether a credit is for story or art, so `Author.role` is `"unknown"` on the Jikan path. The MAL API provides real roles.
- MAL's list feed has no runtimes or themes, and usually no studios or magazines either. Those fill in once title details load.
- On the feed path, watch time is estimated at 24 min/episode until details load, and the KPI card shows what share of titles is estimated.
- The list feed returns numeric titles (e.g. `86`) as JSON numbers, and dates as `MM-DD-YY`. The normalizer handles both.
