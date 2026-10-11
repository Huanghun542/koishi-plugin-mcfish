// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Config } = require('../lib/config')
const g = require('../lib/game')
const render = require('../lib/render')
test('custom names and display names are escaped; missing or traversing item paths use the barrier', () => {
  const config = Config({}), p = g.createPlayer('render'), m = { day: '', increases: {} }
  p.inventory['<script>alert(1)</script>'] = 1
  const html = render.warehouseHtml(p, m, config, '<img src=x>')[0]
  assert(!html.includes('<script>')); assert(html.includes('&lt;img src=x&gt;'))
  assert.equal(render.itemIcon('../fonts/font.ttf'), render.itemIcon('不存在'))
  assert.match(render.itemIcon('不存在'), /^data:image\/png;base64,/)
})
test('configured rarity and color override defaults and final odd item preserves a half-row slot', () => {
  const config = Config({ normalColor: '#abcdef', rareColor: '#123456' })
  config.lootTable.find(i => i.name === '耐久附魔书').rare = false
  const p = g.createPlayer('render'), m = { day: '', increases: {} }
  p.inventory['耐久附魔书'] = 1; p.inventory['海之眷顾附魔书'] = 1; p.inventory['生鳕鱼'] = 1
  const html = render.warehouseHtml(p, m, config, '玩家')[0]
  assert(html.includes('color:#abcdef">耐久附魔书'))
  assert(html.includes('color:#123456">海之眷顾附魔书'))
  assert(html.includes('<div class="spacer"></div>'))
})
