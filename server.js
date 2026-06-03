const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const fsp = fs.promises;
const PROJECT_ROOT = __dirname;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

const PROJECT_FACTS = {
  title: "蝦蝦AI助理",
  frontend: "原生 HTML/CSS/JavaScript",
  backend: "Node.js + Express",
  endpoint: "/api/ask",
  qwenBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  qwenModels: ["qwen-flash", "qwen3.5-flash", "qwen-plus", "qwen3-max"],
  defaultModel: "qwen-flash",
  tavilyMode: "/search",
  deployment: "Railway",
  files: ["index.html", "style.css", "script.js", "server.js", "package.json"],
  keyFlow: "API Key 由前端 modal 自填並存在 localStorage，每次請求傳給 Express 代理；後端只轉發使用，不落地儲存。",
  constraints: [
    "不使用 React/Vue",
    "不使用 LangChain",
    "不使用 /api/chat",
    "不使用 /api/search",
    "不使用 .env 儲存 API Key",
    "目前只支援文字輸入，不支援圖片、語音或多模態"
  ]
};

const WORK_TOOLS = {
  list_files: { risk: "low", requiresConfirm: false },
  read_file: { risk: "low", requiresConfirm: false },
  propose_patch: { risk: "medium", requiresConfirm: false },
  write_file: { risk: "medium", requiresConfirm: true }
};

const ALLOWED_WORK_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".md", ".txt"]);
const BLOCKED_PATH_PARTS = new Set(["node_modules", ".git", ".cursor", "mcps", "terminals", "agent-transcripts"]);
const BLOCKED_FILE_PATTERN = /(^\.env$|\.env\.|secret|credential|password|cookie|private|token|api[_-]?key)/i;
const pendingWrites = new Map();
const WRITE_TOKEN_TTL_MS = 10 * 60 * 1000;

function normalizeProjectRelativePath(inputPath) {
  const raw = String(inputPath || "").replace(/\\/g, "/").trim();
  if (!raw || raw.includes("\0")) throw new Error("缺少或不合法的檔案路徑。");
  if (path.isAbsolute(raw) || /^[a-z]:\//i.test(raw)) throw new Error("只能使用專案內相對路徑。");

  const resolved = path.resolve(PROJECT_ROOT, raw);
  const relative = path.relative(PROJECT_ROOT, resolved).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("路徑超出專案範圍。");
  }

  const parts = relative.split("/");
  if (parts.some((part) => BLOCKED_PATH_PARTS.has(part))) {
    throw new Error("此路徑屬於系統、依賴或內部資料，不允許操作。");
  }
  if (parts.some((part) => BLOCKED_FILE_PATTERN.test(part))) {
    throw new Error("此路徑可能包含敏感資訊，不允許操作。");
  }

  const ext = path.extname(relative).toLowerCase();
  if (!ALLOWED_WORK_EXTENSIONS.has(ext)) {
    throw new Error(`不支援操作 ${ext || "無副檔名"} 檔案。`);
  }

  return { absolute: resolved, relative };
}

async function listProjectFiles(dir = PROJECT_ROOT, depth = 0, results = []) {
  if (depth > 4 || results.length >= 200) return results;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= 200) break;
    if (BLOCKED_PATH_PARTS.has(entry.name) || BLOCKED_FILE_PATTERN.test(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(PROJECT_ROOT, absolute).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await listProjectFiles(absolute, depth + 1, results);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ALLOWED_WORK_EXTENSIONS.has(ext)) results.push(relative);
  }
  return results.sort();
}

async function readProjectFile(relativePath) {
  const safe = normalizeProjectRelativePath(relativePath);
  const stat = await fsp.stat(safe.absolute);
  if (!stat.isFile()) throw new Error("只能讀取檔案。");
  if (stat.size > 180_000) throw new Error("檔案過大，第一版暫不讀取。");
  return {
    path: safe.relative,
    content: await fsp.readFile(safe.absolute, "utf8")
  };
}

function pickRelevantFiles(goal, availableFiles) {
  const text = String(goal || "");
  const explicit = availableFiles.filter((file) => text.includes(file) || text.includes(path.basename(file)));
  if (explicit.length > 0) return explicit.slice(0, 5);

  const candidates = [];
  if (/介面|UI|樣式|排版|顏色|css|手機|響應式/i.test(text)) candidates.push("index.html", "style.css", "script.js");
  if (/前端|按鈕|modal|歷史|模板|indexeddb|javascript|script/i.test(text)) candidates.push("index.html", "script.js", "style.css");
  if (/後端|api|agent|qwen|tavily|server|路由|端點/i.test(text)) candidates.push("server.js", "script.js");
  if (/部署|railway|說明|readme|文件/i.test(text)) candidates.push("README.md", "package.json", "railway.json");

  const unique = [...new Set(candidates)].filter((file) => availableFiles.includes(file));
  return unique.length > 0 ? unique.slice(0, 5) : availableFiles.filter((file) => ["index.html", "style.css", "script.js", "server.js"].includes(file)).slice(0, 4);
}

function createUnifiedDiff(filePath, oldText, newText) {
  if (oldText === newText) return "";
  const oldLines = String(oldText || "").split("\n");
  const newLines = String(newText || "").split("\n");
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1;

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const before = Math.max(0, start - 3);
  const afterOld = Math.min(oldLines.length - 1, oldEnd + 3);
  const afterNew = Math.min(newLines.length - 1, newEnd + 3);
  const lines = [`--- ${filePath}`, `+++ ${filePath}`];

  for (let i = before; i < start; i += 1) lines.push(` ${oldLines[i]}`);
  for (let i = start; i <= oldEnd; i += 1) lines.push(`-${oldLines[i]}`);
  for (let i = start; i <= newEnd; i += 1) lines.push(`+${newLines[i]}`);
  for (let i = oldEnd + 1; i <= afterOld && i < oldLines.length; i += 1) lines.push(` ${oldLines[i]}`);
  if (afterOld < oldLines.length - 1 || afterNew < newLines.length - 1) lines.push(" ...");
  return lines.join("\n");
}

function applyReplacements(original, replacements) {
  let content = String(original || "");
  for (const replacement of replacements || []) {
    const oldText = String(replacement.oldText || "");
    const newText = String(replacement.newText || "");
    if (!oldText || oldText === newText) continue;
    const first = content.indexOf(oldText);
    if (first === -1) {
      throw new Error("AI 提供的 oldText 無法在檔案中找到，已取消建立此 patch。");
    }
    if (content.indexOf(oldText, first + oldText.length) !== -1) {
      throw new Error("AI 提供的 oldText 在檔案中出現多次，為避免誤改已取消建立此 patch。");
    }
    content = content.slice(0, first) + newText + content.slice(first + oldText.length);
  }
  return content;
}

