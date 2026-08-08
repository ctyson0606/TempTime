# TempTime

[English](README.md) · **繁體中文** · [简体中文](README.zh-CN.md)

找出大家都有空的時間，不需要任何人註冊帳號——而且包括架設伺服器的人在內，沒有
任何人會知道你的行事曆裡有什麼。

你建立一個房間、挑幾個日期，然後把六個字元的代碼發給大家。他們在格子上拖曳，標
出自己有空的時段，也可以匯入行事曆檔案，把已經被佔掉的時間扣回去——匯入**只會
扣除，永遠不會增加**，因為行事曆上的空白時段不等於這個人有空。離開他們瀏覽器的
只有一串 `0` 和 `1`，每半小時一位數字。活動名稱、真正的起訖時間、來自哪個 app，
全都不會離開瀏覽器。房間顯示所有人的交集，等到最後一個日期過完就自我銷毀。

完整的資料保存說明在執行中的 app 的 `/privacy` 頁面。

## 技術堆疊

Next.js 16（App Router、Turbopack）· React 19 · TypeScript · Tailwind 4 ·
Supabase（Postgres、RLS、Realtime、`pg_cron`）· Zod · Luxon · `jose` ·
Vitest · Playwright。

## 需求

- Node 20.9 以上。開發時使用 24.13。
- 一個 Supabase 專案。免費方案就夠了。

## 安裝設定

```sh
npm install
cp .env.example .env.local
```

接著填寫 `.env.local`。每一個變數在 `.env.example` 裡都有說明，包括每把金鑰該從
Supabase 主控台的哪一個分頁取得——是 publishable/secret 這一組，不是旁邊那組舊
的 anon/service_role。

### Supabase 專案

1. **盡量建在東京（`ap-northeast-1`）**。每一次寫入都經過 Route Handler，所以真
   正要緊的是伺服器到資料庫這一段，不是使用者到資料庫。區域在建立之後就不能更
   改。
2. 在專案的 API 設定裡，把 **「Automatically expose new tables」關掉**，並保持
   **automatic RLS 開啟**。`submissions` 是一張任何客戶端都不得觸及的資料表，這
   兩個預設值都應該以「拒絕」為預設行為。
3. 在 SQL 編輯器裡依序執行資料庫遷移：

   | 檔案 | 作用 |
   | --- | --- |
   | `supabase/migrations/0001_init.sql` | 三張資料表與它們的連鎖刪除 |
   | `supabase/migrations/0002_rls.sql` | 政策**以及**明確的權限授予 |
   | `supabase/migrations/0003_cron.sql` | 每小時清除過期房間 |

   這些檔案都寫成可重複執行，所以同一個跑兩次是安全的。

   `0002_rls.sql` 會明確授予伺服器角色它自己的權限。這跟「這個角色會繞過 RLS」
   並不重複：授權決定這個角色能不能碰這張表，政策決定它能碰哪些列。在
   expose-new-tables 關閉的情況下，少了授權會讓每一次寫入都以一句乾巴巴的
   `permission denied` 失敗，看起來像是政策寫錯，其實不是。

4. 把專案的 **legacy HS256 共用密鑰**填進 `SUPABASE_JWT_SECRET`。新專案預設使用
   非對稱金鑰簽章，所以這個可能需要到 Settings → API 底下另外啟用。

   這一個不是選填，而且不會溫和地失敗：它負責簽署使用者加入房間時發出的 token，
   所以留空會讓加入房間直接回傳 500。它同時也是讓 Supabase 本身——而不只是這個
   app 自己的路由——能夠驗證我們簽發的 token 的關鍵，即時更新就靠它。

   一旦已經有房間存在，**不要輪替專案的 JWT 金鑰**。驗證清單只保留一把目前的和
   一把前一把，再輪替一次就會把 HS256 擠出去，而房間 token 的壽命最長可達三個
   月。把金鑰移到「standby」有同樣的後果：standby 金鑰不會用於驗證。

## 第二台機器

如果專案已經在別的地方跑起來了，你只是要多加一台電腦，那就**整個跳過上面的
Supabase 章節**——資料庫早就存在，兩台機器連的是同一個。

clone 會帶來除了 git-ignored 之外的所有東西，而那些被忽略的檔案裡，只有兩個是無
法重新產生的。這兩個要手動搬過去：

| 檔案 | 為什麼 clone 帶不到 |
| --- | --- |
| `.env.local` | 真實憑證。沒有它什麼都跑不起來 |
| `PLAN.md` | 實作規格，刻意不進版控 |

其他一律不要複製。`node_modules`、`.next`、`next-env.d.ts` 和
`tsconfig.tsbuildinfo` 同樣被 git 忽略，而它們每一個都含有平台專用的原生執行檔或
絕對建置路徑。這些是重建出來的，不是搬過去的：

```sh
npm ci
npx playwright install chromium   # 只有要跑瀏覽器測試腳本才需要
```

Playwright 的瀏覽器同時位於版本庫和 `node_modules` 之外——macOS 在
`~/Library/Caches/ms-playwright`，Windows 在 `%LOCALAPPDATA%\ms-playwright`——所
以複製整個專案資料夾永遠帶不到它們。

