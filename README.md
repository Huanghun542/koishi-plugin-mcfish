# koishi-plugin-mcfish

Minecraft 风格的 Koishi 钓鱼模拟器，移植自 ZeroBot 的 mcfish。支持钓鱼、背包、每日商店行情、交易、装备、维修、附魔、合成、诅咒净化，以及三叉戟、美西螈、海豚等特殊玩法。

## 使用

需要 **Koishi 4.18+、Node.js 22+** 和数据库插件（推荐 SQLite）。金币使用本插件独立钱包，新玩家默认获得 200 金币。有 `puppeteer` 服务时显示图片背包与商店，否则自动使用文字。

从本仓库安装：

```bash
git clone https://github.com/Huanghun542/koishi-plugin-mcfish.git
cd koishi-plugin-mcfish
npm ci
npm run build
npm pack
```

在 Koishi 项目中安装生成的 `.tgz`，然后启用 `mcfish`：

```bash
npm install /path/to/koishi-plugin-mcfish-1.0.0.tgz
```

| 指令 | 功能 |
| --- | --- |
| `进行钓鱼` / `进行5次钓鱼` | 钓鱼；没有装备时可确认购买新手木竿 |
| `钓鱼背包` / `钓鱼钱包` | 查看物品、装备与金币 |
| `钓鱼商店` / `钓鱼看板` | 查看行情和库存 |
| `购买初始木竿` / `购买鳕鱼 3` / `出售鳕鱼 3` | 交易前选择并确认实际价格 |
| `出售所有垃圾` | 一次出售全部垃圾 |
| `装备木竿` / `装备三叉戟` / `装备美西螈` | 更换钓具 |
| `修复鱼竿` / `附魔诱钓` / `附魔海之眷顾` | 维修与附魔 |
| `合成铁竿` | 三合一合成；材料多时支持“梭哈” |
| `消除宝藏诅咒 2` | 消耗净化书解除诅咒 |
| `当前装备概率明细` / `查看钓鱼规则` | 查看概率和完整玩法 |

也可使用 `mcfish.fish 5`、`mcfish.buy 鳕鱼 3` 等指令；`mcfish.sell 鳕鱼 3 -r` 使用一张唱片翻倍。交互序号从 **0** 开始，回复“取消”终止。

默认每日 50 次钓鱼，按 `Asia/Shanghai` 零点刷新；最长等待 120 秒，诱钓可缩短。可在插件配置中修改初始金币、每日次数、时区、等待时间、确认超时、冷却和图片输出。`maxWaitSeconds: 0` 可立即结算。

保留原版玩法并修正跨月刷新、物品编号冲突和交易并发问题；概率按原物品数据的分类权重计算（初始上钩 60%）。这是新存档，**不会自动导入 Go 版数据库**。开发验证：`npm test`。

## 致谢与许可

感谢原作者 **[fangliuyu](https://github.com/fangliuyu)** 和 FloatTech/ZeroBot-Plugin 的贡献者。原插件：[FloatTech/ZeroBot-Plugin · mcfish](https://github.com/FloatTech/ZeroBot-Plugin/tree/master/plugin/mcfish)，物品数据来自 [FloatTech/zbpdata](https://github.com/FloatTech/zbpdata/blob/main/McFish/articlesInfo.json)。

移植版沿用 **AGPL-3.0-only**，保留来源说明；完整许可见 [LICENSE](LICENSE)，版权与修改说明见 [NOTICE](NOTICE)。
