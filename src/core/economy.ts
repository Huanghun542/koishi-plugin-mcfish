// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'
import { BOOKS, enchantmentKind, isEnchantBook, normalizeName, RODS } from '../catalog'
import type { Config } from '../config'
import { addItem, removeItem } from './inventory'
import { enchantRate } from './enchantments'
import { Dice, ensureIdle, GameError, Market, MAX_PAGES, newRod, Player, positive, Rod, rodAt, ROWS_PER_PAGE, safeAdd } from './model'
export function basePrice(name: string, config: Config): number {
  return Math.round(RODS.find(rod => rod.name === name)?.price ?? config.lootTable.find(item => item.name === name)?.price
    ?? (name === BOOKS[0] ? 100 : name === BOOKS[1] ? 150 : name === BOOKS[2] ? 175 : 0))
}
export function shopItems(config: Config): { name: string; price: number }[] {
  return [...RODS.map(({ name, price }) => ({ name, price })), ...BOOKS.map(name => ({ name, price: basePrice(name, config) * 2 }))]
}
export function salePrice(name: string, market: Market, config: Config): number {
  if (RODS.some(rod => rod.name === name) || name === '三叉戟') return 0
  // Books are purchasable goods: never apply a premium that allows a buy/sell loop.
  const increase = isEnchantBook(name) ? 0 : market.increases[name] || 0
  const multiplier = isEnchantBook(name) ? Math.min(config.saleMultiplier, 1) : config.saleMultiplier
  return Math.round(basePrice(name, config) * multiplier * (100 + increase) / 100)
}
export function protectedFromBulkSale(name: string, config: Config): boolean {
  return isEnchantBook(name) || !!config.lootTable.find(item => item.name === name)?.rare
}
// Deterministic daily quotes remain consistent across process restarts.
function dayDice(day: string, config: Config): Dice {
  const seed = createHash('sha256').update(JSON.stringify([day, config.lootTable.filter(i => !isEnchantBook(i.name)).map(i => i.name), config.saleMultiplier, config.marketMinItems, config.marketMaxItems, config.marketMinIncrease, config.marketMaxIncrease])).digest()
  let state = seed.readUInt32LE(0) || 1
  return max => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return Math.floor((state >>> 0) / 4294967296 * max) }
}
export function refreshMarket(market: Market, day: string, config: Config, rng: Dice = dayDice(day, config)) {
  const signature = createHash('sha256').update(JSON.stringify([config.lootTable.filter(i => !isEnchantBook(i.name)).map(i => i.name), config.saleMultiplier, config.marketMinItems,
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
  if (!item) throw new GameError('铁匠铺仅出售钓鱼竿和附魔书，仔细看清楚哦', 'trade')
  const count = positive(quantity, 1, 10000)
  const cost = item.price * count
  safeAdd(0, cost)
  if (player.wallet < cost) throw new GameError(`绿宝石不足，本次购买需要${cost}个绿宝石，多去钓钓鱼吧`, 'trade')
  const purchased = `已购买「${name}」×${count}，消耗${cost}个绿宝石`
  if (RODS.some(rod => rod.name === name)) {
    const capacity = MAX_PAGES * ROWS_PER_PAGE - player.rods.length
    if (count > capacity) throw new GameError(`仓库鱼竿位置不足，本次最多还能购买${Math.max(0, capacity)}根 | 请先整理仓库`, 'trade')
    player.wallet -= cost
    for (let i = 0; i < count; i++) player.rods.push(newRod(name))
    player.equippedId = player.rods.at(-1)!.id
    return `${purchased} | 已自动装备上，仓库内位于序号${player.rods.length}`
  }
  addItem(player, name, count)
  player.wallet -= cost
  return `${purchased} | 附魔指令：「附魔 N ${name}」| 消耗${config.enchantCost}个绿宝石，成功率${enchantRate(enchantmentKind(name), config)}%${config.consumeEnchantBook ? '' : '，不消耗附魔书'}${name === BOOKS[2] ? ' | 饵钓绑定用户，换竿后仍生效' : ''}`
}
function sellRods(player: Player, rods: Rod[]): string {
  const ids = new Set(rods.map(rod => rod.id))
  const equippedIndex = player.rods.findIndex(rod => rod.id === player.equippedId)
  const next = ids.has(player.equippedId || '') ? player.rods.slice(equippedIndex + 1).find(rod => !ids.has(rod.id))
    || player.rods.find(rod => !ids.has(rod.id)) : undefined
  const soldEquipped = ids.has(player.equippedId || '')
  player.rods = player.rods.filter(rod => !ids.has(rod.id))
  if (soldEquipped) player.equippedId = next?.id || null
  const equipped = soldEquipped ? next ? ` | 已自动装备「${next.name}」，仓库内位于序号${player.rods.indexOf(next) + 1}` : ' | 已无鱼竿可装备' : ''
  return `已出售「${rods[0].name}」×${rods.length}，获得0个绿宝石${equipped}`
}
export function sell(player: Player, name: string, quantity: unknown, market: Market, config: Config, scope = '', now = Date.now()) {
  ensureIdle(player)
  name = Object.hasOwn(player.inventory, name.trim()) ? name.trim() : normalizeName(name)
  const count = positive(quantity)
  if (name === '钓鱼竿' || player.rods.some(rod => rod.name === name) || RODS.some(rod => rod.name === name)) {
    const rods = name === '钓鱼竿' ? [rodAt(player, count)] : player.rods.filter(rod => rod.name === name).slice(0, count)
    if (name !== '钓鱼竿' && rods.length < count) throw new GameError('可出售的鱼竿数量不足。', 'trade')
    if (rods.some(rod => RODS.findIndex(definition => definition.name === rod.name) >= 3)) {
      player.pendingRodSale = { rodIds: rods.map(rod => rod.id), expiresAt: now + config.saleConfirmSeconds * 1000, scope }
      return `即将出售「${rods[0].name}」${rods.length > 1 ? '×' + rods.length : ''}，出售将获得0个绿宝石，请在${config.saleConfirmSeconds}s内输入「确认」再次出售`
    }
    delete player.pendingRodSale
    return sellRods(player, rods)
  }
  removeItem(player, name, count)
  const earned = salePrice(name, market, config) * count
  player.wallet = safeAdd(player.wallet, earned)
  delete player.pendingRodSale
  return `已出售「${name}」×${count}，获得${earned}个绿宝石 | 当前余额${player.wallet}个绿宝石`
}
export function confirmRodSale(player: Player, scope = '', now = Date.now()): string {
  ensureIdle(player)
  const pending = player.pendingRodSale
  if (!pending || pending.scope !== scope) throw new GameError('当前会话没有待确认的鱼竿出售 | 请先输入「出售 钓鱼竿 N」', 'trade')
  delete player.pendingRodSale
  if (now >= pending.expiresAt) return '出售确认已超时，本次未出售任何鱼竿 | 请重新发起出售'
  const rods = pending.rodIds.map(id => player.rods.find(rod => rod.id === id))
  if (rods.some(rod => !rod)) return '待出售鱼竿已发生变化，本次出售已取消 | 请查看仓库后重新出售'
  return sellRods(player, rods as Rod[])
}
export function cancelRodSale(player: Player, scope = ''): string {
  if (!player.pendingRodSale || player.pendingRodSale.scope !== scope) throw new GameError('当前会话没有待确认的鱼竿出售', 'trade')
  delete player.pendingRodSale
  return '已取消本次鱼竿出售 | 鱼竿已保留在仓库中'
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
  if (!count) throw new GameError('仓库中没有可一键出售的普通物品 | 鱼竿、附魔书和稀有物品已保留', 'trade')
  player.wallet = safeAdd(player.wallet, earned)
  for (const name of names) delete player.inventory[name]
  delete player.pendingRodSale
  return `已出售${count}件普通物品，获得${earned}个绿宝石 | 当前仓库鱼竿、附魔书和稀有物品已保留`
}
