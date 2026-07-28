import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const versionSource = fs.readFileSync("src/version.ts", "utf8");
const workerSource = fs.readFileSync("public/sw.js", "utf8");
const expected = pkg.version;
const checks = [
  ["src/version.ts", versionSource.includes(`"${expected}"`)],
  ["public/sw.js", workerSource.includes(expected)],
];
const failures = checks.filter(([, valid]) => !valid).map(([name]) => name);
if (failures.length) {
  console.error(`Versão ${expected} não está consolidada em: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`Versão consolidada: ${expected}`);
