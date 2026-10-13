// SPDX-License-Identifier: AGPL-3.0-only
import { BOOKS, normalizeName } from '../catalog'
import type { Config } from '../config'
import { removeItem } from './inventory'
import { Dice, dice, ensureIdle, GameError, maxDurability, Player, rodAt } from './model'
export function equip(player: Player, index: unknown): string {
  ensureIdle(player)
  const rod = rodAt(player, index)
  player.equippedId = rod.id
  return `已装备 ${rod.name}，耐久 ${rod.durability}/${maxDurability(rod)}。`
}
export function unequip(player: Player): string {
  ensureIdle(player)
  player.equippedId = null
  return '已卸下鱼竿。'
}
export function repair(player: Player, index: unknown, config?: Config): string {
  ensureIdle(player)
  const rod = rodAt(player, index)
  const max = maxDurability(rod)
  if (rod.durability >= max) throw new GameError('该鱼竿耐久已满，无需维修。', 'trade')
  const cost = config?.repairCost ?? 150
  if (player.wallet < cost) throw new GameError(`维修需要 ${cost} 绿宝石，当前余额不足。`, 'trade')
  player.wallet -= cost
  rod.durability = max
  return `已维修 ${rod.name}，耐久恢复至 ${max}/${max}，消耗 ${cost} 绿宝石。`
}
export function enchant(player: Player, index: unknown, name: string, config: Config, rng: Dice = dice): string {
  ensureIdle(player)
  const rod = rodAt(player, index)
  const book = normalizeName(name)
  if (!(BOOKS as readonly string[]).includes(book)) throw new GameError('附魔书名称应为“耐久附魔书”或“海之眷顾附魔书”。', 'trade')
  const field = book === BOOKS[0] ? 'unbreaking' : 'luck'
  const label = field === 'unbreaking' ? '耐久' : '海之眷顾'
  if (rod[field] >= 3) throw new GameError(`${label}已达到三级上限。`, 'trade')
  if (player.wallet < config.enchantCost) throw new GameError(`附魔需要 ${config.enchantCost} 绿宝石，当前余额不足。`, 'trade')
  if (config.consumeEnchantBook) removeItem(player, book, 1)
  player.wallet -= config.enchantCost
  if (rng(100) >= config.enchantSuccessRate) return `附魔失败，已消耗 ${config.enchantCost} 绿宝石${config.consumeEnchantBook ? '及一本' + book : ''}。`
  const oldMax = maxDurability(rod)
  rod[field]++
  if (field === 'unbreaking') rod.durability += maxDurability(rod) - oldMax
  return `附魔成功，${rod.name}的${label}提升至 ${rod[field]} 级。`
}