function countChangedLines(diff) {
  return String(diff || "")
    .split("\n")
    .filter((line) => /^[+-]/.test(line) && !/^---|\+\+\+/.test(line)).length;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function cleanupPendingWrites() {
  const now = Date.now();
  for (const [token, item] of pendingWrites.entries()) {
    if (now - item.createdAt > WRITE_TOKEN_TTL_MS) pendingWrites.delete(token);
  }
}

function isSensitiveWorkRequest(goal) {
  const text = String(goal || "");
  const asksToRead = /讀取|查看|打開|顯示|列出|取得|看一下|內容/i.test(text);
  const mentionsSensitive =
    /\.env\b|secret|credential|password|cookie|private|token|api[_\s-]?key|金鑰|密碼|憑證/i.test(text);
  return asksToRead && mentionsSensitive;
}

function buildWorkPlan(goal, files) {
  const relevantFiles = pickRelevantFiles(goal, files);
  const steps = [
    {
      tool: "list_files",
      risk: WORK_TOOLS.list_files.risk,
      requiresConfirm: false,
      reason: "確認本專案可操作檔案清單。"
    },
    ...relevantFiles.map((file) => ({
      tool: "read_file",
      path: file,
      risk: WORK_TOOLS.read_file.risk,
      requiresConfirm: false,
      reason: `讀取 ${file} 以分析目前實作。`
    })),
    {
      tool: "propose_patch",
      risk: WORK_TOOLS.propose_patch.risk,
      requiresConfirm: false,
      reason: "根據目標與讀取內容產生修改建議與 diff，暫不寫入檔案。"
    }
  ];

  return {
    goal: String(goal || "").trim(),
    scope: "project_only",
    riskLevel: "medium",
    requiresUserConfirmation: true,
    steps
  };
}

function fileBundleForPrompt(files) {
  return files
    .map((file) => `檔案：${file.path}\n\`\`\`\n${file.content.slice(0, 30000)}\n\`\`\``)
    .join("\n\n---\n\n");
}

async function proposeProjectPatches({ goal, files, qwenKey, model, baseUrl }) {
  if (!qwenKey) {
    return {
      summary: "缺少 Qwen API Key，已完成檔案讀取，但無法產生 AI 修改建議。",
      patches: [],
      notes: ["請先在設定填入 Qwen API Key，再執行工作 Agent。"]
    };
  }

  const prompt =
    "你是半自動工作 Agent。請根據使用者目標與專案檔案，提出必要修改。\n" +
    "只能修改提供的檔案；不要新增未提供檔案；不要輸出 Markdown；只輸出 JSON。\n" +
    "務必採用局部最小修改，不要回傳完整新檔案內容。\n" +
    "每個 replacement 的 oldText 必須是檔案中唯一出現的完整原文片段，newText 是替換後片段。\n" +
    "若只需要建議、不需要修改，patches 請回空陣列並把建議放 notes。\n" +
    "JSON 格式：{\"summary\":\"...\",\"patches\":[{\"path\":\"README.md\",\"reason\":\"修改原因\",\"replacements\":[{\"oldText\":\"原文片段\",\"newText\":\"新文片段\"}]}],\"notes\":[\"...\"]}\n\n" +
    `使用者目標：${goal}\n\n` +
    `專案檔案：\n${fileBundleForPrompt(files)}`;

  const data = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    temperature: 0.1
  });

  const parsed = safeJsonParse(data.choices?.[0]?.message?.content);
  if (!parsed) {
    return {
      summary: data.choices?.[0]?.message?.content || "Qwen 沒有回傳可解析的修改建議。",
      patches: [],
      notes: ["模型輸出不是 JSON，因此未建立可確認寫入的 patch。"]
    };
  }

  return {
    summary: String(parsed.summary || "已產生修改建議。"),
    patches: Array.isArray(parsed.patches) ? parsed.patches : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : []
  };
}

function projectFactsText() {
  return [
    `本專案名稱：${PROJECT_FACTS.title}`,
    `前端：${PROJECT_FACTS.frontend}`,
    `後端：${PROJECT_FACTS.backend}`,
    `唯一後端端點：${PROJECT_FACTS.endpoint}`,
    `Qwen 預設 Base URL：${PROJECT_FACTS.qwenBaseUrl}`,
    `模型選項：${PROJECT_FACTS.qwenModels.join(", ")}；預設 ${PROJECT_FACTS.defaultModel}`,
    `Tavily 預設模式：${PROJECT_FACTS.tavilyMode}`,
    `部署平台：${PROJECT_FACTS.deployment}`,
    `檔案結構：${PROJECT_FACTS.files.join(", ")} 位於同一層`,
    `Key 流程：${PROJECT_FACTS.keyFlow}`,
    `限制：${PROJECT_FACTS.constraints.join("；")}`
  ].join("\n");
}

const AGENT_OPERATING_PRINCIPLES = [
  "運作方式：先判斷問題類型與風險，再決定是否需要查證、規劃或拒答。",
  "回答原則：有官方來源、使用者提供內容或本專案固定事實支撐時才下肯定結論；沒有足夠證據時要明確說明不足。",
  "查證原則：涉及價格、計費、API、政策、部署、安全、法律、醫療、投資或最新資訊時，必須優先官方來源；官方與第三方衝突時以官方為準。",
  "來源原則：若已有官方來源能支撐主要結論，不要因混入第三方來源就整題拒答；應標示以官方來源為準，第三方只作補充。",
  "保守原則：高風險問題沒有官方來源或明確證據時，不硬答、不猜測，改為說明需要官方資料或開啟查證模式。",
  "工作 Agent 原則：低風險可讀取與整理；中風險如建立或修改檔案必須先顯示計畫與 diff，等待使用者確認；高風險如刪除、部署、寄信、付款、任意指令第一版禁止或需二次確認。",
  "安全原則：不讀取 .env、密碼、cookie、憑證、API Key 或專案外路徑；不自動刪檔、不自動部署、不自動寄信、不自動執行任意命令。",
  "輸出原則：先給結論，再給依據、風險與下一步；若是修改建議，必須偏向最小改動與可確認差異。"
].join("\n");

const AGENT_RESOURCE_GUIDE = [
  "可用學習資源：Datawhale Hello-Agents 是系統性智能體教程，涵蓋智能體概念、LLM 基礎、ReAct、Plan-and-Solve、Reflection、低代碼平台、AutoGen/AgentScope/LangGraph、自研 Agent 框架、Memory/RAG、上下文工程、MCP/A2A/ANP、Agentic-RL、性能評估、智能旅行助手、DeepResearch Agent、WebAgent、Agent Skills 與 Skill 寫作。",
  "可用角色資源：jnMetaCode/agency-agents-zh 是中文 AI 專家角色庫，包含約 215 個即插即用角色，涵蓋工程、設計、行銷、產品、專案管理、測試、支援、金融、法務、供應鏈、遊戲、特殊專家等部門；可作為子 Agent、人設提示詞、審查角色或工作流分工的參考。",
  "agency-agents-zh 特別適合：需要前端開發者、後端架構師、安全工程師、程式碼審查員、UI/UX 設計師、小紅書/抖音/微信營運、SEO、產品經理、API 測試員、效能測試、無障礙審核、合規審計、智能體編排者或提示詞工程師時，推薦使用資源面板查找對應角色。",
  "Agency Orchestrator 可作為未來多角色協作參考：自動選角、DAG 工作流、並行執行、斷點續跑與模板化交付；但本專案目前尚未實作完整多 Agent 編排，只可作為設計參考。",
  "當使用者詢問 Agent 學習路線、架構設計、工具系統、記憶、上下文、MCP、評估、多智能體或 DeepResearch 時，可以推薦工具列「資源」面板中的 Hello-Agents 精選資源。",
  "當使用者詢問子 Agent 角色、專家分工、角色提示詞、Cursor/Claude Code/Copilot 角色庫或工作流角色設計時，可以推薦工具列「資源」面板中的 agency-agents-zh 精選資源。",
  "推薦資源時請說明適合用途，不要宣稱本專案已完整實作 Hello-Agents 或 agency-agents-zh 的全部內容；本專案目前只實作聊天查證、來源整理、半自動工作 Agent、確認寫入與安全限制。"
].join("\n");

