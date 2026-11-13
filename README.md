# Choke!

把 osu! 玩家数据做成卡牌：用 osu! 账号登录，开包抽卡，在卡册里收藏和查看卡牌。

**当前状态：M1 可用（账号 + 卡池 + 抽卡 + 收藏）。** 验收口径是“能注册、能抽、能看卡”；完整手工验收步骤见 [Design/M1-验收清单.md](Design/M1-验收清单.md)。战斗、经济（任务 / 市场 / 通行证）还没有纳入 M1 验收范围。

## 桌面交互

- 抽卡结果、轻量模式开包结果都可以直接拖到桌面；也可以点“全部发到桌面”。
- 卡册、卡组里的卡也可以拖到桌面：来源卡会暂时变暗并标记“在桌面”，拖回去后恢复。
- 桌面上的卡可以直接拖进右侧卡组槽位，槽位会高亮并自动保存；放进去后桌面卡会被移走。
- 不拖卡时双击桌面空白处，可以收起右侧抽屉。
- 右侧抽屉展开后，入口按钮固定在抽屉最左侧，点不同按钮只切换右侧内容。
- 卡组 1–7 张都可以进入战斗，0 张时才会拦截。
- 桌面上的卡包如果在背包里已经没有库存，点开会提示并自动从桌面移除。
- 桌面卡包拖回背包会恢复库存；从背包发到桌面时会先预扣一个卡包，开包使用一次性 token。
- 桌面“发牌”会先检查背包库存；没有对应卡包时按钮禁用，不会凭空生成卡包。
- 新抽到的卡固定从 Lv.1 / 0 命座开始；桌面卡面不再随机生成等级。
- 账号面板显示 osu! 头像、稳定的 `CHOKE ID #xxxxxx` 数字 ID 和精华余额。

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

> 本地 M1 用 PGlite，不依赖独立 PostgreSQL 服务；它单进程单连接，不适合多实例部署。正式部署再换 PostgreSQL 16。

## 目录

```
.
├─ src/                     # 前端（Vite root），入口在根目录
│  ├─ desk/                 # / 桌面、卡册、卡组、开包、市场、关于
│  └─ pool/                 # 卡池构建与 lab 页面
├─ apps/api/                # Fastify API
│  ├─ src/auth/             # osu! OAuth、session、鉴权
│  ├─ src/gacha/            # 六池权重、服务端 RNG、60 抽保底
│  ├─ src/routes/           # auth / cards / packs / decks / market / progression
│  ├─ src/db/               # Drizzle schema + PGlite 建表
│  ├─ samples/              # 仓库跟踪的 7 张示例卡
│  └─ data/                 # 全量卡池（gitignore）
├─ data/                    # rankings.json 等同步产物（gitignore）
├─ scripts/                 # sync-osu / sync-rankings / build-cards
└─ Design/                  # 需求、规则、验收文档
```

注意：当前前端仍在仓库根目录的 `src/`，没有 `apps/web`；需求文档里的 `apps/web` 是目标结构。

## 环境要求

- **Node.js 22.12+**（或 24 LTS；本次验证使用 v24.22.1）
- **pnpm 9+**（lockfile 为 9.0；本次验证使用 12.16.1）
- Windows / macOS / Linux 均可；Windows 可直接用 `start-choke.bat`
- 一个可用的 osu! OAuth 应用（见下一节）

```bash
node -v
pnpm -v
pnpm install
```

## 配置 `.env`

在**仓库根目录**创建 `.env`：

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

API 会从 `apps/api` 的工作目录向上查找 `.env`，根目录这份会被读到。`.env` 已被 gitignore；不要把密钥写成 `VITE_` 前缀，否则会被打进前端包。

| 变量 | 示例值 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `OSU_CLIENT_ID` | `74418` | 无 | **是** | osu! OAuth 应用的 Client ID |
| `OSU_CLIENT_SECRET` | `replace-with-your-osu-client-secret` | 无 | **是** | osu! OAuth 应用的 Client Secret，不要提交 |
| `SESSION_SECRET` | 一段长随机字符串 | 回退到 `OSU_CLIENT_SECRET`；两者都没填时每次启动用随机值（重启后登录全部失效） | **建议显式配置** | 用于签名 session cookie；改掉后旧登录全部失效 |
| `API_BASE_URL` | `http://localhost:3100` | `http://localhost:3100` | 改端口时必填 | OAuth 回调的 base；**末尾不要带斜杠** |
| `WEB_BASE_URL` | `http://localhost:5173` | `http://localhost:5173` | 前端不是 5173 时必填 | 登录成功后跳转的前端地址 |
| `PG_DATA_DIR` | `./.data/pg` | `./.data/pg` | 可选 | PGlite 数据目录；**相对 `apps/api` 的工作目录解析** |
| `PORT` | `3100` | `3100` | 可选 | API 监听端口；改它必须同时改 `API_BASE_URL` 和 `vite.config.ts` 的代理目标 |

开发时最省事的组合是只填 `OSU_CLIENT_ID`、`OSU_CLIENT_SECRET`、`SESSION_SECRET`，其余保持默认。

### osu! OAuth 回调地址

在 <https://osu.ppy.sh/home/account/edit#new-oauth-application> 创建或修改应用：

