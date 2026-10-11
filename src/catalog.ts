// SPDX-License-Identifier: AGPL-3.0-only
export interface LootItem { name: string; price: number; weight: number; rare: boolean }
export interface RodDefinition { name: string; price: number; durability: number }
// Five tiers and prices follow ZeroBot mcfish; names match the supplied artwork.
export const RODS: RodDefinition[] = [
  { name: '木钓鱼竿', price: 100, durability: 30 },
  { name: '铁钓鱼竿', price: 300, durability: 50 },
  { name: '金钓鱼竿', price: 700, durability: 70 },
  { name: '钻石钓鱼竿', price: 1500, durability: 100 },
  { name: '下界合金钓鱼竿', price: 3100, durability: 150 },
]
export const BOOKS = ['耐久附魔书', '海之眷顾附魔书'] as const
export const DURABILITY_BONUS = [0, 30, 70, 120]
export const DOUBLE_PERCENT = [0, 1, 3, 5]
export const LEGACY_LOOT_V21: LootItem[] = [
  { name: '生鳕鱼', price: 10, weight: 69, rare: false },
  { name: '鲑鱼', price: 20, weight: 20, rare: false },
  { name: '热带鱼', price: 30, weight: 6, rare: false },
  { name: '河豚', price: 40, weight: 3, rare: false },
  { name: '刺豚', price: 36, weight: 3, rare: false },
  { name: '金枪鱼', price: 40, weight: 3, rare: false },
  { name: '鲈鱼', price: 16, weight: 6, rare: false },
  { name: '鳀鱼', price: 8, weight: 10, rare: false },
  { name: '蝠鲼', price: 120, weight: 1, rare: true },
  { name: '螃蟹', price: 16, weight: 8, rare: false },
  { name: '牡蛎', price: 12, weight: 10, rare: false },
  { name: '贝壳', price: 6, weight: 10, rare: false },
  { name: '海草', price: 2, weight: 10, rare: false },
  { name: '海带', price: 4, weight: 10, rare: false },
  { name: '海泡菜', price: 8, weight: 8, rare: false },
  { name: '木棍', price: 2, weight: 10, rare: false },
  { name: '骨头', price: 4, weight: 10, rare: false },
  { name: '皮革', price: 6, weight: 10, rare: false },
  { name: '腐肉', price: 2, weight: 10, rare: false },
  { name: '线', price: 4, weight: 10, rare: false },
  { name: '黏土', price: 4, weight: 10, rare: false },
  { name: '墨囊', price: 12, weight: 8, rare: false },
  { name: '荧光墨囊', price: 40, weight: 4, rare: false },
  { name: '珊瑚', price: 12, weight: 6, rare: false },
  { name: '失活珊瑚', price: 2, weight: 8, rare: false },
  { name: '鹦鹉螺壳', price: 96, weight: 1, rare: true },
  { name: '白珍珠', price: 120, weight: 1, rare: true },
  { name: '黑珍珠', price: 240, weight: 1, rare: true },
  { name: '海洋之心', price: 400, weight: 1, rare: true },
  { name: '下界之星', price: 600, weight: 1, rare: true },
  { name: '鞍', price: 80, weight: 2, rare: true },
  { name: '命名牌', price: 80, weight: 2, rare: true },
  { name: '耐久附魔书', price: 200, weight: 2, rare: true },
  { name: '海之眷顾附魔书', price: 300, weight: 1, rare: true },
]
// Use the former buyback quotes as the new 1x basis; do not double player income.
export const DEFAULT_LOOT: LootItem[] = LEGACY_LOOT_V21.map(item => ({ ...item, price: Math.floor(item.price / 2) }))
export function isEnchantBook(name: string): boolean {
  return name.includes('附魔书') || (BOOKS as readonly string[]).includes(normalizeName(name))
}
export const SOURCE_URL = 'https://github.com/Huanghun542/koishi-plugin-mcfish'
export function normalizeName(name: string): string {
  const aliases: Record<string, string> = {
    木竿: '木钓鱼竿', 铁竿: '铁钓鱼竿', 金竿: '金钓鱼竿', 钻石竿: '钻石钓鱼竿',
    下界合金竿: '下界合金钓鱼竿', 鳕鱼: '生鳕鱼', 鹦鹉螺: '鹦鹉螺壳',
    耐久: BOOKS[0], '耐久附魔': BOOKS[0], 海之眷顾: BOOKS[1], '海之眷顾附魔': BOOKS[1],
  }
  const key = name.trim()
  return Object.hasOwn(aliases, key) ? aliases[key] : key
}
