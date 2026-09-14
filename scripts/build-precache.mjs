import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf8"));

async function files(dir) {
  const result = [];

  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    result.push(...(item.isDirectory() ? await files(path) : [path]));
  }

  return result;
}

const paths = (await files("dist"))
  .filter((path) => !/sw\.js$|_headers$|_redirects$|\.map$/.test(path))
  .sort();

const source = await readFile("public/sw.js", "utf8");

const hash = createHash("sha256");

// O conteúdo do próprio Service Worker participa da revisão do cache.
// Assim, corrigir apenas o SW também gera um CACHE_NAME novo.
hash.update(source);

for (const path of paths) {
  hash.update(path);
  hash.update(await readFile(path));
}

const assets = [
  "/",
  ...paths
    .map((path) => "/" + path.replace(/^dist\//, ""))
    // A navegação usa "/" como app shell canônico.
    // /index.html pode ser redirecionado pelo host para "/".
    .filter((path) => path !== "/index.html"),
];

const uniqueAssets = [...new Set(assets)];

let generated = source;

generated = generated.replace(
  /const CACHE_NAME = .*?;/,
  `const CACHE_NAME = "praxis-shell-${pkg.version}-${hash.digest("hex").slice(0, 12)}";`,
);

generated = generated.replace(
  /const SHELL = .*?;/,
  `const SHELL = ${JSON.stringify(uniqueAssets)};`,
);

await writeFile("dist/sw.js", generated);

console.log(
  `PWA: ${uniqueAssets.length} arquivos versionados disponíveis para instalação offline.`,
);
