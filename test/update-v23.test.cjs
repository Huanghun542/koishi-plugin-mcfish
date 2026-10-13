// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { App } = require('koishi')
const sqlite = require('@koishijs/plugin-database-sqlite').default
const mock = require('@koishijs/plugin-mock').default
const plugin = require('../lib/index')
const { validateConfig } = require('../lib/config')
const { GameRepository } = require('../lib/database')
const { gameplayNotes } = require('../lib/core/help')
const render = require('../lib/render')
const g = require('../lib/game')
const instant = changes => plugin.Config({ minWaitSeconds: 0, maxWaitSeconds: 0, ...changes })

test('configured enchant probabilities have exact percentage boundaries and charge for every attempt', () => {
  for (const rate of [0, 25, 50, 100]) {
    const config = instant({ enchantSuccessRate: rate })
    let successes = 0
    for (let roll = 0; roll < 100; roll++) {
      const p = g.createPlayer('enchant'); p.wallet = 1000; p.inventory['耐久附魔书'] = 1
      const reply = g.enchant(p, 1, '耐久', config, () => roll)
      assert.equal(p.wallet, 700); assert.equal(p.inventory['耐久附魔书'], undefined)
      assert.equal(p.rods[0].unbreaking, roll < rate ? 1 : 0)
      if (reply.includes('附魔成功')) successes++
    }
    assert.equal(successes, rate)
  }
})

test('waiting range includes each endpoint, fixed times and immediate settlement', () => {
  for (const [min, max] of [[20, 40], [7, 9], [0, 2], [4, 4], [0, 0]]) {
    const config = instant({ minWaitSeconds: min, maxWaitSeconds: max })
    for (let offset = 0; offset <= max - min; offset++) {
      const p = g.createPlayer('wait'); let calls = 0
      const pending = g.startFishing(p, 1, config, 100, n => calls++ === 0 ? 0 : offset)
      assert.equal(pending.finishAt, 100 + (min + offset) * 1000)
      assert.equal(calls, min === max ? 1 : 2)
    }
  }
  for (const change of [{ minWaitSeconds: 41 }, { minWaitSeconds: -1 }, { maxWaitSeconds: 3601 },
    { minWaitSeconds: 1.5 }, { enchantSuccessRate: -1 }, { enchantSuccessRate: 101 }, { enchantSuccessRate: 50.5 }]) {
    assert.throws(() => validateConfig({ ...plugin.Config({}), ...change }))
  }
})

test('exact durability is silent before completion and switches to the next usable enchanted rod only after completion', () => {
  const config = plugin.Config({ minWaitSeconds: 20, maxWaitSeconds: 20 })
  const p = g.createPlayer('switch'), broken = g.newRod('铁钓鱼竿'), next = g.newRod('钻石钓鱼竿')
  broken.durability = 0; next.unbreaking = 2; next.durability = 128; p.rods.push(broken, next)
  const originalId = p.equippedId, pending = g.startFishing(p, 30, config, 0, () => 0)
  assert.deepEqual(pending.notes, []); assert.equal(p.equippedId, originalId)
  assert.equal(g.finishFishing(p, 19999, config), null); assert.equal(p.equippedId, originalId)
  const completed = g.finishFishing(p, 20000, config)
  assert.equal(p.equippedId, next.id); assert.equal(next.durability, 128)
  assert.equal(g.fishingText(completed).split('\n').at(-1), '当前鱼竿耐久耗尽，已自动切换到【钻石钓鱼竿】【128/170】')
  assert.equal(g.finishFishing(p, 20000, config), null); assert.equal(p.inventory['生鳕鱼'], 30)
})

test('automatic switching wraps to earlier usable rods and leaves equipment alone when durability remains', () => {
  const config = instant(), p = g.createPlayer('wrap'), last = g.newRod('金钓鱼竿')
  p.rods.push(last); p.equippedId = last.id; last.durability = 1
  g.startFishing(p, 1, config, 0, () => 0); g.finishFishing(p, 0, config)
  assert.equal(p.equippedId, p.rods[0].id)
  g.startFishing(p, 1, config, 0, () => 0)
  const result = g.finishFishing(p, 0, config)
  assert.equal(p.equippedId, p.rods[0].id); assert.deepEqual(result.notes, [])
})

