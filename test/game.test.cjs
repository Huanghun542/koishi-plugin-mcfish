// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const g = require('../lib/game')
const { Config, validateConfig } = require('../lib/config')
const { RODS, BOOKS, DOUBLE_PERCENT } = require('../lib/catalog')
const config = Config({ minWaitSeconds: 0, maxWaitSeconds: 0 })
const market = () => ({ day: '', increases: {} })
const funded = () => { const p = g.createPlayer('alice'); p.wallet = 100000; return p }

test('defaults, four table columns and console controls match the requested configuration', () => {
  assert.equal(config.dailyLimit, 50); assert.equal(config.maxWaitSeconds, 0)
  assert.equal(Config({}).maxWaitSeconds, 40)
  assert.equal(Config({}).minWaitSeconds, 20)
  assert.equal(config.normalColor, '#ffffff'); assert.equal(config.rareColor, '#ffd700')
  assert.equal(config.enchantCost, 300); assert.equal(config.consumeEnchantBook, true); assert.equal(config.enchantSuccessRate, 50)
  assert.equal(config.repairCost, 150); assert.equal(config.saleMultiplier, 1); assert.equal(config.marketMinIncrease, -50)
  assert.equal(config.recallDelaySeconds, 5); assert.deepEqual(config.recallTargets, [])
  const groups = Config.list
  const table = groups[0].dict.lootTable
  assert.equal(table.meta.role, 'table')
  assert.deepEqual(Object.keys(table.inner.dict), ['name', 'price', 'weight', 'rare'])
  assert.equal(groups[0].dict.normalColor.meta.role, 'color')
  assert.equal(groups[4].dict.recallTargets.meta.role, 'checkbox')
})
test('invalid loot and contradictory market ranges fail before activating', () => {
  for (const changes of [ { marketMinItems: 16, marketMaxItems: 15 }, { marketMinIncrease: 201 },
    { lootTable: [] }, { lootTable: config.lootTable.map(i => ({ ...i, weight: 0 })) },
    { lootTable: [...config.lootTable, config.lootTable[0]] }, { normalColor: 'red;}' }, { timezone: 'unknown' } ]) {
    assert.throws(() => validateConfig(Config(changes)))
  }
  assert.doesNotThrow(() => validateConfig(config))
})
test('new users receive exactly one equipped plain wooden rod and 100 emeralds', () => {
  const p = g.createPlayer('alice')
  assert.equal(p.wallet, 100); assert.equal(p.rods.length, 1)
  assert.equal(g.equippedRod(p).name, '木钓鱼竿')
  assert.equal(g.equippedRod(p).unbreaking, 0); assert.equal(g.equippedRod(p).luck, 0)
})
test('daily quota and durability both clamp a request exceeding the configured limit', () => {
  const p = funded(); p.casts = 45
  const result = g.startFishing(p, 500, config, 1000, () => 0)
  assert.equal(result.casts, 5); assert.equal(p.casts, 50); assert.equal(p.rods[0].durability, 25)
  assert.equal(g.finishFishing(p, 1000).drops['生鳕鱼'], 5)
  assert.throws(() => g.startFishing(p, 1, config), /今日钓鱼次数已用完，明天再来吧/)
})
test('partial durability is used and an exhausted rod remains repairable', () => {
  const p = funded(); p.rods[0].durability = 3
  const result = g.startFishing(p, 10, config, 0, () => 0)
  assert.equal(result.casts, 3); assert.equal(p.rods[0].durability, 0)
  g.finishFishing(p, 0)
  assert.throws(() => g.startFishing(p, 1, config), /损坏/)
  g.repair(p, 1, config); assert.equal(p.rods[0].durability, 30); assert.equal(p.wallet, 99850)
})
test('no equipped rod and invalid quantities leave casts and inventory untouched', () => {
  const p = funded(); p.equippedId = null
  assert.throws(() => g.startFishing(p, 1, config), /尚未装备/)
  assert.equal(p.casts, 0)
  for (const input of ['0', '-1', '1.5', 'NaN', '1e3', '9007199254740992']) assert.throws(() => g.positive(input))
})
test('one batch waits 20 to 40 seconds, persists drops, and settles only once', () => {
  for (const [rng, seconds] of [[() => 0, 20], [n => n - 1, 40]]) {
    const p = funded(); const c = Config({})
    const pending = g.startFishing(p, 5, c, 100, rng)
    assert.equal(pending.finishAt, 100 + seconds * 1000)
    assert.equal(g.finishFishing(p, pending.finishAt - 1), null)
    assert.equal(Object.keys(p.inventory).length, 0)
    assert(g.finishFishing(p, pending.finishAt)); assert.equal(g.finishFishing(p, pending.finishAt), null)
    assert.equal(Object.values(p.inventory).reduce((a, b) => a + b, 0), 5)
  }
})
test('50% enchant boundary charges on failure, upgrades exactly one level, caps at three', () => {
  const p = funded(); g.addItem(p, BOOKS[0], 5)
  assert.match(g.enchant(p, 1, BOOKS[0], config, () => 50), /失败/)
  assert.equal(p.wallet, 99700); assert.equal(p.inventory[BOOKS[0]], 4); assert.equal(p.rods[0].unbreaking, 0)
  for (let level = 1; level <= 3; level++) {
    g.enchant(p, 1, BOOKS[0], config, () => 49)
    assert.equal(p.rods[0].unbreaking, level)
    assert.equal(g.maxDurability(p.rods[0]), [30, 50, 70, 90][level])
  }
  const snapshot = structuredClone(p)
  assert.throws(() => g.enchant(p, 1, BOOKS[0], config), /3级/); assert.deepEqual(p, snapshot)
})
test('book consumption can be disabled and both enchantments coexist', () => {
  const p = funded(), c = Config({ consumeEnchantBook: false, enchantCost: 123 })
  g.enchant(p, 1, '耐久', c, () => 0); g.enchant(p, 1, '海之眷顾', c, () => 0)
  assert.equal(p.wallet, 99754); assert.deepEqual(p.inventory, {})
  assert.equal(p.rods[0].unbreaking, 1); assert.equal(p.rods[0].luck, 1)
})
test('luck levels use exact 3%, 6%, 9% boundaries; doubling consumes one cast and durability', () => {
  for (let level = 1; level <= 3; level++) {
    for (let chance = 0; chance < 100; chance++) {
      const p = funded(); p.rods[0].luck = level
      let call = 0
      const result = g.startFishing(p, 1, config, 0, () => call++ === 0 ? 0 : chance * 100)
      assert.equal(result.drops['生鳕鱼'], chance < DOUBLE_PERCENT[level] ? 2 : 1)
      assert.equal(p.casts, 1); assert.equal(p.rods[0].durability, 29)
    }
  }
})
test('zero-weight items are never drawn and configured prices are used', () => {
  const c = Config({ lootTable: config.lootTable.map((i, n) => ({ ...i, weight: n === 1 ? 1 : 0, price: 77 })) })
  const p = funded(), result = g.startFishing(p, 20, c, 0, () => 0)
  assert.deepEqual(result.drops, { 鲑鱼: 20 }); assert.equal(g.salePrice('鲑鱼', market(), c), 77)
})
test('markets choose 5 to 15 distinct items with -50% to 200% changes and stable daily quotes', () => {
  for (let day = 1; day <= 60; day++) {
    const m = market(); g.refreshMarket(m, String(day), config)
    const values = Object.values(m.increases)
    assert(values.length >= 5 && values.length <= 15)
    assert(values.every(n => n >= -50 && n <= 200))
    const snapshot = structuredClone(m)
    g.refreshMarket(m, String(day), config, () => { throw new Error('should not reroll') })
    assert.deepEqual(m, snapshot)
    const restarted = market(); g.refreshMarket(restarted, String(day), config); assert.deepEqual(m, restarted)
  }
  for (const rng of [() => 0, n => n - 1]) {
    const m = market(); g.refreshMarket(m, 'test', config, rng)
    assert.equal(Object.keys(m.increases).length, rng(11) === 0 ? 5 : 15)
  }
})
test('100% increase doubles prices, other items sell at base value, bulk sale keeps all rods', () => {
  const p = funded(), m = { day: 'day', increases: { 生鳕鱼: 100 } }
  g.addItem(p, '生鳕鱼', 2); g.addItem(p, '骨头', 3)
  assert.equal(g.salePrice('生鳕鱼', m, config), 10)
  assert.match(g.sellAll(p, m, config), /26个绿宝石/)
  assert.equal(p.wallet, 100026); assert.equal(p.rods.length, 1); assert.deepEqual(p.inventory, {})
})
test('blacksmith has only 5 plain rod types and 3 books; trading cannot restock it', () => {
  assert.equal(g.shopItems(config).length, 8)
  const p = funded(); g.buy(p, '铁钓鱼竿', 2, config)
  assert.equal(p.rods.length, 3); assert(p.rods.slice(1).every(r => r.unbreaking === 0 && r.luck === 0 && r.durability === 50))
  assert.throws(() => g.buy(p, '生鳕鱼', 1, config), /仅出售/)
  const equippedId = p.equippedId
  assert.match(g.sell(p, '木钓鱼竿', 1, market(), config), /已出售「木钓鱼竿」/)
  assert.equal(p.rods.length, 2); assert.equal(p.equippedId, equippedId)
})
test('warehouse keeps rods first, one per row; regular items are two per row', () => {
  const p = funded(); g.buy(p, '铁钓鱼竿', 1, config)
  for (const item of config.lootTable.slice(0, 3)) g.addItem(p, item.name, 1)
  const rows = g.inventoryRows(p)
  assert.equal(rows.length, 4); assert.equal(rows[0].rods.length, 1); assert.equal(rows[1].rods.length, 1)
  assert.equal(rows[2].items.length, 2); assert.equal(rows[3].items.length, 1)
})
test('overflow after the second page is sold at current quotes with correct odd-row capacity', () => {
  const p = funded(); p.rods = [p.rods[0], ...Array.from({ length: 28 }, () => g.newRod('木钓鱼竿'))]
  g.addItem(p, '生鳕鱼', 2); g.addItem(p, '鲑鱼', 1); g.addItem(p, '骨头', 4)
  const m = { day: 'day', increases: { 骨头: 100 } }, before = p.wallet
  const overflow = g.trimOverflow(p, m, config)
  assert.equal(overflow.earned, 16); assert.equal(p.wallet, before + 16)
  assert.equal(p.inventory['生鳕鱼'], 2); assert.equal(p.inventory['骨头'], undefined)
  assert.equal(g.inventoryPages(p).length, 2); assert.equal(g.inventoryRows(p).length, 30)
  assert.equal(g.trimOverflow(p, m, config).count, 0)
})
test('overflow rods are sold too, while sell-all itself never sells rods', () => {
  const p = funded(); p.rods = Array.from({ length: 31 }, () => g.newRod('木钓鱼竿')); p.equippedId = p.rods[0].id
  const before = p.wallet, overflow = g.trimOverflow(p, market(), config)
  assert.equal(overflow.count, 1); assert.equal(p.rods.length, 30); assert.equal(p.wallet, before)
})
test('calendar dates include month and year, reset once at Shanghai midnight', () => {
  const p = funded(); p.day = '2026-09-11'; p.casts = 50
  g.resetDay(p, '2026-10-11'); assert.equal(p.casts, 0)
  p.casts = 20; g.resetDay(p, '2026-10-11'); assert.equal(p.casts, 20)
  assert.equal(g.dayKey(new Date('2026-10-11T15:59:59Z'), 'Asia/Shanghai'), '2026-10-11')
  assert.equal(g.dayKey(new Date('2026-10-11T16:00:00Z'), 'Asia/Shanghai'), '2026-10-12')
})
test('v1 migration preserves wallet, equipped rod and inventory without another starter gift', () => {
  const old = { wallet: 4321, casts: 17, day: '2026-10-11', equipment: { name: '铁竿', durability: 23, luck: 2 },
    bag: [{ id: 'old', name: '诱钓', count: 3 }, { id: 'fish', name: '鳕鱼', count: 12 }] }
  const p = g.migratePlayer(old, 'alice')
  assert.equal(p.wallet, 4321); assert.equal(p.casts, 17); assert.equal(g.equippedRod(p).name, '铁钓鱼竿')
  assert.equal(p.inventory['耐久附魔书'], 3); assert.equal(p.inventory['生鳕鱼'], 12)
  assert.deepEqual(g.migratePlayer(p, 'alice'), p)
})
test('custom loot names that overlap old aliases can still be sold by their exact name', () => {
  const c = Config({ lootTable: config.lootTable.map((item, i) => i === 0 ? { ...item, name: '鳕鱼', price: 23 } : item) })
  const p = funded(); p.inventory['鳕鱼'] = 3
  assert.match(g.sell(p, '鳕鱼', 2, market(), c), /获得46个绿宝石/)
  assert.equal(p.inventory['鳕鱼'], 1)
})
test('changing market settings regenerates quotes in the configured range on the same day', () => {
  const m = market(); g.refreshMarket(m, 'day', config)
  const changed = Config({ marketMinItems: 6, marketMaxItems: 6, marketMinIncrease: 20, marketMaxIncrease: 20 })
  g.refreshMarket(m, 'day', changed)
  assert.equal(Object.keys(m.increases).length, 6)
  assert(Object.values(m.increases).every(value => value === 20))
})
