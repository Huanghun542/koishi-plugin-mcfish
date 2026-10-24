// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { App, h } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const mock = require('@koishijs/plugin-mock').default
const plugin = require('../lib/index')
const { Config, validateConfig } = require('../lib/config')
const { BOOKS } = require('../lib/catalog')
const { GameRepository } = require('../lib/database')
const { MessageFlow } = require('../lib/core/messages')
const g = require('../lib/game')
const render = require('../lib/render')
const config = changes => Config({ minWaitSeconds: 0, maxWaitSeconds: 0, ...changes })
const funded = () => { const p = g.createPlayer('player'); p.wallet = 100000; return p }

test('help uses configured per-level gains, independent rates and caps without rounding errors or inactive levels', () => {
  for (const text of [plugin.rules(config()), render.helpHtml(config())[0]]) {
    assert(text.includes('耐久：成功率 50%，上限 3 级；每级加成 20 耐久。'))
    assert(text.includes('海之眷顾：成功率 50%，上限 3 级；每级加成 3% 双倍概率'))
    assert(text.includes('饵钓：成功率 50%，上限 3 级；每级加成 5 次额外每日钓鱼'))
  }
  const c = config({ enchantSuccessRate: 71, luckSuccessRate: 82, lureSuccessRate: 93,
    unbreakingMaxLevel: 2, unbreakingBonuses: { level1: 40, level2: 80, level3: 150 },
    luckBonuses: { level1: 1.11, level2: 3.33, level3: 6.66 },
    lureMaxLevel: 1, lureBonuses: { level1: 7 } })
  for (const text of [plugin.rules(c), render.helpHtml(c)[0]]) {
    assert(text.includes('耐久：成功率 71%，上限 2 级；每级加成 40 耐久。'))
    assert(text.includes('海之眷顾：成功率 82%，上限 3 级；每级加成 1.11/2.22/3.33% 双倍概率（依级排列）'))
    assert(text.includes('饵钓：成功率 93%，上限 1 级；每级加成 7 次额外每日钓鱼'))
  }
})

test('three independent enchant rates, ten-level bonuses, default caps and message settings are configured', () => {
  const c = config()
  assert.equal(c.enchantSuccessRate, 50); assert.equal(c.luckSuccessRate, 50); assert.equal(c.lureSuccessRate, 50)
  assert.equal(c.unbreakingMaxLevel, 3); assert.equal(c.luckMaxLevel, 3); assert.equal(c.lureMaxLevel, 3)
  assert.equal(c.enchantFailureDowngrade, false); assert.equal(c.quoteMessages, true); assert.equal(c.forwardFishingResults, true)
  for (let level = 1; level <= 10; level++) {
    assert.equal(g.enchantBonus('unbreaking', level, c), level * 20)
    assert.equal(g.enchantBonus('luck', level, c), level * 3)
    assert.equal(g.enchantBonus('lure', level, c), level * 5)
  }
  for (const field of ['enchantSuccessRate', 'luckSuccessRate', 'lureSuccessRate']) {
    assert.throws(() => validateConfig({ ...c, [field]: 101 }))
  }
  for (const field of ['unbreakingMaxLevel', 'luckMaxLevel', 'lureMaxLevel']) {
    for (const level of [0, 11, 1.5]) assert.throws(() => validateConfig({ ...c, [field]: level }))
  }
  assert.throws(() => validateConfig(config({ unbreakingMaxLevel: 10, unbreakingBonuses: { level9: 1 } })), /递增/)
})

