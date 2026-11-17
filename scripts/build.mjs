import { build as bundle } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
let local = {};
try {
  local = parseEnv(await readFile(new URL(".env", root), "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const env = { ...local, ...process.env };
const url = env.SUPABASE_URL?.trim() || "";
const key = env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
if (Boolean(url) !== Boolean(key))
  throw new Error("Preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntos.");
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
  throw new Error(
    "SUPABASE_URL deve ser a URL HTTPS do projeto Supabase, sem barra final.",
  );
if (key && !key.startsWith("sb_publishable_")) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
  } catch {
    throw new Error("Chave pública Supabase inválida.");
  }
  if (payload.role !== "anon")
    throw new Error(
      "Use somente a chave pública anon/publishable, nunca service_role.",
    );
}
await mkdir(new URL("dist/assets/", root), { recursive: true });
await bundle({
  entryPoints: [fileURLToPath(new URL("js/stock-app.js", root))],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outfile: fileURLToPath(new URL("dist/assets/app.js", root)),
  define: {
    __SUPABASE_URL__: JSON.stringify(url),
    __SUPABASE_KEY__: JSON.stringify(key),
  },
});
for (const path of ["index.html", "favicon.svg", "sw.js"])
  await copyFile(new URL(path, root), new URL("dist/" + path, root));
await copyFile(
  new URL("css/stock.css", root),
  new URL("dist/assets/app.css", root),
);
await writeFile(new URL("dist/.nojekyll", root), "");
console.log(
  "Build pronto em dist/. " +
    (url ? "Supabase configurado." : "Configure .env para habilitar o login."),
);
