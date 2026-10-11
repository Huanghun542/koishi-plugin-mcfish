// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'
import { DOUBLE_PERCENT, LootItem } from '../catalog'
import type { Config } from '../config'
import { addItem } from './inventory'
import { Dice, dice, ensureIdle, equippedRod, GameError, PendingFishing, Player, positive, safeAdd } from './model'
function draw(table: LootItem[], rng: Dice): LootItem {
  let value = rng(table.reduce((sum, item) => sum + item.weight, 0))
  for (const item of table) { if (value < item.weight) return item; value -= item.weight }
  throw new Error('无效抽取权重。')
}
export function startFishing(player: Player, amount: unknown, config: Config, now = Date.now(), rng: Dice = dice): PendingFishing {
  ensureIdle(player)
  const requested = positive(amount)
  const remaining = Math.max(0, config.dailyLimit - player.casts)
  if (!remaining) throw new GameError('今日钓鱼次数已用完，明天再来吧', 'notice')
  const rod = equippedRod(player)
  if (!rod) throw new GameError('尚未装备鱼竿，请使用“装备 N”选择仓库中的鱼竿。', 'equipment')
  if (rod.durability <= 0) throw new GameError('鱼竿已损坏，请使用“维修 N”恢复耐久。', 'damage')
  const casts = Math.min(requested, remaining, rod.durability)
  const notes: string[] = []
  if (requested > remaining) notes.push(`今日剩余 ${remaining} 次，已按剩余次数计算。`)
  if (Math.min(requested, remaining) > rod.durability) notes.push(`鱼竿耐久不足，已按剩余 ${rod.durability} 点耐久进行钓鱼。`)
  const drops: Record<string, number> = {}
  let doubled = 0
  for (let i = 0; i < casts; i++) {
    const item = draw(config.lootTable, rng)
    const double = rod.luck > 0 && rng(100) < DOUBLE_PERCENT[rod.luck]
    if (double) doubled++
    drops[item.name] = safeAdd(drops[item.name] || 0, double ? 2 : 1)
  }
  const seconds = config.maxWaitSeconds > 0 ? rng(config.maxWaitSeconds) + 1 : 0
  rod.durability -= casts
  player.casts += casts
  if (rod.durability === 0) notes.push('鱼竿耐久已耗尽，需维修后继续使用。')
  const pending: PendingFishing = { token: randomUUID(), day: player.day, casts, finishAt: now + seconds * 1000, rodId: rod.id, drops, doubled, notes }
  player.pending = pending
  return pending
}
export function finishFishing(player: Player, now = Date.now()): PendingFishing | null {
  const pending = player.pending
  if (!pending || pending.finishAt > now) return null
  for (const [name, count] of Object.entries(pending.drops)) addItem(player, name, count)
  player.pending = null
  return pending
}
export function fishingText(result: PendingFishing): string {
  return [`本次完成 ${result.casts} 次钓鱼：`, ...Object.entries(result.drops).map(([name, count]) => `${name} ×${count}`),
    result.doubled ? `海之眷顾触发 ${result.doubled} 次双倍产出。` : '', ...result.notes].filter(Boolean).join('\n')
}
