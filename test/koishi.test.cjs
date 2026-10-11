// SPDX-License-Identifier: AGPL-3.0-only
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const mock = require('@koishijs/plugin-mock').default
const plugin = require('../lib/index')
const g = require('../lib/game')
const { GameRepository } = require('../lib/database')
const config = plugin.Config({ maxWaitSeconds: 0, cooldownSeconds: 0, images: false, promptTimeoutSeconds: 5 })
let app, repository, alice, bob, mockFork
const id = user => JSON.stringify(['mock', user])
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function state(user = 'alice') {
  const [row] = await app.database.get('mcfish_player', { id: id(user) })
  return row?.state
}
async function eventually(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await pause(10) }
  assert.fail('operation did not settle within 1 second')
}
async function seed(user, callback) { return repository.run(id(user), callback) }

before(async () => {
  app = new App({ prefix: '', autoAuthorize: 1 })
  app.plugin(sqlite, { path: ':memory:' })
  mockFork = app.plugin(mock)
  app.plugin(plugin, config)
  await app.start()
  await app.mock.initUser('alice')
  await app.mock.initUser('bob')
  alice = app.mock.client('alice')
  bob = app.mock.client('bob')
  repository = new GameRepository(app, config)
})
after(async () => { await mockFork?.dispose(); await app?.stop() })

