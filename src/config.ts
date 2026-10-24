// SPDX-License-Identifier: AGPL-3.0-only
import { Schema } from 'koishi'
import { DEFAULT_LOOT, isEnchantBook, LootItem, RODS } from './catalog'
export type RecallTarget = 'result' | 'equipment' | 'damage' | 'waiting' | 'trade' | 'notice'
export type EnchantBonuses = Record<`level${number}`, number>
export interface Config {
  lootTable: LootItem[]; normalColor: string; rareColor: string
  dailyLimit: number; minWaitSeconds: number; maxWaitSeconds: number; timezone: string
  marketMinIncrease: number; marketMaxIncrease: number; marketMinItems: number; marketMaxItems: number
  consumeEnchantBook: boolean; enchantSuccessRate: number; luckSuccessRate: number; lureSuccessRate: number
  enchantCost: number; repairCost: number; saleMultiplier: number
  unbreakingMaxLevel: number; luckMaxLevel: number; lureMaxLevel: number
  unbreakingBonuses: EnchantBonuses; luckBonuses: EnchantBonuses; lureBonuses: EnchantBonuses; saleConfirmSeconds: number
  enchantFailureDowngrade: boolean; quoteMessages: boolean; forwardFishingResults: boolean
  recallTargets: RecallTarget[]; recallDelaySeconds: number; images: boolean
}
function bonusSchema(label: string, step: number, maximum: number, decimals = false) {
  return Schema.object(Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const level = index + 1
    return [`level${level}`, Schema.number().min(0).max(maximum).step(decimals ? 0.01 : 1).default(level * step)
      .description(`${level}级${label}：总加成${decimals ? '（%）' : ''}`)]
  }))).description(`${label}各级总加成（不累加前一级；生效等级内递增或相等）`)
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    lootTable: Schema.array(Schema.object({
      name: Schema.string().required().description('物品名称'),
      price: Schema.number().min(0).max(1000000000).required().description('物品价格（小数自动四舍五入为整数后使用）'),
      weight: Schema.number().min(0).max(1000000).step(1).required().description('抽取权重'),
      rare: Schema.boolean().default(false).description('是否稀有'),
    })).role('table').default(DEFAULT_LOOT).description('钓鱼物品列表：价格为 1 倍出售倍率下的基础收购价；权重 0 不参与抽取。'),
    normalColor: Schema.string().role('color').default('#ffffff').description('普通物品名称颜色'),
    rareColor: Schema.string().role('color').default('#ffd700').description('稀有物品名称颜色'),
  }).description('物品与颜色'),
  Schema.object({
    dailyLimit: Schema.number().min(1).max(10000).step(1).default(50).description('用户每日钓鱼次数上限'),
    minWaitSeconds: Schema.number().min(0).max(3600).step(1).default(20).description('最短钓鱼等待时间（s），不得大于最长等待时间。'),
    maxWaitSeconds: Schema.number().min(0).max(3600).step(1).default(40).description('最长钓鱼等待时间（s）；一批在最短与最长时间之间随机等待，提示显示此最大值。两者均为 0 时立即结算。'),
    timezone: Schema.string().default('Asia/Shanghai').description('每日次数与行情的零点刷新时区'),
  }).description('钓鱼规则'),
  Schema.object({
    saleMultiplier: Schema.number().min(0).max(10).step(0.1).default(1).description('基础出售倍率；1 倍直接使用表格价格。附魔书回收价不超过购买价的一半。'),
    marketMinIncrease: Schema.number().min(-50).max(10000).step(1).default(-50).description('最低收购涨跌幅（%）；负数表示降价，最低 -50%。'),
    marketMaxIncrease: Schema.number().min(-50).max(10000).step(1).default(200).description('最高收购涨跌幅（%）'),
    marketMinItems: Schema.number().min(1).max(1000).step(1).default(5).description('每日最少行情变化物品种类（附魔书不参与涨跌）'),
    marketMaxItems: Schema.number().min(1).max(1000).step(1).default(15).description('每日最多行情变化物品种类'),
    saleConfirmSeconds: Schema.number().min(1).max(300).step(1).default(30).description('钻石及以上鱼竿出售的二次确认时限（s）；在同一会话输入“确认”后出售。'),
  }).description('市场'),
  Schema.object({
    consumeEnchantBook: Schema.boolean().default(true).description('附魔时消耗一本对应附魔书'),
    enchantSuccessRate: Schema.number().role('slider').min(0).max(100).step(1).default(50).description('耐久附魔成功概率（%）；100 为必定成功。'),
    luckSuccessRate: Schema.number().role('slider').min(0).max(100).step(1).default(50).description('海之眷顾附魔成功概率（%）；100 为必定成功。'),
    lureSuccessRate: Schema.number().role('slider').min(0).max(100).step(1).default(50).description('饵钓附魔成功概率（%）；100 为必定成功。'),
    enchantCost: Schema.number().min(0).max(1000000000).step(1).default(300).description('每次附魔消耗绿宝石'),
    repairCost: Schema.number().min(0).max(1000000000).step(1).default(150).description('修满一次鱼竿耐久消耗绿宝石'),
    unbreakingMaxLevel: Schema.number().min(1).max(10).step(1).default(3).description('耐久附魔等级上限（最高 10 级）'),
    luckMaxLevel: Schema.number().min(1).max(10).step(1).default(3).description('海之眷顾附魔等级上限（最高 10 级）'),
    lureMaxLevel: Schema.number().min(1).max(10).step(1).default(3).description('饵钓附魔等级上限（最高 10 级，绑定用户）'),
    unbreakingBonuses: bonusSchema('耐久增加值', 20, 1000000),
    luckBonuses: bonusSchema('海之眷顾双倍概率', 3, 10000, true),
    lureBonuses: bonusSchema('饵钓额外每日次数', 5, 10000),
  }).description('附魔与维修'),
  Schema.object({
    quoteMessages: Schema.boolean().default(true).description('发送消息时引用触发指令；与合并转发同时开启时，钓鱼结果只使用合并转发。'),
    forwardFishingResults: Schema.boolean().default(true).description('将钓鱼结果合并转发，分为基础产物与双倍额外产物两个节点（需适配器支持）。关闭后分两条消息发送。'),
    recallTargets: Schema.array(Schema.union([
      Schema.const('result').description('钓鱼结果'),
      Schema.const('equipment').description('未装备鱼竿'),
      Schema.const('damage').description('鱼竿耐久不足或损坏'),
      Schema.const('waiting').description('钓鱼等待提示'),
      Schema.const('trade').description('购买、出售、维修与附魔结果'),
      Schema.const('notice').description('其他文字提示'),
    ])).role('checkbox').default([]).description('勾选后在流程结束时撤回对应文字消息（需适配器支持）'),
    recallDelaySeconds: Schema.number().min(0).max(3600).step(1).default(5).description('流程结束后延迟撤回秒数'),
    images: Schema.boolean().default(true).description('使用素材绘制仓库、市场、铁匠铺和排行榜'),
  }).description('消息与界面'),
  Schema.object({
    enchantFailureDowngrade: Schema.boolean().default(false).description('附魔失败掉级：开启后失败的对应附魔降低一级，最低 0 级，消耗不返还。'),
  }).description('实验玩法'),
])
export function validateConfig(config: Config) {
  for (const [label, bonuses, maximum, scale, cap, rate] of [
    ['耐久', config.unbreakingBonuses, 1000000, 1, config.unbreakingMaxLevel, config.enchantSuccessRate],
    ['海之眷顾', config.luckBonuses, 10000, 100, config.luckMaxLevel, config.luckSuccessRate],
    ['饵钓', config.lureBonuses, 10000, 1, config.lureMaxLevel, config.lureSuccessRate],
  ] as const) {
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 10) throw new Error(`mcfish：${label}等级上限必须为 1 至 10 的整数。`)
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100) throw new Error(`mcfish：${label}附魔成功概率必须为 0 至 100 的整数。`)
    const values = Array.from({ length: 10 }, (_, i) => bonuses?.[`level${i + 1}`])
    if (values.some(value => !Number.isFinite(value) || value < 0 || value > maximum || Math.abs(value * scale - Math.round(value * scale)) > 0.000001)) throw new Error(`mcfish：${label}总加成数值无效。`)
    if (values.slice(1, cap).some((value, i) => value < values[i])) throw new Error(`mcfish：${label}总加成须按一级至上限递增或相等。`)
  }
  if (!Number.isSafeInteger(config.saleConfirmSeconds) || config.saleConfirmSeconds < 1 || config.saleConfirmSeconds > 300) throw new Error('mcfish：出售确认时限必须为 1 至 300 秒的整数。')
  if (![config.minWaitSeconds, config.maxWaitSeconds].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 3600)) throw new Error('mcfish：钓鱼等待时间必须为 0 至 3600 秒的整数。')
  if (config.minWaitSeconds > config.maxWaitSeconds) throw new Error('mcfish：最短钓鱼等待时间不得大于最长等待时间。')
  if (!Number.isSafeInteger(config.repairCost) || config.repairCost < 0) throw new Error('mcfish：维修费用必须为非负整数。')
  if (!Number.isFinite(config.saleMultiplier) || config.saleMultiplier < 0 || config.saleMultiplier > 10) throw new Error('mcfish：基础出售倍率必须在 0 至 10 之间。')
  if (config.marketMinIncrease < -50 || config.marketMaxIncrease < -50) throw new Error('mcfish：行情跌幅不能超过 50%。')
  if (!config.lootTable.length || !config.lootTable.some(item => item.weight > 0)) throw new Error('mcfish：至少需要一个抽取权重大于 0 的物品。')
  const names = config.lootTable.map(item => item.name)
  if (names.some(name => !name.trim() || name !== name.trim() || name.length > 80 || /[\r\n]/.test(name))) throw new Error('mcfish：物品名称不得为空、超过 80 字或包含换行、首尾空格。')
  if (new Set(names).size !== names.length) throw new Error('mcfish：物品名称不能重复。')
  if (names.some(name => Object.hasOwn(Object.prototype, name) || name === 'prototype')) throw new Error('mcfish：该物品名称为保留名称。')
  if (config.lootTable.some(item => !Number.isSafeInteger(item.weight))) throw new Error('mcfish：抽取权重必须为整数。')
  if (config.lootTable.some(item => !Number.isFinite(item.price) || item.price < 0 || item.price > 1000000000)) throw new Error('mcfish：物品价格必须在 0 至 1000000000 之间。')
  if (names.some(name => RODS.some(rod => rod.name === name))) throw new Error('mcfish：鱼竿由铁匠铺固定供应，不得与钓鱼物品重名。')
  if (config.marketMinIncrease > config.marketMaxIncrease || config.marketMinItems > config.marketMaxItems) throw new Error('mcfish：市场最低值不得超过最高值。')
  if (names.filter(name => !isEnchantBook(name)).length < config.marketMinItems) throw new Error('mcfish：非附魔书物品种类不能少于市场最少收购种类。')
  try { new Intl.DateTimeFormat('en', { timeZone: config.timezone }).format() }
  catch { throw new Error(`mcfish：无效时区 ${config.timezone}`) }
  const color = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i
  if (!color.test(config.normalColor) || !color.test(config.rareColor)) throw new Error('mcfish：名称颜色格式无效。')
}
