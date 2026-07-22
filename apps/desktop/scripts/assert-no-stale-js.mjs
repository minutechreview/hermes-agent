// Dev/build-time guard: refuse to run against compiled .js files shadowing
// .ts/.tsx sources in the renderer source trees.
//
// A stray `tsc` invocation (no project file, editor compile-on-save, etc.)
// can emit `foo.js` next to `foo.ts` under apps/shared/src or
// apps/desktop/src. `.gitignore` already hides those artifacts from git,
// which makes them invisible in `git status` — but Vite resolves
// extensionless imports with `.js` BEFORE `.ts`, so the renderer silently
// runs the stale compiled copy instead of the real source.
//
// This bit hard in July 2026: a Jul 16 artifact of websocket-url.js predated
// the #68250 getGatewayWsUrl contract change, so every boot dialed
// "ws://<origin>/[object%20Object]" and the desktop app could never connect,
// surviving reboots and cache wipes because the poison lived in src/.
//
// Runs before `vite` in dev and at the head of `build`. Fails loud with the
// exact files and the fix instead of letting the app boot on stale code.

import { existsSync, readdirSync, statSync } from "fs"
import { join, resolve } from "path"
import { isMain } from "./utils.mjs"

// Pure scan — returns { ok: true } or { ok: false, stale: ["/abs/foo.js", ...] }.
// A .js file is stale when a sibling .ts or .tsx source exists. Standalone
// .js files (fixtures, configs) are left alone.
export function checkNoStaleJs(srcDirs) {
  const stale = []

  const walk = dir => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      return
    }

    for (const name of readdirSync(dir)) {
      const full = join(dir, name)

      if (statSync(full).isDirectory()) {
        if (name !== "node_modules") {
          walk(full)
        }

        continue
      }

      if (!name.endsWith(".js")) {
        continue
      }

      const base = full.slice(0, -".js".length)

      if (existsSync(`${base}.ts`) || existsSync(`${base}.tsx`)) {
        stale.push(full)
      }
    }
  }

  for (const dir of srcDirs) {
    walk(dir)
  }

  return stale.length ? { ok: false, stale } : { ok: true }
}

function main() {
  const desktopRoot = resolve(import.meta.dirname, "..")
  const result = checkNoStaleJs([
    join(desktopRoot, "src"),
    resolve(desktopRoot, "..", "shared", "src")
  ])

  if (!result.ok) {
    console.error("\n✗ assert-no-stale-js: compiled .js artifacts are shadowing .ts sources:")

    for (const file of result.stale) {
      console.error(`    ${file}`)
    }

    console.error("  Vite resolves .js before .ts, so the app would run these stale")
    console.error("  compiled copies instead of the real sources. Delete them:")
    console.error(`    rm ${result.stale.join(" ")}\n`)
    process.exit(1)
  }

  console.log("✓ assert-no-stale-js: no compiled .js shadowing .ts sources")
}

if (isMain(import.meta.url)) {
  main()
}

export default { checkNoStaleJs }
