const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

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

const SYSTEM_PROMPT =
  "你是一位繁體中文低成本 Agent 助理。請用清楚、實用、可直接複製的方式回答。" +
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
  "若問題是比較、架構、部署、API 能力或決策建議，請固定使用「結論、依據、風險、建議下一步」四段格式；每個結論必須能被搜尋結果或本專案現況支撐。" +
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

async function tavilySearch(query, tavilyKey) {
  const profile = classifySearch(query);
  const searchBody = {
    query: profile.query,
    search_depth: "basic",
    max_results: 3,
    include_answer: true
  };

  if (profile.officialPreferred) {
    searchBody.include_domains = profile.domains;
  }

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tavilyKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(searchBody)
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error("Tavily 搜尋失敗");
    err.detail = data;
    err.status = resp.status;
    throw err;
  }
  if (profile.officialPreferred && (!Array.isArray(data.results) || data.results.length === 0)) {
    return tavilySearchWithoutDomainLimit(query, tavilyKey);
  }
  return data;
}

async function tavilySearchWithoutDomainLimit(query, tavilyKey) {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tavilyKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `${query} official documentation`,
      search_depth: "basic",
      max_results: 3,
      include_answer: true
    })
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

function buildSearchContext(tavilyData) {
  let results = (Array.isArray(tavilyData.results) ? tavilyData.results : []).sort((a, b) => {
    return Number(isOfficialSource(b.url)) - Number(isOfficialSource(a.url));
  });
  const officialResults = results.filter((r) => isOfficialSource(r.url));
  if (officialResults.length > 0) {
    results = officialResults;
  }
  const sources = results.map((r) => ({ title: r.title, url: r.url, official: isOfficialSource(r.url) }));

  let context = "";
  if (tavilyData.answer) {
    context += `搜尋摘要（僅供參考，若與官方來源衝突請忽略）：${tavilyData.answer}\n\n`;
  }
  context += "搜尋結果（若已篩選到官方來源，下列內容只包含官方來源）：\n";
  results.forEach((r, i) => {
    const sourceType = isOfficialSource(r.url) ? "官方來源" : "第三方來源";
    context += `[${i + 1}] ${sourceType}\n標題：${r.title}\n網址：${r.url}\n內容：${r.content}\n\n`;
  });

  return { context, sources };
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
    "taskType 只能是 project、official_qwen、official_tavily、official_railway、general_write、coding、research、unknown。\n" +
    "若問題涉及官方 API、部署、價格、限制、最新資訊或第三方服務狀態，needsSearch 應為 true。\n" +
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
    const built = buildSearchContext(data);
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
  const built = buildSearchContext(tavilyData);
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
      const built = buildSearchContext(tavilyData);
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
      confidence
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
