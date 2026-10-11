// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const { GameRepository } = require('../lib/database')
const { createPlayer, equipment, addStack, count } = require('../lib/game')

test('disk SQLite preserves wallet, rods and market across a full Koishi restart', async () => {
  const root = path.resolve(process.env.MCFISH_TEST_DIR || os.tmpdir())
  const directory = await fs.mkdtemp(path.join(root, 'mcfish-restart-'))
  const dbPath = path.join(directory, 'fish.db')
  const config = { initialBalance: 200, dailyLimit: 50, timezone: 'Asia/Shanghai' }
  let app
  try {
    app = new App()
    app.plugin(sqlite, { path: dbPath })
    const repository = new GameRepository(app, config)
    await app.start()
    await repository.run('qq:alice', (p, m) => {
      p.wallet = 456; p.equipment = equipment('钻石竿'); p.equipment.lure = 2
      addStack(p.bag, '鳕鱼', 12)
      addStack(m.stock, '唱片', 3)
    })
    await app.stop()
    app = new App()
    app.plugin(sqlite, { path: dbPath })
    const restarted = new GameRepository(app, config)
    await app.start()
    const result = await restarted.run('qq:alice', (p, m) => ({ p, m }))
    assert.equal(result.p.wallet, 456)
    assert.equal(result.p.equipment.name, '钻石竿')
    assert.equal(result.p.equipment.lure, 2)
    assert.equal(count(result.p, '鳕鱼'), 12)
    assert.equal(result.m.stock.find(s => s.name === '唱片').count, 3)
  } finally {
    await app?.stop()
    if (path.dirname(directory) !== root) throw new Error('Unexpected test directory')
    await fs.rm(directory, { recursive: true, force: true })
  }
})
