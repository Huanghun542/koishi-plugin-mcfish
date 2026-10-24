// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const mock = require('@koishijs/plugin-mock').default
const plugin = require('../lib/index')
const { Config, validateConfig } = require('../lib/config')
const { GameRepository } = require('../lib/database')
const g = require('../lib/game')
const render = require('../lib/render')
const market = { day: '', increases: {} }
const custom = changes => Config({ minWaitSeconds: 0, maxWaitSeconds: 0, enchantSuccessRate: 100,
  unbreakingBonuses: { level1: 40, level2: 80, level3: 140 },
  luckBonuses: { level1: 0, level2: 12.34, level3: 100 }, ...changes })

test('enchant levels use configured totals, add only the difference, and share max durability with repair and both views', () => {
  const config = custom(), p = g.createPlayer('bonuses'); p.wallet = 10000; p.inventory['耐久附魔书'] = 3
  const rod = p.rods[0]; rod.durability = 10
  for (const [level, maximum] of [[1, 70], [2, 110], [3, 170]]) {
    g.enchant(p, 1, '耐久', config, () => 0)
    assert.equal(rod.unbreaking, level); assert.equal(g.maxDurability(rod, config), maximum)
    assert.equal(rod.durability, maximum - 20)
  }
  assert.equal(p.wallet, 9100)
  assert.match(g.repair(p, 1, config), /耐久恢复至170\/170/)
  assert.equal(rod.durability, 170); assert.equal(p.wallet, 8950)
  assert.match(g.equip(p, 1, config), /耐久170\/170/)
  assert(render.warehouseText(p, market, config).includes('170/170'))
  assert(render.warehouseHtml(p, market, config, '玩家')[0].includes('170/170'))
  const help = render.helpHtml(config)[0]
  assert(help.includes('每级加成 40/40/60 耐久')); assert(help.includes('每级加成 0/12.34/87.66% 双倍概率'))
})

test('configured luck totals support fractional percentages and exact zero, boundary, and certain outcomes', () => {
  const config = custom()
  for (const [level, roll, count] of [[0, 0, 1], [1, 0, 1], [2, 1233, 2], [2, 1234, 1], [3, 9999, 2]]) {
    const p = g.createPlayer('luck'); p.rods[0].luck = level; let call = 0
    const pending = g.startFishing(p, 1, config, 0, () => call++ === 0 ? 0 : roll)
    assert.equal(pending.drops['生鳕鱼'], count)
    assert.equal(p.casts, 1); assert.equal(p.rods[0].durability, 29)
  }
})

test('invalid or decreasing total bonuses are rejected and lowering max durability safely clamps stored rods', () => {
  const defaults = Config({})
  assert.equal(defaults.unbreakingBonuses.level1, 20); assert.equal(defaults.unbreakingBonuses.level3, 60)
  assert.equal(defaults.luckBonuses.level1, 3); assert.equal(defaults.luckBonuses.level3, 9); assert.equal(defaults.saleConfirmSeconds, 30)
  for (const changes of [{ unbreakingBonuses: { level1: 100, level2: 70, level3: 120 } },
    { unbreakingBonuses: { level1: 1.5, level2: 70, level3: 120 } },
    { luckBonuses: { level1: 1, level2: 3, level3: 10001 } },
    { luckBonuses: { level1: 1, level2: 3, level3: 5.001 } }, { saleConfirmSeconds: 0 }]) {
    assert.throws(() => validateConfig({ ...defaults, ...changes }))
  }
  const p = g.createPlayer('clamp'); p.rods[0].unbreaking = 3; p.rods[0].durability = 150
  g.syncDurability(p, custom({ unbreakingBonuses: { level1: 0, level2: 10, level3: 20 } }))
  assert.equal(p.rods[0].durability, 50)
  g.syncDurability(p, custom()); assert.equal(p.rods[0].durability, 50)
})

test('rod purchases equip the last new rod and book purchases keep equipment with configured guidance', () => {
  const config = custom({ enchantCost: 123, enchantSuccessRate: 87 }), p = g.createPlayer('buy'); p.wallet = 10000
  assert.equal(g.buy(p, '铁钓鱼竿', 2, config), '已购买「铁钓鱼竿」×2，消耗600个绿宝石 | 已自动装备上，仓库内位于序号3')
  assert.equal(p.equippedId, p.rods[2].id)
  assert.equal(g.buy(p, '耐久', 1, config), '已购买「耐久附魔书」×1，消耗200个绿宝石 | 附魔指令：「附魔 N 耐久附魔书」| 消耗123个绿宝石，成功率87%')
  assert.equal(p.equippedId, p.rods[2].id); assert.equal(p.wallet, 9200)
  const empty = g.createPlayer('empty'), before = structuredClone(empty)
  assert.throws(() => g.buy(empty, '铁钓鱼竿', 1, config), /绿宝石不足，本次购买需要300个绿宝石，多去钓钓鱼吧/)
  assert.throws(() => g.buy(empty, '生鳕鱼', 1, config), /铁匠铺仅出售钓鱼竿和附魔书，仔细看清楚哦/)
  assert.deepEqual(empty, before)
  p.rods = Array.from({ length: 30 }, () => g.newRod('木钓鱼竿')); const full = structuredClone(p)
  assert.throws(() => g.buy(p, '钻石钓鱼竿', 1, config), /位置不足/); assert.deepEqual(p, full)
})

