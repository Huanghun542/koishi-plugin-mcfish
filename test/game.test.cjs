// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const g = require('../lib/game')
const { ITEMS } = require('../lib/catalog')
const { cardHtml } = require('../lib/render')
const config = { initialBalance: 200, dailyLimit: 50, timezone: 'Asia/Shanghai' }
const fresh = () => g.createPlayer('alice', config)
const market = () => ({ id: 'global', day: '2026-10-11', discounts: Object.fromEntries(ITEMS.map(i => [i.name, 100])), stock: [] })
const zero = () => 0

test('complete dates reset fishing and trading across months and years', () => {
  const p = fresh()
  p.day = '2026-09-11'; p.casts = 50; p.rodTrades = 10; p.purchases = 30; p.starterPurchases = 3
  g.resetDay(p, '2026-10-11')
  assert.equal(p.casts, 0); assert.equal(p.rodTrades, 0); assert.equal(p.purchases, 0)
  assert.equal(p.starterPurchases, 3)
  assert.equal(g.dayKey(new Date('2026-12-31T16:00:00Z'), 'Asia/Shanghai'), '2027-01-01')
})
test('initial balance is granted once and only three discounted starter rods are available', () => {
  const p = fresh(); p.wallet = 500
  for (let i = 0; i < 3; i++) { g.startRod(p); assert.equal(p.equipment.name, '木竿'); p.equipment = null }
  assert.equal(p.wallet, 200)
  assert.throws(() => g.startRod(p), /三次/)
})
test('base probabilities cover exactly 100 draws and use the upstream category weights', () => {
  const p = fresh(); const probabilities = g.zoneWeights(p)
  assert.deepEqual(probabilities, { treasure: 1, pole: 4, fish: 25, waste: 30, air: 40 })
  const actual = {}
  for (let i = 0; i < 100; i++) {
    const category = g.weighted(Object.entries(probabilities), () => i)
    actual[category] = (actual[category] || 0) + 1
  }
  assert.deepEqual(actual, probabilities)
})
test('luck, fishing buff and dolphin keep the category total at 100', () => {
  const p = fresh(); p.equipment = g.equipment('木竿'); p.equipment.luck = 3
  g.addStack(p.bag, '鳕鱼', 101)
  assert.deepEqual(g.zoneWeights(p), { treasure: 5, pole: 11, fish: 38, waste: 36, air: 10 })
  g.addStack(p.bag, '海豚')
  assert.equal(g.zoneWeights(p).waste, 46)
  assert.equal(g.zoneWeights(p).air, 0)
})
test('fishing clamps casts to daily quota and durability, breaking exhausted equipment', () => {
  const p = fresh(); p.equipment = g.equipment('木竿'); p.equipment.durability = 3; p.casts = 49
  const result = g.fish(p, 10, config, zero)
  assert.equal(result.casts, 1); assert.equal(p.equipment.durability, 2); assert.equal(p.casts, 50)
  assert.throws(() => g.fish(p, 1, config, zero), /今天已/)
  const q = fresh(); q.equipment = g.equipment('木竿'); q.equipment.durability = 1
  g.fish(q, 1, config, zero); assert.equal(q.equipment, null)
})
test('trident triples drops and awards purification books per 75 resolved rolls', () => {
  const p = fresh(); p.equipment = g.equipment('三叉戟')
  const result = g.fish(p, 25, config, zero)
  assert.equal(result.casts, 25); assert.equal(result.drops['诱钓'], 75)
  assert.equal(g.count(p, '净化书'), 1); assert.equal(p.blessingProgress, 0)
})
test('axolotl consumes three fish per cast and multiplies ordinary drops by five', () => {
  const p = fresh(); p.equipment = g.equipment('美西螈'); g.addStack(p.bag, '鳕鱼', 6)
  const result = g.fish(p, 2, config, zero)
  assert.equal(result.drops['诱钓'], 10); assert.equal(g.count(p, '鳕鱼'), 0)
  assert.equal(p.equipment.durability, 999)
  g.fish(p, 1, config, zero); assert.equal(p.equipment, null)
})
test('equipment swaps preserve both old and new item attributes', () => {
  const p = fresh(); p.equipment = g.equipment('金竿'); p.equipment.lure = 2
  const gear = g.equipment('铁竿'); gear.durability = 7
  const stack = g.addStack(p.bag, '铁竿', 1, gear)
  g.equip(p, stack.id)
  assert.equal(p.equipment.durability, 7)
  assert.equal(p.bag.find(s => s.name === '金竿').equipment.lure, 2)
})
test('repair consumes one rod, caps durability and respects repair limit', () => {
  const p = fresh(); p.equipment = g.equipment('木竿'); p.equipment.durability = 1
  const stack = g.addStack(p.bag, '木竿', 1, g.equipment('木竿'))
  g.repair(p, stack.id, zero); assert.equal(p.equipment.durability, 25); assert.equal(p.equipment.repairs, 1)
  p.equipment.repairs = 10
  assert.throws(() => g.repair(p, 'none'), /上限/)
})
test('repair master and trident restore full durability', () => {
  const p = fresh(); p.equipment = g.equipment('木竿'); p.equipment.durability = 1
  for (let i = 0; i < 11; i++) g.addStack(p.bag, '木竿', 1, g.equipment('木竿'))
  g.repair(p, p.bag[0].id, zero); assert.equal(p.equipment.durability, 30)
  p.equipment = g.equipment('三叉戟'); p.equipment.durability = 2
  const stack = g.addStack(p.bag, '三叉戟', 1, g.equipment('三叉戟'))
  g.repair(p, stack.id, zero); assert.equal(p.equipment.durability, 301)
})
test('enchantment consumes books for failed attempts but preserves books at level cap', () => {
  const p = fresh(); p.equipment = g.equipment('木竿'); g.addStack(p.bag, '诱钓', 3)
  assert.match(g.enchant(p, '诱钓', () => 99), /失败/)
  assert.equal(g.count(p, '诱钓'), 2)
  g.enchant(p, '诱钓', zero); assert.equal(p.equipment.lure, 1)
  p.equipment.lure = 3; assert.throws(() => g.enchant(p, '诱钓', zero), /III/)
  assert.equal(g.count(p, '诱钓'), 1)
})
test('crafting rejects repeated IDs before consuming materials', () => {
  const p = fresh()
  const stacks = Array.from({ length: 3 }, () => g.addStack(p.bag, '木竿', 1, g.equipment('木竿')))
  assert.throws(() => g.craft(p, '铁竿', [stacks[0].id, stacks[0].id, stacks[1].id]), /不同/)
  assert.equal(p.bag.length, 3)
})
test('bulk crafting handles independent failures, averages enchantments and keeps remainder', () => {
  const p = fresh()
  for (let i = 0; i < 7; i++) { const gear = g.equipment('木竿'); gear.lure = i % 3; g.addStack(p.bag, '木竿', 1, gear) }
  const ids = p.bag.slice(0, 6).map(s => s.id)
  let batch = 0; const result = g.craft(p, '铁竿', ids, () => batch++ === 0 ? 0 : 99)
  assert.match(result, /成功 1，失败 1/)
  assert.equal(g.count(p, '木竿'), 1); assert.equal(g.count(p, '铁竿'), 1)
  assert.equal(p.bag.find(s => s.name === '铁竿').equipment.lure, 1)
})
test('purification removes equal numbers of curses and books', () => {
  const p = fresh(); g.addStack(p.bag, '宝藏诅咒', 3); g.addStack(p.bag, '净化书', 2)
  assert.throws(() => g.purify(p, 3), /不足/)
  g.purify(p, 2); assert.equal(g.count(p, '宝藏诅咒'), 1); assert.equal(g.count(p, '净化书'), 0)
})
test('market refresh is idempotent within a day and resets across matching day-of-month', () => {
  const m = { id: 'global', day: '', discounts: {}, stock: [] }
  g.refreshMarket(m, '2026-09-11', zero)
  const first = JSON.stringify(m)
  g.refreshMarket(m, '2026-09-11', () => 99)
  assert.equal(JSON.stringify(m), first)
  g.refreshMarket(m, '2026-10-11', zero)
  assert.equal(m.stock.find(s => s.name === '初始木竿').count, 2)
})
test('rod IDs remain unique when created within the same millisecond', () => {
  const bag = []
  for (let i = 0; i < 100; i++) g.addStack(bag, '木竿', 1, g.equipment('木竿'), 1)
  assert.equal(new Set(bag.map(s => s.id)).size, 100)
})
test('price of exhausted/over-repaired rods cannot become negative', () => {
  const gear = g.equipment('木竿'); gear.durability = 1; gear.repairs = 100
  assert.equal(g.priceOf(market(), { name: '木竿', equipment: gear }), 1)
})
test('a cancelled quote does not consume coupons, money or quota', () => {
  const p = fresh(); p.coupons = 3; const m = market(); const stock = g.addStack(m.stock, '鳕鱼', 10)
  const before = JSON.stringify([p, m]); const offer = g.quote(p, m, 'buy', stock.id, 2)
  assert.equal(offer.total, 10); assert.equal(JSON.stringify([p, m]), before)
  g.transact(p, m, offer)
  assert.equal(p.coupons, 1); assert.equal(p.wallet, 190); assert.equal(p.purchases, 2)
  assert.equal(stock.count, 8)
})
test('buying the twentieth undiscounted order grants exactly three half-price units', () => {
  const p = fresh(); p.purchaseProgress = 19; const m = market(); const stock = g.addStack(m.stock, '鳕鱼', 10)
  g.transact(p, m, g.quote(p, m, 'buy', stock.id))
  assert.equal(p.coupons, 3); assert.equal(p.purchaseProgress, 0)
})
test('changed inventory or changed daily price invalidates a quote', () => {
  const p = fresh(); const m = market(); const stock = g.addStack(m.stock, '鳕鱼', 10)
  const offer = g.quote(p, m, 'buy', stock.id)
  stock.count--; assert.throws(() => g.transact(p, m, offer), /变化/)
  stock.count++; m.day = '2026-10-12'; assert.throws(() => g.transact(p, m, offer), /跨日/)
  assert.equal(p.wallet, 200)
})
test('rod trade cap, item purchase cap and purification book restrictions apply', () => {
  const p = fresh(); const m = market(); const rod = g.addStack(m.stock, '木竿', 1, g.equipment('木竿'))
  p.rodTrades = 10; assert.throws(() => g.quote(p, m, 'buy', rod.id), /10 支/)
  const f = g.addStack(m.stock, '鳕鱼', 10); p.purchases = 29
  assert.equal(g.quote(p, m, 'buy', f.id, 10).count, 1)
  const book = g.addStack(m.stock, '净化书', 10)
  assert.throws(() => g.quote(p, m, 'buy', book.id), /没有诅咒/)
})
test('every ten rod trades grants one curse and non-rod sales do not consume purchase quota', () => {
  const p = fresh(); p.curseProgress = 9
  const m = market(); const rod = g.addStack(p.bag, '木竿', 1, g.equipment('木竿'))
  g.transact(p, m, g.quote(p, m, 'sell', rod.id))
  assert.equal(g.count(p, '宝藏诅咒'), 1); assert.equal(p.rodTrades, 1)
  const f = g.addStack(p.bag, '鳕鱼', 3)
  g.transact(p, m, g.quote(p, m, 'sell', f.id, 3))
  assert.equal(p.purchases, 0); assert.equal(m.stock.find(s => s.name === '鳕鱼').count, 3)
})
test('selling records consumes the extra record without resurrecting or double counting it', () => {
  const p = fresh(); const m = market(); const records = g.addStack(p.bag, '唱片', 3)
  const offer = g.quote(p, m, 'sell', records.id, 2, true)
  assert.equal(offer.total, 9600)
  g.transact(p, m, offer)
  assert.equal(g.count(p, '唱片'), 0); assert.equal(p.wallet, 9800)
  assert.equal(m.stock.find(s => s.name === '唱片').count, 2)
})
test('over ten curses show actual negative proceeds and require sufficient balance', () => {
  const p = fresh(); const m = market(); g.addStack(p.bag, '宝藏诅咒', 11)
  const records = g.addStack(p.bag, '唱片')
  assert.throws(() => g.quote(p, m, 'sell', records.id), /倒贴/)
  p.wallet = 1000; const offer = g.quote(p, m, 'sell', records.id)
  assert.equal(offer.total, -240)
  g.transact(p, m, offer); assert.equal(p.wallet, 760)
})
test('selling all waste applies taxes and curses once and preserves non-waste inventory', () => {
  const p = fresh(); const m = market()
  g.addStack(p.bag, '海草', 2); g.addStack(p.bag, '木棍', 3); g.addStack(p.bag, '鳕鱼', 7); g.addStack(p.bag, '宝藏诅咒')
  const offer = g.quote(p, m, 'waste', '')
  assert.equal(offer.total, 36)
  g.transact(p, m, offer); assert.equal(p.wallet, 236); assert.equal(g.count(p, '海草'), 0)
  assert.equal(g.count(p, '鳕鱼'), 7)
})
test('numeric validation rejects negative, fractional, infinite and oversized inputs', () => {
  for (const input of ['-1', '0', '1.2', 'Infinity', 'NaN', '9007199254740993']) assert.throws(() => g.positive(input))
})
test('image cards escape all text and contain no external assets', () => {
  const html = cardHtml('<script>x</script>', '<img src=x onerror=alert(1)>')
  assert(!html.includes('<script>')); assert(!html.includes('<img'))
  assert(html.includes('&lt;script&gt;'))
})
