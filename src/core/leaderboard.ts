// SPDX-License-Identifier: AGPL-3.0-only
import { h } from 'koishi'
export interface LeaderboardEntry { rank: number; username: string; maskedId: string; wallet: number }
export function playerIdentity(id: string): { platform: string; userId: string } {
  try {
    const value = JSON.parse(id)
    if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') return { platform: value[0], userId: value[1] }
  } catch {}
  const colon = id.indexOf(':')
  return colon >= 0 ? { platform: id.slice(0, colon), userId: id.slice(colon + 1) } : { platform: '', userId: id }
}
export function cleanUsername(name: string | undefined): string {
  const cleaned = (name || '').replace(/[\p{Cc}\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim()
  return Array.from(cleaned).slice(0, 200).join('') || '未命名玩家'
}
export function maskUserId(id: string): string {
  const characters = Array.from(id)
  if (characters.length >= 8) return characters.slice(0, 3).join('') + '****' + characters.slice(-4).join('')
  if (characters.length >= 3) return characters[0] + '****' + characters.at(-1)
  return '****'
}
const segments = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
export function truncateUsername(name: string, maxUnits = 16): string {
  const letters = [...segments.segment(cleanUsername(name))].map(item => item.segment)
  const width = (text: string) => /^[\x20-\x7e]+$/.test(text) ? text.length : 2
  if (letters.reduce((total, letter) => total + width(letter), 0) <= maxUnits) return letters.join('')
  let result = '', used = 0
  for (const letter of letters) {
    const units = width(letter)
    if (used + units > maxUnits - 3) break
    result += letter; used += units
  }
  return result + '...'
}
export function leaderboardText(entries: LeaderboardEntry[]): string {
  return h.escape(['福布斯排行榜', '排名 | 用户名 | QQ号 | 绿宝石数量',
    ...entries.map(entry => `NO.${entry.rank} | ${truncateUsername(entry.username)} | ${entry.maskedId} | ${entry.wallet}`),
    entries.length ? '' : '暂无玩家数据。'].filter(Boolean).join('\n'))
}
