// SPDX-License-Identifier: AGPL-3.0-only
import { Context } from 'koishi'
import type { Config } from '../config'
import { dayKey, Market, migratePlayer, Player, refreshMarket, resetDay, syncDurability } from '../game'
import { cleanUsername, LeaderboardEntry, maskUserId, playerIdentity } from '../core/leaderboard'
declare module 'koishi' {
  interface Tables {
    mcfish_player: { id: string; state: Player; wallet: number; username: string; platform: string; userId: string }
    mcfish_market: { id: string; state: Market }
  }
}
const queues = new WeakMap<object, Promise<unknown>>()
export class GameRepository {
  private leaderboardReady?: Promise<void>
  constructor(private ctx: Context, private config: Config) {
    ctx.model.extend('mcfish_player', { id: 'string(255)', state: 'json', wallet: 'double', username: 'string(255)',
      platform: 'string(32)', userId: 'string(255)' }, { primary: 'id' })
    ctx.model.extend('mcfish_market', { id: 'string(32)', state: 'json' }, { primary: 'id' })
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const key = this.ctx.root
    const result = (queues.get(key) || Promise.resolve()).then(task)
    queues.set(key, result.catch(() => {}))
    return result
  }
  run<T>(id: string, operation: (player: Player, market: Market) => T, username?: string): Promise<T> {
    return this.enqueue(async () => {
      let result!: T
      await this.ctx.database.withTransaction(async db => {
        const [row] = await db.get('mcfish_player', { id })
        const [marketRow] = await db.get('mcfish_market', { id: 'global' })
        const player = migratePlayer(row?.state, id)
        syncDurability(player, this.config)
        const market = marketRow?.state?.increases ? marketRow.state : { day: '', increases: {} }
        const day = dayKey(new Date(), this.config.timezone)
        resetDay(player, day)
        refreshMarket(market, day, this.config)
        result = operation(player, market)
        await db.upsert('mcfish_player', [{ id, state: player, wallet: player.wallet,
          username: username === undefined ? row?.username || '未命名玩家' : cleanUsername(username), ...playerIdentity(id) }])
        await db.upsert('mcfish_market', [{ id: 'global', state: market }])
      })
      return structuredClone(result)
    })
  }
  // Backfill the sortable wallet/profile columns of pre-leaderboard saves once.
  // Subsequent rankings read only the database's top ten rows, not every inventory.
  prepareLeaderboard(): Promise<void> {
    if (!this.leaderboardReady) {
      this.leaderboardReady = this.enqueue(async () => {
        await this.ctx.database.withTransaction(async db => {
          const rows = await db.get('mcfish_player', {})
          for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100).map(row => ({ id: row.id, wallet: row.state.wallet,
              username: row.username || '未命名玩家', ...playerIdentity(row.id) }))
            if (batch.length) await db.upsert('mcfish_player', batch)
          }
        })
      }).catch(error => { this.leaderboardReady = undefined; throw error })
    }
    return this.leaderboardReady
  }
  async leaderboard(platform: string): Promise<LeaderboardEntry[]> {
    await this.prepareLeaderboard()
    return this.enqueue(async () => {
      const rows = await this.ctx.database.get('mcfish_player', { platform }, {
        fields: ['username', 'userId', 'wallet'], sort: { wallet: 'desc', id: 'asc' }, limit: 10,
      })
      return rows.map((row, index) => ({ rank: index + 1, username: cleanUsername(row.username),
        maskedId: maskUserId(row.userId), wallet: row.wallet }))
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
