// SPDX-License-Identifier: AGPL-3.0-only
import type { Config } from '../config'
import { EnchantmentKind, SOURCE_URL } from '../catalog'
import { enchantBonus, enchantCap, enchantRate } from './enchantments'
export interface HelpCommand { command: string; description: string }
export function helpCommands(config: Config): HelpCommand[] {
  return [
    { command: '开始N次钓鱼 / 钓鱼', description: `每日基础 ${config.dailyLimit} 次，饵钓增加次数` },
    { command: '仓库 / 钓鱼钱包', description: '查看鱼竿、渔获或绿宝石余额' },
    { command: '市场 / 铁匠铺', description: '查看当日收购价或固定商品' },
    { command: '福布斯排行榜', description: '当前平台余额前十名，QQ 号脱敏' },
    { command: '购买 XX N', description: '购买鱼竿或附魔书，购竿自动装备' },
    { command: '出售 XX N', description: '出售 N 件指定物品' },
    { command: '出售 钓鱼竿 N', description: '出售序号 N 的鱼竿，回收价为 0' },
    { command: '确认 / 取消出售', description: `钻石及以上鱼竿需在 ${config.saleConfirmSeconds}s 内确认` },
    { command: '一键出售', description: '保留鱼竿、附魔书和稀有物品' },
    { command: '装备 N / 卸下鱼竿', description: '按仓库序号装备，或卸下鱼竿' },
    { command: '维修 N', description: `${config.repairCost} 绿宝石，补满指定鱼竿耐久` },
    { command: '附魔 N 附魔书名称', description: `${config.enchantCost} 绿宝石${config.consumeEnchantBook ? ' + 一本对应附魔书' : '，不消耗附魔书'}` },
    { command: '钓鱼帮助 / mcfish', description: '查看指令与玩法（钓鱼规则同效）' },
    { command: '钓鱼源码', description: '查看开源仓库与原作者致谢' },
  ]
}
export function gameplayNotes(config: Config): string[] {
  const wait = config.maxWaitSeconds === 0 ? '立即结算' : `一批随机等待 ${config.minWaitSeconds}–${config.maxWaitSeconds} 秒`
  const perLevel = (kind: EnchantmentKind, unit: string) => {
    const cap = enchantCap(kind, config)
    const increases = Array.from({ length: cap }, (_, i) =>
      (Math.round(enchantBonus(kind, i + 1, config) * 100) - Math.round(enchantBonus(kind, i, config) * 100)) / 100)
    const uniform = increases.every(value => value === increases[0])
    return `每级加成 ${uniform ? increases[0] : increases.join('/')}${unit.startsWith('%') ? '' : ' '}${unit}${uniform ? '' : '（依级排列）'}`
  }
  return [
    `新用户获得木钓鱼竿和 100 绿宝石；${wait}。`,
    `每日基础 ${config.dailyLimit} 次，加上饵钓额外次数；次数或耐久不足时按剩余量钓鱼。${config.timezone} 零点刷新。`,
    `市场每日 ${config.marketMinItems}–${config.marketMaxItems} 种物品涨跌 ${config.marketMinIncrease}% 至 ${config.marketMaxIncrease}%；出售倍率 ${config.saleMultiplier} 倍。附魔书不参与涨跌。`,
    '仓库最多两页，溢出自动出售；买竿自动装备，耗尽耐久或卖竿后自动换用其他鱼竿。',
    `耐久：成功率 ${enchantRate('unbreaking', config)}%，上限 ${config.unbreakingMaxLevel} 级；${perLevel('unbreaking', '耐久')}。`,
    `海之眷顾：成功率 ${enchantRate('luck', config)}%，上限 ${config.luckMaxLevel} 级；${perLevel('luck', '% 双倍概率')}，实际最高 100%。`,
    `饵钓：成功率 ${enchantRate('lure', config)}%，上限 ${config.lureMaxLevel} 级；${perLevel('lure', '次额外每日钓鱼')}，效果绑定用户。`,
    `附魔失败消耗不返还${config.enchantFailureDowngrade ? '，对应附魔降低一级（最低 0 级）' : '，等级保持不变'}。`,
  ]
}
export function rules(config: Config): string {
  return ['MC 钓鱼模拟器', 'XX 为物品名；N 为数量，鱼竿操作中的 N 为仓库序号。',
    ...helpCommands(config).map(item => `${item.command}：${item.description}`),
    '附魔书：耐久附魔书、海之眷顾附魔书、饵钓附魔书（可用简称）。',
    '', ...gameplayNotes(config), `开源地址：${SOURCE_URL}`].join('\n')
}
export function marketChange(increase: number): string {
  return increase < 0 ? `跌幅 ${increase}%` : increase > 0 ? `涨幅 +${increase}%` : '价格持平 0%'
}
