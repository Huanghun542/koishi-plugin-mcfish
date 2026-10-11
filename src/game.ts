// SPDX-License-Identifier: AGPL-3.0-only
// Gameplay adapted from fangliuyu and FloatTech/ZeroBot-Plugin contributors.
import { randomInt, randomUUID } from 'node:crypto'
import { CATALOG, EQUIPPABLE, FISH, ITEMS, RODS, WASTE, ZONE_WEIGHTS, Category } from './catalog'

export class GameError extends Error {}
export interface Equipment {
  name: string
  durability: number
  repairs: number
  lure: number
  luck: number
}
export interface Stack {
  id: string
  name: string
  count: number
  equipment?: Equipment
  createdAt: number
}
export interface Player {
  id: string
  wallet: number
  bag: Stack[]
  equipment: Equipment | null
  day: string
  casts: number
  rodTrades: number
  purchases: number
  starterPurchases: number
  purchaseProgress: number
  coupons: number
  curseProgress: number
  blessingProgress: number
}
export interface Market {
  id: string
  day: string
  discounts: Record<string, number>
  stock: Stack[]
}
export interface GameConfig {
  initialBalance: number
  dailyLimit: number
  timezone: string
}
export type Dice = (max: number) => number
export const dice: Dice = max => randomInt(max)
export const SOURCE_URL = 'https://github.com/Huanghun542/koishi-plugin-mcfish'