const SYSTEM_PROMPT =
  "你是一位繁體中文低成本 Agent 助理。請用清楚、實用、可直接複製的方式回答。" +
  `核心運作準則（必須遵守）：\n${AGENT_OPERATING_PRINCIPLES}\n` +
  `Agent 學習資源（可用於推薦）：\n${AGENT_RESOURCE_GUIDE}\n` +
  "優先簡潔回答，避免不必要的冗長內容，以節省 token。" +
  "只有當問題需要最新資訊、查證事實、價格、新聞、即時資料或指定網頁資訊時，才使用 web_search 工具。" +
  "涉及官方 API、模型、定價、文件、部署或產品能力時，必須優先使用官方文件；官方來源與第三方來源衝突時，以官方來源為準。" +
  `本專案事實（不可違反）：${projectFactsText()}` +
  "前端呼叫的後端端點是 /api/ask，不是 /api/chat；Qwen/Tavily Key 由使用者在前端 modal 自填並存在 localStorage；每次請求會把 Key 傳給自己的 Express 代理後端，由後端呼叫 Qwen/Tavily；伺服器只轉發使用，不落地儲存 Key，也不需要 .env 放 API Key；Tavily 直接用 REST API，不使用 LangChain。" +
  "本專案檔案位於同一層，不是 frontend/backend 分離架構；index.html、style.css、script.js、server.js、package.json 都在同一個專案資料夾。Railway 部署時應直接部署含 package.json 的資料夾；若 GitHub repo 外層還有資料夾，才把 Root Directory 設為 qwen-ai-assistant，不要建議 /frontend 或 /backend。" +
  "目前 UI 是文字聊天介面，不支援圖片、語音或多模態輸入，不要宣稱本專案支援多模態。現在模型選項為 qwen-flash、qwen3.5-flash、qwen-plus、qwen3-max；預設低成本建議是 qwen-flash，需要更強再切換。" +
  "本專案目前只有 /api/ask 端點；/api/ask 已同時處理 Qwen 回答、Tavily 搜尋、自動 agent 流程、來源整理與 usage 回傳。不要建議新增 /api/search，除非使用者明確要求獨立搜尋 API。" +
  "關於 Key 安全，不要說 localStorage 完全安全或符合完整安全原則；應說第一版方便可用，但需注意 XSS、公用裝置與瀏覽器儲存風險，正式版可考慮後端 session、帳號制、短期 token 或加密儲存。" +
  "關於後端 Map 暫存 token→Key：不要把它列為最低成本首選、零風險方案或不改架構方案。這代表後端會暫存使用者 API Key，只能列為進階方案，且必須說明 Railway 重啟會失效、多實例不共享、記憶體外洩或錯誤 log 仍有風險、XSS 仍可能竊取短期 token 並在有效期內濫用。" +
  "Key 安全題的低成本第一版優先建議：CSP、防 XSS、禁止第三方 script、維持 HTML escape/Markdown sanitization、清除 Key 按鈕、公用裝置提醒、sessionStorage 或不記住 Key 選項、縮短本機保存時間。" +
  "回答本專案架構、部署或下一步時，必須依照上述現況，不要建議 /api/chat、React/Vue、LangChain 或伺服器環境變數存 API Key，除非使用者明確要求改架構。" +
  "下一步清單不要用已完成勾選符號，除非使用者明確表示那些事項已完成；已經存在的功能不要寫成重新實作，應改寫為確認、部署、測試線上網址或優化。" +
  "請使用自然但有結構的繁體中文回答，不要寫得像公文，也不要堆太多官方術語。" +
  "若問題是查證、比較、架構、部署、API、計費或決策題，請固定使用「## 先說結論」「## 我查到的重點」「## 需要注意」「## 建議你下一步」四段 Markdown 標題；先用 1～3 句話直接回答，再用條列或表格整理重點。" +
  "若有表格資訊，請使用 Markdown 表格；若有程式碼、指令或設定範例，請使用 fenced code block 並標註語言。" +
  "回答任何問題時都要遵守正確率規則：只把有來源、使用者提供內容或明確專案事實支撐的內容寫成肯定句；不確定、來源不足或可能變動的內容要明確標示為「需確認」或「根據目前資料」；不要把推測寫成事實；不要補不存在的功能、檔案、端點或設定。" +
  "若問題需要最新資訊、官方政策、價格、限制、部署能力或第三方服務狀態，必須搜尋或明確說明需要查官方來源；官方來源不足時不可下絕對結論。" +
  "Railway 支援產生公開網址、自訂網域與 HTTPS/SSL，不要說 Railway 不支援自訂網域或無 SSL。Tavily 不以 Qwen token usage 方式回傳用量；本專案以搜尋次數統計 Tavily 用量，實際額度以 Tavily 後台為準。" +
  "Qwen Flash 系列通常可透過 OpenAI-compatible API 使用；回答時不要說無法確認 qwen-flash 是否兼容，應改為提醒需用實際 API Key 測試帳號權限、地區端點與模型可用性。" +
  "本專案 /api/ask 已使用 OpenAI-compatible chat/completions 格式，不要建議改為該格式；只能建議確認 baseUrl、model、messages、Authorization header 是否正確。" +
  "Tavily 預設使用 /search 以控制成本；/research 只作為進階深度研究選項，不要列為必要下一步。" +
  "關於 Key 安全的低成本第一版，優先建議：改用 sessionStorage 或提供不記住 Key 選項、加 CSP、禁止第三方 script、強化 HTML/Markdown 防 XSS、提供清除 Key 按鈕與公用裝置提醒。" +
  "不要把『後端以記憶體或 Map 暫存使用者 API Key』說成最低成本、成本接近零、不改架構或首選方案；那會改變本專案『後端不儲存 Key』的設計，只能列為進階方案，且必須同時說明：後端會暫存使用者 Key、Railway 重啟會失效、多實例需 Redis 或 session store、token 仍可能被 XSS 在有效期內盜用。" +
  "不要使用 > 引用格式輸出提示區塊。";

const SEARCH_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  "請依據搜尋結果回答；若搜尋結果不足以回答，請誠實說明。請勿杜撰未出現在搜尋結果的事實。" +
  "搜尋結果標示為「官方來源」者可信度最高。若沒有官方來源，請避免對官方能力下絕對結論。" +
  "若來源彼此矛盾，請明確指出矛盾並以官方來源為準。" +
  "不要在回答正文中列出「來源」段落、網址或引用清單；系統會在回答下方自動顯示來源。不要使用 > 引用格式。";

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "用 Tavily 搜尋網路資料。只在需要最新資訊、事實查證、價格、新聞、即時資料或指定網站內容時使用。查 API、模型、定價或官方能力時，query 請明確加入 official docs / 官方文件。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "要搜尋的查詢字串，請用使用者原意改寫成精準關鍵字。"
        }
      },
      required: ["query"]
    }
  }
};

const OFFICIAL_DOMAINS = {
  qwen: [
    "qwen.ai",
    "docs.qwencloud.com",
    "alibabacloud.com",
    "help.aliyun.com",
    "modelstudio.alibabacloud.com"
  ],
  tavily: [
    "tavily.com",
    "docs.tavily.com"
  ],
  railway: [
    "railway.app",
    "docs.railway.com"
  ],
  openai: [
    "openai.com",
    "platform.openai.com",
    "help.openai.com"
  ],
  google: [
    "ai.google.dev",
    "cloud.google.com",
    "developers.google.com",
    "blog.google"
  ],
  deepseek: [
    "deepseek.com",
    "api-docs.deepseek.com"
  ],
  replicate: [
    "replicate.com"
  ],
  fal: [
    "fal.ai",
    "docs.fal.ai"
  ],
  stability: [
    "stability.ai",
    "platform.stability.ai"
  ],
  github: [
    "github.com"
  ],
  npm: [
    "npmjs.com"
  ],
  mdn: [
    "developer.mozilla.org"
  ]
};

function classifySearch(query) {
  const q = String(query || "").toLowerCase();
  const profiles = [];
  if (/qwen|dashscope|model studio|阿里雲|通義|千問|openai-compatible|openai compatible|相容|兼容/.test(q)) {
    profiles.push("qwen");
  }
  if (/tavily|塔维利|搜尋 api|搜索 api|search api/.test(q)) {
    profiles.push("tavily");
  }
  if (/railway|deploy|部署|node\.js|nodejs|hosting|host/.test(q)) {
    profiles.push("railway");
  }
  if (/openai|chatgpt|gpt-|gpt4|gpt-4|gpt5|gpt-5|api pricing|pricing|計費|費用|價格/.test(q)) {
    profiles.push("openai");
  }
  if (/google|gemini|ai studio|google ai|vertex/i.test(q)) profiles.push("google");
  if (/deepseek/i.test(q)) profiles.push("deepseek");
  if (/replicate/i.test(q)) profiles.push("replicate");
  if (/fal\.ai|fal ai|fal/i.test(q)) profiles.push("fal");
  if (/stability|stable diffusion|sdxl|sd3/i.test(q)) profiles.push("stability");
  if (/github|repo|repository/i.test(q)) profiles.push("github");
  if (/npm|package/i.test(q)) profiles.push("npm");
  if (/mdn|html|css|javascript|web api/i.test(q)) profiles.push("mdn");

  const domains = [...new Set(profiles.flatMap((p) => OFFICIAL_DOMAINS[p] || []))];
  const officialPreferred = domains.length > 0;
  const suffix = officialPreferred
    ? ` official documentation ${profiles.join(" ")}`
    : "";
  return {
    profiles,
    domains,
    officialPreferred,
    query: `${query}${suffix}`.trim()
  };
}

async function tavilySearchRequest(body, tavilyKey) {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tavilyKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error("Tavily 搜尋失敗");
    err.detail = data;
    err.status = resp.status;
    throw err;
  }
  return data;
}

