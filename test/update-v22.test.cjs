// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const mock = require('@koishijs/plugin-mock').default
const plugin = require('../lib/index')
const { Config, validateConfig } = require('../lib/config')
const { LEGACY_LOOT_V21 } = require('../lib/catalog')
const { GameRepository } = require('../lib/database')
const g = require('../lib/game')
const render = require('../lib/render')
const { helpCommands } = require('../lib/core/help')
const emptyMarket = { day: '', increases: {} }

test('the new 1x table preserves every former default buyback quote and book purchase price', () => {
  const config = Config({})
  for (const item of LEGACY_LOOT_V21) assert.equal(g.salePrice(item.name, emptyMarket, config), Math.floor(item.price / 2), item.name)
  assert.equal(g.shopItems(config).find(item => item.name === '耐久附魔书').price, 200)
  assert.equal(g.shopItems(config).find(item => item.name === '海之眷顾附魔书').price, 300)
})
test('quotes round down below .5, up at .5, and match text, warehouse, explicit sale and overflow payouts', () => {
  const c = Config({}), market = { day: 'rounding', increases: { 生鳕鱼: -50 } }
  assert.equal(g.salePrice('生鳕鱼', market, Config({ saleMultiplier: 0.9 })), 2)
  assert.equal(g.salePrice('生鳕鱼', market, c), 3)
  const p = g.createPlayer('rounding'); p.inventory['生鳕鱼'] = 2
  assert(render.warehouseText(p, market, c).includes('收购总价 6'))
  assert(render.marketHtml(p, market, c)[0].includes('今日收购 3 绿宝石'))
  assert.match(g.sell(p, '生鳕鱼', 2, market, c), /获得6个绿宝石/)
  assert.equal(p.wallet, 106)
  p.rods = Array.from({ length: 30 }, () => g.newRod('木钓鱼竿'))
  p.equippedId = p.rods[0].id; p.inventory['生鳕鱼'] = 2
  assert.equal(g.trimOverflow(p, market, c).earned, 6)
  assert.equal(p.wallet, 112)
})
test('decimal table prices become whole-emerald bases before market changes and book purchases', () => {
  const config = Config({})
  const c = Config({ lootTable: config.lootTable.map(i => i.name === '生鳕鱼' ? { ...i, price: 5.5 }
    : i.name === '耐久附魔书' ? { ...i, price: 100.4 } : i) })
  validateConfig(c)
  assert.equal(g.basePrice('生鳕鱼', c), 6)
  assert.equal(g.salePrice('生鳕鱼', emptyMarket, c), 6)
  assert.equal(g.salePrice('生鳕鱼', { day: '', increases: { 生鳕鱼: 50 } }, c), 9)
  assert.equal(g.shopItems(c).find(i => i.name === '耐久附魔书').price, 200)
  const p = g.createPlayer('decimals'); p.wallet = 1000
  g.buy(p, '耐久附魔书', 2, c)
  assert.equal(p.wallet, 600)
  g.sell(p, '耐久附魔书', 2, emptyMarket, c)
  assert.equal(p.wallet, 800)
})
test('repair fees follow configuration, support zero fees and leave state intact on insufficient funds', () => {
  const player = g.createPlayer('repair'), config = Config({ repairCost: 333 })
  player.rods[0].durability = 1
  const before = structuredClone(player)
  assert.throws(() => g.repair(player, 1, config), /333个绿宝石/)
  assert.deepEqual(player, before)
  player.wallet = 400
  assert.match(g.repair(player, 1, config), /消耗333个绿宝石/)
  assert.equal(player.wallet, 67); assert.equal(player.rods[0].durability, 30)
  player.rods[0].durability = 1
  assert.match(g.repair(player, 1, Config({ repairCost: 0 })), /消耗0个绿宝石/)
  assert.equal(player.wallet, 67)
})
test('negative markets cover the -50 boundary, reject lower values and refresh saved positive quotes', () => {
  const c = Config({ marketMinIncrease: -50, marketMaxIncrease: -50 })
  validateConfig(c)
  const market = { day: '', increases: {} }
  g.refreshMarket(market, 'same-day', Config({ marketMinIncrease: 10 }))
  g.refreshMarket(market, 'same-day', c)
  assert(Object.values(market.increases).every(change => change === -50))
  assert.equal(g.salePrice('鲑鱼', { day: '', increases: { 鲑鱼: -50 } }, c), 5)
  assert.throws(() => Config({ marketMinIncrease: -51 }))
  assert.throws(() => validateConfig({ ...c, marketMinIncrease: -51 }))
})
test('selling an equipped middle or last rod equips the next remaining rod and never sells a different index', () => {
  const p = g.createPlayer('rods'), config = Config({})
  p.rods.push(g.newRod('铁钓鱼竿'), g.newRod('金钓鱼竿'))
  const [first, middle, last] = p.rods
  g.equip(p, 2)
  g.sell(p, '钓鱼竿', 2, emptyMarket, config)
  assert.equal(p.equippedId, last.id); assert(!p.rods.some(rod => rod.id === middle.id))
  g.sell(p, '钓鱼竿', 2, emptyMarket, config)
  assert.equal(p.equippedId, first.id)
  const before = structuredClone(p)
  assert.throws(() => g.sell(p, '钓鱼竿', 99, emptyMarket, config), /序号不存在/)
  assert.deepEqual(p, before)
})
test('all images have a watermark; help prices and shop durability follow the real config', () => {
  const c = Config({ repairCost: 333, enchantCost: 777, dailyLimit: 42, consumeEnchantBook: false })
  const p = g.createPlayer('render')
  const htmls = [...render.helpHtml(c), ...render.warehouseHtml(p, emptyMarket, c, '黄昏'),
    ...render.shopHtml(p, c), ...render.marketHtml(p, { day: '', increases: { 生鳕鱼: -50, 鲑鱼: 200 } }, c), ...render.leaderboardHtml([])]
  for (const html of htmls) assert(html.includes('class="watermark">Koishi_Plugin_mcfish'))
  const help = htmls[0], text = plugin.rules(c)
  for (const command of helpCommands(c)) assert(help.includes(render.escapeHtml(command.command)))
  for (const content of [help, text]) {
    assert(content.includes('333 绿宝石')); assert(content.includes('777 绿宝石'))
    assert(content.includes('不消耗附魔书')); assert(content.includes('42'))
    assert(!content.includes('维修消耗 200'))
  }
  const shop = render.shopHtml(p, c)[0]
  assert(shop.includes('耐久 30/30　|　耐久附魔 0　|　海之眷顾 0'))
  assert(shop.includes('耐久 150/150')); assert(shop.includes('100 绿宝石'))
  const market = render.marketHtml(p, { day: '', increases: { 生鳕鱼: -50, 鲑鱼: 200 } }, c)[0]
  assert(market.includes('color:#45d483">跌幅 -50%')); assert(market.includes('color:#ff5b62">涨幅 +200%'))
  assert(!market.includes('+-50%'))
  assert(!plugin.usage.includes('mcfish。'))
  assert(plugin.usage.includes('/koishi/node_modules/koishi-plugin-mcfish/assets/items/物品名称.png'))
  assert(plugin.usage.includes('MC 百科')); assert(plugin.usage.includes('AI'))
})
test('Koishi help uses images when available, falls back when rendering fails, and custom fees match deductions', async () => {
  const app = new App({ prefix: '', autoAuthorize: 1 })
  app.plugin(sqlite, { path: ':memory:' }); const fork = app.plugin(mock)
  const c = Config({ repairCost: 333, enchantCost: 777, images: true, minWaitSeconds: 0, maxWaitSeconds: 0 })
  app.plugin(plugin, c); await app.start()
  const repo = new GameRepository(app, c)
  const playerId = JSON.stringify(['mock', 'updated'])
  const original = render.renderPages
  try {
    await app.mock.initUser('updated'); const client = app.mock.client('updated')
    app.puppeteer = {}
    render.renderPages = async (_, html) => {
      assert(html[0].includes('333 绿宝石')); assert(html[0].includes('777 绿宝石'))
      return ['<img src="data:image/png;base64,AA=="/>']
    }
    assert((await client.receive('钓鱼帮助')).join('').includes('<img'))
    render.renderPages = async () => { throw new Error('intentional renderer failure') }
    await client.shouldReply('钓鱼帮助', /维修 N：333 绿宝石/)
    await repo.run(playerId, p => { p.wallet = 1000; p.rods[0].durability = 1 })
    await client.shouldReply('维修 1', /消耗333个绿宝石/)
    assert.equal((await repo.run(playerId, p => p.wallet)), 667)
  } finally { render.renderPages = original; delete app.puppeteer; await fork.dispose(); await app.stop() }
})
