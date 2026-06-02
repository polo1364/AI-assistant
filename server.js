const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT =
  "你是一位繁體中文低成本 Agent 助理。請用清楚、實用、可直接複製的方式回答。" +
  "優先簡潔回答，避免不必要的冗長內容，以節省 token。" +
  "只有當問題需要最新資訊、查證事實、價格、新聞、即時資料或指定網頁資訊時，才使用 web_search 工具。" +
  "涉及官方 API、模型、定價、文件、部署或產品能力時，必須優先使用官方文件；官方來源與第三方來源衝突時，以官方來源為準。" +
  "本專案現況：前端是原生 HTML/CSS/JavaScript，不使用 React/Vue；後端是 Node.js + Express 的代理 server.js；部署目標是 Railway；前端呼叫的後端端點是 /api/ask，不是 /api/chat；Qwen/Tavily Key 由使用者在前端 modal 自填並存在 localStorage；每次請求會把 Key 傳給自己的 Express 代理後端，由後端呼叫 Qwen/Tavily；伺服器只轉發使用，不落地儲存 Key，也不需要 .env 放 API Key；Tavily 直接用 REST API，不使用 LangChain。" +
  "本專案檔案位於同一層，不是 frontend/backend 分離架構；index.html、style.css、script.js、server.js、package.json 都在同一個專案資料夾。Railway 部署時應直接部署含 package.json 的資料夾；若 GitHub repo 外層還有資料夾，才把 Root Directory 設為 qwen-ai-assistant，不要建議 /frontend 或 /backend。" +
  "目前 UI 是文字聊天介面，不支援圖片、語音或多模態輸入，不要宣稱本專案支援多模態。現在模型選項為 qwen-flash、qwen3.5-flash、qwen-plus、qwen3-max；預設低成本建議是 qwen-flash，需要更強再切換。" +
  "回答本專案架構、部署或下一步時，必須依照上述現況，不要建議 /api/chat、React/Vue、LangChain 或伺服器環境變數存 API Key，除非使用者明確要求改架構。" +
  "下一步清單不要用已完成勾選符號，除非使用者明確表示那些事項已完成；已經存在的功能不要寫成重新實作，應改寫為確認、部署、測試線上網址或優化。" +
  "若問題是比較、架構、部署、API 能力或決策建議，請固定使用「結論、依據、風險、建議下一步」四段格式；每個結論必須能被搜尋結果或本專案現況支撐。" +
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

async function callQwen({ baseUrl, qwenKey, model, messages, tools, toolChoice }) {
  const body = {
    model,
    messages,
    temperature: 0.5
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

function shouldSelfCheck({ searchMode, sources, userMessages }) {
  if (searchMode !== "off" && Array.isArray(sources) && sources.length > 0) return true;
  const latest = userMessages[userMessages.length - 1]?.content || "";
  return /架構|部署|api|official|官方|railway|tavily|qwen|openai|compatible|相容|兼容/i.test(latest);
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
    "7. 不要在正文列出來源段落或網址；系統會在下方顯示來源。\n\n" +
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
    toolChoice: "none"
  });

  return {
    reply: stripInlineSources(checked.choices?.[0]?.message?.content || reply),
    usage: checked.usage || null
  };
}

async function runForceSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl }) {
  const steps = [
    "強制搜尋模式：先使用 Tavily 查資料",
    "將搜尋結果交給 Qwen 整理回答"
  ];
  const latestUser = [...userMessages].reverse().find((m) => m.role === "user")?.content || "";
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
    ]
  });

  return {
      reply: stripInlineSources(qwenData.choices?.[0]?.message?.content || "Qwen 沒有回傳內容。"),
    sources: built.sources,
    usage: qwenData.usage || null,
    searchCount: 1,
    steps
  };
}

async function runAgentSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl, searchMode }) {
  const aggregateUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const sources = [];
  const steps = [];
  let searchCount = 0;

  if (searchMode === "force") {
    const result = await runForceSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl });
    mergeUsage(aggregateUsage, result.usage);
    return { ...result, usage: aggregateUsage };
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];
  steps.push(searchMode === "auto" ? "自動模式：Qwen 判斷是否需要搜尋" : "關閉搜尋：直接由 Qwen 回答");
  const first = await callQwen({
    baseUrl,
    qwenKey,
    model,
    messages,
    tools: searchMode === "auto" ? [WEB_SEARCH_TOOL] : undefined,
    toolChoice: searchMode === "auto" ? "auto" : undefined
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
      toolChoice: "auto"
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
    toolChoice: "none"
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
    const { message, messages, searchMode, useSearch, qwenKey, tavilyKey, model, baseUrl } = req.body || {};
    const normalizedMessages = normalizeMessages(message, messages);

    if (normalizedMessages.length === 0 || !normalizedMessages.some((m) => m.role === "user" && m.content.trim())) {
      return res.status(400).json({ error: "缺少 message" });
    }
    if (!qwenKey) {
      return res.status(400).json({ error: "缺少 Qwen API Key，請在設定中填入。" });
    }

    const usedModel = model || "qwen-flash";
    const usedBaseUrl = baseUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    const usedSearchMode = searchMode || (useSearch ? "force" : "off");

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
      searchMode: usedSearchMode
    });

    if (shouldSelfCheck({ searchMode: usedSearchMode, sources: result.sources, userMessages: normalizedMessages })) {
      result.steps = [...(result.steps || []), "執行最終自我檢查，修正來源與專案事實"];
      const checked = await selfCheckAnswer({
        reply: result.reply,
        sources: result.sources,
        userMessages: normalizedMessages,
        qwenKey,
        model: usedModel,
        baseUrl: usedBaseUrl
      });
      result.reply = checked.reply;
      mergeUsage(result.usage, checked.usage);
    }

    res.json({
      reply: result.reply,
      sources: result.sources,
      usage: result.usage,
      searchCount: result.searchCount || 0,
      searchMode: usedSearchMode,
      steps: result.steps || []
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
