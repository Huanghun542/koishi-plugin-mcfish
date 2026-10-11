// SPDX-License-Identifier: AGPL-3.0-only
import { Context } from 'koishi'
import type { Config } from '../config'
import { dayKey, Market, migratePlayer, Player, refreshMarket, resetDay } from '../game'
declare module 'koishi' {
  interface Tables {
    mcfish_player: { id: string; state: Player }
    mcfish_market: { id: string; state: Market }
  }
}
const queues = new WeakMap<object, Promise<unknown>>()
export class GameRepository {
  constructor(private ctx: Context, private config: Config) {
    ctx.model.extend('mcfish_player', { id: 'string(255)', state: 'json' }, { primary: 'id' })
    ctx.model.extend('mcfish_market', { id: 'string(32)', state: 'json' }, { primary: 'id' })
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const key = this.ctx.root
    const result = (queues.get(key) || Promise.resolve()).then(task)
    queues.set(key, result.catch(() => {}))
    return result
  }
  run<T>(id: string, operation: (player: Player, market: Market) => T): Promise<T> {
    return this.enqueue(async () => {
      let result!: T
      await this.ctx.database.withTransaction(async db => {
        const [row] = await db.get('mcfish_player', { id })
        const [marketRow] = await db.get('mcfish_market', { id: 'global' })
        const player = migratePlayer(row?.state, id)
        const market = marketRow?.state?.increases ? marketRow.state : { day: '', increases: {} }
        const day = dayKey(new Date(), this.config.timezone)
        resetDay(player, day)
        refreshMarket(market, day, this.config)
        result = operation(player, market)
        await db.upsert('mcfish_player', [{ id, state: player }])
        await db.upsert('mcfish_market', [{ id: 'global', state: market }])
      })
      return structuredClone(result)
    })
  }
  refresh(): Promise<void> {
    return this.enqueue(async () => {
      await this.ctx.database.withTransaction(async db => {
        const [row] = await db.get('mcfish_market', { id: 'global' })
        const market = row?.state?.increases ? row.state : { day: '', increases: {} }
        refreshMarket(market, dayKey(new Date(), this.config.timezone), this.config)
        await db.upsert('mcfish_market', [{ id: 'global', state: market }])
      })
    })
  }
}