test('insufficient durability still clamps casts; no usable rod reports the configured repair price at the end', () => {
  const config = instant({ repairCost: 222 }), p = g.createPlayer('repair')
  p.rods[0].durability = 3; const broken = g.newRod('铁钓鱼竿'); broken.durability = 0; p.rods.push(broken)
  const pending = g.startFishing(p, 10, config, 0, () => 0)
  assert.equal(pending.casts, 3); assert.deepEqual(pending.notes, ['鱼竿耐久不足，已按剩余 3 点耐久进行钓鱼。'])
  const result = g.finishFishing(p, 0, config)
  assert.equal(p.equippedId, p.rods[0].id)
  assert.equal(g.fishingText(result).split('\n').at(-1), '鱼竿耐久已耗尽，需维修后继续使用【维修将消耗222个绿宝石】')
  assert.equal(p.casts, 3); assert.equal(p.inventory['生鳕鱼'], 3)
})

test('recovering an older exhausted batch replaces its old notice and settles the switch exactly once', () => {
  const config = instant(), p = g.createPlayer('legacy'), next = g.newRod('铁钓鱼竿')
  p.rods.push(next); const pending = g.startFishing(p, 30, config, 0, () => 0)
  pending.notes.push('鱼竿耐久已耗尽，需维修后继续使用。')
  const restored = structuredClone(p), result = g.finishFishing(restored, 1, config)
  assert.equal(restored.equippedId, next.id); assert.equal(result.notes.length, 1)
  assert.match(result.notes[0], /已自动切换到【铁钓鱼竿】【50\/50】/)
  assert.equal(g.finishFishing(restored, 1, config), null); assert.equal(restored.inventory['生鳕鱼'], 30)
})

test('image and text help use configured waiting times, fees and enchant probability', () => {
  const config = plugin.Config({ minWaitSeconds: 7, maxWaitSeconds: 9, enchantSuccessRate: 100, enchantCost: 123, repairCost: 222 })
  for (const text of [gameplayNotes(config).join('\n'), plugin.rules(config), render.helpHtml(config)[0]]) {
    assert(text.includes('7–9 秒')); assert(text.includes('成功率 100%'))
  }
  assert(render.helpHtml(config)[0].includes('123 绿宝石')); assert(render.helpHtml(config)[0].includes('222 绿宝石'))
})

test('Koishi exact-durability fishing sends only wait and result, persists switching, and recovers exhaustion on reload', async () => {
  const config = instant({ images: false, enchantSuccessRate: 100, repairCost: 222 })
  const app = new App({ prefix: '', autoAuthorize: 1 })
  app.plugin(sqlite, { path: ':memory:' }); const mockFork = app.plugin(mock), fork = app.plugin(plugin, config)
  await app.start(); const repo = new GameRepository(app, config), id = user => JSON.stringify(['mock', user])
  try {
    await app.mock.initUser('switch'); await app.mock.initUser('empty'); await app.mock.initUser('recover')
    await repo.run(id('switch'), p => { p.rods.push(g.newRod('铁钓鱼竿')) })
    const replies = await app.mock.client('switch').receive('进行30次钓鱼')
    assert.equal(replies.length, 2)
    assert.equal(replies[0], '已开始 30 次钓鱼。\n本次钓鱼预计等待0秒，请耐心等待...')
    assert(!replies[0].includes('耐久')); assert.match(replies[1], /已自动切换到【铁钓鱼竿】【50\/50】$/)
    const switched = await repo.run(id('switch'), p => p)
    assert.equal(switched.equippedId, switched.rods[1].id); assert.equal(switched.pending, null)
    const empty = await app.mock.client('empty').receive('开始30次钓鱼')
    assert.equal(empty.length, 2); assert.match(empty[1], /【维修将消耗222个绿宝石】$/)
    await repo.run(id('recover'), p => { g.startFishing(p, 30, config, Date.now() - 1, () => 0) })
    await app.mock.client('recover').shouldReply('钓鱼钱包', [/上次钓鱼已完成[\s\S]*【维修将消耗222个绿宝石】$/, /100 绿宝石/])
    await repo.run(id('switch'), p => { p.wallet = 1000; p.inventory['海之眷顾附魔书'] = 1 })
    await app.mock.client('switch').shouldReply('附魔 2 海之眷顾', /附魔成功/)
    assert.equal((await repo.run(id('switch'), p => p)).wallet, 700)
  } finally { await fork.dispose(); await mockFork.dispose(); await app.stop() }
})