test('lure book costs 350, has a named icon, retains half-price protection and uses its independent success rate', () => {
  const c = config({ enchantSuccessRate: 0, luckSuccessRate: 100, lureSuccessRate: 73 })
  assert.equal(g.shopItems(c).find(item => item.name === BOOKS[2]).price, 350)
  assert.equal(g.salePrice(BOOKS[2], { day: '', increases: { [BOOKS[2]]: 200 } }, c), 175)
  assert.equal(g.salePrice(BOOKS[2], { day: '', increases: {} }, config({ saleMultiplier: 10 })), 175)
  const p = funded(), equipped = p.equippedId
  assert.match(g.buy(p, '饵钓', 1, c), /消耗350个绿宝石[\s\S]*成功率73%[\s\S]*绑定用户/)
  assert.equal(p.equippedId, equipped); assert.equal(p.inventory[BOOKS[2]], 1)
  assert(render.shopHtml(p, c)[0].includes('350 绿宝石 / 件'))
  assert.notEqual(render.itemIcon(BOOKS[2]), render.itemIcon('不存在'))
  p.inventory['生鳕鱼'] = 1; g.sellAll(p, { day: '', increases: {} }, c)
  assert.equal(p.inventory[BOOKS[2]], 1)
})

test('lure is user-bound, survives rod changes and sales, and extends actual daily casts without resetting usage', () => {
  const c = config({ lureSuccessRate: 100 }), p = funded()
  p.inventory[BOOKS[2]] = 3; p.casts = 50
  const rod = structuredClone(p.rods[0])
  assert.match(g.enchant(p, 1, '饵钓', c, () => 99), /饵钓提升至1级[\s\S]*55次/)
  assert.deepEqual(p.rods[0], rod); assert(!Object.hasOwn(p.rods[0], 'lure'))
  const result = g.startFishing(p, 99, c, 0, () => 0)
  assert.equal(result.casts, 5); assert.equal(p.casts, 55); assert.equal(p.rods[0].durability, 25)
  g.finishFishing(p, 0, c)
  assert.throws(() => g.startFishing(p, 1, c), /今日钓鱼次数已用完/)
  g.buy(p, '铁钓鱼竿', 1, c); g.sell(p, '木钓鱼竿', 1, { day: '', increases: {} }, c)
  assert.equal(p.lureLevel, 1); assert.equal(g.dailyFishingLimit(p, c), 55); assert.equal(p.casts, 55)
  g.enchant(p, 1, '饵钓附魔书', c, () => 99)
  assert.equal(g.startFishing(p, 99, c, 0, () => 0).casts, 5)
  assert.equal(p.casts, 60); g.finishFishing(p, 0, c)
  g.resetDay(p, 'next-day'); assert.equal(p.casts, 0); assert.equal(p.lureLevel, 2)
  const html = render.warehouseHtml(p, { day: '', increases: {} }, c, '玩家')[0]
  assert(html.includes('今日钓鱼 0/60')); assert(html.includes('饵钓 2 级'))
  for (const row of html.matchAll(/<small>耐久 ([^<]*)<\/small>/g)) assert(!row[1].includes('饵钓'))
})

test('all three enchantments stop at their independently configured caps up to ten without further charges', () => {
  const c = config({ consumeEnchantBook: false, enchantCost: 0, enchantSuccessRate: 100, luckSuccessRate: 100, lureSuccessRate: 100,
    unbreakingMaxLevel: 10, luckMaxLevel: 7, lureMaxLevel: 4 })
  const p = funded()
  for (const [book, cap, getLevel] of [[BOOKS[0], 10, () => p.rods[0].unbreaking], [BOOKS[1], 7, () => p.rods[0].luck], [BOOKS[2], 4, () => p.lureLevel]]) {
    for (let level = 1; level <= cap; level++) { g.enchant(p, 1, book, c, () => 99); assert.equal(getLevel(), level) }
    const before = structuredClone(p)
    assert.throws(() => g.enchant(p, 1, book, c), new RegExp(cap + '级上限'))
    assert.deepEqual(p, before)
  }
  assert.equal(g.maxDurability(p.rods[0], c), 230); assert.equal(g.dailyFishingLimit(p, c), 70)
})

test('independent success rates apply to each book and purchasing guidance matches those rates', () => {
  const c = config({ enchantSuccessRate: 0, luckSuccessRate: 100, lureSuccessRate: 25 }), p = funded()
  for (const [book, rate] of [[BOOKS[0], 0], [BOOKS[1], 100], [BOOKS[2], 25]]) {
    assert.match(g.buy(p, book, 2, c), new RegExp('成功率' + rate + '%'))
  }
  assert.match(g.enchant(p, 1, BOOKS[0], c, () => 0), /附魔失败/)
  assert.match(g.enchant(p, 1, BOOKS[1], c, () => 99), /附魔成功/)
  assert.match(g.enchant(p, 1, BOOKS[2], c, () => 25), /附魔失败/)
  assert.match(g.enchant(p, 1, BOOKS[2], c, () => 24), /附魔成功/)
  assert.equal(p.rods[0].unbreaking, 0); assert.equal(p.rods[0].luck, 1); assert.equal(p.lureLevel, 1)
})

