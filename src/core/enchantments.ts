// SPDX-License-Identifier: AGPL-3.0-only
import { DOUBLE_PERCENT, DURABILITY_BONUS, EnchantmentKind, LURE_BONUS } from '../catalog'
import type { Config } from '../config'
export function enchantRate(kind: EnchantmentKind, config: Config): number {
  return kind === 'unbreaking' ? config.enchantSuccessRate : kind === 'luck' ? config.luckSuccessRate : config.lureSuccessRate
}
export function enchantCap(kind: EnchantmentKind, config: Config): number { return config[`${kind}MaxLevel`] }
export function enchantBonus(kind: EnchantmentKind, level: number, config?: Config): number {
  if (level <= 0) return 0
  const fallback = kind === 'unbreaking' ? DURABILITY_BONUS : kind === 'luck' ? DOUBLE_PERCENT : LURE_BONUS
  return config?.[`${kind}Bonuses`]?.[`level${Math.min(10, level)}`] ?? fallback[Math.min(10, level)]
}