async function smartSearch(query, tavilyKey, options = {}) {
  const maxResults = options.maxResults || 6;
  const searchDepth = options.searchDepth || "basic";
  const profile = classifySearch(query);
  const searchBodies = [];

  if (profile.officialPreferred) {
    searchBodies.push({
      query: profile.query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
      include_domains: profile.domains
    });
  }

  searchBodies.push({
    query: `${query} official documentation`,
    search_depth: searchDepth,
    max_results: maxResults,
    include_answer: true
  });
  searchBodies.push({
    query,
    search_depth: searchDepth,
    max_results: maxResults,
    include_answer: true
  });

  let answer = "";
  const allResults = [];
  for (const body of searchBodies) {
    const data = await tavilySearchRequest(body, tavilyKey);
    if (data.answer && !answer) answer = data.answer;
    if (Array.isArray(data.results)) allResults.push(...data.results);

    const uniqueCount = new Set(allResults.map((r) => r?.url).filter(Boolean)).size;
    const officialCount = allResults.filter((r) => isOfficialSource(r?.url)).length;
    if (officialCount >= 2 || uniqueCount >= maxResults) break;
  }

  const seen = new Set();
  const results = allResults
    .filter((r) => {
      if (!r || !r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .sort((a, b) => Number(isOfficialSource(b.url)) - Number(isOfficialSource(a.url)))
    .slice(0, maxResults);

  return { answer, results };
}

async function tavilySearch(query, tavilyKey, options = {}) {
  return smartSearch(query, tavilyKey, options);
}

async function tavilyExtract(urls, tavilyKey) {
  const cleanUrls = [...new Set((urls || []).filter(Boolean))].slice(0, 3);
  if (cleanUrls.length === 0) return { results: [] };

  const resp = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tavilyKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      urls: cleanUrls,
      extract_depth: "basic"
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error("Tavily 擷取網頁內容失敗");
    err.detail = data;
    err.status = resp.status;
    throw err;
  }
  return data;
}

function isOfficialSource(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return Object.values(OFFICIAL_DOMAINS)
      .flat()
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch (e) {
    return false;
  }
}

function buildSearchContext(tavilyData, extractData = null) {
  const rawResults = Array.isArray(tavilyData.results) ? tavilyData.results : [];
  const officialResults = rawResults.filter((r) => isOfficialSource(r.url));
  const thirdPartyResults = rawResults.filter((r) => !isOfficialSource(r.url));
  const results = [...officialResults, ...thirdPartyResults].slice(0, 6);
  const extractMap = new Map();
  const extractResults = Array.isArray(extractData?.results) ? extractData.results : [];
  extractResults.forEach((item) => {
    if (item?.url) extractMap.set(item.url, item.raw_content || item.content || "");
  });
  const sources = results.map((r) => ({ title: r.title, url: r.url, official: isOfficialSource(r.url) }));

  let context = "";
  if (tavilyData.answer) {
    context += `搜尋摘要（僅供參考，若與官方來源衝突請忽略）：${tavilyData.answer}\n\n`;
  }
  context += "搜尋結果（官方來源優先，第三方來源只作補充）：\n";
  results.forEach((r, i) => {
    const sourceType = isOfficialSource(r.url) ? "官方來源" : "第三方來源";
    const extracted = extractMap.get(r.url);
    const content = extracted ? `${String(extracted).slice(0, 2500)}\n（以上為 Tavily Extract 正文節錄）` : r.content;
    context += `[${i + 1}] ${sourceType}\n標題：${r.title}\n網址：${r.url}\n內容：${content}\n\n`;
  });

  return { context, sources };
}

async function extractForSearchResults(tavilyData, tavilyKey) {
  const results = Array.isArray(tavilyData.results) ? tavilyData.results : [];
  const urls = results
    .slice()
    .sort((a, b) => Number(isOfficialSource(b.url)) - Number(isOfficialSource(a.url)))
    .slice(0, 3)
    .map((r) => r.url);
  try {
    return await tavilyExtract(urls, tavilyKey);
  } catch (error) {
    return { results: [], error: error.message };
  }
}

function normalizeMessages(message, messages) {
  if (Array.isArray(messages) && messages.length > 0) {
    return messages
      .filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
  }
  return [{ role: "user", content: String(message || "") }];
}

function mergeUsage(total, usage) {
  if (!usage) return total;
  total.prompt_tokens += usage.prompt_tokens || 0;
  total.completion_tokens += usage.completion_tokens || 0;
  total.total_tokens += usage.total_tokens || 0;
  return total;
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((s) => {
    if (!s || !s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

function stripInlineSources(reply) {
  if (!reply) return reply;
  return reply
    .replace(/\n\s*來源[:：][\s\S]*$/i, "")
    .replace(/\n\s*參考來源[:：][\s\S]*$/i, "")
    .trim();
}

function validateAnswer(reply) {
  const text = String(reply || "");
  const violations = [];
  const checks = [
    [/\/api\/chat/i, "本專案端點是 /api/ask，不是 /api/chat。"],
    [/\/api\/search/i, "本專案目前不使用 /api/search；/api/ask 已處理搜尋與回答。"],
    [/\bReact\b|\bVue\b/i, "本專案前端是原生 HTML/CSS/JavaScript，不使用 React/Vue。"],
    [/LangChain|@langchain/i, "本專案直接呼叫 Tavily REST API，不使用 LangChain。"],
    [/frontend|backend|\/frontend|\/backend/i, "本專案不是 frontend/backend 分離架構，檔案位於同一層。"],
    [/\.env.+(API|Key|金鑰)|環境變數.+(API|Key|金鑰)/i, "本專案不使用 .env 或伺服器環境變數儲存 API Key。"],
    [/不支援自訂網域|無\s*SSL|沒有\s*SSL|不支援\s*SSL/i, "Railway 支援公開網址、自訂網域與 HTTPS/SSL。"],
    [/必須.*\/research|\/research.*必要|接入 Tavily `?\/research`? 端點/i, "Tavily /research 只是進階選項，預設用 /search 控成本。"],
    [/無法確認.*qwen-flash.*兼容|qwen-flash.*無法確認.*兼容/i, "不要說 qwen-flash 無法確認是否兼容；應提醒測試帳號權限、地區端點與模型可用性。"],
    [/多模態|圖片|語音/i, "目前 UI 只支援文字輸入，不要宣稱本專案支援多模態、圖片或語音。"],
    [/(Map|記憶體|快取|cache|暫存).{0,30}(Key|API Key|token).{0,40}(最低成本|首選|成本接近零|零風險|完全安全|不改架構)/i, "後端 Map/記憶體暫存 token→Key 只能列為進階方案，不能說成最低成本首選、零風險或不改架構。"],
    [/(短期 token|sessionToken|token).{0,80}(即使.*XSS.*無法|XSS.*無法.*取得|安全性提升.*無法直接取得)/i, "短期 token 仍可能被 XSS 竊取並在有效期內濫用，不能說 XSS 無法造成風險。"]
  ];

  checks.forEach(([regex, message]) => {
    if (regex.test(text)) violations.push(message);
  });

  if (/dashscope\.aliyuncs\.com\/compatible-mode\/v1/.test(text) && !/dashscope-intl\.aliyuncs\.com\/compatible-mode\/v1/.test(text)) {
    violations.push("本專案預設 Qwen Base URL 是國際端點 dashscope-intl.aliyuncs.com；中國區端點只能作為地區替代。");
  }

  const backendKeyCache =
    /(後端|伺服器|server|node)/i.test(text) &&
    /(記憶體|memory|Map|快取|cache|暫存|session\s*store|redis)/i.test(text) &&
    /(api\s*key|key|金鑰|token)/i.test(text);
  const framedAsCheapDefault =
    /(最低成本|成本接近零|成本幾乎零|幾乎零成本|零成本|不改架構|無需改架構|首選|第一版|預設方案|最划算|最省)/i.test(text);
  if (backendKeyCache && framedAsCheapDefault) {
    violations.push(
      "不要把『後端記憶體/Map 暫存使用者 Key』說成最低成本或首選；只能列為進階方案，並說明後端會暫存 Key、Railway 重啟失效、多實例需 Redis/session、token 仍可能被 XSS 盜用。"
    );
  }

  return [...new Set(violations)];
}

function isHighRiskQuestion(text) {
  return /最新|目前|現在|價格|計費|費用|官方|API|限制|規定|政策|法律|醫療|藥物|部署|帳號|權限|金鑰|Key|token|安全|付款|投資/i.test(String(text || ""));
}

function buildConfidence({ sources, violations, searchCount, userMessages }) {
  const latest = userMessages?.[userMessages.length - 1]?.content || "";
  const officialCount = (sources || []).filter((s) => s.official).length;
  const sourceCount = (sources || []).length;
  const highRisk = isHighRiskQuestion(latest);

  if (violations.length > 0) {
    return {
      level: "low",
      label: "低",
      reason: `仍發現 ${violations.length} 個風險，建議人工確認。`
    };
  }

  if (highRisk && officialCount > 0) {
    return {
      level: "high",
      label: "高",
      reason: `此問題屬於高變動或高風險資訊，已使用 ${officialCount} 個官方來源。`
    };
  }

  if (highRisk && officialCount === 0) {
    return {
      level: "low",
      label: "低",
      reason: "此問題需要官方來源或明確證據，但目前沒有官方來源。"
    };
  }

  if (sourceCount > 0) {
    return {
      level: "medium",
      label: "中",
      reason: `使用 ${sourceCount} 個來源，但官方來源不足，需視內容人工確認。`
    };
  }
  return {
    level: "medium",
    label: "中",
    reason: "未使用外部來源，主要依據使用者提供內容與專案固定事實。"
  };
}

function buildThinkingSummary({ searchMode, answerMode, steps, sources, confidence }) {
  const officialCount = (sources || []).filter((s) => s.official).length;
  const thirdPartyCount = (sources || []).filter((s) => !s.official).length;

  return {
    mode:
      answerMode === "precise"
        ? "高準確模式"
        : answerMode === "verified"
          ? "查證模式"
          : "快速模式",
    search:
      searchMode === "off"
        ? "未啟用網路查證"
        : "已啟用網路查證",
    sourceSummary:
      sources && sources.length > 0
        ? `使用 ${sources.length} 個來源，其中官方來源 ${officialCount} 個、第三方來源 ${thirdPartyCount} 個。`
        : "未使用外部來源。",
    confidence: confidence?.label || "中",
    steps: (steps || []).slice(0, 5)
  };
}

function getProjectFactAnswer(userMessages) {
  const latest = userMessages?.[userMessages.length - 1]?.content || "";
  const mentionsThisProject = /這個專案|本專案|目前專案|這專案|專案/i.test(latest);
  if (!mentionsThisProject) return null;

  if (/後端.*端點|端點.*後端|API.*端點|endpoint/i.test(latest)) {
    return {
      reply: `本專案後端端點是 \`${PROJECT_FACTS.endpoint}\`。`,
      fact: "backend_endpoint"
    };
  }

  if (/React|Vue|框架|前端框架/i.test(latest)) {
    return {
      reply: "沒有，前端是原生 HTML / CSS / JavaScript。",
      fact: "frontend_stack"
    };
  }

  if (/Qwen|Tavily|Railway/i.test(latest) && /各自|負責|角色|做什麼|用途|分工/i.test(latest)) {
    return {
      reply:
        "結論：在本專案中，Qwen 負責核心文字理解、整理與回答；Tavily 負責即時網路搜尋與外部資料補充；Railway 負責部署這個 Node.js + 前端專案並提供線上網址。\n\n" +
        `依據：前端透過 \`${PROJECT_FACTS.endpoint}\` 呼叫 Express 後端；後端依需求把對話送到 Qwen，若需要查資料則呼叫 Tavily REST API 的 \`${PROJECT_FACTS.tavilyMode}\`；整個專案部署目標是 ${PROJECT_FACTS.deployment}。\n\n` +
        "風險：Qwen 模型可用性仍需用實際 API Key 測試帳號權限、地區端點與模型是否開通；Tavily 實際額度以官方後台為準；API Key 存在瀏覽器 localStorage，需注意 XSS 與公用裝置風險。\n\n" +
        "建議下一步：部署後測試線上網址是否能正常呼叫 Qwen；開啟查證或高準確模式測試 Tavily 來源顯示；確認設定視窗的清除 Key 功能與用量面板都能正常使用。",
      fact: "service_roles"
    };
  }

  if (/(API\s*Key|Key|金鑰).*(\.env|環境變數|存在|儲存|存在哪|放哪|保存)|(\.env|環境變數).*(API\s*Key|Key|金鑰)/i.test(latest)) {
    return {
      reply: "不是存在 .env。API Key 由使用者在前端設定視窗輸入，存在瀏覽器 localStorage；後端只代理轉發，不落地儲存。",
      fact: "key_storage"
    };
  }

  return null;
}

function projectFactResponse(factAnswer) {
  return {
    reply: factAnswer.reply,
    sources: [],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    searchCount: 0,
    searchMode: "off",
    steps: [
      `Project facts：命中 ${factAnswer.fact}`,
      "直接使用本專案固定事實回答，未呼叫模型或搜尋"
    ],
    confidence: {
      level: "high",
      label: "高",
      reason: "此問題可由本專案固定事實直接確認。"
    }
  };
}

function shouldRefuseOrDefer({ sources, searchMode, userMessages, violations }) {
  const latest = userMessages?.[userMessages.length - 1]?.content || "";
  const highRisk = isHighRiskQuestion(latest);
  const hasSources = Array.isArray(sources) && sources.length > 0;
  const hasOfficial = hasSources && sources.some((s) => s.official);

  if (violations && violations.length > 0) {
    return {
      defer: true,
      reason: `仍有 ${violations.length} 個驗證風險。`
    };
  }

  if (highRisk && searchMode === "off") {
    return {
      defer: true,
      reason: "這題屬於高風險或高變動資訊，但目前未開啟查證模式。"
    };
  }

  if (highRisk && searchMode !== "off" && !hasOfficial) {
    return {
      defer: true,
      reason: "這題需要官方來源或明確證據，但目前沒有取得官方來源。"
    };
  }

  return {
    defer: false,
    reason: ""
  };
}

async function callQwen({ baseUrl, qwenKey, model, messages, tools, toolChoice, temperature = 0.2 }) {
  const body = {
    model,
    messages,
    temperature
  };
  if (tools) body.tools = tools;
  if (toolChoice && tools) body.tool_choice = toolChoice;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${qwenKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error("Qwen API 呼叫失敗");
    err.detail = data;
    err.status = resp.status;
    throw err;
  }
  return data;
}

function safeJsonParse(text) {
  try {
    const cleaned = String(text || "")
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

function fallbackPlan(userMessages, searchMode) {
  const latest = userMessages[userMessages.length - 1]?.content || "";
  const route = classifySearch(latest);
  const needsSearch =
    searchMode === "force" ||
    (searchMode === "auto" && (
      route.officialPreferred ||
      /最新|目前|現在|官方|價格|計費|費用|限制|部署|支援|是否|查詢|比較|研究|規定|政策|版本|模型|API|文件|docs|documentation|安全|風險|金鑰|Key|token|SSL|網域|權限/i.test(latest)
    ));
  const queries = route.profiles.length
    ? route.profiles.map((p) => {
        if (p === "qwen") return `Qwen OpenAI-compatible API official documentation ${latest}`;
        if (p === "tavily") return `Tavily API search official documentation ${latest}`;
        if (p === "railway") return `Railway Node.js Express deploy official documentation ${latest}`;
        if (p === "openai") return `OpenAI API pricing official documentation ${latest}`;
        return latest;
      })
    : [latest];

  return {
    taskType: route.profiles[0] || "general",
    needsSearch,
    queries: queries.slice(0, 3),
    answerFormat: /架構|部署|api|比較|風險|建議/i.test(latest) ? "conclusion_basis_risks_next_steps" : "natural",
    mustUseProjectFacts: /本專案|這個|目前|部署|架構|key|api|railway|tavily|qwen/i.test(latest)
  };
}

async function createAgentPlan({ userMessages, qwenKey, model, baseUrl, searchMode }) {
  const fallback = fallbackPlan(userMessages, searchMode);
  if (searchMode === "off") return fallback;

  const latest = userMessages[userMessages.length - 1]?.content || "";
  const plannerPrompt =
    "請只輸出 JSON，不要 Markdown。你是低成本 agent 的 Planner。\n" +
    "根據使用者問題決定 taskType、是否需要搜尋、最多 3 個搜尋 query、回答格式，以及是否必須使用本專案事實。\n" +
    "taskType 只能是 project、official_qwen、official_tavily、official_railway、official_openai、general_write、coding、research、unknown。\n" +
    "若問題涉及官方 API、部署、價格、限制、最新資訊或第三方服務狀態，needsSearch 應為 true。\n" +
    "若問題涉及 API 能力、模型是否支援、圖片生成、價格或限制，queries 必須從不同角度產生，例如：official docs、models documentation、pricing/limits、specific feature availability。\n" +
    "query 請用英文關鍵字搭配 official docs，以提高官方文件命中率；不要只重複使用者原句。\n" +
    "本專案事實：\n" + projectFactsText() + "\n\n" +
    "輸出格式：{\"taskType\":\"...\",\"needsSearch\":true,\"queries\":[\"...\"],\"answerFormat\":\"conclusion_basis_risks_next_steps|natural\",\"mustUseProjectFacts\":true}\n\n" +
    `使用者問題：${latest}`;

  try {
    const planned = await callQwen({
      baseUrl,
      qwenKey,
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: plannerPrompt }
      ],
      temperature: 0.1
    });
    const json = safeJsonParse(planned.choices?.[0]?.message?.content);
    if (!json) return { ...fallback, usage: planned.usage || null };
    return {
      taskType: json.taskType || fallback.taskType,
      needsSearch: Boolean(json.needsSearch),
      queries: Array.isArray(json.queries) && json.queries.length > 0 ? json.queries.slice(0, 3) : fallback.queries,
      answerFormat: json.answerFormat || fallback.answerFormat,
      mustUseProjectFacts: Boolean(json.mustUseProjectFacts),
      usage: planned.usage || null
    };
  } catch (e) {
    return fallback;
  }
}

async function executePlannedSearch({ plan, userMessages, qwenKey, tavilyKey, model, baseUrl, aggregateUsage, steps }) {
  const contexts = [];
  const allSources = [];
  let searchCount = 0;

  for (const query of plan.queries.slice(0, 3)) {
    steps.push(`Tavily 搜尋：${query}`);
    const data = await tavilySearch(query, tavilyKey);
    const extractData = await extractForSearchResults(data, tavilyKey);
    const built = buildSearchContext(data, extractData);
    contexts.push(`查詢：${query}\n${built.context}`);
    allSources.push(...built.sources);
    searchCount += 1;
    steps.push(`取得 ${built.sources.length} 個來源，優先保留官方來源`);
  }

  const latest = userMessages[userMessages.length - 1]?.content || "";
  const finalPrompt =
    "請根據以下搜尋證據與本專案事實回答。不要在正文列出來源網址，系統會在下方顯示來源。\n" +
    "若資料不足，請明確說明不足處。若回答架構/API/部署/決策題，使用「結論、依據、風險、建議下一步」格式。\n\n" +
    `Planner：${JSON.stringify({
      taskType: plan.taskType,
      answerFormat: plan.answerFormat,
      mustUseProjectFacts: plan.mustUseProjectFacts
    })}\n\n` +
    `本專案事實：\n${projectFactsText()}\n\n` +
    `搜尋證據：\n${contexts.join("\n---\n")}\n\n` +
    `使用者問題：${latest}`;

  const final = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages: [
      { role: "system", content: SEARCH_SYSTEM_PROMPT },
      ...userMessages.slice(0, -1),
      { role: "user", content: finalPrompt }
    ],
    temperature: 0.1
  });
  mergeUsage(aggregateUsage, final.usage);
  steps.push("Writer：Qwen 根據計畫與搜尋證據產生回答");

  return {
    reply: stripInlineSources(final.choices?.[0]?.message?.content || "Qwen 沒有回傳內容。"),
    sources: dedupeSources(allSources),
    searchCount
  };
}

function shouldSelfCheck({ searchMode, userMessages, answerMode }) {
  const latest = userMessages?.[userMessages.length - 1]?.content || "";
  if (answerMode === "fast") {
    return searchMode !== "off" || isHighRiskQuestion(latest);
  }
  return true;
}

function answerTemperature({ searchMode, answerMode, latest, taskType }) {
  const creative =
    taskType === "general_write" ||
    /文案|創作|故事|貼文|廣告|標語|slogan|命名|社群|行銷|企劃|改寫|潤飾|copy/i.test(String(latest || ""));

  if (searchMode !== "off" || answerMode === "precise" || isHighRiskQuestion(latest)) return 0.1;
  if (creative) return 0.7;
  return 0.2;
}

function sourceSummary(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "無來源。";
  return sources
    .slice(0, 6)
    .map((s, i) => `${i + 1}. ${s.official ? "官方" : "第三方"}：${s.title || "未命名"} — ${s.url}`)
    .join("\n");
}

async function selfCheckAnswer({ reply, sources, userMessages, qwenKey, model, baseUrl }) {
  const latest = userMessages[userMessages.length - 1]?.content || "";
  const checkPrompt =
    "請做最終自我檢查並直接輸出修正版回答，不要輸出檢查過程。\n" +
    "檢查規則：\n" +
    "1. 結論必須被來源或本專案現況支撐；沒有支撐就改成保守說法。\n" +
    "2. 不要把第三方來源當官方結論；官方與第三方衝突時以官方為準。\n" +
    "3. 本專案固定使用 /api/ask，不是 /api/chat。\n" +
    "4. 本專案不用 React/Vue、不用 LangChain、不用 .env 存 API Key。\n" +
    "5. Key 流程是前端 localStorage 保存，每次請求傳給 Express 代理，後端只轉發不儲存。\n" +
    "6. 若是架構/部署/API 題，使用「結論、依據、風險、建議下一步」格式。\n" +
    "7. Railway 支援公開網址、自訂網域與 HTTPS/SSL，不要寫成不支援或無 SSL。\n" +
    "8. Tavily 用量不要寫成 Qwen token usage；本專案以搜尋次數估算，實際額度以 Tavily 後台為準。\n" +
    "9. 不確定、來源不足或可能變動的內容請改成保守說法，不要下絕對結論。\n" +
    "10. 不要說 qwen-flash 無法確認是否兼容；應改為提醒測試帳號權限、地區端點與模型可用性。\n" +
    "11. 不要建議把 /api/ask 改成 OpenAI-compatible 格式，因為目前已是該格式；只能建議確認 baseUrl、model、messages、Authorization header。\n" +
    "12. 不要把 Tavily /research 列為必要下一步；/research 僅是進階選項，預設用 /search 控成本。\n" +
    "13. 不要把『後端記憶體或 Map 暫存 token→Key』說成最低成本首選、成本接近零、零風險、不改架構或完全安全；只能列為進階方案，並說明後端會暫存使用者 API Key、Railway 重啟失效、多實例不共享或需 Redis/session store、記憶體外洩/log/debug dump 風險、token 仍可能被 XSS 盜用並在有效期內濫用。Key 安全低成本第一版優先 CSP、防 XSS、禁止第三方 script、清除 Key、公用裝置提醒、sessionStorage/不記住 Key、縮短本機保存時間。\n" +
    "14. 不要在正文列出來源段落或網址；系統會在下方顯示來源。\n\n" +
    `使用者問題：\n${latest}\n\n` +
    `目前來源：\n${sourceSummary(sources)}\n\n` +
    `待檢查回答：\n${reply}`;

  const checked = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: checkPrompt }
    ],
    toolChoice: "none",
    temperature: 0.1
  });

  return {
    reply: stripInlineSources(checked.choices?.[0]?.message?.content || reply),
    usage: checked.usage || null
  };
}