**如果 `npm ci` 失敗並顯示 `Missing: <package> from lock file`**，代表這份
lockfile 是在別的平台產生的，缺少你這個平台需要的選用相依套件。改用
`npm install`——`npm ci` 依定義就不會寫入 lockfile，所以它選擇拒絕而不是修補。產
生的 diff 應該只會新增一個標記為 `"optional": true` 的項目，而且不會更動任何
`version`、`resolved` 或 `integrity` 這幾行；把它 commit 並 push，因為修補後的
lockfile 是一個在兩個平台上都能用的超集合。

然後依照這個順序驗證，因為每一步證明的東西都跟上一步不同：

```sh
npm test                        # 程式碼與相依套件——完全不涉及憑證
node scripts/verify-rls.mjs     # 憑證，以及線上資料庫的 RLS
npm run dev                     # 整條路徑：建立房間並送出
```

`CRON_SECRET` 是上述三步都不會碰到的唯一變數。只有 `verify-purge.mjs` 需要它，
而且填錯會直接以 401 明確失敗。

## 執行

```sh
npm run dev          # http://localhost:3000
npm run build        # 正式版建置
npm start            # 正式版伺服器
```

## 檢查

```sh
npm test             # Vitest，不需要 Supabase
npm run lint
npm run typecheck
npm run format:check
```

## 對執行中的系統做驗證

單元測試涵蓋純邏輯。凡是依賴瀏覽器、資料庫或真實 HTTP 往返的部分，都是靠實際驅動
它來驗證的，用的是下面這些腳本。**它們只供開發使用：它們會寫入 `.env.local` 指向
的那個資料庫。**

| 腳本 | 需要 | 證明什麼 |
| --- | --- | --- |
| `verify-rls.mjs` | 只需要 `.env.local` | 房間 token 讀得到 `participants`，但在 `submissions` 上被拒絕——它直接跟 Supabase 對話，所以 app 不必是執行中的 |
| `verify-heatmap.mjs` | `APP_URL` | 疊圖 API 的形狀、它的隱私性，以及在別處有效的 token 會被拒絕 |
| `verify-purge.mjs` | `APP_URL` | 過期、排程憑證，以及連鎖刪除 |
| `verify-headers.mjs` | `BASE_URL`、**正式版建置** | CSP 與安全性標頭，包含試圖注入腳本的對照組 |
| `drive-ui.mjs` | `BASE_URL` | 兩個瀏覽器情境下的房間生命週期，包含房間消失的四種情況 |
| `drive-heatmap.mjs` | `BASE_URL` | 疊圖、即時連線，以及輪詢備援 |
| `drive-mobile.mjs` | `BASE_URL` | 手機尺寸的觸控情境：版面、點擊目標、手指塗色、點擊讀數 |

```sh
node scripts/drive-ui.mjs                       # 預設 localhost:3000
BASE_URL=http://localhost:3000 node scripts/drive-mobile.mjs
```

執行之前要知道兩件事：

- **`verify-headers.mjs` 必須跑在 `npm run build && npm start` 之上**，不能用開發
  伺服器。開發模式刻意放寬了政策——為了 Fast Refresh 而允許 `'unsafe-eval'`，為
  了熱重載而允許 `ws:`——所以對著 `npm run dev` 跑出綠燈，並不能證明實際上線的東
  西如何。這支腳本一旦偵測到開發用的政策就會拒絕執行。
- **除了 `verify-purge.mjs` 之外的每一支都會建立真實房間**，而建立房間有每個位址
  每小時十個的限制。一小時跑個幾次是上限。`verify-purge.mjs` 直接植入測試資料，
  完全不消耗這個額度。

截圖預設會落在版本庫根目錄，並且已被 git 忽略；設定 `SHOT_DIR` 可以改放到別處。

## 部署

app 本身沒有綁定任何特定的託管商，但 `vercel.json` 是為 Vercel 寫的，而且編碼了
一個值得知道的妥協：

- **把 app 放在跟資料庫同一個區域。** 一次即時更新要付兩趟連續的往返，其中一趟就
  是 app 到資料庫這一段。
- **把 `.env.example` 裡的每一個變數**都設進託管商的環境變數。
- **排程是每天一次，不是每小時。** Vercel 的 Hobby 方案不允許部署更頻繁的排程，
  而且 Vercel Cron 只會發出 `GET`，也不能送自訂標頭。因此清除路由同時接受 `GET`
  和 `POST`，並且從 `x-cron-secret` 或 bearer token 兩者之一讀取它的密鑰。這只是
  備援：每小時的保證來自資料庫內部的 `pg_cron`，不受影響。

如果你部署到別的地方，`vercel.json` 就是一個可以直接刪掉的檔案。

## 關於這個版本庫

- `METHOD.md`——這裡的做事方式：驗證規則、慣例，以及那些試過又被否決的做法和理
  由。
- `STATE.md`——專案目前的進度。
- `PLAN.md` 是實作規格，而且刻意**不**進版控，所以 `STATE.md` 裡對它的引用在全新
  的 clone 中不會解析得到。

## 授權

MIT。見 `LICENSE`。
