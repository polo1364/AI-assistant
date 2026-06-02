const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT =
  "你是一位繁體中文 AI 助理，擅長整理資料、SOP、旅遊企劃、正式文案、信件摘要、RO 腳本檢查與 AI 圖像提示詞。回答要清楚、實用、可直接複製。";

const SEARCH_SYSTEM_PROMPT =
  "你是一位繁體中文 AI 助理。請依據使用者提供的『搜尋結果』來整理並回答問題，內容要正確、清楚、可直接複製。" +
  "若搜尋結果不足以回答，請誠實說明。請勿杜撰未出現在搜尋結果的事實。回答結尾請以條列列出引用的來源編號。";

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
      max_results: 5,
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

app.post("/api/ask", async (req, res) => {
  try {
    const { message, useSearch, qwenKey, tavilyKey, model, baseUrl } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "缺少 message" });
    }
    if (!qwenKey) {
      return res.status(400).json({ error: "缺少 Qwen API Key，請在設定中填入。" });
    }

    const usedModel = model || "qwen-flash";
    const usedBaseUrl = baseUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

    let sources = [];
    let systemPrompt = SYSTEM_PROMPT;
    let userContent = message;

    if (useSearch) {
      if (!tavilyKey) {
        return res.status(400).json({ error: "已開啟聯網搜尋，但缺少 Tavily API Key。" });
      }
      const tavilyData = await tavilySearch(message, tavilyKey);
      const built = buildSearchContext(tavilyData);
      sources = built.sources;
      systemPrompt = SEARCH_SYSTEM_PROMPT;
      userContent = `${built.context}\n---\n使用者問題：${message}`;
    }

    const qwenResp = await fetch(`${usedBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qwenKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: usedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.7
      })
    });

    const qwenData = await qwenResp.json();

    if (!qwenResp.ok) {
      console.error("Qwen API error:", qwenData);
      return res.status(qwenResp.status).json({
        error: "Qwen API 呼叫失敗",
        detail: qwenData
      });
    }

    const reply = qwenData.choices?.[0]?.message?.content || "Qwen 沒有回傳內容。";

    res.json({
      reply,
      sources,
      usage: qwenData.usage || null
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
app.listen(PORT, () => {
  console.log(`Qwen AI 助理已啟動：http://localhost:${PORT}`);
});