test('indexed and named higher-tier sales require scoped confirmation and sell only the originally selected IDs once', () => {
  const config = custom(), p = g.createPlayer('sell'), diamond = g.newRod('钻石钓鱼竿'), netherite = g.newRod('下界合金钓鱼竿')
  p.rods.push(diamond, netherite); p.equippedId = diamond.id
  assert.equal(g.sell(p, '钓鱼竿', 2, market, config, 'room', 100), '即将出售「钻石钓鱼竿」，出售将获得0个绿宝石，请在30s内输入「确认」再次出售')
  assert.equal(p.rods.length, 3); assert.equal(p.equippedId, diamond.id); assert.equal(p.wallet, 100)
  const before = structuredClone(p)
  assert.throws(() => g.confirmRodSale(p, 'other-room', 101), /当前会话没有待确认/); assert.deepEqual(p, before)
  p.rods.shift() // A changed warehouse index must never redirect the confirmation.
  assert.match(g.confirmRodSale(p, 'room', 102), /已出售「钻石钓鱼竿」×1，获得0个绿宝石/)
  assert.equal(p.rods.length, 1); assert.equal(p.equippedId, netherite.id); assert.equal(p.wallet, 100)
  assert.throws(() => g.confirmRodSale(p, 'room', 103), /没有待确认/)
  g.sell(p, '下界合金竿', 1, market, config, 'room', 104)
  assert.match(g.confirmRodSale(p, 'room', 105), /已出售「下界合金钓鱼竿」/)
  assert.equal(p.rods.length, 0)
})

test('confirmation expires at the deadline, cancels explicitly, replaces older requests and rejects missing targets atomically', () => {
  const config = custom({ saleConfirmSeconds: 5 }), p = g.createPlayer('expire')
  p.rods.push(g.newRod('钻石钓鱼竿'), g.newRod('钻石钓鱼竿'), g.newRod('下界合金钓鱼竿'))
  g.sell(p, '钻石钓鱼竿', 2, market, config, '', 1000)
  assert.match(g.confirmRodSale(p, '', 6000), /已超时/); assert.equal(p.rods.length, 4); assert(!p.pendingRodSale)
  g.sell(p, '钓鱼竿', 2, market, config, '', 7000); g.cancelRodSale(p); assert.equal(p.rods.length, 4)
  g.sell(p, '钓鱼竿', 2, market, config, '', 8000)
  const target = p.rods[3].id
  g.sell(p, '钓鱼竿', 4, market, config, '', 8001); g.confirmRodSale(p, '', 8002)
  assert(!p.rods.some(r => r.id === target)); assert.equal(p.rods.length, 3)
  g.sell(p, '钻石钓鱼竿', 2, market, config, '', 9000); p.rods.pop()
  assert.match(g.confirmRodSale(p, '', 9001), /发生变化/); assert.equal(p.rods.length, 2)
  assert.equal(p.wallet, 100)
})

test('one-click sale uses the new copy and preserves all protected goods', () => {
  const p = g.createPlayer('bulk'); p.inventory = { 生鳕鱼: 2, 耐久附魔书: 1, 海洋之心: 1 }
  assert.equal(g.sellAll(p, market, Config({})), '已出售2件普通物品，获得10个绿宝石 | 当前仓库鱼竿、附魔书和稀有物品已保留')
  assert.deepEqual(p.inventory, { 耐久附魔书: 1, 海洋之心: 1 }); assert.equal(p.rods.length, 1)
})

test('Koishi confirmation is isolated by user and channel, survives plugin reload and prevents concurrent double sale', async () => {
  const config = custom({ images: false }), app = new App({ prefix: '', autoAuthorize: 1 })
  app.plugin(sqlite, { path: ':memory:' }); const mockFork = app.plugin(mock); let fork = app.plugin(plugin, config)
  await app.start(); const repo = new GameRepository(app, config), id = u => JSON.stringify(['mock', u])
  try {
    await app.mock.initUser('seller'); await app.mock.initUser('other'); await app.mock.initChannel('room')
    const seller = app.mock.client('seller'), other = app.mock.client('other'), group = app.mock.client('seller', 'room')
    await repo.run(id('seller'), p => { p.wallet = 10000 })
    await seller.shouldReply('购买 钻石钓鱼竿 1', /已自动装备上，仓库内位于序号2/)
    await seller.shouldReply('出售 钓鱼竿 2', /请在30s内输入「确认」/)
    await other.shouldReply('确认', /没有待确认/); await group.shouldReply('确认', /没有待确认/)
    const pending = await repo.run(id('seller'), p => p.pendingRodSale)
    await fork.dispose(); fork = app.plugin(plugin, config)
    assert.deepEqual(await repo.run(id('seller'), p => p.pendingRodSale), pending)
    const results = await Promise.all([seller.receive('确认'), seller.receive('确认')])
    assert.equal(results.flat().filter(text => text.includes('已出售「钻石钓鱼竿」')).length, 1)
    const after = await repo.run(id('seller'), p => p)
    assert.equal(after.rods.length, 1); assert.equal(after.wallet, 8500); assert(!after.pendingRodSale)
    await seller.shouldReply('确认', /没有待确认/)
    await seller.shouldReply('购买 下界合金钓鱼竿 1', /已自动装备上/)
    await seller.shouldReply('出售 下界合金钓鱼竿 1', /即将出售/)
    await repo.run(id('seller'), p => { p.pendingRodSale.expiresAt = Date.now() - 1 })
    await seller.shouldReply('确认', /已超时/)
    assert.equal((await repo.run(id('seller'), p => p)).rods.length, 2)
    await seller.shouldReply('出售 钓鱼竿 2', /即将出售/); await seller.shouldReply('取消出售', /已取消/)
  } finally { await fork.dispose(); await mockFork.dispose(); await app.stop() }
})
