import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dir = path.join(project, ".local", "postgres");
mkdirSync(path.dirname(dir), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "eiem",
  password: "eiem_local_password",
  port: Number(process.env.PGPORT || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});
if (!existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient("postgres", "127.0.0.1");
await client.connect();
if (
  !(await client.query("SELECT 1 FROM pg_database WHERE datname='eiembeauty'"))
    .rowCount
)
  await client.query("CREATE DATABASE eiembeauty");
await client.end();
console.log(
  `PostgreSQL lokal siap di 127.0.0.1:${process.env.PGPORT || 5432}. Ctrl+C untuk berhenti. Data disimpan di .local/postgres.`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Keep the parent alive while the database process is running.
setInterval(() => {}, 1000);
