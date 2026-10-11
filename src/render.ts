// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Context, h } from 'koishi'
import type {} from 'koishi-plugin-puppeteer'
import type { Config } from './config'
import { BOOKS, RODS } from './catalog'
import { gameplayNotes, helpCommands, marketChange } from './core/help'
import { inventoryPages, LeaderboardEntry, maxDurability, Player, Market, salePrice, shopItems, truncateUsername } from './game'

export const WIDTH = 751, HEIGHT = 1238
const root = path.resolve(__dirname, '../assets')
const cache = new Map<string, string>()
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
function asset(relative: string, fallback?: string): string {
  // Resolve only literal filenames inside the asset tree; item names may be user-configured.
  if (!cache.has(relative)) {
    const location = path.resolve(root, relative)
    if (!location.startsWith(root + path.sep)) return fallback ? asset(fallback) : ''
    try {
      const mime = location.endsWith('.ttf') ? 'font/ttf' : 'image/png'
      cache.set(relative, `data:${mime};base64,${readFileSync(location).toString('base64')}`)
    } catch { return fallback ? asset(fallback) : '' }
  }
  return cache.get(relative)!
}
export function itemIcon(name: string): string {
  if (/[\\/]|^\.{1,2}$/.test(name)) return asset('items/屏障.png')
  return asset(`items/${name}.png`, 'items/屏障.png')
}
const icon = (name: string) => `<img class="icon" alt="" src="${itemIcon(name)}">`
function nameHtml(name: string, config: Config) {
  const rare = config.lootTable.find(item => item.name === name)?.rare ?? BOOKS.includes(name as any)
  return `<b style="color:${escapeHtml(rare ? config.rareColor : config.normalColor)}">${escapeHtml(name)}</b>`
}
function card(title: string, wallet: number | null, background: string, body: string, footer: string, extraStyle = ''): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    @font-face{font-family:MC;src:url('${asset('fonts/font.ttf')}')}*{box-sizing:border-box}
    body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;font-family:MC,'Microsoft YaHei',sans-serif}
    article{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:url('${asset(`backgrounds/${background}.png`)}') center/100% 100%;overflow:hidden}
    h1{position:absolute;left:223px;top:109px;width:326px;height:68px;line-height:68px;margin:0;font-size:32px;text-align:center;color:#193548;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .balance{position:absolute;left:441px;top:192px;width:205px;height:45px;display:flex;align-items:center;justify-content:center;gap:8px;color:#17683f;font-size:25px}
    .balance img{width:32px;height:32px;image-rendering:pixelated}.rows{position:absolute;left:97px;top:243px;width:566px}
    .row{display:flex;gap:9px;height:51px;padding-bottom:4px}.entry{background:rgba(15,43,55,.85);border:1px solid rgba(150,222,237,.45);border-radius:6px;display:flex;align-items:center;gap:9px;min-width:0;padding:4px 8px;flex:1}
    .spacer{flex:1;min-width:0}.icon{width:36px;height:36px;flex-shrink:0;object-fit:contain;image-rendering:pixelated}.copy{min-width:0;flex:1}b{display:block;font-size:18px;line-height:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:normal}
    small{display:block;color:#d3e5e8;font-size:13px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.number{color:#a9d4db;font-size:15px;flex-shrink:0}.tag{color:#a4f7c4;font-size:13px;margin-left:10px}
    footer{position:absolute;left:147px;top:1030px;width:470px;padding:9px 12px;border-radius:6px;background:rgba(15,43,55,.85);text-align:center;color:#d3e5e8;font-size:15px;line-height:23px}
    .watermark{position:absolute;left:0;right:0;bottom:22px;text-align:center;color:#fff;font:20px/26px MC,'Microsoft YaHei',sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);letter-spacing:.5px}
    ${extraStyle}
  </style></head><body><article><h1>${escapeHtml(title)}</h1>${wallet === null ? '' : `<div class="balance" style="font-size:${String(wallet).length > 9 ? 18 : 25}px">${wallet}${icon('绿宝石')}</div>`}<div class="rows">${body}</div><footer>${escapeHtml(footer).replace(/\n/g, '<br>')}</footer><div class="watermark">Koishi_Plugin_mcfish</div></article></body></html>`
}
export function warehouseHtml(player: Player, market: Market, config: Config, username: string): string[] {
  const pages = inventoryPages(player)
  return pages.map((rows, page) => {
    const body = rows.map(row => `<div class="row">${row.rods ? row.rods.map(rod => {
      const index = player.rods.findIndex(r => r.id === rod.id) + 1
      return `<div class="entry"><span class="number">${index}</span>${icon(rod.name)}<div class="copy">${nameHtml(rod.name, config)}<small>耐久 ${rod.durability}/${maxDurability(rod)}　耐久附魔 ${rod.unbreaking}　海之眷顾 ${rod.luck}</small></div>${rod.id === player.equippedId ? '<span class="tag">已装备</span>' : ''}</div>`
    }).join('') : row.items!.map(([name, count]) => `<div class="entry">${icon(name)}<div class="copy">${nameHtml(name, config)}<small>×${count}　收购总价 ${salePrice(name, market, config) * count}</small></div></div>`).join('') + (row.items!.length === 1 ? '<div class="spacer"></div>' : '')}</div>`).join('')
    return card(`${username}的仓库`, player.wallet, '仓库背景', body, `第 ${page + 1}/${pages.length} 页　今日钓鱼 ${player.casts}/${config.dailyLimit}\n装备 N · 维修 N · 附魔 N 附魔书名称`)
  })
}
export function marketHtml(player: Player, market: Market, config: Config): string[] {
  const entries = Object.entries(market.increases)
  const pages: string[] = []
  for (let start = 0; start < entries.length; start += 15) {
    const body = entries.slice(start, start + 15).map(([name, increase]) => `<div class="row"><div class="entry">${icon(name)}<div class="copy">${nameHtml(name, config)}<small>基础收购 ${salePrice(name, { day: '', increases: {} }, config)}　今日收购 ${salePrice(name, market, config)} 绿宝石　<span style="color:${increase < 0 ? '#45d483' : increase > 0 ? '#ff5b62' : '#d3e5e8'}">${escapeHtml(marketChange(increase))}</span></small></div></div></div>`).join('')
    pages.push(card('每日收购市场', player.wallet, '市场背景', body, `${market.day} · ${config.timezone} 零点刷新\n出售 物品名称 数量 · 一键出售`))
  }
  return pages
}
export function shopHtml(player: Player, config: Config): string[] {
  const body = shopItems(config).map(item => {
    const rod = RODS.find(value => value.name === item.name)
    const detail = rod ? `耐久 ${rod.durability}/${rod.durability}　|　耐久附魔 0　|　海之眷顾 0` : `${item.price} 绿宝石 / 件`
    return `<div class="row"><div class="entry">${icon(item.name)}<div class="copy"><div class="shop-title">${nameHtml(item.name, config)}${rod ? `<span class="shop-price">${item.price} 绿宝石</span>` : ''}</div><small>${detail}</small></div></div></div>`
  }).join('')
  return [card('铁匠铺', player.wallet, '工匠铺背景', body, `鱼竿均为无附魔、满耐久\n维修 ${config.repairCost} 绿宝石 · 购买 物品名称 数量`, `
    .shop-title{display:flex;align-items:center;gap:10px}.shop-title b{flex:1;min-width:0}.shop-price{color:#a4f7c4;font-size:14px;white-space:nowrap}
  `)]
}
export function shopText(player: Player, config: Config): string {
  return `铁匠铺（鱼竿均无附魔、满耐久）：\n${shopItems(config).map(item => {
    const rod = RODS.find(value => value.name === item.name)
    return rod ? `${item.name}：${item.price} 绿宝石，耐久 ${rod.durability}/${rod.durability} | 耐久附魔 0 | 海之眷顾 0` : `${item.name}：${item.price} 绿宝石`
  }).join('\n')}`
}
export function helpHtml(config: Config): string[] {
  const commands = helpCommands(config)
  const commandBody = commands.map(item => `<div class="help-item"><b>${escapeHtml(item.command)}</b><small>${escapeHtml(item.description)}</small></div>`).join('')
  const notes = gameplayNotes(config).map(note => `<div class="help-note">${escapeHtml(note)}</div>`).join('')
  const body = `<div class="help-grid">${commandBody}</div><div class="help-caption">简易玩法</div><div class="help-notes">${notes}</div>`
  return [card('钓鱼帮助', null, '帮助菜单背景', body, 'XX 为物品名，N 为数量或鱼竿序号\n省略数量默认为 1 · “钓鱼”默认一次', `
    h1{top:165px;height:54px;line-height:54px}
    .help-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px}
    .help-item{min-height:56px;padding:6px 8px;border:1px solid rgba(150,222,237,.45);border-radius:6px;background:rgba(15,43,55,.85);overflow:hidden}
    .help-item b{color:#fff;font-size:16px;line-height:20px;text-overflow:ellipsis}.help-item small{font-size:12px;line-height:18px;color:#d3e5e8;white-space:normal;overflow-wrap:anywhere}
    .help-caption{margin:10px 0 5px;color:#193548;font-size:18px;text-align:center;border-bottom:2px solid #759ba6;padding-bottom:3px}
    .help-notes{padding:8px 10px;border-radius:6px;background:rgba(15,43,55,.85);color:#fff;font-size:14px;line-height:23px}
    .help-note{white-space:normal;overflow-wrap:anywhere;margin-bottom:4px}.help-note:last-child{margin-bottom:0}
  `)]
}
export function leaderboardHtml(entries: LeaderboardEntry[]): string[] {
  const body = `<div class="rank-head"><span>排名</span><span>用户名</span><span>QQ号</span><span>绿宝石数量</span></div>`
    + entries.slice(0, 10).map(entry => `<div class="rank-row${entry.rank <= 3 ? ' podium' : ''}"><span class="rank">NO.${entry.rank}</span><span class="username">${escapeHtml(truncateUsername(entry.username, 15))}</span><span class="qq">${escapeHtml(entry.maskedId)}</span><span class="amount" style="font-size:${String(entry.wallet).length > 10 ? 13 : 19}px">${entry.wallet}</span></div>`).join('')
    + (entries.length ? '' : '<div class="rank-empty">暂无玩家数据</div>')
  return [card('福布斯排行榜', null, '仓库背景', body, '按当前平台绿宝石余额排名 · 前 10 名\n仅统计余额，不包含仓库估值', `
    .rank-head,.rank-row{display:grid;grid-template-columns:65px minmax(0,1fr) 145px 142px;align-items:center;column-gap:0;padding:0 9px}
    .rank-head{height:48px;margin-bottom:9px;color:#204758;font-size:17px;border-bottom:2px solid #759ba6}
    .rank-row{height:61px;margin-bottom:9px;border:1px solid rgba(150,222,237,.45);border-radius:6px;background:rgba(15,43,55,.85);color:#eff9f9;font-size:18px}
    .rank-row span{min-width:0;white-space:nowrap;overflow:hidden}.rank{color:#a9d4db}.podium .rank{color:#ffd700}.username{text-overflow:ellipsis}
    .qq{font-size:17px;color:#bbd9df}.amount{text-align:right;color:#a4f7c4;font-variant-numeric:tabular-nums}.rank-head span:last-child{text-align:right}.rank-empty{padding:30px;text-align:center;color:#204758}
  `)]
}
export function warehouseText(player: Player, market: Market, config: Config): string {
  return [`仓库 · 绿宝石 ${player.wallet} · 今日钓鱼 ${player.casts}/${config.dailyLimit}`,
    ...player.rods.map((rod, i) => `${i + 1}. ${rod.name}${rod.id === player.equippedId ? '（已装备）' : ''} 耐久 ${rod.durability}/${maxDurability(rod)}，耐久附魔 ${rod.unbreaking}，海之眷顾 ${rod.luck}`),
    ...Object.entries(player.inventory).map(([name, count]) => `${name} ×${count}　收购总价 ${salePrice(name, market, config) * count}`)].join('\n')
}
export async function renderPages(ctx: Context, html: string[]): Promise<string[]> {
  const output: string[] = []
  for (const content of html) {
    const page = await ctx.puppeteer.page()
    try {
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
      await page.setContent(content, { waitUntil: 'load' })
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))) })
      const buffer = await page.screenshot({ type: 'png' })
      output.push(h.image(Buffer.from(buffer), 'image/png').toString())
    } finally { await page.close() }
  }
  return output
}
