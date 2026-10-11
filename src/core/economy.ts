// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'
import { BOOKS, isEnchantBook, normalizeName, RODS } from '../catalog'
import type { Config } from '../config'
import { addItem, removeItem } from './inventory'
import { Dice, ensureIdle, GameError, Market, newRod, Player, positive, safeAdd } from './model'
export function basePrice(name: string, config: Config): number {
  return RODS.find(rod => rod.name === name)?.price ?? config.lootTable.find(item => item.name === name)?.price
    ?? (name === BOOKS[0] ? 200 : name === BOOKS[1] ? 300 : 0)
}
export function shopItems(config: Config): { name: string; price: number }[] {
  return [...RODS.map(({ name, price }) => ({ name, price })), ...BOOKS.map(name => ({ name, price: basePrice(name, config) }))]
}
export function salePrice(name: string, market: Market, config: Config): number {
  if (RODS.some(rod => rod.name === name) || name === '三叉戟') return 0
  // Books are purchasable goods: never apply a premium that allows a buy/sell loop.
  const increase = isEnchantBook(name) ? 0 : market.increases[name] || 0
  return Math.floor(basePrice(name, config) * (100 + increase) / 200)
}
export function protectedFromBulkSale(name: string, config: Config): boolean {
  return isEnchantBook(name) || !!config.lootTable.find(item => item.name === name)?.rare
}
// Deterministic daily quotes remain consistent across process restarts.
function dayDice(day: string, config: Config): Dice {
  const seed = createHash('sha256').update(JSON.stringify([day, config.lootTable.filter(i => !isEnchantBook(i.name)).map(i => i.name), config.marketMinItems, config.marketMaxItems, config.marketMinIncrease, config.marketMaxIncrease])).digest()
  let state = seed.readUInt32LE(0) || 1
  return max => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return Math.floor((state >>> 0) / 4294967296 * max) }
}
export function refreshMarket(market: Market, day: string, config: Config, rng: Dice = dayDice(day, config)) {
  const signature = createHash('sha256').update(JSON.stringify([config.lootTable.filter(i => !isEnchantBook(i.name)).map(i => i.name), config.marketMinItems,
    config.marketMaxItems, config.marketMinIncrease, config.marketMaxIncrease])).digest('hex')
  if (market.day === day && market.signature === signature) return
  const names = config.lootTable.filter(item => !isEnchantBook(item.name)).map(item => item.name)
  const max = Math.min(config.marketMaxItems, names.length)
  const min = Math.min(config.marketMinItems, max)
  const amount = min + rng(max - min + 1)
  market.increases = {}
  for (let i = 0; i < amount; i++) {
    const index = i + rng(names.length - i)
    ;[names[i], names[index]] = [names[index], names[i]]
    market.increases[names[i]] = config.marketMinIncrease + rng(config.marketMaxIncrease - config.marketMinIncrease + 1)
  }
  market.day = day
  market.signature = signature
}
export function buy(player: Player, name: string, quantity: unknown, config: Config) {
  ensureIdle(player)
  name = normalizeName(name)
  const item = shopItems(config).find(item => item.name === name)
  if (!item) throw new GameError('铁匠铺仅出售五种鱼竿和两种附魔书。', 'trade')
  const count = positive(quantity, 1, 10000)
  const cost = item.price * count
  safeAdd(0, cost)
  if (player.wallet < cost) throw new GameError(`绿宝石不足，本次购买需要 ${cost} 绿宝石。`, 'trade')
  player.wallet -= cost
  if (RODS.some(rod => rod.name === name)) {
    for (let i = 0; i < count; i++) player.rods.push(newRod(name))
  } else addItem(player, name, count)
  return `已购买 ${name} ×${count}，消耗 ${cost} 绿宝石。`
}
export function sell(player: Player, name: string, quantity: unknown, market: Market, config: Config) {
  ensureIdle(player)
  name = Object.hasOwn(player.inventory, name.trim()) ? name.trim() : normalizeName(name)
  const count = positive(quantity)
  if (name === '钓鱼竿' || player.rods.some(rod => rod.name === name) || RODS.some(rod => rod.name === name)) {
    const rods = player.rods.filter(rod => (name === '钓鱼竿' || rod.name === name) && rod.id !== player.equippedId)
    if (rods.length < count) throw new GameError('可出售的鱼竿数量不足；装备中的鱼竿须先卸下。', 'trade')
    const ids = new Set(rods.slice(0, count).map(rod => rod.id))
    player.rods = player.rods.filter(rod => !ids.has(rod.id))
    return `已出售 ${name} ×${count}，鱼竿无回收价值，获得 0 绿宝石。`
  }
  removeItem(player, name, count)
  const earned = salePrice(name, market, config) * count
  player.wallet = safeAdd(player.wallet, earned)
  return `已出售 ${name} ×${count}，获得 ${earned} 绿宝石。`
}
export function sellAll(player: Player, market: Market, config: Config) {
  ensureIdle(player)
  let count = 0, earned = 0
  const names: string[] = []
  for (const [name, amount] of Object.entries(player.inventory)) {
    if (protectedFromBulkSale(name, config)) continue
    count = safeAdd(count, amount)
    earned = safeAdd(earned, salePrice(name, market, config) * amount)
    names.push(name)
  }
  if (!count) throw new GameError('仓库中没有可一键出售的普通物品；鱼竿、附魔书和稀有物品已保留。', 'trade')
  player.wallet = safeAdd(player.wallet, earned)
  for (const name of names) delete player.inventory[name]
  return `已出售 ${count} 件普通物品，获得 ${earned} 绿宝石。鱼竿、附魔书和稀有物品已保留。`
}
