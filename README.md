# koishi-plugin-mcfish

Minecraft 风格的 Koishi 钓鱼小游戏。使用 ZeroBot mcfish 的鱼竿分级、随机等待与附魔升级机制，并按本项目规则调整；采用 AstrBot 版的模块划分、图标和背景。支持仓库、每日收购市场、铁匠铺及消息撤回。

## 安装

需要 **Koishi 4.18+、Node.js 22+** 和数据库插件（推荐 SQLite）；启用 `puppeteer` 可显示图片界面，否则输出文字。

从 [Releases](https://github.com/Huanghun542/koishi-plugin-mcfish/releases) 下载 `.tgz`，在 Koishi 项目目录执行：

```bash
npm install /path/to/koishi-plugin-mcfish-2.0.0.tgz
```

也可克隆本仓库，执行 `npm ci && npm run build && npm pack`。安装后在 Koishi 控制台启用 `mcfish`。

## 指令与规则

| 指令 | 功能 |
| --- | --- |
| `开始5次钓鱼` / `钓鱼` | 批量钓鱼 / 钓一次 |
| `仓库` / `市场` / `铁匠铺` / `钓鱼钱包` | 查看仓库、当日收购价、固定商品和余额 |
| `购买 木钓鱼竿 2` / `出售 生鳕鱼 3` | 购买或出售指定数量；省略数量默认为 1 |
| `一键出售` | 出售全部非鱼竿物品，包含附魔书 |
| `装备 1` / `卸下鱼竿` | 按仓库序号更换装备 |
| `附魔 1 耐久附魔书` / `附魔 1 海之眷顾附魔书` | 对指定鱼竿附魔，也接受“耐久”“海之眷顾”简称 |
| `维修 1` | 花费 200 绿宝石修满耐久 |
| `钓鱼帮助` / `钓鱼源码` | 查看规则或开源地址 |

新用户获得 **100 绿宝石和已装备的木钓鱼竿**。默认每日 50 次，按当天剩余次数与鱼竿耐久截断；一批随机等待 1–40 秒，保持 ZeroBot 的随机等待方式。耗尽耐久的鱼竿保留，可维修。

仓库每页 15 行，鱼竿优先、一行一个，物品一行两个；最多两页，超出的鱼竿和物品按当日收购价自动出售。序号从 **1** 开始。图标取 `assets/items/物品名称.png`，缺失时使用屏障图标。

市场按 `Asia/Shanghai` 零点刷新，每日随机高价收购 5–15 种物品，涨幅 10%–200%；其他物品按基础价格收购。铁匠铺固定出售五种无附魔鱼竿及两种附魔书，不支持玩家之间交易。

附魔每次成功率 **50%**，默认消耗 500 绿宝石和一本对应书，失败不返还，最高三级；耐久附魔额外增加 **30/70/120** 耐久，海之眷顾的双倍产出概率为 **1%/3%/5%**。

配置支持四列表格（名称、价格、权重、是否稀有）、普通/稀有名称调色盘、每日次数、等待、市场、附魔和撤回选项。撤回默认关闭；勾选的文字消息在整个流程结束 **5 秒后** 撤回，需要适配器支持。调试可将等待设为 0。

钓鱼记录与待结算收获保存在数据库中；等待时重启可在下次使用指令时恢复。v1 Koishi 存档会迁移，不直接读取 Go 或 AstrBot 数据库。开发验证：`npm test`。

## 致谢

感谢原作者 **[fangliuyu](https://github.com/fangliuyu)** 及 FloatTech/ZeroBot-Plugin 贡献者。原仓库：[FloatTech/ZeroBot-Plugin](https://github.com/FloatTech/ZeroBot-Plugin)，原插件：[plugin/mcfish](https://github.com/FloatTech/ZeroBot-Plugin/tree/master/plugin/mcfish)。界面素材与布局来自 Huanghun542 提供的 `astrbot_plugin_mcfishing`。

沿用 **AGPL-3.0-only**；完整许可见 [LICENSE](LICENSE)，来源说明见 [NOTICE](NOTICE)。
