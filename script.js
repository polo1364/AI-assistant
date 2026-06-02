const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const searchToggle = document.getElementById("searchToggle");

const SETTINGS_KEY = "qwen_assistant_settings";
const USAGE_KEY = "qwen_assistant_usage";

const defaultSettings = {
  qwenKey: "",
  tavilyKey: "",
  baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  model: "qwen-flash",
  priceIn: 0,
  priceOut: 0,
  priceSearch: 0,
  currency: "USD",
  search: false
};

const emptyUsage = () => ({
  inTokens: 0,
  outTokens: 0,
  totalTokens: 0,
  searches: 0
});

let usage = {
  session: emptyUsage(),
  total: emptyUsage()
};

const templates = {
  sop: `請將以下內容整理成正式 SOP。
請使用繁體中文。
請包含：
1. 目的
2. 適用範圍
3. 作業流程
4. 注意事項
5. 檢查項目
6. 異常處理

以下是內容：
`,

  travel: `請將以下內容整理成旅遊企劃。
請使用繁體中文。
請包含：
1. 行程重點
2. 每日安排
3. 交通方式
4. 餐食建議
5. 費用估算
6. 注意事項
7. 適合族群

以下是資料：
`,

  copywriting: `請將以下內容改寫成正式文案。
請使用繁體中文。
語氣要自然、清楚、有質感。
請提供：
1. 標題
2. 正文
3. 重點條列
4. 可直接複製版本

以下是內容：
`,

  email: `請幫我整理以下信件內容。
請使用繁體中文。
請包含：
1. 信件重點
2. 對方想表達什麼
3. 我需要做什麼
4. 建議回覆內容
5. 可直接複製的回信版本

以下是信件：
`,

  ro: `請幫我檢查以下 RO / rAthena 腳本。
請使用繁體中文。
請包含：
1. 可能錯誤
2. 問題原因
3. 修正建議
4. 修正版程式碼
5. 注意事項

以下是腳本：
`,

  imagePrompt: `請幫我把以下需求整理成 AI 圖像生成提示詞。
請使用繁體中文。
請包含：
1. 主題設定
2. 人物設定
3. 場景背景
4. 構圖鏡頭
5. 光影風格
6. 細節要求
7. 負面提示詞
8. 可直接複製版本

以下是需求：
`
};

/* ---------- 設定存取 ---------- */
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch (e) {
    return { ...defaultSettings };
  }
}

function getSettings() {
  return loadSettings();
}

function saveSettings() {
  const s = {
    qwenKey: document.getElementById("qwenKey").value.trim(),
    tavilyKey: document.getElementById("tavilyKey").value.trim(),
    baseUrl: document.getElementById("baseUrl").value.trim() || defaultSettings.baseUrl,
    model: document.getElementById("model").value,
    priceIn: parseFloat(document.getElementById("priceIn").value) || 0,
    priceOut: parseFloat(document.getElementById("priceOut").value) || 0,
    priceSearch: parseFloat(document.getElementById("priceSearch").value) || 0,
    currency: document.getElementById("currency").value.trim() || "USD",
    search: searchToggle.checked
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  closeModal("settingsModal");
}

function fillSettingsForm() {
  const s = getSettings();
  document.getElementById("qwenKey").value = s.qwenKey;
  document.getElementById("tavilyKey").value = s.tavilyKey;
  document.getElementById("baseUrl").value = s.baseUrl;
  document.getElementById("model").value = s.model;
  document.getElementById("priceIn").value = s.priceIn || "";
  document.getElementById("priceOut").value = s.priceOut || "";
  document.getElementById("priceSearch").value = s.priceSearch || "";
  document.getElementById("currency").value = s.currency;
}

function clearKeys() {
  const s = getSettings();
  s.qwenKey = "";
  s.tavilyKey = "";
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  document.getElementById("qwenKey").value = "";
  document.getElementById("tavilyKey").value = "";
  alert("已清除 API Key。");
}

/* ---------- 用量存取 ---------- */
function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      usage.total = { ...emptyUsage(), ...parsed.total };
    }
  } catch (e) {
    usage = { session: emptyUsage(), total: emptyUsage() };
  }
}

function persistUsage() {
  localStorage.setItem(USAGE_KEY, JSON.stringify({ total: usage.total }));
}

function recordUsage({ inTokens = 0, outTokens = 0, totalTokens = 0, searched = false }) {
  for (const bucket of [usage.session, usage.total]) {
    bucket.inTokens += inTokens;
    bucket.outTokens += outTokens;
    bucket.totalTokens += totalTokens || inTokens + outTokens;
    if (searched) bucket.searches += 1;
  }
  persistUsage();
  renderUsage();
}

