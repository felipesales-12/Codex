import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile),
  name = "compasso-inventory-" + randomUUID().slice(0, 8);
async function sql(text) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", [
      "exec",
      "-i",
      name,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
    ]);
    let out = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (out += x));
    p.on("error", reject);
    p.on("close", (code) => (code ? reject(new Error(out)) : resolve(out)));
    p.stdin.end(text);
  });
}
try {
  await exec("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "--network",
    "none",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine",
  ]);
  for (let i = 0; i < 60; i++) {
    try {
      await exec("docker", ["exec", name, "pg_isready", "-U", "postgres"]);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  for (const f of [
    "tests/database-bootstrap.sql",
    "supabase/schema.sql",
    "supabase/inventory.sql",
    "supabase/inventory.sql",
    "supabase/registration.sql",
    "supabase/registration.sql",
  ])
    await sql(await readFile(f, "utf8"));
  console.log(
    (await sql(await readFile("tests/inventory.sql", "utf8")))
      .split("\n")
      .filter((x) => x.includes("PASS:"))
      .join("\n"),
  );
  const move = () =>
    sql(
      "set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);select public.inventory_apply(gen_random_uuid(),'sheet_move','{\"id\":\"carbono-2\",\"delta\":-2}');",
    );
  const results = await Promise.allSettled([move(), move()]);
  if (results.filter((r) => r.status === "fulfilled").length !== 1)
    throw new Error(
      "Concorrência aceitou saldo negativo ou rejeitou ambas as baixas",
    );
  console.log(
    "PASS: duas conexões concorrentes disputam saldo sem deixá-lo negativo",
  );
  console.log(
    (await sql(await readFile("tests/registration.sql", "utf8")))
      .split("\n")
      .filter((x) => x.includes("PASS:"))
      .join("\n"),
  );
} finally {
  await exec("docker", ["rm", "-f", name]).catch(() => {});
}