test('Koishi loads the plugin, exposes Chinese rules and persists an independent wallet', async () => {
  await alice.shouldReply('查看钓鱼规则', /MC 钓鱼模拟器/)
  await alice.shouldReply('钓鱼钱包', /200 金币/)
  await alice.shouldReply('钓鱼钱包', /200 金币/)
  assert.equal((await state()).wallet, 200)
  await alice.shouldReply('钓鱼源码', /Huanghun542\/koishi-plugin-mcfish/)
})
test('original Chinese fishing shortcut offers starter purchase and can be cancelled', async () => {
  const reply = await alice.receive('进行钓鱼', 1)
  assert.match(reply.join(''), /100 金币购买/)
  await alice.receive('否')
  await pause(25)
  assert.equal((await state()).wallet, 200)
  assert.equal((await state()).equipment, null)
})
test('starter confirmation equips a rod and the multi-cast Chinese shortcut settles correctly', async () => {
  assert.match((await alice.receive('进行5次钓鱼', 1)).join(''), /100 金币购买/)
  await alice.receive('是')
  await eventually(async () => (await state()).casts === 5)
  const p = await state()
  assert.equal(p.wallet, 100); assert.equal(p.equipment.name, '木竿'); assert.equal(p.equipment.durability, 25)
  await alice.shouldReply('mcfish.fish 2', /进行了 2 次钓鱼/)
  assert.equal((await state()).casts, 7)
})
test('Chinese probability, inventory and shop commands are reachable', async () => {
  await alice.shouldReply('当前装备概率明细', /空竿：40%/)
  await alice.shouldReply('钓鱼背包', /当前装备：木竿/)
  await alice.shouldReply('钓鱼商店', /初始木竿/)
  await alice.shouldReply('钓鱼看板', /今日行情/)
})
test('Chinese buy shortcut cancellation preserves coupons and balance', async () => {
  await seed('alice', (p, market) => { p.wallet = 200; p.coupons = 3; g.addStack(market.stock, '鳕鱼', 20) })
  const before = await state()
  assert.match((await alice.receive('购买鳕鱼 2', 1)).join(''), /购买鳕鱼×2：支付/)
  await alice.receive('取消'); await pause(25)
  const p = await state()
  assert.equal(p.wallet, before.wallet); assert.equal(p.coupons, 3); assert.equal(p.purchases, before.purchases)
})
test('confirmed purchase commits wallet, inventory, coupons and quota together', async () => {
  assert.match((await alice.receive('购买鳕鱼 2', 1)).join(''), /购买鳕鱼×2/)
  await alice.receive('是')
  await eventually(async () => (await state()).coupons === 1)
  const p = await state()
  assert.equal(p.purchases, 2); assert(g.count(p, '鳕鱼') >= 2); assert(p.wallet < 200)
})
test('another user cannot confirm someone else’s pending transaction', async () => {
  const before = await state()
  assert.match((await alice.receive('购买鳕鱼 1', 1)).join(''), /购买鳕鱼×1/)
  await bob.receive('是'); await pause(25)
  assert.equal((await state()).wallet, before.wallet)
  await alice.receive('否'); await pause(25)
})
test('saying no to record use continues selling and preserves the record', async () => {
  await seed('alice', p => { p.bag = []; g.addStack(p.bag, '鳕鱼', 5); g.addStack(p.bag, '唱片') })
  assert.match((await alice.receive('出售鳕鱼 2', 1)).join(''), /唱片/)
  await alice.receive('否', 1)
  await alice.receive('是')
  await eventually(async () => g.count(await state(), '鳕鱼') === 3)
  assert.equal(g.count(await state(), '唱片'), 1)
})
test('Chinese equipment, enchantment, purification and repair commands mutate real SQLite state', async () => {
  await seed('alice', p => {
    p.bag = []
    g.addStack(p.bag, '铁竿', 1, g.equipment('铁竿'))
    g.addStack(p.bag, '铁竿', 1, g.equipment('铁竿'))
    g.addStack(p.bag, '诱钓'); g.addStack(p.bag, '宝藏诅咒', 2); g.addStack(p.bag, '净化书', 2)
  })
  assert.match((await alice.receive('装备铁竿', 1)).join(''), /\[0\]/)
  await alice.receive('0')
  await eventually(async () => (await state()).equipment.name === '铁竿')
  await alice.shouldReply('修复鱼竿', /维修成功/)
  assert.equal((await state()).equipment.repairs, 1)
  await alice.shouldReply('附魔诱钓', /附魔(成功|失败)/)
  assert.equal(g.count(await state(), '诱钓'), 0)
  await alice.shouldReply('消除绑定诅咒 2', /消除了 2 层/)
  assert.equal(g.count(await state(), '宝藏诅咒'), 0)
})
test('Chinese bulk crafting validates selection and supports all-in synthesis', async () => {
  await seed('alice', p => {
    p.bag = []
    for (let i = 0; i < 7; i++) g.addStack(p.bag, '木竿', 1, g.equipment('木竿'))
  })
  assert.match((await alice.receive('合成铁竿', 1)).join(''), /梭哈/)
  await alice.receive('0 0 1'); await pause(25)
  assert.equal(g.count(await state(), '木竿'), 7)
  assert.match((await alice.receive('合成铁竿', 1)).join(''), /梭哈/)
  await alice.receive('梭哈')
  await eventually(async () => g.count(await state(), '木竿') === 1)
})
test('Chinese sell-all-waste command removes only waste after confirmation', async () => {
  await seed('alice', p => { p.bag = []; g.addStack(p.bag, '海草', 3); g.addStack(p.bag, '鳕鱼', 4) })
  assert.match((await alice.receive('出售所有垃圾', 1)).join(''), /全部垃圾×3/)
  await alice.receive('是')
  await eventually(async () => g.count(await state(), '海草') === 0)
  assert.equal(g.count(await state(), '鳕鱼'), 4)
})
test('two simultaneous buyers cannot purchase the last item twice', async () => {
  let stockId
  for (const user of ['alice', 'bob']) await seed(user, (p, market) => {
    p.wallet = 10000; p.purchases = 0; p.coupons = 0
    market.stock = market.stock.filter(s => s.name !== '唱片')
    stockId = g.addStack(market.stock, '唱片').id
  })
  const offers = await Promise.all(['alice', 'bob'].map(user => seed(user, (p, m) => g.quote(p, m, 'buy', stockId))))
  const results = await Promise.allSettled(['alice', 'bob'].map((user, i) => seed(user, (p, m) => g.transact(p, m, offers[i]))))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.filter(r => r.status === 'rejected').length, 1)
  const a = await state('alice'), b = await state('bob')
  assert.equal(g.count(a, '唱片') + g.count(b, '唱片'), 1)
  assert([a, b].some(p => p.wallet === 10000))
})
test('repository errors roll back mutations and do not poison subsequent operations', async () => {
  const before = await state()
  await assert.rejects(seed('alice', (p, m) => {
    p.wallet = 0; p.bag = []; m.stock = []
    throw new g.GameError('deliberate failure')
  }), /deliberate failure/)
  assert.deepEqual(await state(), before)
  const balance = await seed('alice', p => p.wallet)
  assert.equal(balance, before.wallet)
})
test('SQLite rolls back both player and market when a failure follows the first write', async () => {
  const before = await state()
  await assert.rejects(app.database.withTransaction(async db => {
    await db.upsert('mcfish_player', [{ id: id('alice'), state: { ...before, wallet: 0 } }])
    await db.upsert('mcfish_market', [{ id: 'global', state: { id: 'global', day: 'wrong', discounts: {}, stock: [] } }])
    throw new Error('simulated write failure')
  }), /simulated write failure/)
  assert.deepEqual(await state(), before)
  const [m] = await app.database.get('mcfish_market', { id: 'global' })
  assert.notEqual(m.state.day, 'wrong')
})