function resetUsage() {
  usage = { session: emptyUsage(), total: emptyUsage() };
  persistUsage();
  renderUsage();
}

function fmtCost(value, currency) {
  return `${currency} ${value.toFixed(4)}`;
}

function renderUsage() {
  const s = getSettings();
  const cur = s.currency || "USD";

  const cost = (b) => (b.inTokens / 1e6) * s.priceIn + (b.outTokens / 1e6) * s.priceOut;
  const searchCost = (b) => b.searches * s.priceSearch;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set("sIn", usage.session.inTokens.toLocaleString());
  set("sOut", usage.session.outTokens.toLocaleString());
  set("sTotal", usage.session.totalTokens.toLocaleString());
  set("sCost", fmtCost(cost(usage.session), cur));
  set("tIn", usage.total.inTokens.toLocaleString());
  set("tOut", usage.total.outTokens.toLocaleString());
  set("tTotal", usage.total.totalTokens.toLocaleString());
  set("tCost", fmtCost(cost(usage.total), cur));

  set("sSearch", usage.session.searches.toLocaleString());
  set("sSearchCost", fmtCost(searchCost(usage.session), cur));
  set("tSearch", usage.total.searches.toLocaleString());
  set("tSearchCost", fmtCost(searchCost(usage.total), cur));
}

/* ---------- 模態視窗 ---------- */
function openModal(id) {
  if (id === "settingsModal") fillSettingsForm();
  if (id === "usageModal") renderUsage();
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

/* ---------- 聊天 ---------- */
function useTemplate(type) {
  userInput.value = templates[type] || "";
  userInput.focus();
}

function addMessage(role, text, sources) {
  const div = document.createElement("div");
  div.className = `message ${role}`;

  const body = document.createElement("div");
  body.textContent = text;
  div.appendChild(body);

  if (role === "ai") {
    if (Array.isArray(sources) && sources.length > 0) {
      const box = document.createElement("div");
      box.className = "sources";
      const title = document.createElement("div");
      title.className = "sources-title";
      title.textContent = "來源：";
      box.appendChild(title);
      sources.forEach((src) => {
        if (!src || !src.url) return;
        const a = document.createElement("a");
        a.href = src.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = src.title ? `${src.title} — ${src.url}` : src.url;
        box.appendChild(a);
      });
      div.appendChild(box);
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "複製";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "已複製";
      setTimeout(() => {
        copyBtn.textContent = "複製";
      }, 1200);
    };
    div.appendChild(document.createElement("br"));
    div.appendChild(copyBtn);
  }

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) {
    alert("請先輸入內容");
    return;
  }

  const s = getSettings();
  if (!s.qwenKey) {
    alert("請先在「設定」填入 Qwen API Key。");
    openModal("settingsModal");
    return;
  }

  const useSearch = searchToggle.checked;
  if (useSearch && !s.tavilyKey) {
    alert("已開啟聯網搜尋，但尚未填入 Tavily API Key。請到「設定」填入，或關閉聯網搜尋。");
    openModal("settingsModal");
    return;
  }

  addMessage("user", text);
  userInput.value = "";
  sendBtn.disabled = true;
  sendBtn.textContent = "等待";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        useSearch,
        qwenKey: s.qwenKey,
        tavilyKey: s.tavilyKey,
        model: s.model,
        baseUrl: s.baseUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      addMessage("ai", `發生錯誤：${data.error || response.status}${data.detail ? "\n" + JSON.stringify(data.detail) : ""}`);
    } else if (data.reply) {
      addMessage("ai", data.reply, data.sources);
      recordUsage({
        inTokens: data.usage?.prompt_tokens || 0,
        outTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        searched: useSearch
      });
    } else {
      addMessage("ai", "沒有收到 Qwen 回覆，請檢查 API Key 或模型設定。");
    }
  } catch (error) {
    addMessage("ai", "發生錯誤，請確認伺服器 (server.js) 是否有啟動。");
    console.error(error);
  }

  sendBtn.disabled = false;
  sendBtn.textContent = "送出";
}

/* ---------- 事件綁定 ---------- */
document.getElementById("settingsBtn").onclick = () => openModal("settingsModal");
document.getElementById("usageBtn").onclick = () => openModal("usageModal");

[document.getElementById("settingsModal"), document.getElementById("usageModal")].forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

searchToggle.addEventListener("change", () => {
  const s = getSettings();
  s.search = searchToggle.checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
});

userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ---------- 初始化 ---------- */
(function init() {
  const s = getSettings();
  searchToggle.checked = !!s.search;
  loadUsage();
  renderUsage();
  if (!s.qwenKey) {
    openModal("settingsModal");
  }
})();
