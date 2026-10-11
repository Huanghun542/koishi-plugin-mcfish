// SPDX-License-Identifier: AGPL-3.0-only
import { Context, Schema, Session } from 'koishi'
import { EQUIPPABLE, ITEMS } from './catalog'
import { GameRepository } from './database'
import { count, craft, craftingMaterial, dice, enchant, equip, equipmentLabel, fish, GameError,
  Player, positive, priceOf, purify, quote, repair, rodCount, SOURCE_URL, Stack, stackLabel, startRod, transact, zoneWeights } from './game'
import { renderCard } from './render'

export const name = 'mcfish'
export const inject = { required: ['database'], optional: ['puppeteer'] }
export const usage = `MC 钓鱼模拟器。需启用数据库；Puppeteer 可选。发送「查看钓鱼规则」开始。源码：${SOURCE_URL}。AGPL-3.0-only，无担保。`

export interface Config {
  initialBalance: number
  dailyLimit: number
  timezone: string
  maxWaitSeconds: number
  promptTimeoutSeconds: number
  cooldownSeconds: number
  images: boolean
}
export const Config: Schema<Config> = Schema.object({
  initialBalance: Schema.number().min(100).max(1000000).step(1).default(200).description('新玩家初始金币，只在首次建档时发放。'),
  dailyLimit: Schema.number().min(1).max(500).step(1).default(50).description('每人每日钓鱼次数。'),
  timezone: Schema.string().default('Asia/Shanghai').description('每日刷新时区（IANA 名称）。'),
  maxWaitSeconds: Schema.number().min(0).max(120).step(1).default(120).description('无诱钓附魔时的最长等待秒数；0 为立即结算。'),
  promptTimeoutSeconds: Schema.number().min(5).max(120).step(1).default(60).description('选择与交易确认等待秒数。'),
  cooldownSeconds: Schema.number().min(0).max(60).default(3).description('每位玩家操作间隔秒数。'),
  images: Schema.boolean().default(true).description('有 Puppeteer 时将背包、商店和钓鱼结果渲染为图片。'),
})

export function rules(config: Config) {
  return `MC 钓鱼模拟器（移植自规则 5.6.2）
进行钓鱼 / 进行5次钓鱼
钓鱼背包 / 钓鱼商店 / 钓鱼看板 / 钓鱼钱包
购买初始木竿 / 购买鳕鱼 3 / 出售鳕鱼 3 / 出售所有垃圾
装备木竿 / 装备三叉戟 / 装备美西螈
修复鱼竿 / 附魔诱钓 / 附魔海之眷顾
合成铁竿（可选择三支材料或回复“梭哈”）
消除宝藏诅咒 2 / 当前装备概率明细

每天 ${config.dailyLimit} 次钓鱼，按 ${config.timezone} 零点刷新。新玩家获得 ${config.initialBalance} 金币，最多三次花 100 金币购买并装备新手木竿。
商店每日行情为均价的 50%–199%，出售收取 20% 税。每天交易鱼竿上限 10 支、购买非鱼竿物品上限 30 件（垃圾除外）。背包鱼竿超过 30 支不能钓鱼，超过 50 支不能购买。
鱼竿等级：木竿 → 铁竿 → 金竿 → 钻石竿 → 下界合金竿 → 三叉戟。三支低级钓具合成一支高级钓具，成功率 90%，失败消耗材料，附魔取平均值。三叉戟每次获得三次掉落。
维修需要同类钓具，继承 80% 耐久，背包鱼竿超过 10 支时继承 100%；三叉戟直接修满。最多维修 10 次。附魔消耗对应书，成功率 51%，等级上限 III；诱钓缩短等待，海之眷顾提高掉落概率。
美西螈每次消耗三条鱼，非鱼竿且非美西螈的掉落数量变为五；没有鱼会离开。海豚把空竿概率变为垃圾。背包名字含“鱼”的物品超过 100 件时激活钓鱼佬效果。
每交易 10 支鱼竿增加一层宝藏诅咒，每层使购买价格增加 10%、出售价格减少 10%；超过 10 层出售可能倒贴，确认时显示实际金额。一份净化书消除一层诅咒。每结算 75 次掉落奖励一本净化书。每 20 笔未使用优惠的购买获得三件半价福利，唱片可用于一次出售翻倍。
初始概率：宝藏 1%、钓具 4%、鱼 25%、垃圾 30%、空竿 40%。实时详情以“当前装备概率明细”为准。
金币是本插件独立余额，不连接其他经济插件。新 Koishi 存档，不读取原版 Go SQLite 数据。
感谢 fangliuyu 与 FloatTech/ZeroBot-Plugin 贡献者。AGPL-3.0-only，无担保。
开源地址：${SOURCE_URL}`
}