test('failed enchants downgrade only the corresponding level, clamp durability and never reset daily cast counts', () => {
  const c = config({ enchantFailureDowngrade: true }), p = funded()
  p.rods[0].unbreaking = 2; p.rods[0].luck = 2; p.rods[0].durability = 70; p.lureLevel = 2; p.casts = 60
  for (const book of BOOKS) p.inventory[book] = 3
  assert.match(g.enchant(p, 1, BOOKS[0], c, () => 99), /耐久已降低至1级/)
  assert.equal(p.rods[0].durability, 50); assert.equal(p.rods[0].luck, 2); assert.equal(p.lureLevel, 2)
  assert.match(g.enchant(p, 1, BOOKS[1], c, () => 99), /海之眷顾已降低至1级/)
  assert.equal(p.rods[0].unbreaking, 1); assert.equal(p.lureLevel, 2)
  assert.match(g.enchant(p, 1, BOOKS[2], c, () => 99), /饵钓已降低至1级/)
  assert.equal(g.dailyFishingLimit(p, c), 55); assert.equal(p.casts, 60)
  assert.throws(() => g.startFishing(p, 1, c), /今日钓鱼次数已用完/)
  assert.equal(p.wallet, 99100)
  for (const book of BOOKS) { g.enchant(p, 1, book, c, () => 99); g.enchant(p, 1, book, c, () => 99) }
  assert.equal(p.rods[0].unbreaking, 0); assert.equal(p.rods[0].luck, 0); assert.equal(p.lureLevel, 0)
  assert.equal(p.wallet, 97300); assert.equal(p.rods[0].durability, 30)
})

test('downgrade is disabled by default and invalid resources never cost levels or currency', () => {
  for (const book of BOOKS) {
    const p = funded(), c = config(); p.rods[0].unbreaking = 1; p.rods[0].luck = 1; p.lureLevel = 1
    p.inventory[book] = 1
    g.enchant(p, 1, book, c, () => 99)
    assert.equal(p.rods[0].unbreaking, 1); assert.equal(p.rods[0].luck, 1); assert.equal(p.lureLevel, 1)
    const before = structuredClone(p)
    assert.throws(() => g.enchant(p, 1, book, config({ enchantFailureDowngrade: true }), () => 99), /数量不足/)
    assert.deepEqual(p, before)
  }
})

test('custom lure and rod bonuses apply at level ten and luck above 100 percent still produces exactly two items per cast', () => {
  const c = config({ lureMaxLevel: 10, luckMaxLevel: 10, lureBonuses: { level10: 123 }, luckBonuses: { level10: 250 } })
  validateConfig(c)
  const p = funded(); p.lureLevel = 10; p.rods[0].luck = 10
  assert.equal(g.dailyFishingLimit(p, c), 173); assert.equal(g.luckPercent(p.rods[0], c), 100)
  let call = 0
  const pending = g.startFishing(p, 5, c, 0, () => call++ % 2 === 0 ? 0 : 9999)
  assert.equal(pending.doubled, 5); assert.deepEqual(pending.drops, { 生鳕鱼: 10 }); assert.deepEqual(pending.bonusDrops, { 生鳕鱼: 5 })
  assert.equal(p.rods[0].durability, 25); assert.equal(p.casts, 5)
})

