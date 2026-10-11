// SPDX-License-Identifier: AGPL-3.0-only
import { Context, Session } from 'koishi'
import { SOURCE_URL } from './catalog'
import { Config, RecallTarget, validateConfig } from './config'
import { GameRepository } from './database'
import { buy, dayKey, enchant, equip, finishFishing, fishingText, GameError, Market, overflowText,
  Player, repair, salePrice, sell, sellAll, shopItems, startFishing, trimOverflow, unequip } from './game'
import { MessageFlow } from './core/messages'
import { marketHtml, renderPages, shopHtml, warehouseHtml, warehouseText } from './render'
export { Config } from './config'
export const name = 'mcfish'
export const inject = { required: ['database'], optional: ['puppeteer'] }
export const usage = `MC 钓鱼。启用数据库后即可使用，图片界面需 Puppeteer。发送“钓鱼帮助”查看指令。源码：${SOURCE_URL}。`
export function rules(config: Config): string {
  return `MC 钓鱼模拟器
开始N次钓鱼 / 钓鱼（一次）
仓库 / 市场 / 铁匠铺 / 钓鱼钱包
购买 物品名称 数量 / 出售 物品名称 数量 / 一键出售
装备 N / 卸下鱼竿 / 维修 N / 附魔 N 附魔书名称
附魔书：耐久附魔书、海之眷顾附魔书

新用户获得木钓鱼竿和 100 绿宝石。每日最多 ${config.dailyLimit} 次，一批随机等待 1 至 ${config.maxWaitSeconds} 秒；次数与市场按 ${config.timezone} 零点刷新。
仓库最多两页：鱼竿一行一个，物品一行两个，超出容量按当日收购价自动出售。一键出售保留鱼竿。
市场每日高价收购 ${config.marketMinItems} 至 ${config.marketMaxItems} 种物品，涨幅 ${config.marketMinIncrease}% 至 ${config.marketMaxIncrease}%。
维修消耗 200 绿宝石并修满耐久。附魔成功率 50%，每次消耗 ${config.enchantCost} 绿宝石${config.consumeEnchantBook ? '和一本对应附魔书' : ''}，失败不返还，最高三级。
耐久附魔额外增加 30/70/120 耐久；海之眷顾增加 1%/3%/5% 的双倍产出概率。
开源地址：${SOURCE_URL}`
}
export function apply(ctx: Context, config: Config) {
  validateConfig(config)
  const repository = new GameRepository(ctx, config)
  const active = new Set<string>()
  const delays = new Map<() => void, () => void>()
  let disposed = false
  ctx.on('dispose', () => { disposed = true; for (const [cancel, resolve] of delays) { cancel(); resolve() }; delays.clear() })
  async function wait(ms: number) {
    if (ms <= 0) return
    await new Promise<void>(resolve => {
      const cancel = ctx.setTimeout(() => { delays.delete(cancel); resolve() }, ms)
      delays.set(cancel, resolve)
    })
  }
  async function scheduleRefresh() {
    if (disposed) return
    try { await repository.refresh() } catch (error) { ctx.logger('mcfish').error(error) }
    const now = Date.now(), today = dayKey(new Date(now), config.timezone)
    let low = now, high = now + 26 * 3600000
    while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (dayKey(new Date(mid), config.timezone) === today) low = mid; else high = mid }
    if (!disposed) ctx.setTimeout(scheduleRefresh, high - Date.now() + 10)
  }
  ctx.on('ready', scheduleRefresh)

  async function guard(session: Session | undefined, action: (id: string, flow: MessageFlow) => Promise<void>, options?: object) {
    if (!session) return '请在聊天中使用此命令。'
    const flow = new MessageFlow(ctx, session, config)
    if (!session.platform || !session.userId) { await flow.send('无法识别当前用户。'); flow.end(); return }
    const id = JSON.stringify([session.platform, session.userId])
    if (active.has(id)) { await flow.send('正在钓鱼或处理其他操作，请稍后再试。', 'waiting'); flow.end(); return }
    if (disposed) return
    active.add(id)
    try {
      if (options && Object.keys(options).length) throw new GameError('数量或序号必须是正整数。')
      // Recover persisted fishing after reload/restart exactly once before processing commands.
      const recovered = await repository.run(id, (p, m) => {
        const result = finishFishing(p)
        return { result, overflow: trimOverflow(p, m, config), pending: p.pending }
      })
      if (recovered.result) await flow.send(`上次钓鱼已完成。\n${fishingText(recovered.result)}`, 'result')
      await flow.send(overflowText(recovered.overflow), 'trade')
      if (recovered.pending) throw new GameError(`正在钓鱼，约 ${Math.max(1, Math.ceil((recovered.pending.finishAt - Date.now()) / 1000))} 秒后完成。`, 'waiting')
      await action(id, flow)
    } catch (error) {
      if (error instanceof GameError) await flow.send(error.message, error.target)
      else { ctx.logger('mcfish').error(error); await flow.send('操作失败，请稍后重试或联系管理员查看日志。') }
    } finally { active.delete(id); flow.end() }
  }
  async function view(id: string, flow: MessageFlow, kind: 'warehouse' | 'market' | 'shop', username: string) {
    const snapshot = await repository.run(id, (p, m) => ({ p, m }))
    const { p, m } = snapshot
    if (config.images && ctx.puppeteer) {
      try {
        const html = kind === 'warehouse' ? warehouseHtml(p, m, config, username) : kind === 'market' ? marketHtml(p, m, config) : shopHtml(p, config)
        const pages = await renderPages(ctx, html)
        for (const image of pages) await flow.send(image, 'notice', true)
        return
      } catch (error) { ctx.logger('mcfish').warn('图片渲染失败，使用文字输出：%s', error) }
    }
    const text = kind === 'warehouse' ? warehouseText(p, m, config) : kind === 'shop'
      ? `铁匠铺（鱼竿均无附魔、满耐久）：\n${shopItems(config).map(i => `${i.name}：${i.price} 绿宝石`).join('\n')}`
      : `每日收购市场 · ${m.day}\n${Object.entries(m.increases).map(([name, increase]) => `${name}：${salePrice(name, m, config)} 绿宝石，涨幅 +${increase}%`).join('\n')}\n其他物品按基础价格收购。`
    await flow.send(text)
  }
  const command = (name: string, description: string) => ctx.command(`mcfish.${name}`, description)
  ctx.command('mcfish', 'MC 钓鱼模拟器').action(({ session }) => guard(session, async (_, flow) => { await flow.send(rules(config)) }))
  command('rules', '查看钓鱼帮助').alias('钓鱼帮助', '查看钓鱼规则').action(({ session }) => guard(session, async (_, flow) => { await flow.send(rules(config)) }))
  command('source', '查看开源代码').alias('钓鱼源码').action(({ session }) => guard(session, async (_, flow) => { await flow.send(`${SOURCE_URL}\n感谢 fangliuyu 与 FloatTech/ZeroBot-Plugin 贡献者。AGPL-3.0-only。`) }))
  command('pack', '查看仓库').alias('仓库', '钓鱼背包').action(({ session }) => guard(session, (id, flow) => view(id, flow, 'warehouse', session!.username || session!.userId || '玩家')))
  command('market', '查看今日收购行情').alias('市场', '钓鱼市场', '钓鱼看板').action(({ session }) => guard(session, (id, flow) => view(id, flow, 'market', '')))
  command('shop', '查看铁匠铺').alias('铁匠铺', '工匠铺', '钓鱼商店').action(({ session }) => guard(session, (id, flow) => view(id, flow, 'shop', '')))
  command('wallet', '查看绿宝石余额').alias('钓鱼钱包').action(({ session }) => guard(session, async (id, flow) => { await flow.send(await repository.run(id, p => `当前余额：${p.wallet} 绿宝石。`)) }))
  ctx.command('mcfish.fish [次数:string]', '开始钓鱼').alias('钓鱼')
    .shortcut(/^开始(?:(\d+)次)?钓鱼$/, { args: ['$1'] })
    .shortcut(/^进行(?:(\d+)次)?钓鱼$/, { args: ['$1'] })
    .action(({ session, options }, amount) => guard(session, async (id, flow) => {
      const pending = await repository.run(id, p => startFishing(p, amount, config))
      for (const note of pending.notes.filter(note => note.includes('耐久'))) await flow.send(note, 'damage')
      await flow.send(`已开始 ${pending.casts} 次钓鱼，预计最长等待 ${config.maxWaitSeconds} 秒。`, 'waiting')
      await wait(pending.finishAt - Date.now())
      if (disposed) return
      const result = await repository.run(id, (p, m) => {
        const completed = finishFishing(p)
        if (!completed) throw new GameError('本次钓鱼尚未完成，请稍后查看仓库。', 'waiting')
        return { completed, overflow: trimOverflow(p, m, config) }
      })
      await flow.send(fishingText(result.completed), 'result')
      await flow.send(overflowText(result.overflow), 'trade')
    }, options))
  function mutation(id: string, flow: MessageFlow, action: (p: Player, m: Market) => string, target: RecallTarget = 'trade') {
    return repository.run(id, (p, m) => ({ text: action(p, m), overflow: trimOverflow(p, m, config) }))
      .then(async result => { await flow.send(result.text, target); await flow.send(overflowText(result.overflow), 'trade') })
  }
  ctx.command('mcfish.buy <物品:string> [数量:string]', '购买鱼竿或附魔书').alias('购买')
    .action(({ session, options }, item, quantity) => guard(session, (id, flow) => mutation(id, flow, p => buy(p, item, quantity, config)), options))
  ctx.command('mcfish.sell <物品:string> [数量:string]', '出售仓库物品').alias('出售')
    .action(({ session, options }, item, quantity) => guard(session, (id, flow) => mutation(id, flow, (p, m) => sell(p, item, quantity, m, config)), options))
  command('sell-all', '出售全部非鱼竿物品').alias('一键出售')
    .action(({ session }) => guard(session, (id, flow) => mutation(id, flow, (p, m) => sellAll(p, m, config))))
  ctx.command('mcfish.equip <序号:string>', '按仓库序号装备鱼竿').alias('装备')
    .action(({ session, options }, index) => guard(session, (id, flow) => mutation(id, flow, p => equip(p, index)), options))
  command('unequip', '卸下当前鱼竿').alias('卸下鱼竿')
    .action(({ session }) => guard(session, (id, flow) => mutation(id, flow, p => unequip(p))))
  ctx.command('mcfish.repair <序号:string>', '花费 200 绿宝石修满鱼竿耐久').alias('维修')
    .action(({ session, options }, index) => guard(session, (id, flow) => mutation(id, flow, p => repair(p, index)), options))
  ctx.command('mcfish.enchant <序号:string> <附魔书:string>', '对指定鱼竿附魔').alias('附魔')
    .action(({ session, options }, index, book) => guard(session, (id, flow) => mutation(id, flow, p => enchant(p, index, book, config)), options))
}
