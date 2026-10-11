// SPDX-License-Identifier: AGPL-3.0-only
import { Context } from 'koishi'
import { createPlayer, dayKey, GameConfig, Market, Player, refreshMarket, resetDay } from './game'

declare module 'koishi' {
  interface Tables {
    mcfish_player: { id: string; state: Player }
    mcfish_market: { id: string; state: Market }
  }
}

export class GameRepository {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(private ctx: Context, private config: GameConfig) {
    ctx.model.extend('mcfish_player', { id: 'string(255)', state: 'json' }, { primary: 'id' })
    ctx.model.extend('mcfish_market', { id: 'string(32)', state: 'json' }, { primary: 'id' })
  }

  // Prompts and fishing delays run outside this queue and outside the transaction.
  // A trade commits wallet, bag, quota and shared stock together, or rolls them all back.
  run<T>(id: string, operation: (player: Player, market: Market) => T): Promise<T> {
    const task = this.pending.then(async () => {
      let result!: T
      await this.ctx.database.withTransaction(async db => {
        const [row] = await db.get('mcfish_player', { id })
        const [marketRow] = await db.get('mcfish_market', { id: 'global' })
        const player = row?.state || createPlayer(id, this.config)
        const market = marketRow?.state || { id: 'global', day: '', discounts: {}, stock: [] }
        const day = dayKey(new Date(), this.config.timezone)
        resetDay(player, day)
        refreshMarket(market, day)
        result = operation(player, market)
        await db.upsert('mcfish_player', [{ id, state: player }])
        await db.upsert('mcfish_market', [{ id: 'global', state: market }])
      })
      return result
    })
    this.pending = task.catch(() => {})
    return task
  }
}
