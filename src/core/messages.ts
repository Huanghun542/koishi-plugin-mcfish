// SPDX-License-Identifier: AGPL-3.0-only
import { Context, Session } from 'koishi'
import type { Config, RecallTarget } from '../config'
// Timers start only after the last message of the entire workflow has been sent.
export class MessageFlow {
  private recalls: string[] = []
  constructor(private ctx: Context, private session: Session, private config: Config) {}
  async send(content: string, target: RecallTarget = 'notice', image = false) {
    if (!content) return
    const ids = await this.session.send(content)
    if (!image && this.config.recallTargets.includes(target) && Array.isArray(ids)) this.recalls.push(...ids)
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
