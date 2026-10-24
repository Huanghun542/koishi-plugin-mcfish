// SPDX-License-Identifier: AGPL-3.0-only
import { Context, h, Session } from 'koishi'
import type { Config, RecallTarget } from '../config'
// Timers start only after the last message of the entire workflow has been sent.
export class MessageFlow {
  private recalls: string[] = []
  constructor(private ctx: Context, private session: Session, private config: Config) {}
  private remember(ids: unknown, target: RecallTarget, image = false) {
    if (!image && this.config.recallTargets.includes(target) && Array.isArray(ids)) this.recalls.push(...ids)
  }
  async send(content: string, target: RecallTarget = 'notice', image = false) {
    if (!content) return
    const quote = this.config.quoteMessages && this.session.messageId ? h.quote(this.session.messageId).toString() : ''
    const ids = await this.session.send(quote + (image ? content : h.text(content).toString()))
    this.remember(ids, target, image)
  }
  async sendFishing(parts: [string, string]) {
    if (this.config.forwardFishingResults) {
      const nodes = parts.map(content => h('message', {}, [
        h('author', { id: this.session.selfId, name: this.session.bot.user?.name || 'MC 钓鱼' }), h.text(content),
      ]))
      try {
        const ids = await this.session.send(h('message', { forward: true }, nodes).toString())
        this.remember(ids, 'result')
        return
      } catch (error) { this.ctx.logger('mcfish').warn('合并转发发送失败，改为普通消息：%s', error) }
    }
    for (const part of parts) await this.send(part, 'result')
  }
  end() {
    const ids = [...new Set(this.recalls)]
    if (!ids.length) return
    this.ctx.setTimeout(async () => {
      for (const id of ids) {
        try { if (this.session.channelId) await this.session.bot.deleteMessage(this.session.channelId, id) }
        catch (error) { this.ctx.logger('mcfish').debug('消息撤回失败：%s', error) }
      }
    }, this.config.recallDelaySeconds * 1000)
  }
}
