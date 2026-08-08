# TempTime

[English](README.md) · [繁體中文](README.zh-TW.md) · **简体中文**

找出大家都有空的时间，不需要任何人注册账号——而且包括架设服务器的人在内，没有任
何人会知道你的日历里有什么。

你创建一个房间、挑几个日期，然后把六个字符的代码发给大家。他们在网格上拖动，标出
自己有空的时段，也可以导入日历文件，把已经被占掉的时间扣回去——导入**只会扣除，
永远不会增加**，因为日历上的空白时段不等于这个人有空。离开他们浏览器的只有一串
`0` 和 `1`，每半小时一位数字。事件名称、真正的起止时间、来自哪个 app，全都不会离
开浏览器。房间显示所有人的交集，等到最后一个日期过完就自我销毁。

完整的数据保存说明在运行中的 app 的 `/privacy` 页面。

## 技术栈

Next.js 16（App Router、Turbopack）· React 19 · TypeScript · Tailwind 4 ·
Supabase（Postgres、RLS、Realtime、`pg_cron`）· Zod · Luxon · `jose` ·
Vitest · Playwright。

## 环境要求

- Node 20.9 以上。开发时使用 24.13。
- 一个 Supabase 项目。免费方案就够了。

## 安装配置

```sh
npm install
cp .env.example .env.local
```

接着填写 `.env.local`。每一个变量在 `.env.example` 里都有说明，包括每把密钥该从
Supabase 控制台的哪一个标签页获取——是 publishable/secret 这一组，不是旁边那组旧
的 anon/service_role。

### Supabase 项目

1. **尽量建在东京（`ap-northeast-1`）**。每一次写入都经过 Route Handler，所以真
   正要紧的是服务器到数据库这一段，不是用户到数据库。区域在创建之后就不能更改。
2. 在项目的 API 设置里，把 **“Automatically expose new tables”关掉**，并保持
   **automatic RLS 开启**。`submissions` 是一张任何客户端都不得触及的表，这两个
   默认值都应该以“拒绝”为默认行为。
3. 在 SQL 编辑器里依次执行数据库迁移：

   | 文件 | 作用 |
   | --- | --- |
   | `supabase/migrations/0001_init.sql` | 三张表与它们的级联删除 |
   | `supabase/migrations/0002_rls.sql` | 策略**以及**显式的权限授予 |
   | `supabase/migrations/0003_cron.sql` | 每小时清除过期房间 |

   这些文件都写成可重复执行，所以同一个跑两次是安全的。

   `0002_rls.sql` 会显式授予服务器角色它自己的权限。这跟“这个角色会绕过 RLS”并
   不重复：授权决定这个角色能不能碰这张表，策略决定它能碰哪些行。在
   expose-new-tables 关闭的情况下，少了授权会让每一次插入都以一句干巴巴的
   `permission denied` 失败，看起来像是策略写错，其实不是。

4. 把项目的 **legacy HS256 共享密钥**填进 `SUPABASE_JWT_SECRET`。新项目默认使用
   非对称密钥签名，所以这个可能需要到 Settings → API 底下另外启用。

   这一个不是选填，而且不会温和地失败：它负责签发用户加入房间时颁发的 token，所
   以留空会让加入房间直接返回 500。它同时也是让 Supabase 本身——而不只是这个 app
   自己的路由——能够验证我们签发的 token 的关键，实时更新就靠它。

   一旦已经有房间存在，**不要轮换项目的 JWT 密钥**。验证列表只保留一把当前的和一
   把上一把，再轮换一次就会把 HS256 挤出去，而房间 token 的寿命最长可达三个月。把
   密钥移到“standby”有同样的后果：standby 密钥不会用于验证。

## 第二台机器

如果项目已经在别的地方跑起来了，你只是要多加一台电脑，那就**整个跳过上面的
Supabase 章节**——数据库早就存在，两台机器连的是同一个。

clone 会带来除了 git-ignored 之外的所有东西，而那些被忽略的文件里，只有两个是无
法重新生成的。这两个要手动搬过去：

| 文件 | 为什么 clone 带不到 |
| --- | --- |
| `.env.local` | 真实凭据。没有它什么都跑不起来 |
| `PLAN.md` | 实现规格，刻意不进版本控制 |

其他一律不要复制。`node_modules`、`.next`、`next-env.d.ts` 和
`tsconfig.tsbuildinfo` 同样被 git 忽略，而它们每一个都含有平台专用的原生可执行文
件或绝对构建路径。这些是重建出来的，不是搬过去的：

```sh
npm ci
npx playwright install chromium   # 只有要跑浏览器测试脚本才需要
```

Playwright 的浏览器同时位于仓库和 `node_modules` 之外——macOS 在
`~/Library/Caches/ms-playwright`，Windows 在 `%LOCALAPPDATA%\ms-playwright`——所
以复制整个项目目录永远带不到它们。