export function apply(ctx: Context, config: Config) {
  try { new Intl.DateTimeFormat('en', { timeZone: config.timezone }).format() }
  catch { throw new Error(`mcfish：无效时区 ${config.timezone}`) }
  const repository = new GameRepository(ctx, config)
  const active = new Set<string>()
  const cooldowns = new Map<string, number>()
  const delays = new Map<() => void, (error: GameError) => void>()
  let disposed = false
  ctx.on('dispose', () => {
    disposed = true
    for (const [cancel, reject] of delays) { cancel(); reject(new GameError('插件已停用，本次钓鱼已取消。')) }
    delays.clear()
    cooldowns.clear()
  })
  const idOf = (session: Session) => {
    if (!session.platform || !session.userId) throw new GameError('无法识别当前玩家。')
    return JSON.stringify([session.platform, session.userId])
  }
  async function guard(session: Session | undefined, action: (id: string, session: Session) => Promise<string>, limited = true) {
    if (!session) return '请在聊天中使用此命令。'
    let id: string
    try { id = idOf(session) } catch (error) { return (error as Error).message }
    if (disposed) return '插件已停用。'
    if (active.has(id)) return '你还有正在进行的操作，请先完成或取消。'
    const now = Date.now()
    if (limited && (cooldowns.get(id) || 0) > now) return '操作太快了，请稍后再试。'
    active.add(id)
    if (limited) cooldowns.set(id, now + config.cooldownSeconds * 1000)
    try { return await action(id, session) }
    catch (error) {
      if (error instanceof GameError) return error.message
      ctx.logger('mcfish').error(error)
      return '操作失败，未提交的变更已取消。请稍后重试或联系管理员查看日志。'
    } finally { active.delete(id) }
  }
  ctx.setInterval(() => {
    const now = Date.now()
    for (const [id, expires] of cooldowns) if (expires < now) cooldowns.delete(id)
  }, 60000)
  async function answer(session: Session, message: string, allowNo = false): Promise<string> {
    await session.send(message)
    const response = (await session.prompt(config.promptTimeoutSeconds * 1000)).trim()
    if (disposed) throw new GameError('插件已停用。')
    if (!response) throw new GameError('等待超时，操作已取消。')
    if (response === '取消' || (!allowNo && ['否', 'n', 'N'].includes(response))) throw new GameError('已取消操作。')
    return response
  }
  async function confirm(session: Session, message: string) {
    const response = await answer(session, `${message}\n回答“是”确认，回答“否”或“取消”取消。`)
    if (!['是', 'y', 'Y'].includes(response)) throw new GameError('没有收到“是”，操作已取消。')
  }
  async function choose(session: Session, stacks: Stack[]): Promise<Stack> {
    if (!stacks.length) throw new GameError('没有找到该物品。')
    if (stacks.length === 1) return stacks[0]
    const response = await answer(session, `${stacks.map((s, i) => `[${i}] ${stackLabel(s)}`).join('\n')}\n输入序号选择，或回复“取消”。`)
    if (!/^\d+$/.test(response) || !stacks[Number(response)]) throw new GameError('序号无效，操作已取消。')
    return stacks[Number(response)]
  }
  async function delay(seconds: number) {
    if (!seconds) return
    await new Promise<void>((resolve, reject) => {
      const cancel = ctx.setTimeout(() => { delays.delete(cancel); resolve() }, seconds * 1000)
      delays.set(cancel, reject)
    })
  }
  const pack = (player: Player) => [
    `金币：${player.wallet}　今日钓鱼：${player.casts}/${config.dailyLimit}`,
    `今日鱼竿交易：${player.rodTrades}/10　物品购买：${player.purchases}/30　半价福利：${player.coupons}`,
    `当前装备：${player.equipment ? equipmentLabel(player.equipment) : '无'}`,
    rodCount(player) > 10 ? '修复大师：已激活' : '',
    player.bag.filter(s => s.name.includes('鱼')).reduce((n, s) => n + s.count, 0) > 100 || player.equipment?.name === '美西螈' ? '钓鱼佬：已激活' : '',
    '背包（耐久 / 维修次数 / 诱钓 / 眷顾）：',
    ...player.bag.map(stackLabel),
    player.bag.length ? '' : '背包为空。',
  ].filter(Boolean).join('\n')

  ctx.command('mcfish', 'MC 钓鱼模拟器').action(() => rules(config))
  ctx.command('mcfish.rules', '查看钓鱼规则').alias('查看钓鱼规则').action(() => rules(config))
  ctx.command('mcfish.source', '查看开源代码').alias('钓鱼源码').action(() => `${SOURCE_URL}\nAGPL-3.0-only，无担保；感谢 fangliuyu 与 FloatTech/ZeroBot-Plugin 贡献者。`)
  ctx.command('mcfish.pack', '查看钓鱼背包').alias('钓鱼背包')
    .action(({ session }) => guard(session, async id => renderCard(ctx, '钓鱼背包', await repository.run(id, pack), config.images), false))
  ctx.command('mcfish.wallet', '查看金币余额').alias('钓鱼钱包')
    .action(({ session }) => guard(session, id => repository.run(id, p => `你的钓鱼钱包：${p.wallet} 金币。`), false))
  ctx.command('mcfish.shop', '查看商店和每日行情').alias('钓鱼商店', '钓鱼看板')
    .action(({ session }) => guard(session, async id => {
      const text = await repository.run(id, (_, market) => `钓鱼商店 · ${market.day}\n今日行情：\n${ITEMS.filter(i => i.name !== '宝藏诅咒').map(i => `${i.name}：均价 ${i.price}，今日 ${market.discounts[i.name]}%`).join('\n')}\n\n上架物品：\n${market.stock.map(s => `${stackLabel(s)}　库存 ${s.count}　单价 ${priceOf(market, s)}`).join('\n')}\n出售收取 20% 税，实际交易价还受诅咒、优惠和唱片影响。`)
      return renderCard(ctx, '钓鱼商店', text, config.images)
    }))
  ctx.command('mcfish.fish [次数:string]', '进行钓鱼').alias('钓鱼')
    .shortcut(/^进行(?:(\d+)次)?钓鱼$/, { args: ['$1'] })
    .action(({ session }, amount) => guard(session, async (id, session) => {
      const requested = positive(amount, 1, config.dailyLimit)
      const state = await repository.run(id, p => p)
      if (state.casts >= config.dailyLimit) throw new GameError('今日钓鱼次数已用完，明天再来吧。')
      if (rodCount(state) > 30) throw new GameError('背包鱼竿超过 30 支，不能钓鱼。')
      if (!state.equipment) {
        if (state.starterPurchases >= 3) throw new GameError('新手购竿机会已用完，请从背包装备钓具或到商店购买。')
        await confirm(session, '你尚未装备钓具，是否花费 100 金币购买并装备新手木竿？')
        await repository.run(id, p => startRod(p))
      }
      const lure = await repository.run(id, p => p.equipment?.lure || 0)
      const max = Math.floor(config.maxWaitSeconds / (lure + 1))
      if (max) { await session.send(`开始钓鱼，预计最多等待 ${max} 秒。`); await delay(dice(max) + 1) }
      if (disposed) throw new GameError('插件已停用。')
      const result = await repository.run(id, p => fish(p, requested, config))
      const text = `进行了 ${result.casts} 次钓鱼：\n${Object.entries(result.drops).map(([name, n]) => `${name}×${n}`).join('\n')}\n${result.notes.join('\n')}`.trim()
      return renderCard(ctx, '钓鱼收获', text, config.images)
    }))
  ctx.command('mcfish.equip <物品:string>', '装备钓具')
    .shortcut(new RegExp(`^装备(${EQUIPPABLE.join('|')})$`), { args: ['$1'] })
    .action(({ session }, item) => guard(session, async (id, session) => {
      if (!EQUIPPABLE.includes(item)) throw new GameError('请选择鱼竿、三叉戟或美西螈。')
      const candidates = await repository.run(id, p => p.bag.filter(s => s.name === item))
      const selected = await choose(session, candidates)
      return repository.run(id, p => equip(p, selected.id))
    }))
  ctx.command('mcfish.repair', '维修当前钓具').alias('修复鱼竿', '维修鱼竿')
    .action(({ session }) => guard(session, async (id, session) => {
      const candidates = await repository.run(id, p => {
        if (!p.equipment || p.equipment.name === '美西螈') throw new GameError('只能维修装备中的鱼竿或三叉戟。')
        if (p.equipment.repairs >= 10) throw new GameError('钓具已达到 10 次维修上限。')
        return p.bag.filter(s => s.name === p.equipment!.name)
      })
      const selected = await choose(session, candidates)
      return repository.run(id, p => repair(p, selected.id))
    }))
  ctx.command('mcfish.enchant <附魔:string>', '附魔当前钓具')
    .shortcut(/^附魔(诱钓|海之眷顾)$/, { args: ['$1'] })
    .action(({ session }, book) => guard(session, id => repository.run(id, p => enchant(p, book))))
  ctx.command('mcfish.craft <物品:string>', '三合一合成钓具')
    .shortcut(/^合成(.+竿|三叉戟)$/, { args: ['$1'] })
    .action(({ session }, item) => guard(session, async (id, session) => {
      const material = craftingMaterial(item)
      const candidates = await repository.run(id, p => p.bag.filter(s => s.name === material && s.equipment))
      if (candidates.length < 3) throw new GameError(`材料不足：需要 3 支${material}。`)
      let selected = candidates.slice(0, 3)
      if (candidates.length > 3) {
        const response = await answer(session, `${candidates.map((s, i) => `[${i}] ${stackLabel(s)}`).join('\n')}\n输入三个不同序号（空格分隔），回复“梭哈”合成全部，或“取消”。成功率 90%，失败消耗材料。`)
        if (response === '梭哈') selected = candidates.slice(0, Math.floor(candidates.length / 3) * 3)
        else {
          if (!/^\d+\s+\d+\s+\d+$/.test(response)) throw new GameError('请输入三个有效序号。')
          const indexes = response.split(/\s+/).map(Number)
          if (new Set(indexes).size !== 3 || indexes.some(i => !candidates[i])) throw new GameError('序号重复或超出范围。')
          selected = indexes.map(i => candidates[i])
        }
      }
      return repository.run(id, p => craft(p, item, selected.map(s => s.id)))
    }))
  ctx.command('mcfish.purify [数量:string]', '消除宝藏诅咒')
    .shortcut(/^消除(?:绑定|宝藏)诅咒\s*(\d*)$/, { args: ['$1'] })
    .action(({ session }, amount) => guard(session, id => repository.run(id, p => purify(p, positive(amount)))))
  ctx.command('mcfish.probability', '查看实际掉落概率').alias('当前装备概率明细')
    .action(({ session }) => guard(session, id => repository.run(id, p => {
      const weights = zoneWeights(p)
      const labels = { treasure: '宝藏', pole: '钓具', fish: '鱼', waste: '垃圾', air: '空竿' }
      const lines = Object.entries(weights).map(([key, weight]) => `${labels[key as keyof typeof labels]}：${weight}%`)
      lines.push('\n物品实际掉落概率（每次掉落）：')
      for (const item of ITEMS) lines.push(`${item.name}：${(weights[item.category] * item.weight / 100).toFixed(2)}%`)
      lines.push('三叉戟每次抽取 3 次；三叉戟自身无法钓出。美西螈按规则增加数量。')
      return lines.join('\n')
    }), false))

  for (const mode of ['buy', 'sell'] as const) {
    const verb = mode === 'buy' ? '购买' : '出售'
    const names = ITEMS.filter(i => i.name !== '宝藏诅咒').map(i => i.name).concat(mode === 'buy' ? ['初始木竿'] : [])
    ctx.command(`mcfish.${mode} <物品:string> [数量:string]`, `${verb}商店物品`)
      .option('record', '-r 使用唱片使出售价格翻倍')
      .shortcut(new RegExp(`^${verb}(${names.join('|')})\\s*(\\d*)$`), { args: ['$1', '$2'] })
      .action(({ session, options }, item, amount) => guard(session, async (id, session) => {
        if (!names.includes(item)) throw new GameError('没有这种可交易物品。')
        const requested = positive(amount)
        const candidates = await repository.run(id, (p, market) => (mode === 'buy' ? market.stock : p.bag).filter(s => s.name === item))
        const selected = await choose(session, candidates)
        let record = !!options?.record
        if (mode === 'buy' && record) throw new GameError('唱片只用于出售。')
        if (mode === 'sell' && !record) {
          const available = await repository.run(id, p => count(p, '唱片') - (item === '唱片' ? Math.min(requested, selected.count) : 0))
          if (available > 0) {
            const response = await answer(session, '是否消耗一张额外唱片，让本次出售金额翻倍？回答“是”或“否”（“取消”终止交易）。', true)
            if (!['是', '否'].includes(response)) throw new GameError('回答无效，操作已取消。')
            record = response === '是'
          }
        }
        const expected = await repository.run(id, (p, market) => quote(p, market, mode, selected.id, requested, record))
        await confirm(session, `${verb}${expected.name}×${expected.count}：${expected.total < 0 ? '需要倒贴' : mode === 'buy' ? '支付' : '获得'} ${Math.abs(expected.total)} 金币（已计算税、诅咒、优惠${record ? '与唱片' : ''}）。`)
        return repository.run(id, (p, market) => transact(p, market, expected))
      }))
  }
  ctx.command('mcfish.sell-waste', '出售背包中所有垃圾').alias('出售所有垃圾')
    .action(({ session }) => guard(session, async (id, session) => {
      const expected = await repository.run(id, (p, market) => quote(p, market, 'waste', ''))
      await confirm(session, `出售全部垃圾×${expected.count}：${expected.total < 0 ? '需要倒贴' : '获得'} ${Math.abs(expected.total)} 金币（已计算税与诅咒）。`)
      return repository.run(id, (p, market) => transact(p, market, expected))
    }))
}
