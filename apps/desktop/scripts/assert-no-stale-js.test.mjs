import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import { checkNoStaleJs } from '../scripts/assert-no-stale-js.mjs'

function makeSrcTree(build) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-stale-js-'))
  const srcDir = path.join(tempRoot, 'src')
  fs.mkdirSync(srcDir, { recursive: true })
  if (build) build(srcDir)
  return { tempRoot, srcDir }
}

test('passes on a clean tree of .ts sources', () => {
  const { tempRoot, srcDir } = makeSrcTree(d => {
    fs.writeFileSync(path.join(d, 'websocket-url.ts'), 'export {}', 'utf8')
    fs.writeFileSync(path.join(d, 'index.ts'), 'export {}', 'utf8')
  })
  try {
    assert.deepEqual(checkNoStaleJs([srcDir]), { ok: true })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('flags a compiled .js shadowing a sibling .ts (the #68250 incident shape)', () => {
  const { tempRoot, srcDir } = makeSrcTree(d => {
    fs.writeFileSync(path.join(d, 'websocket-url.ts'), 'export {}', 'utf8')
    fs.writeFileSync(path.join(d, 'websocket-url.js'), 'export {}', 'utf8')
  })
  try {
    const result = checkNoStaleJs([srcDir])
    assert.equal(result.ok, false)
    assert.equal(result.stale.length, 1)
    assert.match(result.stale[0], /websocket-url\.js$/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('flags a .js shadowing a .tsx source and recurses into subdirectories', () => {
  const { tempRoot, srcDir } = makeSrcTree(d => {
    const nested = path.join(d, 'app', 'chat')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'view.tsx'), 'export {}', 'utf8')
    fs.writeFileSync(path.join(nested, 'view.js'), 'export {}', 'utf8')
  })
  try {
    const result = checkNoStaleJs([srcDir])
    assert.equal(result.ok, false)
    assert.match(result.stale[0], /app[/\\]chat[/\\]view\.js$/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('leaves standalone .js files (no sibling source) alone', () => {
  const { tempRoot, srcDir } = makeSrcTree(d => {
    fs.writeFileSync(path.join(d, 'fixture-data.js'), 'export {}', 'utf8')
    fs.writeFileSync(path.join(d, 'index.ts'), 'export {}', 'utf8')
  })
  try {
    assert.deepEqual(checkNoStaleJs([srcDir]), { ok: true })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('skips node_modules and tolerates missing directories', () => {
  const { tempRoot, srcDir } = makeSrcTree(d => {
    const nm = path.join(d, 'node_modules', 'pkg')
    fs.mkdirSync(nm, { recursive: true })
    fs.writeFileSync(path.join(nm, 'mod.ts'), 'export {}', 'utf8')
    fs.writeFileSync(path.join(nm, 'mod.js'), 'export {}', 'utf8')
  })
  try {
    assert.deepEqual(checkNoStaleJs([srcDir, path.join(tempRoot, 'does-not-exist')]), { ok: true })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
