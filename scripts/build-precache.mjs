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
const paths = (await files("dist")).filter(path => !/sw\.js$|_headers$|_redirects$|\.map$/.test(path)).sort();
const hash = createHash("sha256");
for (const path of paths) { hash.update(path); hash.update(await readFile(path)); }
const assets = paths.map(path => "/" + path.replace(/^dist\//, ""));
let source = await readFile("public/sw.js", "utf8");
source = source.replace(/const CACHE_NAME = .*?;/, `const CACHE_NAME = "praxis-shell-${pkg.version}-${hash.digest("hex").slice(0, 12)}";`);
source = source.replace(/const SHELL = .*?;/, `const SHELL = ${JSON.stringify(assets)};`);
await writeFile("dist/sw.js", source);
console.log(`PWA: ${assets.length} arquivos versionados disponíveis para instalação offline.`);
