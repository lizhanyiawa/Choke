# osu! API 同步

把玩家 id 列表变成一张带头像、banner、pp、作图和等级分布的卡池。

## 1. 建 OAuth 应用

打开 https://osu.ppy.sh/home/account/edit#new-oauth-application ，注册一个应用。

- Application Name：随便，比如 `Choke Pool Sync`
- Callback URL：如果这个应用也要用于游戏登录，必须精确填写 `http://localhost:3100/auth/osu/callback`，不能留空；仅做数据同步（client credentials）时回调不参与流程，但建议和登录应用保持一致

拿到 Client ID 和 Client Secret。

## 2. 配置

```bash
cp .env.example .env
```

填两行：

```
OSU_CLIENT_ID=12345
OSU_CLIENT_SECRET=xxxxxxxx
```

`.env` 已在 `.gitignore` 里。不要加 `VITE_` 前缀，那会把密钥打进前端包。

## 3. 跑

把 id 列表准备好。可以是 Mutualify 的导出，也可以是每行一个 id 的 txt：

```bash
# 从 Mutualify 导出文件同步全部
npm run sync:osu -- --from mutualify-pool.json

# 先拿 50 个试水
npm run sync:osu -- --from mutualify-pool.json --limit 50

# 从纯文本 id 列表
npm run sync:osu -- --ids ids.txt
```

产物在 `data/osu-players.json`，直接拖进 `/pool-lab` 的导入框。

## 4. 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--from <file>` | — | JSON 数组或纯文本 id 列表 |
| `--ids <file>` | — | 额外 id 列表，可叠加 |
| `--out <file>` | `data/osu-players.json` | 输出位置 |
| `--limit <n>` | 全部 | 本次最多处理多少条 |
| `--rankings <n>` | 0 | 从表现排行榜补充前 n 个 id |
| `--rankings-page <n>` | 1 | 从排行榜第 n 页开始取 |
| `--rate <ms>` | 1100 | 请求间隔，官方建议约每秒 1 次 |
| `--refresh` | 关 | 重新拉已经同步过的人 |
| `--no-cache` | 关 | 不复用 `.cache/osu-token.json` |

不给 `--from` 和 `--ids` 时从 stdin 读 id。

## 5. 行为

- 每 25 条写一次盘，Ctrl+C 会先写盘再退出；
- 已经出现在输出文件里的 id 默认跳过，所以可以分批跑；
- 404（用户不存在或被删除）记为 `gone`，不写入；
- 401 自动换 token 重试一次；
- 429 按 `Retry-After` 等待，最多重试 4 次；
- 403 直接停，通常是应用权限或 token 有问题。

## 6. 速度

10 万条按 1100ms 算是 30 小时左右。建议分几天跑，每天 `--limit` 一段；脚本会自动跳过已完成的人。真要压缩时间，先把 `--rate` 降到 800ms 试，别再低。

## 6.1 抽样

只取排行榜第 1 页会全是顶级玩家，稀有度分布会失真。要验证分布，按分段各取一页：

```bash
npm run sync:osu -- --rankings 50 --rankings-page 1   --out data/rank-1.json
npm run sync:osu -- --rankings 50 --rankings-page 10  --out data/rank-500.json
npm run sync:osu -- --rankings 50 --rankings-page 100 --out data/rank-5000.json
npm run sync:osu -- --rankings 50 --rankings-page 400 --out data/rank-20000.json
```

实测参考：第 1 页约 3 万 pp、十万粉；第 100 页约 1 万 pp、几十到几百粉。两端的 signal 差一个数量级，只拿一端做样本会把档位全推到顶端。

全球榜本身只能翻到约 1 万人（200 页），再往后接口会重复返回最后一页。要更大的池子，只能逐人请求 `/users/{id}`，或者叠加多个国家的榜。

## 7. 输出字段

```json
{
  "osuId": 124493,
  "username": "chocomint",
  "country": "KR",
  "title": null,
  "followerCount": 166544,
  "globalRank": 104,
  "mappingFollowers": 5785,
  "rankedMaps": 0,
  "guestMaps": 4,
  "lovedMaps": 0,
  "pp": 18670.2,
  "rankedSetCount": 0,
  "grades": { "ssh": 3, "ss": 2, "sh": 6, "s": 2, "a": 3 },
  "avatarUrl": "https://a.ppy.sh/124493?1791390129.jpeg",
  "coverUrl": "https://assets.ppy.sh/user-cover-presets/6/a7d5....jpeg"
}
```

`normalizeMutualify` 认识这些字段，导入后稀有度信号和 banner 都会生效。

---

# 各国排行榜直出

`sync-osu.mjs` 是逐人请求，10 万人要 30 小时。如果暂时不需要粉丝数和作图数，可以直接吃排行榜：每页 50 人，而且自带 `avatar_url`、`cover.url`、`pp`、`global_rank`、`grade_counts`。

```bash
# 全部国家，pp >= 2000，只保留活跃账号
npm run sync:rankings -- --min-pp 2000 --active

# 指定国家，顺便合并 Mutualify 导出的粉丝数
npm run sync:rankings -- --countries CN,US,JP --min-pp 2000 --followers mutualify-pool.json
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--min-pp <n>` | 2000 | 低于这个 pp 就停止翻页 |
| `--countries <list>` | all | 逗号分隔的国家代码 |
| `--active` | 关 | 跳过 `is_active === false` 的账号 |
| `--max-pages <n>` | 200 | 每国最多翻多少页 |
| `--followers <file>` | — | 合并 Mutualify 的 `followerCount` |
| `--out <file>` | `data/rankings.json` | 输出位置 |

产出字段：`osuId`、`username`、`country`、`pp`、`globalRank`、`grades`、`avatarUrl`、`coverUrl`、`playCount`、`totalHits`、`level`、`isActive`、`lastVisit`、`snapshotAt`，以及合并进来的 `followerCount`。

每个国家最多 1 万（200 页），pp 阈值通常会先触发。
