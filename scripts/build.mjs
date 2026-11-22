import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";

const minifyUiPlugin = {
  name: "minify-ui",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]ui\.ts$/ }, async (args) => {
      let src = await fs.promises.readFile(args.path, "utf8");

      src = src.replace(/const SHARED_STYLES = `([\s\S]*?)`;/, (_, css) => {
        const minCss = esbuild.transformSync(css, { loader: "css", minify: true }).code.trim();
        return `const SHARED_STYLES = ${JSON.stringify(minCss)};`;
      });

      src = src.replace(/<style>([\s\S]*?)<\/style>/g, (_, css) => {
        const ph = ".__dd_shared_ph__{color:#000}";
        const prepared = css.replace(/\$\{SHARED_STYLES\}/g, ph);
        const minCss = esbuild.transformSync(prepared, { loader: "css", minify: true }).code.trim();
        if (!minCss.includes(ph)) {
          throw new Error("CSS placeholder was lost during minification");
        }
        return `<style>${minCss.replace(ph, "${SHARED_STYLES}")}</style>`;
      });

      src = src.replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => {
        const placeholders = [];
        const prepared = js.replace(/\$\{safeJsonForScript\(([^)]+)\)\}/g, (match) => {
          const id = `__DD_PH_${placeholders.length}__`;
          placeholders.push(match);
          return id;
        });
        let minJs = esbuild
          .transformSync(prepared, { loader: "js", minify: true, charset: "utf8", target: "es2024" })
          .code.trim();
        for (let i = 0; i < placeholders.length; i++) {
          minJs = minJs.replace(`__DD_PH_${i}__`, placeholders[i]);
        }
        return `<script>${minJs}</script>`;
      });

      src = src.replace(/>\r?\n\s+</g, "><");
      return { contents: src, loader: "ts" };
    });
  },
};

fs.mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  target: "es2024",
  platform: "neutral",
  conditions: ["workerd"],
  external: ["node:zlib", "node:buffer", "cloudflare:workers"],
  minify: true,
  charset: "utf8",
  plugins: [minifyUiPlugin],
  outfile: path.join("dist", "worker.js"),
});

const outBytes = fs.readFileSync(path.join("dist", "worker.js"));
const sha256 = crypto.createHash("sha256").update(outBytes).digest("hex");
console.log(`Built dist/worker.js (${outBytes.length} bytes, sha256=${sha256})`);
