<div align="center">

# MCFISH · MC 钓鱼

**在聊天中抛竿、收集渔获，经营属于你的仓库。**

![Koishi](https://img.shields.io/badge/Koishi-4.18%2B-4e8fb8?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-4c956c?style=flat-square)
![License](https://img.shields.io/badge/License-AGPL--3.0-728294?style=flat-square)

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
    <td align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/market.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/market.png" width="250" alt="每日市场：展示高价收购物品、价格和涨幅"></a></td>
    <td align="center"><a href="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/blacksmith.png"><img src="https://raw.githubusercontent.com/Huanghun542/koishi-plugin-mcfish/main/docs/images/blacksmith.png" width="250" alt="铁匠铺：五种鱼竿和两种附魔书"></a></td>
  </tr>
</table>

<p align="center"><sub>实际界面渲染示例，预览中的物品与余额为示例数据；点击图片可查看大图。</sub></p>

## 快速开始

需要 **Koishi 4.18+**、**Node.js 22+** 和数据库插件，推荐 SQLite。启用 **Puppeteer** 后显示图片界面，未启用时使用文字。

从 [Releases](https://github.com/Huanghun542/koishi-plugin-mcfish/releases) 下载 `.tgz`，在 Koishi 项目目录安装：

```bash
npm install /path/to/koishi-plugin-mcfish-2.0.0.tgz
```

在控制台启用数据库和 `mcfish`，发送 `开始5次钓鱼` 即可开始。新用户自动获得 **木钓鱼竿和 100 绿宝石**，无需额外注册。

## 常用指令

`XX` 为物品名称，`N` 为数量或仓库中的鱼竿序号；鱼竿序号从 **1** 开始。

| 指令 | 说明 |
| :--- | :--- |
| `开始N次钓鱼` / `钓鱼` | 批量钓鱼 / 钓一次，例如 `开始5次钓鱼` |
| `仓库` / `钓鱼钱包` | 查看鱼竿、物品与绿宝石余额 |
| `市场` / `铁匠铺` | 查看今日收购行情与固定商品 |
| `购买 XX N` / `出售 XX N` | 购买或出售指定数量，省略数量默认为 1 |
| `一键出售` | 出售全部非鱼竿物品，包含附魔书 |
| `装备 N` / `卸下鱼竿` | 更换或卸下当前鱼竿 |
| `附魔 N 附魔书名称` | 为指定鱼竿附魔，例如 `附魔 1 耐久附魔书` |
| `维修 N` | 花费 200 绿宝石修满指定鱼竿耐久 |
| `钓鱼帮助` / `钓鱼源码` | 查看完整规则或开源地址 |

## 玩法说明

| 项目 | 默认规则 |
| :--- | :--- |
| 每日钓鱼 | 每人每天 **50 次**，一批随机等待 **1–40 秒** |
| 次数与耐久 | 按剩余次数与鱼竿耐久计算；耐久耗尽后保留鱼竿，可维修 |
| 仓库容量 | 每页 **15 行**，最多 **2 页**；鱼竿一行一个，物品一行两个，超出的物品与鱼竿自动出售 |
| 每日市场 | 每天高价收购 **5–15 种**物品，涨幅 **10%–200%**，其余按基础价格收购 |
| 铁匠铺 | 固定出售木、铁、金、钻石、下界合金五种满耐久无附魔鱼竿，以及两种附魔书 |
| 每日刷新 | 次数与市场按 **Asia/Shanghai 零点**刷新 |

### 附魔

每次成功率 **50%**，默认消耗 **500 绿宝石和一本对应附魔书**。成功提升一级，失败不返还，最高三级。两种附魔可以同时存在。

| 附魔书 | 一级 | 二级 | 三级 |
| :--- | :---: | :---: | :---: |
| 耐久附魔书 | 额外 30 耐久 | 额外 70 耐久 | 额外 120 耐久 |
| 海之眷顾附魔书 | 1% 双倍概率 | 3% 双倍概率 | 5% 双倍概率 |

附魔指令也接受 `耐久`、`海之眷顾` 简称。双倍产出不额外消耗次数或耐久。

## 配置

在 Koishi 控制台直接编辑四列奖池表格：**物品名称、物品价格、抽取权重、是否稀有**。普通物品名称默认白色，稀有物品默认金色，可通过调色盘修改。

每日次数、等待时间、市场收购范围、附魔费用与附魔书消耗均可配置。文字消息撤回默认关闭；勾选后，在整个流程结束 **5 秒后** 撤回对应消息，需要适配器支持。

## 致谢与许可

感谢原作者 **[fangliuyu](https://github.com/fangliuyu)** 和 FloatTech/ZeroBot-Plugin 贡献者。原仓库：[FloatTech/ZeroBot-Plugin](https://github.com/FloatTech/ZeroBot-Plugin)，原插件：[plugin/mcfish](https://github.com/FloatTech/ZeroBot-Plugin/tree/master/plugin/mcfish)。界面素材与布局来自 Huanghun542 的 `astrbot_plugin_mcfishing`。

本项目采用 **AGPL-3.0-only**，详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