async function repairAnswer({ reply, violations, sources, userMessages, qwenKey, model, baseUrl }) {
  const latest = userMessages[userMessages.length - 1]?.content || "";
  const repairPrompt =
    "請根據以下硬性違規項，直接輸出修正版回答。不要解釋你做了哪些修改。\n" +
    "若主題涉及 API Key 安全，必須分成「低成本第一版」與「進階方案」；低成本第一版優先 CSP、防 XSS、sessionStorage/不記住 Key、清除 Key、公用裝置提醒；後端 Map 暫存 token→Key 只能列為進階方案並說明風險。\n" +
    "硬性違規項：\n" +
    violations.map((v, i) => `${i + 1}. ${v}`).join("\n") +
    "\n\n本專案事實：\n" +
    projectFactsText() +
    "\n\n使用者問題：\n" +
    latest +
    "\n\n可用來源：\n" +
    sourceSummary(sources) +
    "\n\n原回答：\n" +
    reply;

  const repaired = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: repairPrompt }
    ],
    temperature: 0.1
  });

  return {
    reply: stripInlineSources(repaired.choices?.[0]?.message?.content || reply),
    usage: repaired.usage || null
  };
}

async function runForceSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl }) {
  const latestUser = [...userMessages].reverse().find((m) => m.role === "user")?.content || "";
  const route = classifySearch(latestUser);
  const steps = [
    `Router 分類：${route.profiles.length ? route.profiles.join(", ") : "general"}`,
    route.officialPreferred ? `優先官方來源：${route.domains.join(", ")}` : "未限定官方來源",
    "強制搜尋模式：先使用 Tavily 查資料",
    "將搜尋結果交給 Qwen 整理回答"
  ];
  const tavilyData = await tavilySearch(latestUser, tavilyKey);
  const extractData = await extractForSearchResults(tavilyData, tavilyKey);
  const built = buildSearchContext(tavilyData, extractData);
  const qwenData = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages: [
      { role: "system", content: SEARCH_SYSTEM_PROMPT },
      ...userMessages.slice(0, -1),
      { role: "user", content: `${built.context}\n---\n使用者問題：${latestUser}` }
    ],
    temperature: 0.1
  });

  return {
      reply: stripInlineSources(qwenData.choices?.[0]?.message?.content || "Qwen 沒有回傳內容。"),
    sources: built.sources,
    usage: qwenData.usage || null,
    searchCount: 1,
    steps
  };
}

