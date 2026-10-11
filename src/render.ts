// SPDX-License-Identifier: AGPL-3.0-only
import { Context, h } from 'koishi'
import type {} from 'koishi-plugin-puppeteer'

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

export function cardHtml(title: string, text: string): string {
  return `<html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;width:940px;background:#182c25;color:#eff6dd;font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif}
    article{background:#223b2e;border:4px solid #708751;box-shadow:8px 8px 0 #0e1f18;padding:28px}
    small{color:#b8ce85;letter-spacing:3px;font-size:16px}h1{font-size:32px;margin:12px 0 22px;padding-bottom:18px;border-bottom:3px solid #708751}
    pre{font:20px/1.8 "Microsoft YaHei","Noto Sans CJK SC",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
    footer{margin-top:24px;color:#abc4a0;font-size:14px}</style><article><small>MCFISH · 钓鱼模拟器</small><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(text)}</pre><footer>Koishi · mcfish</footer></article></html>`
}

export async function renderCard(ctx: Context, title: string, text: string, images: boolean): Promise<string> {
  if (images && ctx.puppeteer) {
    try {
      const page = await ctx.puppeteer.page()
      try {
        await page.setViewport({ width: 940, height: 800, deviceScaleFactor: 1 })
        await page.setContent(cardHtml(title, text))
        await page.evaluate(() => document.fonts.ready)
        const card = await page.$('article')
        if (!card) throw new Error('Missing card element')
        const buffer = await card.screenshot({ type: 'png' })
        return h.image(Buffer.from(buffer), 'image/png').toString()
      } finally { await page.close() }
    } catch (error) { ctx.logger('mcfish').warn('图片渲染失败，改用文字：%s', error) }
  }
  return text
}