test('two result parts separate normal and extra drops exactly, with zero-bonus and legacy-batch fallbacks', () => {
  const c = config({ luckBonuses: { level1: 50 } }), p = funded(); p.rods[0].luck = 1
  const rolls = [0, 0, 70, 9999, 0, 9999, 70, 0]
  const pending = g.startFishing(p, 4, c, 0, () => rolls.shift())
  assert.deepEqual(pending.drops, { 生鳕鱼: 3, 鲑鱼: 3 }); assert.deepEqual(pending.bonusDrops, { 生鳕鱼: 1, 鲑鱼: 1 })
  const [base, extra] = g.fishingResultParts(pending)
  assert(base.includes('生鳕鱼 ×2')); assert(base.includes('鲑鱼 ×2'))
  assert(extra.includes('生鳕鱼 ×1')); assert(extra.includes('鲑鱼 ×1')); assert(extra.includes('触发 2 次'))
  g.finishFishing(p, 0, c); assert.deepEqual(p.inventory, pending.drops); assert.equal(g.finishFishing(p, 0, c), null)
  const old = structuredClone(pending); delete old.bonusDrops
  assert(g.fishingResultParts(old)[0].includes('生鳕鱼 ×3')); assert(g.fishingResultParts(old)[1].includes('已计入上方结果'))
  assert.equal(g.fishingResultParts({ ...old, doubled: 0 })[1], '本次未触发双倍产出')
})

test('message options quote text and images, while combined results contain two bot-authored nodes without quotes', async () => {
  for (const quoteMessages of [false, true]) for (const forwardFishingResults of [false, true]) {
    const sent = [], c = config({ quoteMessages, forwardFishingResults })
    const session = { messageId: 'trigger', selfId: 'bot', bot: { user: { name: '钓鱼机器人' } }, async send(text) { sent.push(text); return [String(sent.length)] } }
    const flow = new MessageFlow({ logger() { return { warn() {} } } }, session, c)
    await flow.send('钱包 <quote id="evil"/>'); await flow.send('<img src="data:image/png;base64,AA=="/>', 'notice', true)
    assert.equal(h.parse(sent[0])[0].type, quoteMessages ? 'quote' : 'text')
    assert.equal(h.parse(sent[1])[0].type, quoteMessages ? 'quote' : 'img')
    assert(!sent[0].includes('<quote id="evil"/>'))
    await flow.sendFishing(['基础产物', '双倍额外产物'])
    if (forwardFishingResults) {
      assert.equal(sent.length, 3)
      const forward = h.parse(sent[2])[0]
      assert.equal(forward.type, 'message'); assert.equal(forward.attrs.forward, true); assert.equal(forward.children.length, 2)
      assert(!sent[2].includes('<quote'))
      for (const node of forward.children) assert.equal(node.children[0].attrs.id, 'bot')
      assert.equal(forward.children[0].children[1].attrs.content, '基础产物')
      assert.equal(forward.children[1].children[1].attrs.content, '双倍额外产物')
    } else {
      assert.equal(sent.length, 4)
      assert.equal(h.parse(sent[2])[0].type, quoteMessages ? 'quote' : 'text')
      assert.equal(h.parse(sent[3])[0].type, quoteMessages ? 'quote' : 'text')
    }
  }
})

test('unsupported forward delivery falls back to two messages and recalls all successful results after the flow', async () => {
  const sent = [], removed = [], timers = []; let calls = 0
  const session = { messageId: 'trigger', channelId: 'room', bot: { user: { name: 'MC 钓鱼' }, async deleteMessage(channel, id) { removed.push(id) } },
    async send(text) { calls++; if (calls === 1) throw Error('forward unsupported'); sent.push(text); return [String(calls)] } }
  const flow = new MessageFlow({ logger() { return { warn() {} } }, setTimeout(fn) { timers.push(fn) } }, session, config({ recallTargets: ['result'] }))
  await flow.sendFishing(['基础产物', '双倍额外产物'])
  assert.equal(sent.length, 2); assert(sent.every(s => s.startsWith('<quote id="trigger"/>')))
  assert.equal(timers.length, 0); flow.end(); await timers[0](); assert.deepEqual(removed, ['2', '3'])
})