- **Callback URL 必须精确填写**：`http://localhost:3100/auth/osu/callback`
- 不能留空，不能带结尾斜杠，不能写成 `127.0.0.1`，端口必须是 `3100`
- 当前使用的应用 `client_id` 是 `74418`；如果换成自己的应用，同时改 `OSU_CLIENT_ID` 和 `OSU_CLIENT_SECRET`

登录流程是 `GET /auth/osu` → osu! 授权 → 回调 `http://localhost:3100/auth/osu/callback` → 建号并写 session → 跳回 `WEB_BASE_URL/gacha`。

## 快速启动（两个终端）

首次准备：

```bash
pnpm install
copy .env.example .env
# 编辑 .env：填 OSU_CLIENT_SECRET、SESSION_SECRET；OSU_CLIENT_ID 默认 74418
```

导入 7 张示例卡（**此时不要启动 API**，PGlite 单进程不能同时被两个进程打开）：

```bash
pnpm import:sample
```

终端 A 启动 API：

```bash
pnpm dev:api
# 等价于 pnpm --filter @choke/api run dev
# 健康检查：http://localhost:3100/health
```

终端 B 启动前端：

```bash
pnpm dev
# Vite 默认 http://localhost:5173
```

打开 <http://localhost:5173/gacha>，点“用 osu! 登录”，授权后回到开包页。

Windows 也可以双击 `start-choke.bat`，它会分别打开 API 和前端两个窗口，并自动打开浏览器。脚本固定使用 5173 / 3100。

### 使用 5207 等其它前端端口

本地常用 `5207`，此时必须让 `WEB_BASE_URL` 指向实际地址，否则登录成功后会跳到 5173：

```bash
# .env
WEB_BASE_URL=http://localhost:5207

# 终端 B
pnpm dev -- --port 5207 --strictPort
```

改完 `.env` 要重启 API。OAuth 回调仍然固定为 `http://localhost:3100/auth/osu/callback`。

## 全量卡池

仓库只跟踪 `apps/api/samples/sample-cards.json`（7 张）。全量卡池和排行榜数据都被 gitignore：

- `data/rankings.json`：排行榜同步产物，当前约 147 MB
- `apps/api/data/choke-cards.json`：构建产物，当前约 90 MB

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

## M1 手工验收

完整清单、curl 命令和负向用例在 [Design/M1-验收清单.md](Design/M1-验收清单.md)。最短路径：

1. **登录**：打开 `/gacha`，点“用 osu! 登录”，完成 osu! 授权，右上角显示用户名。
2. **抽卡**：选“普通”，点“开启 5 张”，页面出现 5 张卡，保底进度更新。
3. **看卡**：打开 `/` 桌面，双击“卡册”，刚抽到的卡在列表里；点任意卡打开详情。
4. **桌面开包**：在桌面点“发牌”，双击桌上的卡包开包，结束后把卡拖进卡册（或点“快速收卡”），再到卡册确认。
5. **负向检查**：退出登录后卡册显示“登录后查看卡册”入口；未登录直接请求 `GET /users/:id/cards` 应返回 401。

## 常见问题

**登录后跳到了 5173，但我跑的是 5207**
`WEB_BASE_URL` 还是默认值。改成实际前端地址（如 `http://localhost:5207`）并重启 API。OAuth 回调本身仍是 3100。

**osu! 报 `redirect_uri` 不匹配**
去 osu! 应用页把 Callback URL 精确改成 `http://localhost:3100/auth/osu/callback`；同时确认 `API_BASE_URL` 没有结尾斜杠、`PORT` 是 3100。

**登录成功但接口仍然 401 / 浏览器没有 cookie**
统一用 `http://localhost`，不要一会儿 `localhost` 一会儿 `127.0.0.1`，两者 cookie 不共享。cookie 名是 `choke_session`，`httpOnly` + `SameSite=Lax`，30 天有效。改过 `SESSION_SECRET` 会让旧 cookie 全部失效，重新登录即可。

**能不能同时跑 API 和导入脚本？**
不能。PGlite 是单进程单连接，导入前先停 API；也不要让两个 API 实例共用同一个 `PG_DATA_DIR`。多实例部署要等换 PostgreSQL。

**卡池文件在哪？为什么克隆后只有 7 张卡**
`apps/api/data/choke-cards.json` 和 `data/rankings.json` 都被 gitignore，仓库只跟踪 7 张样本。按“全量卡池”一节构建、导入即可。

**`pnpm --filter @choke/api import ...` 报 pnpm 参数错误**
`import` 是 pnpm 的内置命令。用根脚本 `pnpm import:sample` / `pnpm import:cards`，或写成 `pnpm --filter @choke/api run import -- ...`。

**抽卡报“卡池里没有 X 档的卡”**
当前库没有对应稀有度的卡。先 `pnpm import:sample` 或导入全量卡池；导入时 API 要停着。

**3100 被占用**
M1 建议保持 3100。非要改端口，需要同时改 `PORT`、`API_BASE_URL`、`vite.config.ts` 里 `/api` 和 `/auth` 的代理目标，以及 osu! 应用的回调地址。

## M1 边界

当前可用：osu! OAuth 登录 / 首次登录建号、六池抽卡、服务端 RNG、60 抽保底、桌面开包落库、卡册筛选/排序/分页、卡牌详情、`/users/:userId/...` 的 session 鉴权（越权 403、未登录 401）。

**不在 M1 验收范围**：战斗 PVE、任务、市场、通行证、经济账本、PvP、自动化测试 / CI。这些仍按需求文档的后续里程碑推进。
