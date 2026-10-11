// SPDX-License-Identifier: AGPL-3.0-only
import { randomInt, randomUUID } from 'node:crypto'
import { DURABILITY_BONUS, normalizeName, RODS } from '../catalog'
export class GameError extends Error {
  constructor(message: string, public target: import('../config').RecallTarget = 'notice') { super(message) }
}
export interface Rod { id: string; name: string; durability: number; baseDurability: number; unbreaking: number; luck: number }
export interface PendingFishing { token: string; day: string; casts: number; finishAt: number; rodId: string; drops: Record<string, number>; doubled: number; notes: string[] }
export interface Player {
  version: 2; id: string; wallet: number; rods: Rod[]; equippedId: string | null
  inventory: Record<string, number>; day: string; casts: number; pending: PendingFishing | null
}
export interface Market { day: string; increases: Record<string, number>; signature?: string }
export type Dice = (max: number) => number
export const dice: Dice = max => randomInt(max)
export const ROWS_PER_PAGE = 15
export const MAX_PAGES = 2
export function positive(value: unknown, fallback = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || value === '') return fallback
  if (!/^[0-9]+$/.test(String(value))) throw new GameError('数量或序号必须是正整数。')
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new GameError(`数量或序号必须是 1 至 ${max} 的整数。`)
  return number
}
export function safeAdd(a: number, b: number): number {
  const result = a + b
  if (!Number.isSafeInteger(result) || result < 0) throw new GameError('金额或数量超出允许范围。')
  return result
}
export function dayKey(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(name => parts.find(p => p.type === name)!.value).join('-')
}
export function newRod(name: string): Rod {
  const definition = RODS.find(rod => rod.name === normalizeName(name))
  if (!definition) throw new GameError('铁匠铺没有这种鱼竿。')
  return { id: randomUUID(), name: definition.name, durability: definition.durability, baseDurability: definition.durability, unbreaking: 0, luck: 0 }
}
export function maxDurability(rod: Rod): number { return rod.baseDurability + DURABILITY_BONUS[rod.unbreaking] }
export function createPlayer(id: string): Player {
  const rod = newRod('木钓鱼竿')
  return { version: 2, id, wallet: 100, rods: [rod], equippedId: rod.id, inventory: {}, day: '', casts: 0, pending: null }
}
export function resetDay(player: Player, day: string) {
  if (player.day !== day) { player.day = day; player.casts = 0 }
}
export function equippedRod(player: Player): Rod | undefined { return player.rods.find(rod => rod.id === player.equippedId) }
export function rodAt(player: Player, index: unknown): Rod {
  const rod = player.rods[positive(index) - 1]
  if (!rod) throw new GameError('鱼竿序号不存在，请先查看仓库。', 'equipment')
  return rod
}
// Upgrade published v1 saves once, preserving balances, bag counts and equipped gear.
export function migratePlayer(raw: any, id: string): Player {
  if (!raw) return createPlayer(id)
  if (raw.version === 2) return raw as Player
  const player: Player = { version: 2, id, wallet: raw.wallet ?? 100, rods: [], equippedId: null, inventory: {}, day: raw.day || '', casts: raw.casts || 0, pending: null }
  const gear = (old: any, oldId = randomUUID()) => {
    const name = normalizeName(old.name)
    const baseDurability = RODS.find(rod => rod.name === name)?.durability || 301
    const rod: Rod = { id: oldId, name, durability: Math.max(0, old.durability || 0), baseDurability, unbreaking: 0, luck: Math.min(3, Math.max(0, old.luck || 0)) }
    player.rods.push(rod)
    return rod
  }
  if (raw.equipment) {
    if (raw.equipment.name === '美西螈') player.inventory['美西螈'] = 1
    else player.equippedId = gear(raw.equipment).id
  }
  for (const stack of raw.bag || []) {
    if (stack.equipment && stack.name !== '美西螈') {
      for (let i = 0; i < stack.count; i++) gear(stack.equipment, i ? randomUUID() : stack.id)
    } else {
      const name = stack.name === '诱钓' ? '耐久附魔书' : normalizeName(stack.name)
      player.inventory[name] = safeAdd(player.inventory[name] || 0, stack.count)
    }
  }
  return player
}
export function ensureIdle(player: Player) {
  if (player.pending) throw new GameError('正在钓鱼，请等待本次钓鱼完成。', 'waiting')
}
