import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

mkdirSync("dist/.openai", { recursive: true });
copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (name === "server" || name === ".openai") return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

const assets = Object.fromEntries(filesIn("dist").map((path) => {
  const urlPath = `/${relative("dist", path).split(sep).join("/")}`;
  return [urlPath, {
    body: readFileSync(path).toString("base64"),
    type: contentTypes[extname(path)] ?? "application/octet-stream",
  }];
}));

mkdirSync("dist/server", { recursive: true });
writeFileSync(
  "dist/server/index.js",
  `const assets = ${JSON.stringify(assets)};

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = assets[path] ?? (!path.includes(".") ? assets["/index.html"] : null);
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(decode(asset.body), {
      headers: {
        "content-type": asset.type,
        "cache-control": path === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable",
      },
    });
  },
};
`,
  "utf8",
);
