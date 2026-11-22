import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { systemClock, type Clock } from "./clock";

export interface TtlCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

interface Envelope<T> {
  expiresAt: number;
  value: T;
}

export class MemoryTtlCache implements TtlCache {
  private readonly map = new Map<string, Envelope<unknown>>();

  constructor(
    private readonly maxEntries = 2000,
    private readonly clock: Clock = systemClock,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.clock.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Re-insert to keep Map order as LRU.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.clock.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

/** Memory cache backed by JSON files so cached responses survive dev-server restarts. */
export class FileTtlCache implements TtlCache {
  private readonly memory: MemoryTtlCache;

  constructor(
    private readonly dir: string,
    private readonly clock: Clock = systemClock,
  ) {
    this.memory = new MemoryTtlCache(2000, clock);
  }

  private file(key: string): string {
    return path.join(this.dir, `${createHash("sha1").update(key).digest("hex")}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hot = await this.memory.get<T>(key);
    if (hot !== undefined) return hot;
    try {
      const env = JSON.parse(await readFile(this.file(key), "utf8")) as Envelope<T>;
      const ttl = env.expiresAt - this.clock.now();
      if (ttl <= 0) {
        await rm(this.file(key), { force: true });
        return undefined;
      }
      await this.memory.set(key, env.value, ttl);
      return env.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.memory.set(key, value, ttlMs);
    const env: Envelope<T> = { value, expiresAt: this.clock.now() + ttlMs };
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file(key), JSON.stringify(env));
    } catch {
      // Disk persistence is best-effort (e.g. read-only serverless FS).
    }
  }
}
