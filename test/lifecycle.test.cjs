// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const mock = require('@koishijs/plugin-mock').default
const plugin = require('../lib/index')
const { GameRepository } = require('../lib/database')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const id = user => JSON.stringify(['mock', user])

test('during a real fishing wait, duplicate casts are blocked and other users can trade', async () => {
  const config = plugin.Config({ images: false, minWaitSeconds: 1, maxWaitSeconds: 1 })
  const app = new App({ prefix: '', autoAuthorize: 1 })
  app.plugin(sqlite, { path: ':memory:' }); const mockFork = app.plugin(mock)
  const fork = app.plugin(plugin, config); await app.start()
  const repo = new GameRepository(app, config)
  try {
    await app.mock.initUser('waiter'); await app.mock.initUser('trader')
    const waiter = app.mock.client('waiter'), trader = app.mock.client('trader')
    const started = await waiter.receive('开始2次钓鱼', 1)
    assert.match(started.join(''), /已开始 2 次/)
    await waiter.shouldReply('开始10次钓鱼', /正在钓鱼或处理其他操作/)
    await trader.shouldReply('购买 木钓鱼竿 1', /已购买/)
    assert.equal((await repo.run(id('waiter'), p => p)).casts, 2)
    await pause(1050)
    const completed = await repo.run(id('waiter'), p => p)
    assert.equal(completed.pending, null)
    assert.equal(Object.values(completed.inventory).reduce((a, b) => a + b, 0), 2)
  } finally { await fork.dispose(); await mockFork.dispose(); await app.stop() }
})
test('plugin disposal during a wait preserves reserved casts and recovers stored drops on reload', async () => {
  const config = plugin.Config({ images: false, maxWaitSeconds: 40 })
  const app = new App({ prefix: '', autoAuthorize: 1 })
  app.plugin(sqlite, { path: ':memory:' }); const mockFork = app.plugin(mock)
  const fork = app.plugin(plugin, config); await app.start()
  const repo = new GameRepository(app, config)
  try {
    await app.mock.initUser('restart'); const client = app.mock.client('restart')
    await client.receive('开始3次钓鱼', 1)
    const pending = await repo.run(id('restart'), p => p.pending)
    assert(pending); await fork.dispose(); await pause(10)
    assert.deepEqual(await repo.run(id('restart'), p => p.pending), pending)
    await repo.run(id('restart'), p => { p.pending.finishAt = Date.now() - 10 })
    app.plugin(plugin, config)
    await client.shouldReply('钓鱼钱包', [/上次钓鱼已完成/, /未触发双倍产出/, /100 绿宝石/])
    const p = await repo.run(id('restart'), p => p)
    assert.equal(p.casts, 3); assert.equal(p.rods[0].durability, 27); assert.equal(p.pending, null)
    assert.equal(Object.values(p.inventory).reduce((a, b) => a + b, 0), 3)
  } finally { await mockFork.dispose(); await app.stop() }
})