**如果 `npm ci` 失败并显示 `Missing: <package> from lock file`**，说明这份
lockfile 是在别的平台生成的，缺少你这个平台需要的可选依赖。改用
`npm install`——`npm ci` 按定义就不会写入 lockfile，所以它选择拒绝而不是修补。生
成的 diff 应该只会新增一个标记为 `"optional": true` 的条目，而且不会改动任何
`version`、`resolved` 或 `integrity` 这几行；把它 commit 并 push，因为修补后的
lockfile 是一个在两个平台上都能用的超集。

然后按照这个顺序验证，因为每一步证明的东西都跟上一步不同：

```sh
npm test                        # 代码与依赖——完全不涉及凭据
node scripts/verify-rls.mjs     # 凭据，以及线上数据库的 RLS
npm run dev                     # 整条路径：创建房间并提交
```

`CRON_SECRET` 是上述三步都不会碰到的唯一变量。只有 `verify-purge.mjs` 需要它，而
且填错会直接以 401 明确失败。

## 运行

```sh
npm run dev          # http://localhost:3000
npm run build        # 生产构建
npm start            # 生产服务器
```

## 检查

```sh
npm test             # Vitest，不需要 Supabase
npm run lint
npm run typecheck
npm run format:check
```

## 对运行中的系统做验证

单元测试覆盖纯逻辑。凡是依赖浏览器、数据库或真实 HTTP 往返的部分，都是靠实际驱动
它来验证的，用的是下面这些脚本。**它们只供开发使用：它们会写入 `.env.local` 指向
的那个数据库。**

| 脚本 | 需要 | 证明什么 |
| --- | --- | --- |
| `verify-rls.mjs` | 只需要 `.env.local` | 房间 token 读得到 `participants`，但在 `submissions` 上被拒绝——它直接跟 Supabase 对话，所以 app 不必是运行中的 |
| `verify-heatmap.mjs` | `APP_URL` | 叠加图 API 的形状、它的隐私性，以及在别处有效的 token 会被拒绝 |
| `verify-purge.mjs` | `APP_URL` | 过期、定时任务凭据，以及级联删除 |
| `verify-headers.mjs` | `BASE_URL`、**生产构建** | CSP 与安全响应头，包含试图注入脚本的对照组 |
| `drive-ui.mjs` | `BASE_URL` | 两个浏览器上下文下的房间生命周期，包含房间消失的四种情况 |
| `drive-heatmap.mjs` | `BASE_URL` | 叠加图、实时连接，以及轮询兜底 |
| `drive-mobile.mjs` | `BASE_URL` | 手机尺寸的触控上下文：布局、点击目标、手指涂色、点击读数 |

```sh
node scripts/drive-ui.mjs                       # 默认 localhost:3000
BASE_URL=http://localhost:3000 node scripts/drive-mobile.mjs
```

运行之前要知道两件事：

- **`verify-headers.mjs` 必须跑在 `npm run build && npm start` 之上**，不能用开发
  服务器。开发模式刻意放宽了策略——为了 Fast Refresh 而允许 `'unsafe-eval'`，为了
  热重载而允许 `ws:`——所以对着 `npm run dev` 跑出绿灯，并不能证明实际上线的东西
  如何。这个脚本一旦检测到开发用的策略就会拒绝运行。
- **除了 `verify-purge.mjs` 之外的每一个都会创建真实房间**，而创建房间有每个地址
  每小时十个的限制。一小时跑个几次是上限。`verify-purge.mjs` 直接植入测试数据，
  完全不消耗这个额度。

截图默认会落在仓库根目录，并且已被 git 忽略；设置 `SHOT_DIR` 可以改放到别处。

## 部署

app 本身没有绑定任何特定的托管商，但 `vercel.json` 是为 Vercel 写的，而且编码了
一个值得知道的妥协：

- **把 app 放在跟数据库同一个区域。** 一次实时更新要付两趟连续的往返，其中一趟就
  是 app 到数据库这一段。
- **把 `.env.example` 里的每一个变量**都设进托管商的环境变量。
- **定时任务是每天一次，不是每小时。** Vercel 的 Hobby 方案不允许部署更频繁的定时
  任务，而且 Vercel Cron 只会发出 `GET`，也不能发送自定义请求头。因此清除路由同时
  接受 `GET` 和 `POST`，并且从 `x-cron-secret` 或 bearer token 两者之一读取它的密
  钥。这只是兜底：每小时的保证来自数据库内部的 `pg_cron`，不受影响。

如果你部署到别的地方，`vercel.json` 就是一个可以直接删掉的文件。

## 关于这个仓库

- `METHOD.md`——这里的做事方式：验证规则、约定，以及那些试过又被否决的做法和理
  由。
- `STATE.md`——项目目前的进度。
- `PLAN.md` 是实现规格，而且刻意**不**进版本控制，所以 `STATE.md` 里对它的引用在
  全新的 clone 中不会解析得到。

## 许可

MIT。见 `LICENSE`。
