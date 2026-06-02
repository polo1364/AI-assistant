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
  "只有當問題需要最新資訊、查證事實、價格、新聞、即時資料或指定網頁資訊時，才使用 web_search 工具。";

const SEARCH_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  "請依據搜尋結果回答；若搜尋結果不足以回答，請誠實說明。請勿杜撰未出現在搜尋結果的事實。回答結尾請列出引用來源編號。";

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "用 Tavily 搜尋網路資料。只在需要最新資訊、事實查證、價格、新聞、即時資料或指定網站內容時使用。",
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

async function tavilySearch(query, tavilyKey) {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tavilyKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
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

function buildSearchContext(tavilyData) {
  const results = Array.isArray(tavilyData.results) ? tavilyData.results : [];
  const sources = results.map((r) => ({ title: r.title, url: r.url }));

  let context = "";
  if (tavilyData.answer) {
    context += `搜尋摘要：${tavilyData.answer}\n\n`;
  }
  context += "搜尋結果：\n";
  results.forEach((r, i) => {
    context += `[${i + 1}] 標題：${r.title}\n網址：${r.url}\n內容：${r.content}\n\n`;
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

async function callQwen({ baseUrl, qwenKey, model, messages, tools, toolChoice }) {
  const body = {
    model,
    messages,
    temperature: 0.5
  };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

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

async function runForceSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl }) {
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
    reply: qwenData.choices?.[0]?.message?.content || "Qwen 沒有回傳內容。",
    sources: built.sources,
    usage: qwenData.usage || null,
    searchCount: 1
  };
}

async function runAgentSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl, searchMode }) {
  const aggregateUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const sources = [];
  let searchCount = 0;

  if (searchMode === "force") {
    const result = await runForceSearch({ userMessages, qwenKey, tavilyKey, model, baseUrl });
    mergeUsage(aggregateUsage, result.usage);
    return { ...result, usage: aggregateUsage };
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];
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
    return {
      reply: assistantMessage?.content || "Qwen 沒有回傳內容。",
      sources: [],
      usage: aggregateUsage,
      searchCount
    };
  }

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
      const tavilyData = await tavilySearch(query, tavilyKey);
      const built = buildSearchContext(tavilyData);
      sources.push(...built.sources);
      searchCount += 1;
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
      return {
        reply: assistantMessage?.content || "Qwen 沒有回傳內容。",
        sources: dedupeSources(sources),
        usage: aggregateUsage,
        searchCount
      };
    }
    messages.push(assistantMessage);
  }

  return {
    reply: assistantMessage?.content || "已完成搜尋，但 Qwen 沒有回傳最終內容。",
    sources: dedupeSources(sources),
    usage: aggregateUsage,
    searchCount
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

    res.json({
      reply: result.reply,
      sources: result.sources,
      usage: result.usage,
      searchCount: result.searchCount || 0,
      searchMode: usedSearchMode
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