export function dayKey(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(name => parts.find(p => p.type === name)!.value).join('-')
}
export function createPlayer(id: string, config: GameConfig): Player {
  return { id, wallet: config.initialBalance, bag: [], equipment: null, day: '', casts: 0, rodTrades: 0,
    purchases: 0, starterPurchases: 0, purchaseProgress: 0, coupons: 0, curseProgress: 0, blessingProgress: 0 }
}
export function resetDay(player: Player, day: string) {
  if (player.day === day) return
  player.day = day
  player.casts = player.rodTrades = player.purchases = 0
}
export function equipment(name: string): Equipment {
  if (!EQUIPPABLE.includes(name)) throw new GameError('这件物品不能装备。')
  return { name, durability: CATALOG.get(name)!.maxDurability, repairs: 0, lure: 0, luck: 0 }
}
export function count(player: Player, name: string): number {
  return player.bag.filter(s => s.name === name).reduce((n, s) => n + s.count, 0)
}
export function rodCount(player: Player): number {
  return player.bag.filter(s => s.name.endsWith('竿')).reduce((n, s) => n + s.count, 0)
}
export function addStack(bag: Stack[], name: string, amount = 1, gear?: Equipment, now = Date.now()): Stack {
  if (!CATALOG.has(name)) throw new GameError('没有这种物品。')
  if (!Number.isSafeInteger(amount) || amount < 1) throw new GameError('物品数量无效。')
  const old = !gear && bag.find(s => s.name === name && !s.equipment)
  if (old) {
    if (!Number.isSafeInteger(old.count + amount)) throw new GameError('物品数量超出上限。')
    old.count += amount
    return old
  }
  const stack: Stack = { id: randomUUID(), name, count: amount, createdAt: now }
  if (gear) stack.equipment = { ...gear }
  bag.push(stack)
  return stack
}
export function consume(bag: Stack[], stack: Stack, amount: number) {
  const current = bag.find(s => s.id === stack.id)
  if (!current || amount < 1 || current.count < amount) throw new GameError('物品数量不足，操作已取消。')
  current.count -= amount
  if (!current.count) bag.splice(bag.indexOf(current), 1)
}
export function consumeNamed(player: Player, name: string, amount: number) {
  if (count(player, name) < amount) throw new GameError(`你的${name}数量不足。`)
  for (const stack of [...player.bag].filter(s => s.name === name)) {
    const used = Math.min(stack.count, amount)
    consume(player.bag, stack, used)
    amount -= used
    if (!amount) break
  }
}
export function positive(value: unknown, fallback = 1, max = 10000): number {
  if (value === undefined || value === '') return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new GameError(`数量必须是 1–${max} 的整数。`)
  return number
}
export function refreshMarket(market: Market, day: string, rng: Dice = dice, now = Date.now()) {
  if (market.day === day) return
  market.day = day
  market.stock = market.stock.filter(s => !s.equipment || s.name === '初始木竿' || now - s.createdAt < 86400000)
  for (const item of ITEMS.filter(i => i.name !== '宝藏诅咒')) {
    const inStock = market.stock.filter(s => s.name === item.name).reduce((n, s) => n + s.count, 0)
    market.discounts[item.name] = inStock > 150 ? 90 + rng(20) : 50 + rng(150)
  }
  const marketFish = [...FISH, '海豚']
  const fish = marketFish[rng(marketFish.length)]
  const existing = market.stock.find(s => s.name === fish)
  const next = (existing?.count || 0) + 100 - market.discounts[fish]
  if (existing) existing.count = next > 0 ? Math.min(255, next) : 100
  else addStack(market.stock, fish, next > 0 ? next : 100, undefined, now)
  const starter = market.stock.find(s => s.name === '初始木竿')
  if (starter) starter.count = starter.count >= 5 ? 1 : starter.count + 1
  else market.stock.push({ id: randomUUID(), name: '初始木竿', count: 1, createdAt: now, equipment: equipment('木竿') })
}
export function startRod(player: Player) {
  if (player.equipment) throw new GameError('你已经装备了钓具。')
  if (player.starterPurchases >= 3) throw new GameError('三次新手购竿机会已用完，请从背包装备或到商店购买。')
  if (player.wallet < 100) throw new GameError('余额不足 100 金币，无法购买新手木竿。')
  player.wallet -= 100
  player.starterPurchases++
  player.equipment = equipment('木竿')
}
export function zoneWeights(player: Player): Record<Category | 'air', number> {
  const buff = player.bag.filter(s => s.name.includes('鱼')).reduce((n, s) => n + s.count, 0) > 100 || player.equipment?.name === '美西螈'
  const base = buff ? { treasure: 2, pole: 8, fish: 35, waste: 45 } : { ...ZONE_WEIGHTS }
  const luck = player.equipment?.luck || 0
  base.treasure += luck
  base.pole += luck
  base.fish += luck
  base.waste -= luck * 3
  let air = 100 - Object.values(base).reduce((a, b) => a + b, 0)
  if (count(player, '海豚')) { base.waste += air; air = 0 }
  return { ...base, air }
}
export function weighted<T>(entries: [T, number][], rng: Dice): T {
  let value = rng(entries.reduce((n, [, weight]) => n + weight, 0))
  for (const [item, weight] of entries) {
    if (value < weight) return item
    value -= weight
  }
  throw new Error('Invalid random result.')
}
export function fish(player: Player, requested: number, config: GameConfig, rng: Dice = dice) {
  requested = positive(requested, 1, config.dailyLimit)
  if (rodCount(player) > 30) throw new GameError('背包鱼竿超过 30 支，不能钓鱼。')
  const equipped = player.equipment
  if (!equipped) throw new GameError('请先装备钓具。')
  if (player.casts >= config.dailyLimit) throw new GameError(`今天已钓鱼 ${config.dailyLimit} 次，明天再来吧。`)
  const casts = Math.min(requested, config.dailyLimit - player.casts, equipped.name === '美西螈' ? requested : equipped.durability)
  if (casts < 1) throw new GameError('钓具已经没有耐久。')
  let probabilities = zoneWeights(player)
  let rolls = casts
  const notes: string[] = []
  player.casts += casts
  if (equipped.name === '美西螈') {
    let need = casts * 3
    const eaten: Record<string, number> = {}
    for (const name of [...FISH, '海豚']) {
      const used = Math.min(need, count(player, name))
      if (!used) continue
      consumeNamed(player, name, used)
      eaten[name] = used
      need -= used
      if (!need) break
    }
    const total = casts * 3 - need
    if (!total) {
      player.equipment = null
      return { casts, drops: {}, notes: ['美西螈没有吃到鱼，离开了你。'] }
    }
    rolls = Math.floor(total / 3)
    probabilities = zoneWeights(player)
    notes.push(`美西螈吃掉：${Object.entries(eaten).map(([name, n]) => `${name}×${n}`).join('、')}`)
    if (need) notes.push('鱼不够，只结算吃够 3 条鱼的次数。')
  } else {
    equipped.durability -= casts
    if (equipped.name === '三叉戟') rolls *= 3
    if (!equipped.durability) { player.equipment = null; notes.push('钓具耐久耗尽，已损毁。') }
    else if (equipped.durability < 10) notes.push(`钓具耐久仅剩 ${equipped.durability}。`)
  }
  const drops: Record<string, number> = {}
  for (let i = 0; i < rolls; i++) {
    const category = weighted(Object.entries(probabilities) as [Category | 'air', number][], rng)
    if (category === 'air') { drops['赛博空气'] = (drops['赛博空气'] || 0) + 1; continue }
    const item = weighted(ITEMS.filter(i => i.category === category && i.weight > 0).map(i => [i, i.weight]), rng)
    let gear: Equipment | undefined
    if (item.category === 'pole') gear = { name: item.name, durability: rng(item.maxDurability) + 1, repairs: rng(10), lure: rng(3), luck: rng(2) }
    const amount = equipped.name === '美西螈' && !gear && item.name !== '美西螈' ? 5 : 1
    addStack(player.bag, item.name, amount, gear)
    drops[item.name] = (drops[item.name] || 0) + amount
  }
  player.blessingProgress += rolls
  const books = Math.floor(player.blessingProgress / 75)
  if (books) { addStack(player.bag, '净化书', books); player.blessingProgress %= 75; notes.push(`钓鱼奖励：净化书×${books}`) }
  return { casts, drops, notes }
}
export function selectStack(bag: Stack[], id: string): Stack {
  const selected = bag.find(s => s.id === id)
  if (!selected) throw new GameError('该物品已变化，请重新操作。')
  return selected
}
export function equip(player: Player, id: string) {
  const stack = selectStack(player.bag, id)
  const next = stack.equipment ? { ...stack.equipment } : equipment(stack.name)
  if (!EQUIPPABLE.includes(next.name)) throw new GameError('这件物品不能装备。')
  consume(player.bag, stack, 1)
  const old = player.equipment
  if (old) addStack(player.bag, old.name, 1, old.name === '美西螈' ? undefined : old)
  player.equipment = next
  return `装备成功：${equipmentLabel(next)}`
}
export function repair(player: Player, id: string, rng: Dice = dice) {
  const current = player.equipment
  if (!current || current.name === '美西螈') throw new GameError('只能维修装备中的鱼竿或三叉戟。')
  if (current.repairs >= 10) throw new GameError('钓具已达到 10 次维修上限。')
  const material = selectStack(player.bag, id)
  if (!material.equipment || material.name !== current.name) throw new GameError('需要背包中的同类钓具进行维修。')
  const max = CATALOG.get(current.name)!.maxDurability
  current.durability = current.name === '三叉戟' ? max : Math.min(max, current.durability + Math.floor(material.equipment.durability * (rodCount(player) > 10 ? 1 : 0.8)))
  for (const stat of ['lure', 'luck'] as const) {
    if (material.equipment[stat] && rng(100) < 50) current[stat] = Math.min(3, current[stat] + material.equipment[stat])
  }
  consume(player.bag, material, 1)
  current.repairs++
  return `维修成功：${equipmentLabel(current)}`
}
export function enchant(player: Player, book: string, rng: Dice = dice) {
  if (book !== '诱钓' && book !== '海之眷顾') throw new GameError('只能附魔诱钓或海之眷顾。')
  const current = player.equipment
  if (!current || current.name === '美西螈') throw new GameError('只能附魔装备中的鱼竿或三叉戟。')
  const stat = book === '诱钓' ? 'lure' : 'luck'
  if (current[stat] >= 3) throw new GameError(`${book}已达到 III 级。`)
  consumeNamed(player, book, 1)
  if (rng(100) > 50) return '附魔失败，消耗了一本附魔书。'
  current[stat]++
  return `附魔成功：${book} ${['0', 'I', 'II', 'III'][current[stat]]}`
}
export function craftingMaterial(target: string) {
  const index = RODS.indexOf(target)
  if (index < 1) throw new GameError('可合成铁竿、金竿、钻石竿、下界合金竿或三叉戟。')
  return RODS[index - 1]
}
export function craft(player: Player, target: string, ids: string[], rng: Dice = dice) {
  const material = craftingMaterial(target)
  if (!ids.length || ids.length % 3 || new Set(ids).size !== ids.length) throw new GameError('请选择 3 支不同的材料鱼竿。')
  const stacks = ids.map(id => selectStack(player.bag, id))
  if (stacks.some(s => s.name !== material || !s.equipment)) throw new GameError(`合成${target}需要 3 支${material}。`)
  let success = 0
  for (let i = 0; i < stacks.length; i += 3) {
    const group = stacks.slice(i, i + 3)
    const gear = equipment(target)
    gear.lure = Math.floor(group.reduce((n, s) => n + s.equipment!.lure, 0) / 3)
    gear.luck = Math.floor(group.reduce((n, s) => n + s.equipment!.luck, 0) / 3)
    for (const stack of group) consume(player.bag, stack, 1)
    if (rng(100) < 90) { addStack(player.bag, target, 1, gear); success++ }
  }
  return `合成完成：成功 ${success}，失败 ${stacks.length / 3 - success}。失败批次的材料已消耗。`
}
export function purify(player: Player, requested: number) {
  const amount = Math.min(positive(requested), count(player, '宝藏诅咒'))
  if (!amount) throw new GameError('你没有宝藏诅咒。')
  if (count(player, '净化书') < amount) throw new GameError('净化书不足。')
  consumeNamed(player, '净化书', amount)
  consumeNamed(player, '宝藏诅咒', amount)
  return `消除了 ${amount} 层宝藏诅咒。`
}
export function priceOf(market: Market, stack: Stack): number {
  const name = stack.name === '初始木竿' ? '木竿' : stack.name
  const item = CATALOG.get(name)
  if (!item || name === '宝藏诅咒') throw new GameError('该物品不能交易。')
  const discount = market.discounts[name] || 100
  if (stack.name === '初始木竿') return item.price + Math.floor(item.price * discount / 100)
  const gear = stack.equipment
  const base = !gear ? item.price : item.price - (item.maxDurability - gear.durability) - gear.repairs * 2
    + Math.floor(gear.lure * 600 * (market.discounts['诱钓'] || 100) / 100)
    + Math.floor(gear.luck * 1800 * (market.discounts['海之眷顾'] || 100) / 100)
  return Math.max(1, Math.floor(base * discount / 100))
}
export interface Quote {
  mode: 'buy' | 'sell' | 'waste'
  ids: string[]
  count: number
  total: number
  day: string
  fingerprint: string
  record: boolean
  coupons: number
  name: string
}
function fingerprint(player: Player, stacks: Stack[], market: Market) {
  return JSON.stringify([stacks, market.discounts, count(player, '宝藏诅咒'), player.coupons, player.rodTrades, player.purchases])
}
export function quote(player: Player, market: Market, mode: Quote['mode'], id: string, requested = 1, useRecord = false): Quote {
  requested = positive(requested)
  const stacks = mode === 'waste' ? player.bag.filter(s => WASTE.includes(s.name))
    : [selectStack(mode === 'buy' ? market.stock : player.bag, id)]
  if (!stacks.length) throw new GameError('背包里没有垃圾。')
  const stack = stacks[0]
  if (stack.name === '宝藏诅咒') throw new GameError('宝藏诅咒不能交易，请使用净化书。')
  const isRod = stack.name.endsWith('竿')
  let amount = mode === 'waste' ? stacks.reduce((n, s) => n + s.count, 0) : (stack.equipment ? 1 : requested)
  if (mode === 'buy' && rodCount(player) > 50) throw new GameError('背包鱼竿超过 50 支，不能购买。')
  if (isRod && player.rodTrades >= 10) throw new GameError('今天已交易 10 支鱼竿，明天再来吧。')
  if (mode === 'buy' && !isRod && !WASTE.includes(stack.name)) {
    amount = Math.min(amount, 30 - player.purchases)
    if (amount < 1) throw new GameError('今天已购买 30 件物品，明天再来吧。')
  }
  if (mode === 'buy' && stack.name === '净化书') {
    const need = count(player, '宝藏诅咒') - count(player, '净化书')
    if (need <= 0) throw new GameError('你没有诅咒或净化书已经足够。')
    amount = Math.min(amount, need)
  }
  if (mode === 'buy' && stack.count < amount) throw new GameError('商店库存不足。')
  if (mode === 'sell') amount = Math.min(amount, stack.count)
  let total: number
  let coupons = 0
  if (mode === 'waste') total = stacks.reduce((n, s) => n + Math.floor(priceOf(market, s) * s.count * 0.8), 0)
  else {
    const price = priceOf(market, stack)
    if (mode === 'buy') {
      coupons = Math.min(player.coupons, amount)
      total = price * (amount - coupons) + Math.floor(price / 2) * coupons
    } else total = price * amount
  }
  const curse = count(player, '宝藏诅咒')
  if (mode === 'buy') total = Math.floor(total * (100 + 10 * curse) / 100)
  else {
    if (useRecord) {
      const spare = count(player, '唱片') - (stack.name === '唱片' && mode === 'sell' ? amount : 0)
      if (spare < 1) throw new GameError('没有可用于翻倍的额外唱片。')
      total *= 2
    }
    total = Math.trunc(total * (100 - 10 * curse) / 100)
    if (mode === 'sell') total = Math.trunc(total * 0.8)
  }
  if (!Number.isSafeInteger(total)) throw new GameError('交易金额超出上限。')
  if (mode === 'buy' && player.wallet < total) throw new GameError(`余额 ${player.wallet} 金币，不足以支付 ${total}。`)
  if (mode !== 'buy' && total < 0 && player.wallet + total < 0) throw new GameError(`诅咒使本次出售需要倒贴 ${-total} 金币，余额不足。`)
  return { mode, ids: stacks.map(s => s.id), count: amount, total, day: market.day,
    fingerprint: fingerprint(player, stacks, market), record: useRecord, coupons, name: mode === 'waste' ? '全部垃圾' : stack.name }
}
export function transact(player: Player, market: Market, expected: Quote) {
  if (expected.day !== market.day) throw new GameError('商店已跨日刷新，请重新确认价格。')
  const current = quote(player, market, expected.mode, expected.ids[0], expected.count, expected.record)
  if (current.fingerprint !== expected.fingerprint || current.total !== expected.total || current.count !== expected.count) throw new GameError('库存或交易条件已经变化，请重新操作。')
  if (expected.mode === 'buy') {
    const stack = selectStack(market.stock, expected.ids[0])
    addStack(player.bag, stack.name === '初始木竿' ? '木竿' : stack.name, expected.count, stack.equipment)
    consume(market.stock, stack, expected.count)
    player.wallet -= expected.total
    if (expected.coupons) player.coupons -= expected.coupons
    else {
      player.purchaseProgress++
      if (player.purchaseProgress >= 20) { player.purchaseProgress -= 20; player.coupons += 3 }
    }
    if (!expected.name.endsWith('竿') && !WASTE.includes(expected.name)) player.purchases += expected.count
  } else {
    if (expected.record) consumeNamed(player, '唱片', 1)
    for (const id of expected.ids) {
      const stack = selectStack(player.bag, id)
      const amount = expected.mode === 'waste' ? stack.count : expected.count
      const item = CATALOG.get(stack.name)!
      if (item.category !== 'waste') {
        if (!stack.equipment) {
          const existing = market.stock.find(s => s.name === stack.name && !s.equipment)
          const space = 255 - (existing?.count || 0)
          if (space > 0) addStack(market.stock, stack.name, Math.min(space, amount))
        } else if (priceOf(market, stack) >= item.price * 2 && market.stock.filter(s => s.name === stack.name).length < 5) {
          addStack(market.stock, stack.name, 1, stack.equipment)
        }
      }
      consume(player.bag, stack, amount)
    }
    player.wallet += expected.total
  }
  if (expected.name.endsWith('竿')) {
    player.rodTrades++
    player.curseProgress++
    if (player.curseProgress >= 10) { player.curseProgress -= 10; addStack(player.bag, '宝藏诅咒') }
  }
  if (!Number.isSafeInteger(player.wallet) || player.wallet < 0) throw new GameError('余额超出有效范围，交易已取消。')
  return expected.mode === 'buy' ? `花费 ${expected.total} 金币，购买了${expected.name}×${expected.count}。`
    : `出售${expected.name}×${expected.count}，${expected.total < 0 ? '支付' : '获得'} ${Math.abs(expected.total)} 金币。`
}
export function equipmentLabel(gear: Equipment): string {
  return `${gear.name}（耐久 ${gear.durability}/${CATALOG.get(gear.name)!.maxDurability}，修 ${gear.repairs}/10，诱钓 ${gear.lure}，眷顾 ${gear.luck}）`
}
export function stackLabel(stack: Stack): string {
  return stack.equipment ? `${stack.name === stack.equipment.name ? '' : stack.name + '：'}${equipmentLabel(stack.equipment)}` : `${stack.name}×${stack.count}`
}
