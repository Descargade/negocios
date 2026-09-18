import pg from "pg";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class RadarStore {
  private pool: pg.Pool | undefined;
  private local: DatabaseSync | undefined;
  private ready: Promise<void> | undefined;
  readonly mode: string;
  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 4,
      });
      this.mode = "PostgreSQL";
    } else {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL)
        throw new Error(
          "Configurá DATABASE_URL antes de iniciar en producción.",
        );
      const path = resolve(process.env.RADAR_DB_PATH || "data/radar.sqlite");
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      this.local = new DatabaseSync(path);
      this.local.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
      this.mode = "SQLite local";
    }
  }
  async query(sql: string, args: any[] = []): Promise<any[]> {
    if (this.pool) return (await this.pool.query(sql, args)).rows;
    const stmt = this.local!.prepare(sql.replace(/\$\d+/g, "?"));
    return stmt.all(...args);
  }
  init(initial: any) {
    return (this.ready ??= this.initialize(initial).catch((error) => {
      this.ready = undefined;
      throw error;
    }));
  }
  private async initialize(initial: any) {
    await this.query(
      "CREATE TABLE IF NOT EXISTS radar_state (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)",
    );
    await this.query(
      "CREATE TABLE IF NOT EXISTS radar_sessions (token TEXT PRIMARY KEY, expires BIGINT NOT NULL)",
    );
    await this.query(
      "CREATE TABLE IF NOT EXISTS radar_auth_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until_at BIGINT NOT NULL)",
    );
    await this.query(
      "INSERT INTO radar_state (id,version,data) VALUES (1,0,$1) ON CONFLICT (id) DO NOTHING",
      [JSON.stringify(initial)],
    );
  }
  async read() {
    const [row] = await this.query(
      "SELECT version,data FROM radar_state WHERE id=1",
    );
    return { version: row.version, state: JSON.parse(row.data) };
  }
  async save(version: number, state: any) {
    const rows = await this.query(
      "UPDATE radar_state SET version=version+1,data=$1 WHERE id=1 AND version=$2 RETURNING version",
      [JSON.stringify(state), version],
    );
    if (!rows.length)
      throw Object.assign(
        new Error(
          "Los datos cambiaron en otra pestaña. Recargá y revisá antes de guardar.",
        ),
        { status: 409 },
      );
    return rows[0].version;
  }
  async close() {
    await this.pool?.end();
    this.local?.close();
  }
}
