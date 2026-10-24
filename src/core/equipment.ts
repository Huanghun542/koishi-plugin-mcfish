// SPDX-License-Identifier: AGPL-3.0-only
import { BOOKS, enchantmentKind, normalizeName } from '../catalog'
import type { Config } from '../config'
import { removeItem } from './inventory'
import { dailyFishingLimit, Dice, dice, ensureIdle, GameError, maxDurability, Player, rodAt } from './model'
import { enchantCap, enchantRate } from './enchantments'
export function equip(player: Player, index: unknown, config?: Config): string {
  ensureIdle(player)
  const rod = rodAt(player, index)
  player.equippedId = rod.id
  return `已装备「${rod.name}」| 耐久${rod.durability}/${maxDurability(rod, config)}，仓库内位于序号${player.rods.indexOf(rod) + 1}`
}
export function unequip(player: Player): string {
  ensureIdle(player)
  player.equippedId = null
  return '已卸下鱼竿 | 使用「装备 N」可重新装备，N为仓库鱼竿序号'
}
export function repair(player: Player, index: unknown, config?: Config): string {
  ensureIdle(player)
  const rod = rodAt(player, index)
  const max = maxDurability(rod, config)
  if (rod.durability >= max) throw new GameError('该鱼竿耐久已满，无需维修。', 'trade')
  const cost = config?.repairCost ?? 150
  if (player.wallet < cost) throw new GameError(`绿宝石不足，本次维修需要${cost}个绿宝石，多去钓钓鱼吧`, 'trade')
  player.wallet -= cost
  rod.durability = max
  return `已维修「${rod.name}」，消耗${cost}个绿宝石 | 耐久恢复至${max}/${max}`
}
export function enchant(player: Player, index: unknown, name: string, config: Config, rng: Dice = dice): string {
  ensureIdle(player)
  const rod = rodAt(player, index)
  const book = normalizeName(name)
  if (!(BOOKS as readonly string[]).includes(book)) throw new GameError('附魔书名称应为「耐久附魔书」「海之眷顾附魔书」或「饵钓附魔书」', 'trade')
  const kind = enchantmentKind(book)
  const label = kind === 'unbreaking' ? '耐久' : kind === 'luck' ? '海之眷顾' : '饵钓'
  const level = kind === 'lure' ? player.lureLevel || 0 : rod[kind]
  const cap = enchantCap(kind, config)
  if (level >= cap) throw new GameError(`${label}已达到${cap}级上限。`, 'trade')
  if (player.wallet < config.enchantCost) throw new GameError(`绿宝石不足，本次附魔需要${config.enchantCost}个绿宝石，多去钓钓鱼吧`, 'trade')
  if (config.consumeEnchantBook) removeItem(player, book, 1)
  player.wallet -= config.enchantCost
  const spent = `消耗${config.enchantCost}个绿宝石${config.consumeEnchantBook ? '和1本「' + book + '」' : ''}`
  if (rng(100) >= enchantRate(kind, config)) {
    let downgrade = ''
    if (config.enchantFailureDowngrade && level > 0) {
      if (kind === 'lure') player.lureLevel = level - 1
      else {
        rod[kind] = level - 1
        if (kind === 'unbreaking') rod.durability = Math.min(rod.durability, maxDurability(rod, config))
      }
      downgrade = ` | ${label}已降低至${level - 1}级`
    }
    return `附魔失败 | 已${spent}，本次材料不返还${downgrade}`
  }
  if (kind === 'lure') {
    player.lureLevel = level + 1
    return `附魔成功，饵钓提升至${player.lureLevel}级 | 今日次数上限${dailyFishingLimit(player, config)}次，效果绑定用户 | 已${spent}`
  }
  const oldMax = maxDurability(rod, config)
  rod[kind]++
  if (kind === 'unbreaking') rod.durability = Math.min(rod.durability, oldMax) + maxDurability(rod, config) - oldMax
  return `附魔成功，「${rod.name}」的${label}提升至${rod[kind]}级 | 已${spent}`
}