async function runAgentSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl, searchMode, answerMode }) {
  const aggregateUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const sources = [];
  const steps = [];
  let searchCount = 0;
  const latestUser = [...userMessages].reverse().find((m) => m.role === "user")?.content || "";
  const route = classifySearch(latestUser);
  let plannedTaskType = route.profiles[0] || "general";

  if (searchMode === "force") {
    const result = await runForceSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl });
    mergeUsage(aggregateUsage, result.usage);
    return { ...result, usage: aggregateUsage };
  }

  if (searchMode === "auto") {
    const plan = await createAgentPlan({ userMessages, qwenKey, model, baseUrl, searchMode });
    plannedTaskType = plan.taskType || plannedTaskType;
    mergeUsage(aggregateUsage, plan.usage);
    steps.push(`Planner JSON：taskType=${plan.taskType}, needsSearch=${plan.needsSearch ? "yes" : "no"}`);
    if (Array.isArray(plan.queries) && plan.queries.length > 0) {
      steps.push(`Planner queries：${plan.queries.join(" | ")}`);
    }

    if (plan.needsSearch) {
      const planned = await executePlannedSearch({
        plan,
        userMessages,
        qwenKey,
        tavilyKey,
        model,
        baseUrl,
        aggregateUsage,
        steps
      });
      return {
        reply: planned.reply,
        sources: planned.sources,
        usage: aggregateUsage,
        searchCount: planned.searchCount,
        steps
      };
    }
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];
  steps.push(`Router 分類：${route.profiles.length ? route.profiles.join(", ") : "general"}`);
  steps.push(route.officialPreferred ? `優先官方來源：${route.domains.join(", ")}` : "未限定官方來源");
  steps.push(searchMode === "auto" ? "自動模式：Qwen 判斷是否需要搜尋" : "關閉搜尋：直接由 Qwen 回答");
  const first = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages,
    tools: searchMode === "auto" ? [WEB_SEARCH_TOOL] : undefined,
    toolChoice: searchMode === "auto" ? "auto" : undefined,
    temperature: searchMode === "auto" ? 0.1 : answerTemperature({
      searchMode,
      answerMode,
      latest: latestUser,
      taskType: plannedTaskType
    })
  });
  mergeUsage(aggregateUsage, first.usage);

  let assistantMessage = first.choices?.[0]?.message;
  let toolCalls = assistantMessage?.tool_calls || [];

  if (searchMode !== "auto" || toolCalls.length === 0) {
    if (searchMode === "auto") steps.push("判斷結果：不需要搜尋，直接回答");
    return {
      reply: stripInlineSources(assistantMessage?.content || "Qwen 沒有回傳內容。"),
      sources: [],
      usage: aggregateUsage,
      searchCount,
      steps
    };
  }

  steps.push(`判斷結果：需要搜尋（${toolCalls.length} 個查詢）`);
  messages.push(assistantMessage);

  for (let round = 0; round < 2 && toolCalls.length > 0; round += 1) {
    for (const call of toolCalls) {
      if (call.function?.name !== "web_search") continue;
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch (e) {
        args = {};
      }
      const query = args.query || userMessages[userMessages.length - 1]?.content || "";
      steps.push(`Tavily 搜尋：${query}`);
      const tavilyData = await tavilySearch(query, tavilyKey);
      const extractData = await extractForSearchResults(tavilyData, tavilyKey);
      const built = buildSearchContext(tavilyData, extractData);
      sources.push(...built.sources);
      searchCount += 1;
      steps.push(`取得 ${built.sources.length} 個來源，優先保留官方來源`);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: built.context
      });
    }

    const next = await callQwen({
      baseUrl,
      qwenKey,
      model,
      messages,
      tools: [WEB_SEARCH_TOOL],
      toolChoice: "auto",
      temperature: 0.1
    });
    mergeUsage(aggregateUsage, next.usage);
    assistantMessage = next.choices?.[0]?.message;
    toolCalls = assistantMessage?.tool_calls || [];

    if (toolCalls.length === 0) {
      steps.push("Qwen 根據搜尋結果整理最終回答");
      return {
        reply: stripInlineSources(assistantMessage?.content || "Qwen 沒有回傳內容。"),
        sources: dedupeSources(sources),
        usage: aggregateUsage,
        searchCount,
        steps
      };
    }
    steps.push(`需要補充搜尋（第 ${round + 2} 輪）`);
    messages.push(assistantMessage);
  }

  steps.push("已達工具呼叫上限，停止繼續搜尋");
  messages.push({
    role: "user",
    content:
      "請停止呼叫工具，根據目前已取得的搜尋結果，直接產生最終回答。若資料不足，請明確說明不足之處。"
  });
  const finalWithoutTools = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages,
    toolChoice: "none",
    temperature: 0.1
  });
  mergeUsage(aggregateUsage, finalWithoutTools.usage);
  const finalMessage = finalWithoutTools.choices?.[0]?.message;
  steps.push("Qwen 根據目前來源整理最終回答");

  return {
    reply: stripInlineSources(finalMessage?.content || "已完成搜尋，但 Qwen 沒有回傳最終內容。"),
    sources: dedupeSources(sources),
    usage: aggregateUsage,
    searchCount,
    steps
  };
}

