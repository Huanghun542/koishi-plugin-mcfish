// SPDX-License-Identifier: AGPL-3.0-only
import { Schema } from 'koishi'
import { DEFAULT_LOOT, isEnchantBook, LootItem, RODS } from './catalog'
export type RecallTarget = 'result' | 'equipment' | 'damage' | 'waiting' | 'trade' | 'notice'
export interface Config {
  lootTable: LootItem[]; normalColor: string; rareColor: string
  dailyLimit: number; maxWaitSeconds: number; timezone: string
  marketMinIncrease: number; marketMaxIncrease: number; marketMinItems: number; marketMaxItems: number
  consumeEnchantBook: boolean; enchantCost: number; repairCost: number; saleMultiplier: number
  recallTargets: RecallTarget[]; recallDelaySeconds: number; images: boolean
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
    maxWaitSeconds: Schema.number().min(0).max(3600).step(1).default(40).description('最长钓鱼等待时间（秒）；一批随机等待 1 至该值，0 表示立即结算。'),
    timezone: Schema.string().default('Asia/Shanghai').description('每日次数与行情的零点刷新时区'),
  }).description('钓鱼规则'),
  Schema.object({
    saleMultiplier: Schema.number().min(0).max(10).step(0.1).default(1).description('基础出售倍率；1 倍直接使用表格价格。附魔书回收价不超过购买价的一半。'),
    marketMinIncrease: Schema.number().min(-50).max(10000).step(1).default(-50).description('最低收购涨跌幅（%）；负数表示降价，最低 -50%。'),
    marketMaxIncrease: Schema.number().min(-50).max(10000).step(1).default(200).description('最高收购涨跌幅（%）'),
    marketMinItems: Schema.number().min(1).max(1000).step(1).default(5).description('每日最少行情变化物品种类（附魔书不参与涨跌）'),
    marketMaxItems: Schema.number().min(1).max(1000).step(1).default(15).description('每日最多行情变化物品种类'),
  }).description('市场'),
  Schema.object({
    consumeEnchantBook: Schema.boolean().default(true).description('附魔时消耗一本对应附魔书'),
    enchantCost: Schema.number().min(0).max(1000000000).step(1).default(500).description('每次附魔消耗绿宝石'),
    repairCost: Schema.number().min(0).max(1000000000).step(1).default(200).description('修满一次鱼竿耐久消耗绿宝石'),
  }).description('附魔与维修'),
  Schema.object({
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
])
export function validateConfig(config: Config) {
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