test('merged result recalls use only the returned forwarded message ID and do not add duplicate normal sends', async () => {
  const sent = [], removed = [], timers = []
  const session = { selfId: 'bot', messageId: 'trigger', channelId: 'room', bot: { async deleteMessage(channel, id) { removed.push(id) } },
    async send(text) { sent.push(text); return ['forward-id'] } }
  const flow = new MessageFlow({ setTimeout(fn) { timers.push(fn) } }, session, config({ recallTargets: ['result'] }))
  await flow.sendFishing(['基础产物', '双倍额外产物']); flow.end(); await timers[0]()
  assert.equal(sent.length, 1); assert.deepEqual(removed, ['forward-id']); assert(!sent[0].includes('<quote'))
})

test('SQLite restart preserves user lure levels and the pending bonus breakdown, while old saves gain level zero', async () => {
  const root = path.resolve(process.env.MCFISH_TEST_DIR || os.tmpdir()), directory = await fs.mkdtemp(path.join(root, 'mcfish-v25-'))
  const c = config(); let app
  const open = async () => { app = new App(); app.plugin(sqlite, { path: path.join(directory, 'fish.db') }); const repo = new GameRepository(app, c); await app.start(); return repo }
  try {
    let repo = await open()
    const before = await repo.run('lure', p => { p.lureLevel = 2; p.rods[0].luck = 1; g.startFishing(p, 4, c, 0, () => 0); return p })
    await app.stop(); repo = await open(); assert.deepEqual(await repo.run('lure', p => p), before)
    const done = await repo.run('lure', p => g.finishFishing(p, 0, c))
    assert.deepEqual(done.bonusDrops, { 生鳕鱼: 4 }); assert.equal((await repo.run('lure', p => p)).inventory['生鳕鱼'], 8)
    const old = g.createPlayer('old'); delete old.lureLevel; old.wallet = 9876
    await app.database.upsert('mcfish_player', [{ id: 'old', state: old }])
    const migrated = await repo.run('old', p => p)
    assert.equal(migrated.lureLevel, 0); assert.equal(migrated.wallet, 9876); assert.equal(migrated.rods.length, 1)
  } finally {
    await app?.stop(); if (path.dirname(directory) !== root) throw Error('Unexpected test directory')
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('Koishi default result forwarding, quoted replies and user-bound lure work end to end', async () => {
  const c = config({ images: false, lureSuccessRate: 100, luckBonuses: { level1: 150, level2: 200, level3: 250 } })
  const app = new App({ prefix: '', autoAuthorize: 1 }); app.plugin(sqlite, { path: ':memory:' })
  const mockFork = app.plugin(mock), fork = app.plugin(plugin, c); await app.start()
  const repo = new GameRepository(app, c), id = JSON.stringify(['mock', 'lure-user'])
  try {
    await app.mock.initUser('lure-user'); const client = app.mock.client('lure-user')
    await repo.run(id, p => { p.wallet = 5000; p.rods[0].luck = 1; p.casts = 50 })
    await client.shouldReply('购买 饵钓附魔书 1', /<quote[\s\S]*消耗350个绿宝石/)
    await client.shouldReply('附魔 1 饵钓', /<quote[\s\S]*饵钓提升至1级/)
    const replies = await client.receive('开始2次钓鱼')
    assert.equal(replies.length, 3); assert(replies[0].startsWith('<quote'))
    assert(replies[1].includes('本次完成 2 次钓鱼')); assert(!replies[1].includes('<quote'))
    assert(replies[2].includes('触发 2 次双倍产出')); assert(!replies[2].includes('<quote'))
    assert.equal((await repo.run(id, p => p)).casts, 52)
    await client.shouldReply('仓库', /今日钓鱼 52\/55 · 饵钓 1 级/)
    await repo.run(id, p => { g.startFishing(p, 1, c, Date.now() - 1, () => 0) })
    const recovered = await client.receive('钓鱼钱包')
    assert.equal(recovered.length, 3); assert(recovered[0].includes('上次钓鱼已完成')); assert(recovered[1].includes('额外获得'))
    assert(recovered[2].startsWith('<quote'))
    const state = await repo.run(id, p => p), total = Object.values(state.inventory).reduce((a, b) => a + b, 0)
    assert.equal(total, 6); assert.equal(state.pending, null); assert.equal(state.lureLevel, 1)
  } finally { await fork.dispose(); await mockFork.dispose(); await app.stop() }
})
