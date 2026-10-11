// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Config, validateConfig } = require('../lib/config')
const { BOOKS, RODS } = require('../lib/catalog')
const g = require('../lib/game')
const config = Config({}), market = { day: '', increases: {} }
test('one-click sale preserves rare loot and every enchant book even with rarity disabled', () => {
  const p = g.createPlayer('seller')
  p.inventory = { 生鳕鱼: 4, 骨头: 3, 海洋之心: 2, 耐久附魔书: 5, 海之眷顾附魔书: 1, 自定义附魔书: 1 }
  const c = Config({ lootTable: config.lootTable.map(item => item.name.includes('附魔书') ? { ...item, rare: false } : item) })
  assert.match(g.sellAll(p, market, c), /7 件普通物品/)
  assert.equal(p.wallet, 126)
  assert.deepEqual(p.inventory, { 海洋之心: 2, 耐久附魔书: 5, 海之眷顾附魔书: 1, 自定义附魔书: 1 })
  assert.equal(p.rods.length, 1)
  const snapshot = structuredClone(p)
  assert.throws(() => g.sellAll(p, market, c), /没有可一键出售的普通物品/)
  assert.deepEqual(p, snapshot)
})
test('a configured rare custom item is protected; explicit sale remains available', () => {
  const c = Config({ lootTable: [...config.lootTable, { name: '稀有石头', price: 100, weight: 1, rare: true }] })
  const p = g.createPlayer('seller'); p.inventory = { 稀有石头: 2, 木棍: 1 }
  g.sellAll(p, market, c)
  assert.deepEqual(p.inventory, { 稀有石头: 2 })
  assert.match(g.sell(p, '稀有石头', 1, market, c), /获得 50 绿宝石/)
})
test('generic rod sale treats N as quantity, preserves the equipped rod and pays zero', () => {
  const p = g.createPlayer('seller')
  p.rods.push(g.newRod('铁钓鱼竿'), g.newRod('钻石钓鱼竿'))
  const equippedId = p.equippedId, wallet = p.wallet
  assert.match(g.sell(p, '钓鱼竿', 2, market, config), /获得 0 绿宝石/)
  assert.equal(p.wallet, wallet); assert.equal(p.rods.length, 1); assert.equal(p.rods[0].id, equippedId)
  assert.throws(() => g.sell(p, '钓鱼竿', 1, market, config), /装备中的/)
  g.unequip(p); g.sell(p, '钓鱼竿', undefined, market, config); assert.equal(p.rods.length, 0)
})
test('named, enchanted and overflowing rods all have zero resale value', () => {
  const p = g.createPlayer('seller'); p.rods.push(g.newRod('下界合金钓鱼竿'))
  p.rods[1].unbreaking = 3; p.rods[1].luck = 3
  const wallet = p.wallet
  g.sell(p, '下界合金钓鱼竿', 1, { day: '', increases: { 下界合金钓鱼竿: 200 } }, config)
  assert.equal(p.wallet, wallet)
  for (const rod of RODS) assert.equal(g.salePrice(rod.name, market, config), 0)
})
test('half-price buyback applies premium then rounds down to whole emeralds', () => {
  assert.equal(g.salePrice('生鳕鱼', market, config), 5)
  assert.equal(g.salePrice('生鳕鱼', { day: '', increases: { 生鳕鱼: 100 } }, config), 10)
  assert.equal(g.salePrice('生鳕鱼', { day: '', increases: { 生鳕鱼: 200 } }, config), 15)
  const c = Config({ lootTable: config.lootTable.map(item => item.name === '生鳕鱼' ? { ...item, price: 11 } : item) })
  assert.equal(g.salePrice('生鳕鱼', market, c), 5)
  assert.equal(g.salePrice('生鳕鱼', { day: '', increases: { 生鳕鱼: 10 } }, c), 6)
})
test('books never enter premium markets and cannot be bought and resold for profit', () => {
  for (const book of BOOKS) {
    const p = g.createPlayer('buyer'); p.wallet = 10000
    const quote = { day: '', increases: { [book]: 200 } }
    g.buy(p, book, 10, config)
    const spent = 10000 - p.wallet
    g.sell(p, book, 10, quote, config)
    assert.equal(10000 - p.wallet, spent / 2)
    const c = Config({ lootTable: config.lootTable.map(item => item.name === book ? { ...item, price: 1 } : item) })
    assert.equal(g.salePrice(book, quote, c), 0)
  }
  for (let day = 0; day < 20; day++) {
    const m = { day: '', increases: {} }; g.refreshMarket(m, String(day), config)
    assert(!Object.keys(m.increases).some(name => name.includes('附魔书')))
  }
  const insufficient = Config({ lootTable: [...config.lootTable.filter(i => !i.name.includes('附魔书')).slice(0, 4), ...config.lootTable.filter(i => i.name.includes('附魔书'))] })
  assert.throws(() => validateConfig(insufficient), /非附魔书物品种类/)
})
test('default daily income is bounded under baseline and average daily market quotes', () => {
  const total = config.lootTable.reduce((sum, item) => sum + item.weight, 0)
  const baseline = config.lootTable.reduce((sum, item) => sum + g.salePrice(item.name, market, config) * item.weight, 0) / total * 50
  let daily = 0, bulk = 0
  for (let day = 1; day <= 365; day++) {
    const m = { day: '', increases: {} }; g.refreshMarket(m, 'balance-day-' + day, config)
    for (const item of config.lootTable) {
      const expected = g.salePrice(item.name, m, config) * item.weight / total * 50
      daily += expected / 365
      if (!g.protectedFromBulkSale(item.name, config)) bulk += expected / 365
    }
  }
  assert(baseline >= 450 && baseline <= 550)
  assert(daily >= 550 && daily <= 700)
  assert(bulk >= 280 && bulk <= 380)
  assert(config.lootTable.every(item => item.price > 0 && Number.isSafeInteger(item.price)))
})
