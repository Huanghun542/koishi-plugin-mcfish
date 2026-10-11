// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const { GameRepository } = require('../lib/database')
const { Config } = require('../lib/config')
const g = require('../lib/game')
test('SQLite restart preserves rods, enchantments, wallet, market and pending fishing', async () => {
  const root = path.resolve(process.env.MCFISH_TEST_DIR || os.tmpdir())
  const directory = await fs.mkdtemp(path.join(root, 'mcfish-v2-'))
  const config = Config({ maxWaitSeconds: 0 })
  let app
  try {
    const open = async () => {
      app = new App(); app.plugin(sqlite, { path: path.join(directory, 'fish.db') })
      const repo = new GameRepository(app, config); await app.start(); return repo
    }
    let repo = await open()
    const before = await repo.run('alice', (p, m) => {
      p.wallet = 4321; p.rods[0].luck = 3; p.rods[0].unbreaking = 2
      g.startFishing(p, 4, config, 0, () => 0); return { p, m }
    })
    await app.stop(); repo = await open()
    const restored = await repo.run('alice', (p, m) => ({ p, m }))
    assert.deepEqual(restored, before)
    await repo.run('alice', p => { assert(g.finishFishing(p)); assert.equal(g.finishFishing(p), null) })
    assert.equal((await repo.run('alice', p => p)).inventory['生鳕鱼'], 8)
  } finally {
    await app?.stop()
    if (path.dirname(directory) !== root) throw new Error('Unexpected test directory')
    await fs.rm(directory, { recursive: true, force: true })
  }
})
test('a v2 SQLite file gains ranking columns while retaining the full save and later username updates', async () => {
  const root = path.resolve(process.env.MCFISH_TEST_DIR || os.tmpdir())
  const directory = await fs.mkdtemp(path.join(root, 'mcfish-ranking-'))
  const playerId = JSON.stringify(['qq', '3339999053'])
  const player = g.createPlayer(playerId)
  player.wallet = 114514; player.inventory['海洋之心'] = 2
  let app
  try {
    app = new App(); app.plugin(sqlite, { path: path.join(directory, 'fish.db') })
    app.model.extend('mcfish_player', { id: 'string(255)', state: 'json' }, { primary: 'id' })
    await app.start()
    await app.database.upsert('mcfish_player', [{ id: playerId, state: player }])
    await app.stop()
    const open = async () => {
      app = new App(); app.plugin(sqlite, { path: path.join(directory, 'fish.db') })
      const repo = new GameRepository(app, Config({})); await app.start(); return repo
    }
    let repo = await open()
    assert.deepEqual(await repo.leaderboard('qq'), [{ rank: 1, username: '未命名玩家', maskedId: '333****9053', wallet: 114514 }])
    assert.deepEqual((await app.database.get('mcfish_player', { id: playerId }))[0].state, player)
    await repo.run(playerId, p => { p.wallet = 99999 }, '黄昏')
    await app.stop(); repo = await open()
    const top = await repo.leaderboard('qq')
    assert.deepEqual(top, [{ rank: 1, username: '黄昏', maskedId: '333****9053', wallet: 99999 }])
    await repo.run(playerId, p => p)
    assert.equal((await repo.leaderboard('qq'))[0].username, '黄昏')
    assert.equal((await repo.run(playerId, p => p)).inventory['海洋之心'], 2)
  } finally {
    await app?.stop()
    if (path.dirname(directory) !== root) throw new Error('Unexpected test directory')
    await fs.rm(directory, { recursive: true, force: true })
  }
})
