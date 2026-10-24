<div align="center">

# MCFISH · MC 钓鱼

**在聊天中抛竿、收集渔获，经营属于你的仓库。**

![Koishi](https://img.shields.io/badge/Koishi-4.18%2B-4e8fb8?style=flat-square) ![Node.js](https://img.shields.io/badge/Node.js-22%2B-4c956c?style=flat-square) [![npm](https://img.shields.io/npm/v/koishi-plugin-mcfish?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-mcfish) ![License](https://img.shields.io/badge/License-AGPL--3.0-728294?style=flat-square)

[快速开始](#快速开始) · [常用指令](#常用指令) · [玩法说明](#玩法说明) · [下载插件](https://github.com/Huanghun542/koishi-plugin-mcfish/releases) · [反馈问题](https://github.com/Huanghun542/koishi-plugin-mcfish/issues)

</div>

## 界面预览

<table>
  <tr>
    <th align="center">仓库</th>
    <th align="center">每日市场</th>
    <th align="center">铁匠铺</th>
  </tr>
  <tr>
    <td align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/warehouse.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/warehouse.png" width="250" alt="仓库：鱼竿优先展示，物品每行两件"></a></td>
    <td align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/market.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/market.png" width="250" alt="每日市场：展示收购物品、价格和涨跌幅"></a></td>
    <td align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/blacksmith.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/blacksmith.png" width="250" alt="铁匠铺：五种鱼竿和三种附魔书"></a></td>
  </tr>
</table>

<p align="center"><sub>实际界面渲染示例，预览中的物品与余额为示例数据；点击图片可查看大图。</sub></p>

<details>
  <summary>福布斯排行榜预览</summary>
  <p align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/leaderboard.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/leaderboard.png" width="375" alt="福布斯排行榜：前十名玩家、脱敏 QQ 号与绿宝石余额"></a></p>
</details>

<details>
  <summary>帮助菜单预览</summary>
  <p align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/help.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/help.png" width="375" alt="帮助菜单：全部指令、当前费用和简易玩法"></a></p>
</details>

## 快速开始

需要 **Koishi 4.18+**、**Node.js 22+** 和数据库插件，推荐 SQLite。启用 **Puppeteer** 后显示图片界面，未启用时使用文字。

在 Koishi 插件市场搜索 **`mcfish`** 并安装，或在 Koishi 项目目录执行：

```bash
npm install koishi-plugin-mcfish
```

也可从 [Releases](https://github.com/Huanghun542/koishi-plugin-mcfish/releases) 下载 `.tgz` 手动安装。

在控制台启用数据库和 `mcfish`，发送 `开始5次钓鱼` 即可开始。新用户自动获得 **木钓鱼竿和 100 绿宝石**，无需额外注册。

## 常用指令

`XX` 为物品名称，`N` 为数量或仓库中的鱼竿序号；鱼竿序号从 **1** 开始。

| 指令 | 说明 |
| :--- | :--- |
| `开始N次钓鱼` / `钓鱼` | 批量钓鱼 / 钓一次，例如 `开始5次钓鱼` |
| `仓库` / `钓鱼钱包` | 查看鱼竿、物品与绿宝石余额 |
| `市场` / `铁匠铺` | 查看今日收购行情与固定商品 |
| `购买 XX N` / `出售 XX N` | 购买或出售指定数量，省略数量默认为 1；购买鱼竿后自动装备新竿 |
| `一键出售` | 出售普通物品，保留鱼竿、附魔书和稀有物品 |
| `出售 钓鱼竿 N` | 出售仓库序号 N 的鱼竿，回收价为 0；装备中的鱼竿出售后自动装备下一根 |
| `确认` / `取消出售` | 钻石及以上鱼竿出售需在同一会话确认，默认 30 秒内有效 |
| `福布斯排行榜` | 当前平台绿宝石余额前 10 名，QQ 号脱敏，长名字以 `...` 省略 |
| `装备 N` / `卸下鱼竿` | 更换或卸下当前鱼竿 |
| `附魔 N 附魔书名称` | 耐久与海之眷顾附魔指定鱼竿；饵钓使用相同指令，效果绑定用户 |
| `维修 N` | 按配置费用修满指定鱼竿耐久，默认 150 绿宝石 |
| `钓鱼帮助` / `钓鱼源码` | 查看图片帮助菜单或开源地址；帮助中的价格与配置同步 |

## 玩法说明

| 项目 | 默认规则 |
| :--- | :--- |
| 每日钓鱼 | 每人每天基础 **50 次**，饵钓默认每级额外 **5 次**；一批随机等待 **20–40 秒** |
| 次数与耐久 | 按剩余次数与鱼竿耐久计算；钓完耐久耗尽时自动换用有耐久的鱼竿，没有可用鱼竿时提示维修 |
| 仓库容量 | 每页 **15 行**，最多 **2 页**；鱼竿一行一个，物品一行两个，超出的物品与鱼竿自动出售 |
| 基础收购价 | 表格价格 × 出售倍率，默认 **1 倍**，最终价格四舍五入；鱼竿回收价为 **0** |
| 每日市场 | 每天 **5–15 种**物品行情变化，默认范围 **-50% 至 +200%**；跌幅绿色，涨幅红色 |
| 铁匠铺 | 五种满耐久无附魔鱼竿，以及耐久、海之眷顾、饵钓三种附魔书；饵钓附魔书默认售价 **350** |
| 每日刷新 | 次数与市场按 **Asia/Shanghai 零点**刷新 |

例如生鳕鱼表格价格 5，1 倍时基础收购价为 5；涨幅 200% 时卖 15，跌幅 50% 时价格 2.5 四舍五入为 3。附魔书购买价为表格价格的两倍，回收价不超过购买价的 **1/2**，不参与市场涨跌。稀有物品和附魔书可手动出售，仓库溢出仍按容量规则自动出售。

排行榜仅统计绿宝石余额，不包含仓库估值。旧存档的用户名会在玩家下次使用指令时更新。

### 附魔

三种附魔的成功率独立配置，默认均为 **50%**；每次默认消耗 **300 绿宝石和一本对应附魔书**。成功提升一级，失败不返还。上限各自配置，默认 **3 级**，最高 **10 级**。

| 附魔书 | 一级 | 二级 | 三级 |
| :--- | :---: | :---: | :---: |
| 耐久附魔书 | 额外 20 耐久 | 额外 40 耐久 | 额外 60 耐久 |
| 海之眷顾附魔书 | 3% 双倍概率 | 6% 双倍概率 | 9% 双倍概率 |
| 饵钓附魔书 | 每日额外 5 次 | 每日额外 10 次 | 每日额外 15 次 |

各级配置表示该级总加成，不与前级累加，双倍概率实际最高按 100% 计算。指令接受 `耐久`、`海之眷顾`、`饵钓` 简称，例如 `附魔 1 饵钓`。饵钓绑定用户，换竿或卖竿后保留，等级显示在仓库底部。双倍产出不额外消耗次数或耐久。

## 配置

在 Koishi 控制台直接编辑四列奖池表格：**物品名称、物品价格、抽取权重、是否稀有**。小数物价先四舍五入为整数后使用，行情计算后的单件价格也四舍五入。普通物品名称默认白色，稀有物品默认金色，可通过调色盘修改。

每日次数、等待范围、市场、高阶鱼竿出售确认时限、各级附魔总加成与上限、成功率和费用均可配置。实验玩法中的 **附魔失败掉级** 默认关闭，开启后对应附魔失败降低一级，最低 0 级。

**引用消息**与**钓鱼结果合并转发**默认开启：结果为基础产物、双倍额外产物两个节点，合并转发时不附带引用；关闭合并后分两条消息发送。需要适配器支持，转发报错时回退为普通消息。文字消息撤回默认关闭；勾选后在流程结束 **5 秒后** 撤回对应消息。

旧配置中保存的附魔成功率和加成会保留；原成功率字段现在用于耐久，海之眷顾与饵钓使用各自的新配置。升级后可在配置页按需调整为新默认值，玩家存档无需重置。

**从旧版更新到 2.2：** 奖池价格现在直接表示 1 倍下的收购价。默认奖池请恢复默认值；自定义奖池请将旧价格减半，再使用 1 倍出售倍率，以维持原收购价。若保存过旧的最低涨幅，需手动改为 `-50`。

新增图标放入插件安装目录的 `assets/items/物品名称.png`，文件名与奖池物品名完全一致。Docker 常见路径为 `/koishi/node_modules/koishi-plugin-mcfish/assets/items/`。建议从 MC 百科下载透明物品图标，或用 AI 绘制；推荐 64×64 / 128×128 的透明 PNG，大小不超过 200 KB。替换后重启 Koishi，更新插件前保留自定义图标副本。

完整默认物价与稀有度见 [经济设定](docs/economy.md)。

## 更新日志

- **2.5.0**：新增用户饵钓与独立附魔配置，支持失败掉级、消息引用和双倍产物分段合并转发。
- **2.4.0**：支持各级附魔总加成配置，购竿自动装备，高阶鱼竿出售需确认，统一操作提示。
- **2.3.0**：新增附魔概率和等待时间范围配置，调整默认费用，优化耐久提示与自动换竿。

## 致谢与许可

感谢原作者 **[fangliuyu](https://github.com/fangliuyu)** 和 FloatTech/ZeroBot-Plugin 贡献者。原仓库：[FloatTech/ZeroBot-Plugin](https://github.com/FloatTech/ZeroBot-Plugin)，原插件：[plugin/mcfish](https://github.com/FloatTech/ZeroBot-Plugin/tree/master/plugin/mcfish)。界面素材与布局来自 Huanghun542 的 `astrbot_plugin_mcfishing`。

本项目采用 **AGPL-3.0-only**，详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
