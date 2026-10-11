// Builds the folder that Terraform zips and uploads:  backend/lambda-build/
// Run from the backend folder:  npm run build:lambda
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "lambda-build");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, "src"), path.join(out, "src"), { recursive: true }); // includes src/ai/knowledge/*.md

// Lean package.json: no dev dependencies; no Anthropic SDK (Lambda uses the OpenRouter / openai-compatible provider).
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
delete pkg.devDependencies;
delete pkg.scripts;
delete pkg.dependencies["@langchain/anthropic"];
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2));
fs.writeFileSync(path.join(out, ".npmrc"), "legacy-peer-deps=true\n");

console.log("Installing production dependencies (a few minutes)...");
execSync("npm install --omit=dev --no-audit --no-fund", { cwd: out, stdio: "inherit" });

// Shrink the package (Lambda limit: 250 MB unzipped): remove type definitions, source maps, markdown.
let removed = 0;
(function clean(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) clean(p);
    else if (/\.(d\.ts|d\.mts|d\.cts|map|md|markdown)$/i.test(e.name) && !/^license/i.test(e.name)) {
      fs.rmSync(p, { force: true });
      removed++;
    }
  }
})(path.join(out, "node_modules"));

let bytes = 0;
(function size(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? size(p) : (bytes += fs.statSync(p).size);
  }
})(out);
console.log(`Removed ${removed} unneeded files. Package folder size: ${(bytes / 1024 / 1024).toFixed(1)} MB (Lambda limit 250 MB unzipped).`);
console.log("Done: backend/lambda-build is ready. Next: cd ../terraform && terraform apply");
