# Choke!

把 osu! 玩家数据做成卡牌。在牌桌开包，在卡册收藏和培养卡牌，编队参加实时战斗。

## 启动游戏

在游戏目录双击 [Choke.exe](Choke.exe)。测试环境在点「测试号登录」时启动。

正式存档默认在 `apps/api/.data/pg`，测试存档在 `.cache/developer/pg`。F11 切换全屏，Esc 返回牌桌，Ctrl+F 聚焦搜索。

## 开发者工具

在测试牌桌按 F10，或从「关于 → 开发者工具」打开工作台。工作台有资源补充、卡牌编辑器、卡面实验室和卡池实验室。「试开棱彩包」可重播同一组样卡。

在 PowerShell 运行 `.\Choke.exe --developer` 可以用同一个客户端预览源码修改。F12 打开 WebView2 检查器。

## 从源码构建

需要 Node.js 22.12+、pnpm 9+ 和 Windows WebView2 运行时。从游戏目录运行以下命令准备桌面依赖并构建界面。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-desktop.ps1
```

改动 `apps/desktop` 下的 C# 文件或图标后，传入 `-RebuildExecutable` 编译新版。如果当前 EXE 已签名，构建脚本会用同一张证书签新版，验证通过后才替换。

## 闪卡、精华与市场

- 开包时每张卡都有独立闪卡概率，卡包越好概率越高；闪卡只是实例外观，不改变稀有度。
- 分解重复卡会获得精华，闪卡分解获得 3 倍精华；精华只能用于给卡镀闪。
- 卡牌详情可以用精华镀闪（外观）；经验仍只来自熔卡。
- 市场用金币上架、下架和购买卡牌；购买后 `user_card` 所有权直接转给买家。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 + Vite 8 + Tailwind CSS 4 + shadcn/ui + framer-motion |
| 后端 | Fastify 5 + TypeScript |
| 数据 | Drizzle ORM + PGlite（本地嵌入式 PostgreSQL，数据目录 `apps/api/.data/pg`） |
| 登录 | osu! OAuth 2（authorization code），首次登录自动建号 |
| 包管理 | pnpm workspace（`apps/*`） |

## 目录

```
.
├─ src/                     # 前端（Vite root），入口在根目录
│  ├─ desk/                 # / 桌面、卡册、卡组、开包、市场、关于
│  └─ pool/                 # 卡池构建与 lab 页面
├─ apps/desktop/            # Windows 客户端
├─ apps/api/                # Fastify API
│  ├─ src/auth/             # osu! OAuth、session、鉴权
│  ├─ src/gacha/            # 六池权重、服务端 RNG、60 抽保底
│  ├─ src/routes/           # auth / cards / packs / decks / market / progression
│  ├─ src/db/               # Drizzle schema + PGlite 建表
│  ├─ samples/              # 仓库跟踪的 7 张示例卡
│  └─ data/                 # 全量卡池（gitignore）
├─ data/                    # rankings.json 等同步产物（gitignore）
├─ scripts/                 # sync-osu / sync-rankings / build-cards
└─ Design/                  # 设计规则、技能池和演出
```

## 配置 osu! 登录

使用 osu! 账号时，将根目录的 `.env.example` 复制为 `.env`，填写 `OSU_CLIENT_ID`、`OSU_CLIENT_SECRET` 和 `SESSION_SECRET`。在 osu! 应用设置中将 Callback URL 填为 `http://localhost:3100/auth/osu/callback`。 [osu! 应用设置](https://osu.ppy.sh/home/account/edit#new-oauth-application)

## 全量卡池

仓库只跟踪 `apps/api/samples/sample-cards.json`（7 张）。全量卡池和排行榜数据都被 gitignore：

- `data/rankings.json`：排行榜同步产物，当前约 147 MB
- `apps/api/data/choke-cards.json`：构建产物，当前约 90 MB

只需要示例卡时，退出游戏后运行 `pnpm import:sample`。导入脚本需要独占正在使用的 PGlite 数据目录。

先准备 `data/rankings.json`（可复用已有文件，或重新同步）：

```bash
pnpm sync:rankings -- --min-pp 2000 --active
```

构建并导入：

```bash
# 读 data/rankings.json，写 apps/api/data/choke-cards.json
pnpm build:cards

# 停掉 API 后再导入；--replace 会先清空 cards 表
pnpm import:cards
```

单独指定文件时，注意 pnpm 的 `import` 是内置命令，必须写 `run import`：

```bash
pnpm --filter @choke/api run import -- samples/sample-cards.json
pnpm --filter @choke/api run import -- data/choke-cards.json --replace
```

`--replace` 只清空 `cards` 静态定义表，不会删除 `user_cards`；如果全量卡定义和旧数据不一致，已有卡册可能指向不存在的卡，个人库建议先备份 `apps/api/.data/pg`。

## 设计资料

> V2 当前使用 **100 个精选技能资产**（8 个来源子职业）。`边线技能池` 和 `技能演出` 记录的是 V1 旧池（1470 项），仅用于旧配装兼容、经典模式和资料；不要当作当前内容，但可以**参考复用**——V2 的 100 个资产就取自其中。

- [交接文档](Design/交接文档.md) —— 当前状态、未收尾清单和接手说明
- [培养系统 v1 实施与验收](Design/培养系统%20v1%20实施与验收.md) —— V2 主体（仍在收尾）
- [卡池与稀有度规则](Design/卡池与稀有度规则%20v0.1.md)
- [卡牌培养规则](Design/卡牌培养规则%20v0.3.md)
- [边线技能池（V1 旧池归档，可复用）](Design/边线技能池/README.md)
- [技能演出（V1 1470 项归档，可复用）](Design/技能演出/进度.md)
