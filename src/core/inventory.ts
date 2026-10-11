// SPDX-License-Identifier: AGPL-3.0-only
import type { Config } from '../config'
import { GameError, MAX_PAGES, Player, Rod, ROWS_PER_PAGE, safeAdd } from './model'
import { salePrice } from './economy'
import type { Market } from './model'
export interface InventoryRow { rods?: Rod[]; items?: [string, number][] }
export function addItem(player: Player, name: string, count: number) {
  player.inventory[name] = safeAdd(player.inventory[name] || 0, count)
}
export function removeItem(player: Player, name: string, count: number) {
  if ((player.inventory[name] || 0) < count) throw new GameError(`${name}数量不足。`, 'trade')
  player.inventory[name] -= count
  if (!player.inventory[name]) delete player.inventory[name]
}
export function inventoryRows(player: Player): InventoryRow[] {
  const rows: InventoryRow[] = player.rods.map(rod => ({ rods: [rod] }))
  const items = Object.entries(player.inventory).filter(([, count]) => count > 0)
  for (let i = 0; i < items.length; i += 2) rows.push({ items: items.slice(i, i + 2) })
  return rows
}
export function inventoryPages(player: Player): InventoryRow[][] {
  const rows = inventoryRows(player)
  const pages: InventoryRow[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE))
  return pages.length ? pages.slice(0, MAX_PAGES) : [[]]
}
export interface Overflow { names: string[]; count: number; earned: number }
export function trimOverflow(player: Player, market: Market, config: Config): Overflow {
  const maximum = ROWS_PER_PAGE * MAX_PAGES
  const overflow: Overflow = { names: [], count: 0, earned: 0 }
  for (const row of inventoryRows(player).slice(maximum)) {
    for (const rod of row.rods || []) {
      const index = player.rods.findIndex(r => r.id === rod.id)
      if (index < 0) continue
      overflow.earned = safeAdd(overflow.earned, salePrice(rod.name, market, config))
      overflow.count++
      overflow.names.push(rod.name)
      player.rods.splice(index, 1)
      if (player.equippedId === rod.id) player.equippedId = null
    }
    for (const [name, count] of row.items || []) {
      overflow.earned = safeAdd(overflow.earned, salePrice(name, market, config) * count)
      overflow.count = safeAdd(overflow.count, count)
      overflow.names.push(name)
      delete player.inventory[name]
    }
  }
  player.wallet = safeAdd(player.wallet, overflow.earned)
  return overflow
}
export function overflowText(overflow: Overflow): string {
  return overflow.count ? `仓库超过两页，已自动出售 ${overflow.count} 件物品，获得 ${overflow.earned} 绿宝石。` : ''
}
