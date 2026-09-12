import { Pool, types } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

type Row = Record<string, any>;
type Result = { rows: Row[]; rowCount?: number | null; affectedRows?: number };
type Connection = { query(sql: string, values?: any[]): Promise<Result> };
function parameters(sql: string) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  );
}
function numbers(rows: Row[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (typeof value === "bigint") {
          const number = Number(value);
          if (!Number.isSafeInteger(number))
            throw new Error("Database integer exceeds JavaScript precision.");
          return [key, number];
        }
        return [key, value];
      }),
    ),
  );
}
export class Database {
  private context = new AsyncLocalStorage<Connection>();
  constructor(
    private connection: Connection,
    private acquire: () => Promise<Connection & { release(): void }>,
    private shutdown: () => Promise<void>,
  ) {}
  async query(sql: string, values: any[] = []) {
    const response = await (this.context.getStore() ?? this.connection).query(
      parameters(sql),
      values,
    );
    const result: Result = Array.isArray(response) ? response.at(-1) : response;
    return {
      rows: numbers(result.rows),
      changes: result.rowCount ?? result.affectedRows ?? 0,
    };
  }
  prepare(sql: string) {
    return {
      get: async (...values: any[]) => (await this.query(sql, values)).rows[0],
      all: async (...values: any[]) => (await this.query(sql, values)).rows,
      run: async (...values: any[]) => ({
        changes: (await this.query(sql, values)).changes,
      }),
    };
  }
  async exec(sql: string) {
    await this.query(sql);
  }
  async close() {
    await this.shutdown();
  }
  async transaction<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    const client = await this.acquire();
    try {
      await client.query("BEGIN");
      // Serialize multi-step writes to preserve pool-role and publication invariants.
      await client.query("SELECT pg_advisory_xact_lock(734291)");
      const result = await this.context.run(client, work);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
export async function openDatabase(
  url = process.env.DATABASE_URL,
): Promise<Database> {
  if (url === ":memory:" && process.env.TEST_DATABASE_URL) {
    // Isolate each integration test in its own schema, even when sharing one server.
    const admin = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 1,
    });
    const schema = "picks_test_" + randomUUID().replaceAll("-", "");
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      const testUrl = new URL(process.env.TEST_DATABASE_URL);
      testUrl.searchParams.set("options", `-c search_path=${schema}`);
      const testDb = await openDatabase(testUrl.href);
      const close = testDb.close.bind(testDb);
      testDb.close = async () => {
        try {
          await close();
          await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        } finally {
          await admin.end();
        }
      };
      return testDb;
    } catch (error) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
      throw error;
    }
  }
  let db: Database;
  if (url === ":memory:") {
    // Embedded Postgres for isolated tests only, never a production fallback.
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    let tail = Promise.resolve();
    const acquire = async () => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      return {
        query: async (sql: string, values?: any[]) => {
          if (!values?.length && sql.includes(";")) {
            const results = await pg.exec(sql);
            return results.at(-1) ?? { rows: [] };
          }
          return pg.query<Row>(sql, values);
        },
        release,
      };
    };
    const connection: Connection = {
      query: async (sql, values) => {
        const c = await acquire();
        try {
          return await c.query(sql, values);
        } finally {
          c.release();
        }
      },
    };
    db = new Database(connection, acquire, () => pg.close());
  } else {
    if (!url || !/^postgres(ql)?:\/\//.test(url))
      throw new Error(
        "Set DATABASE_URL to your Postgres connection URL in .env.",
      );
    const pool = new Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 10_000,
      types: {
        getTypeParser: (oid, format) =>
          oid === 20
            ? (value: string) => BigInt(value)
            : types.getTypeParser(oid, format),
      },
    });
    pool.on("error", () => console.error("Postgres connection error."));
    db = new Database(
      pool,
      () => pool.connect(),
      () => pool.end(),
    );
  }
  try {
    await db.transaction(async () => {
      await db.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      );
      if (
        !(await db
          .prepare("SELECT 1 FROM schema_migrations WHERE version=1")
          .get())
      ) {
        await db.exec(
          await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
        );
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (1)")
          .run();
      }
    });
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
export const transaction = <T>(db: Database, work: () => T | Promise<T>) =>
  db.transaction(work);