app.post("/api/plan", async (req, res) => {
  try {
    const { goal } = req.body || {};
    if (!String(goal || "").trim()) {
      return res.status(400).json({ error: "缺少工作目標。" });
    }
    if (isSensitiveWorkRequest(goal)) {
      return res.status(400).json({
        error: "這個工作目標涉及讀取敏感檔案或憑證資訊，工作 Agent 第一版不允許規劃此類操作。"
      });
    }

    const files = await listProjectFiles();
    const plan = buildWorkPlan(goal, files);
    res.json({
      plan,
      availableTools: WORK_TOOLS,
      files: files.slice(0, 80)
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "產生任務計畫失敗。" });
  }
});

app.post("/api/execute", async (req, res) => {
  try {
    const { goal, plan, qwenKey, model, baseUrl } = req.body || {};
    const workGoal = String(goal || plan?.goal || "").trim();
    if (!workGoal) return res.status(400).json({ error: "缺少工作目標。" });

    const usedModel = model || "qwen-flash";
    const usedBaseUrl = baseUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    const files = await listProjectFiles();
    const readSteps = Array.isArray(plan?.steps)
      ? plan.steps.filter((step) => step.tool === "read_file" && step.path)
      : [];
    const targetFiles = readSteps.length > 0
      ? [...new Set(readSteps.map((step) => step.path))]
      : pickRelevantFiles(workGoal, files);

    const readFiles = [];
    for (const file of targetFiles.slice(0, 6)) {
      readFiles.push(await readProjectFile(file));
    }

    const proposal = await proposeProjectPatches({
      goal: workGoal,
      files: readFiles,
      qwenKey,
      model: usedModel,
      baseUrl: usedBaseUrl
    });

    const patches = [];
    for (const item of proposal.patches.slice(0, 4)) {
      const safe = normalizeProjectRelativePath(item.path);
      const original = readFiles.find((file) => file.path === safe.relative) || await readProjectFile(safe.relative);
      if (!Array.isArray(item.replacements) || item.replacements.length === 0) continue;
      const content = applyReplacements(original.content, item.replacements);
      if (!content || content === original.content) continue;

      const diff = createUnifiedDiff(safe.relative, original.content, content);
      if (!diff) continue;
      if (countChangedLines(diff) > 80) {
        proposal.notes.push(`${safe.relative} 的建議修改過大，已略過；請要求 Agent 拆成更小的局部修改。`);
        continue;
      }

      const token = crypto.randomBytes(18).toString("hex");
      pendingWrites.set(token, {
        path: safe.relative,
        content,
        diff,
        reason: String(item.reason || ""),
        baseHash: sha256(original.content),
        targetHash: sha256(content),
        createdAt: Date.now()
      });

      patches.push({
        path: safe.relative,
        reason: String(item.reason || "套用 AI 建議修改。"),
        diff,
        confirmationToken: token,
        expiresInSeconds: Math.floor(WRITE_TOKEN_TTL_MS / 1000)
      });
    }

    cleanupPendingWrites();
    res.json({
      goal: workGoal,
      steps: [
        "list_files：已列出本專案可操作檔案",
        ...readFiles.map((file) => `read_file：已讀取 ${file.path}`),
        "propose_patch：已產生修改建議與 diff，尚未寫入"
      ],
      readFiles: readFiles.map((file) => ({
        path: file.path,
        size: file.content.length
      })),
      summary: proposal.summary,
      notes: proposal.notes,
      patches
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "執行工作計畫失敗。" });
  }
});

