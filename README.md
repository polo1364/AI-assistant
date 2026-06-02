# 蝦蝦 Qwen AI 助理

手機與電腦都能用的響應式 AI 助理網頁。

- **Qwen** 負責整理回答（OpenAI 相容 API）
- **Tavily** 負責聯網查資料（可選，由「聯網搜尋」開關控制）
- 兩把 API Key 由你自己在「設定」模態視窗輸入，只存在瀏覽器 `localStorage`
- 為避開瀏覽器 CORS，附一個極簡 Node 代理 `server.js`：前端把 Key 隨請求傳給自己的代理，代理再去打 Tavily / Qwen（代理不儲存 Key）
- 內建快捷模板、回覆複製、用量/花費估算模態視窗

## 功能
1. 響應式聊天介面（手機 / 平板 / 電腦自適應）
2. 接 Qwen Flash / Qwen3.5 Flash / Plus / Max
3. 聯網搜尋開關（Tavily 查資料 → Qwen 整理，並附來源連結）
4. 6 個快捷模板（SOP / 旅遊 / 文案 / 信件 / RO 腳本 / 圖片提示詞）
5. 回覆可一鍵複製
6. 用量 / 預估花費模態視窗（Qwen token 與花費、Tavily 搜尋次數）
7. PWA：可加入手機主畫面

## 取得 API Key
- Qwen：到 [Alibaba Cloud Model Studio](https://modelstudio.alibabacloud.com/) 啟用服務後於 Key Management 建立。
- Tavily：到 [tavily.com](https://www.tavily.com/) 註冊後取得 API Key（不用聯網搜尋可不填）。

## 本機執行
需要 Node.js 18 以上（已用內建 `fetch`）。

```bash
npm install
npm start
```

看到 `Qwen AI 助理已啟動：http://localhost:3000` 後，用瀏覽器開啟該網址。
首次開啟會自動跳出「設定」視窗，填入 Qwen API Key（要聯網再填 Tavily Key），按儲存即可使用。

## 手機測試（同一個 Wi-Fi）
1. 電腦與手機連同一個 Wi-Fi。
2. Windows 用 `ipconfig` 查 IPv4 位址，例如 `192.168.1.25`。
3. 手機瀏覽器開 `http://192.168.1.25:3000`。
4. 若打不開：確認同一 Wi-Fi、server 仍在執行、Windows 防火牆允許 Node.js。

## 用量 / 花費說明
- 數字來自每次回覆的 `usage`（token）與聯網搜尋次數，於瀏覽器本機累加。
- 花費為「估算」：在設定填入每 1M tokens 的輸入/輸出單價與 Tavily 單次搜尋價即可估算。
- Qwen / Tavily 都沒有公開查詢真實餘額的 API，實際金額以官方帳單為準。

## 部署前測試問題
上線前建議用以下問題確認 Agent 是否仍遵守本專案事實與高準確模式規則：

1. 問：「這個專案後端端點是什麼？」
   - 正確：回答 `/api/ask`
   - 不應出現：`/api/chat`、`/api/search`

2. 問：「這個專案有用 React 嗎？」
   - 正確：沒有，前端是原生 HTML / CSS / JavaScript

3. 問：「高準確模式下，Qwen API 最新價格是多少？」
   - 沒有 Tavily Key：應提示高準確模式處理高風險問題需要 Tavily API Key
   - 有 Tavily Key：應查官方來源後再回答

## 部署到 Railway（建議）
因為有 Node 代理，需要部署到能跑 Node 的平台。GitHub Pages 是純靜態主機，無法執行 `server.js`，請勿用 Pages。

步驟：
1. 進 [railway.app](https://railway.app)，用 GitHub 登入。
2. New Project → Deploy from GitHub repo → 選你的 repo。
3. Railway 會自動偵測 `package.json` 並依 `railway.json` / `Procfile`：安裝 `npm install`、啟動 `npm start`。
4. Build 完成後到該服務 Settings → Networking → Generate Domain，取得對外網址（`*.up.railway.app`）。
5. 手機/電腦打開該網址，在「設定」填入 Key 即可使用。

注意：
- 不需設定任何 API Key 環境變數（Key 由使用者在前端 modal 自填）。
- `PORT` 由 Railway 自動注入，程式已用 `process.env.PORT` 相容。
- 若 repo 把專案放在子資料夾，請在 Railway 服務 Settings 的 Root Directory 指定該資料夾。

## 安全提醒
- Key 只存在你裝置的瀏覽器，公用裝置使用後請到設定按「清除 Key」。
- repo 內不含任何 Key；`.gitignore` 已忽略 `node_modules` 與 `.env`。

## icon.png
PWA 圖示請放一張 512×512 的 `icon.png` 於本資料夾（可自行替換）。