app.post("/api/confirm-write", async (req, res) => {
  try {
    const { confirmationToken } = req.body || {};
    cleanupPendingWrites();

    const token = String(confirmationToken || "");
    const pending = pendingWrites.get(token);
    if (!pending) {
      return res.status(403).json({ error: "確認 token 無效或已過期，請重新產生 diff。" });
    }

    const safe = normalizeProjectRelativePath(pending.path);
    const beforeContent = await fsp.readFile(safe.absolute, "utf8");
    const beforeHash = sha256(beforeContent);
    if (beforeHash !== pending.baseHash) {
      pendingWrites.delete(token);
      return res.status(409).json({
        error: `檔案 ${safe.relative} 在產生 diff 後已變更，為避免覆蓋新內容，請重新產生計畫與 diff。`
      });
    }

    await fsp.writeFile(safe.absolute, pending.content, "utf8");
    const now = new Date();
    await fsp.utimes(safe.absolute, now, now);

    const writtenContent = await fsp.readFile(safe.absolute, "utf8");
    const writtenHash = sha256(writtenContent);
    if (writtenHash !== pending.targetHash) {
      throw new Error(`寫入 ${safe.relative} 後驗證失敗，檔案內容未符合預期。`);
    }
    const stat = await fsp.stat(safe.absolute);
    pendingWrites.delete(token);

    res.json({
      ok: true,
      path: safe.relative,
      absolutePath: safe.absolute,
      projectRoot: PROJECT_ROOT,
      message: `已寫入 ${safe.relative}。`,
      verified: true,
      beforeHash,
      writtenHash,
      lastWriteTime: stat.mtime.toISOString(),
      bytes: Buffer.byteLength(writtenContent, "utf8"),
      diff: pending.diff
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "確認寫入失敗。" });
  }
});

app.get("/api/runtime", (req, res) => {
  res.json({
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV || "",
    platform: process.platform,
    pid: process.pid,
    localOnlyNotice: "工作 Agent 寫入檔案只會修改此後端所在機器的專案資料夾。若使用 Railway 或遠端網址，不會修改你桌面的本機檔案。"
  });
});

app.post("/api/ask", async (req, res) => {
  try {
    const { message, messages, searchMode, answerMode, useSearch, qwenKey, tavilyKey, model, baseUrl } = req.body || {};
    const normalizedMessages = normalizeMessages(message, messages);

    if (normalizedMessages.length === 0 || !normalizedMessages.some((m) => m.role === "user" && m.content.trim())) {
      return res.status(400).json({ error: "缺少 message" });
    }

    const factAnswer = getProjectFactAnswer(normalizedMessages);
    if (factAnswer) {
      return res.json(projectFactResponse(factAnswer));
    }

    if (!qwenKey) {
      return res.status(400).json({ error: "缺少 Qwen API Key，請在設定中填入。" });
    }

    const usedModel = model || "qwen-flash";
    const usedBaseUrl = baseUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    const usedAnswerMode = ["fast", "verified", "precise"].includes(answerMode) ? answerMode : "verified";
    const reviewModel = usedAnswerMode === "precise" ? "qwen-plus" : usedModel;
    let usedSearchMode = searchMode || (useSearch ? "force" : "off");
    const latestQuestion = normalizedMessages[normalizedMessages.length - 1]?.content || "";

    if (usedAnswerMode === "precise" && isHighRiskQuestion(latestQuestion) && !tavilyKey) {
      return res.status(400).json({
        error: "高準確模式處理高風險問題需要 Tavily API Key，請先填入 Tavily Key 或改用快速模式。"
      });
    }

    if (usedAnswerMode === "precise" && usedSearchMode === "off" && tavilyKey && isHighRiskQuestion(latestQuestion)) {
      usedSearchMode = "auto";
    }

    if (usedSearchMode !== "off") {
      if (!tavilyKey) {
        return res.status(400).json({ error: "已開啟聯網搜尋，但缺少 Tavily API Key。" });
      }
    }

    const result = await runAgentSearch({
      userMessages: normalizedMessages,
      qwenKey,
      tavilyKey,
      model: usedModel,
      baseUrl: usedBaseUrl,
      searchMode: usedSearchMode,
      answerMode: usedAnswerMode
    });

    if (shouldSelfCheck({ searchMode: usedSearchMode, userMessages: normalizedMessages, answerMode: usedAnswerMode })) {
      result.steps = [...(result.steps || []), "執行最終自我檢查，修正來源與專案事實"];
      const checked = await selfCheckAnswer({
        reply: result.reply,
        sources: result.sources,
        userMessages: normalizedMessages,
        qwenKey,
        model: reviewModel,
        baseUrl: usedBaseUrl
      });
      result.reply = checked.reply;
      mergeUsage(result.usage, checked.usage);
    }

    const violations = validateAnswer(result.reply);
    if (violations.length > 0) {
      result.steps = [...(result.steps || []), `程式驗證發現 ${violations.length} 個事實風險，已要求重寫`];
      const repaired = await repairAnswer({
        reply: result.reply,
        violations,
        sources: result.sources,
        userMessages: normalizedMessages,
        qwenKey,
        model: usedModel,
        baseUrl: usedBaseUrl
      });
      result.reply = repaired.reply;
      mergeUsage(result.usage, repaired.usage);
    }

    const finalViolations = validateAnswer(result.reply);
    const deferCheck = usedAnswerMode === "fast" && !isHighRiskQuestion(latestQuestion)
      ? { defer: false, reason: "" }
      : shouldRefuseOrDefer({
      sources: result.sources,
      searchMode: usedSearchMode,
      userMessages: normalizedMessages,
      violations: finalViolations
    });
    if (deferCheck.defer) {
      result.reply =
        `這題我不能下 100% 結論。\n\n原因：${deferCheck.reason}\n\n建議：請開啟查證模式、提供官方資料，或改用高準確模式後再判斷。`;
      result.steps = [...(result.steps || []), `Defer：${deferCheck.reason}`];
    }

    const confidence = buildConfidence({
      sources: result.sources,
      violations: finalViolations,
      searchCount: result.searchCount || 0,
      userMessages: normalizedMessages
    });
    result.steps = [
      ...(result.steps || []),
      finalViolations.length > 0
        ? `Validator：仍有 ${finalViolations.length} 個風險，可信度 ${confidence.label}`
        : `Validator：未發現硬性違規，可信度 ${confidence.label}`
    ];

    res.json({
      reply: result.reply,
      sources: result.sources,
      usage: result.usage,
      searchCount: result.searchCount || 0,
      searchMode: usedSearchMode,
      answerMode: usedAnswerMode,
      steps: result.steps || [],
      confidence,
      thinkingSummary: buildThinkingSummary({
        searchMode: usedSearchMode,
        answerMode: usedAnswerMode,
        steps: result.steps || [],
        sources: result.sources || [],
        confidence
      })
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(error.status || 500).json({
      error: error.message || "伺服器錯誤",
      detail: error.detail
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Qwen AI 助理已啟動：http://localhost:${PORT}`);
});
