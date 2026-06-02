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

const DB_NAME = "qwen_assistant_db";
const DB_VERSION = 1;
const TEMPLATES_SEEDED_KEY = "qwen_assistant_templates_seeded";

const DEFAULT_TEMPLATES = [
  {
    name: "SOP整理",
    content: `請將以下內容整理成正式 SOP。
請使用繁體中文。
請包含：
1. 目的
2. 適用範圍
3. 作業流程
4. 注意事項
5. 檢查項目
6. 異常處理

以下是內容：
`
  },
  {
    name: "旅遊企劃",
    content: `請將以下內容整理成旅遊企劃。
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
`
  },
  {
    name: "正式文案",
    content: `請將以下內容改寫成正式文案。
請使用繁體中文。
語氣要自然、清楚、有質感。
請提供：
1. 標題
2. 正文
3. 重點條列
4. 可直接複製版本

以下是內容：
`
  },
  {
    name: "信件摘要",
    content: `請幫我整理以下信件內容。
請使用繁體中文。
請包含：
1. 信件重點
2. 對方想表達什麼
3. 我需要做什麼
4. 建議回覆內容
5. 可直接複製的回信版本

以下是信件：
`
  },
  {
    name: "RO腳本檢查",
    content: `請幫我檢查以下 RO / rAthena 腳本。
請使用繁體中文。
請包含：
1. 可能錯誤
2. 問題原因
3. 修正建議
4. 修正版程式碼
5. 注意事項

以下是腳本：
`
  },
  {
    name: "圖片提示詞",
    content: `請幫我把以下需求整理成 AI 圖像生成提示詞。
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
  }
];

/* ---------- IndexedDB ---------- */
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("history")) {
        const store = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
        store.createIndex("ts", "ts");
      }
      if (!db.objectStoreNames.contains("templates")) {
        db.createObjectStore("templates", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbAdd(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).add(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

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
  if (id === "templatesModal") {
    resetTemplateForm();
    renderTemplates();
  }
  if (id === "historyModal") renderHistory();
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

/* ---------- 自訂查詢模板 ---------- */
async function seedTemplatesIfNeeded() {
  if (localStorage.getItem(TEMPLATES_SEEDED_KEY)) return;
  const existing = await idbAll("templates");
  if (existing.length === 0) {
    for (const t of DEFAULT_TEMPLATES) {
      await idbAdd("templates", { name: t.name, content: t.content });
    }
  }
  localStorage.setItem(TEMPLATES_SEEDED_KEY, "1");
}

async function renderTemplates() {
  const list = document.getElementById("templateList");
  const templates = await idbAll("templates");
  list.innerHTML = "";

  if (templates.length === 0) {
    list.innerHTML = '<p class="empty">尚無模板，請在下方新增。</p>';
    return;
  }

  templates.forEach((t) => {
    const item = document.createElement("div");
    item.className = "list-item";

    const info = document.createElement("div");
    info.className = "list-info";
    const name = document.createElement("div");
    name.className = "list-title";
    name.textContent = t.name;
    const preview = document.createElement("div");
    preview.className = "list-preview";
    preview.textContent = t.content.replace(/\s+/g, " ").trim().slice(0, 50);
    info.appendChild(name);
    info.appendChild(preview);

    const actions = document.createElement("div");
    actions.className = "list-actions";

    const useBtn = document.createElement("button");
    useBtn.className = "mini-btn primary";
    useBtn.textContent = "使用";
    useBtn.onclick = () => {
      userInput.value = t.content;
      closeModal("templatesModal");
      userInput.focus();
      autoGrowInput();
    };

    const editBtn = document.createElement("button");
    editBtn.className = "mini-btn";
    editBtn.textContent = "編輯";
    editBtn.onclick = () => fillTemplateForm(t);

    const delBtn = document.createElement("button");
    delBtn.className = "mini-btn danger";
    delBtn.textContent = "刪除";
    delBtn.onclick = async () => {
      await idbDelete("templates", t.id);
      renderTemplates();
    };

    actions.appendChild(useBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function fillTemplateForm(t) {
  document.getElementById("templateEditId").value = t.id;
  document.getElementById("templateName").value = t.name;
  document.getElementById("templateContent").value = t.content;
  document.getElementById("templateFormTitle").textContent = "編輯模板";
  document.querySelector("#templatesModal .modal-body").scrollTop = document.querySelector("#templatesModal .modal-body").scrollHeight;
}

function resetTemplateForm() {
  document.getElementById("templateEditId").value = "";
  document.getElementById("templateName").value = "";
  document.getElementById("templateContent").value = "";
  document.getElementById("templateFormTitle").textContent = "新增模板";
}

async function submitTemplate() {
  const idRaw = document.getElementById("templateEditId").value;
  const name = document.getElementById("templateName").value.trim();
  const content = document.getElementById("templateContent").value;

  if (!name || !content.trim()) {
    alert("請填入模板名稱與內容。");
    return;
  }

  if (idRaw) {
    await idbPut("templates", { id: Number(idRaw), name, content });
  } else {
    await idbAdd("templates", { name, content });
  }
  resetTemplateForm();
  renderTemplates();
}

/* ---------- 歷史查詢紀錄 ---------- */
async function saveHistory(record) {
  try {
    await idbAdd("history", record);
  } catch (e) {
    console.error("儲存歷史失敗", e);
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function renderHistory() {
  const list = document.getElementById("historyList");
  const records = await idbAll("history");
  records.sort((a, b) => b.ts - a.ts);
  list.innerHTML = "";

  if (records.length === 0) {
    list.innerHTML = '<p class="empty">尚無歷史紀錄。</p>';
    return;
  }

  records.forEach((r) => {
    const item = document.createElement("div");
    item.className = "list-item";

    const info = document.createElement("div");
    info.className = "list-info";
    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = (r.searched ? "🌐 " : "") + r.question.replace(/\s+/g, " ").trim().slice(0, 40);
    const meta = document.createElement("div");
    meta.className = "list-preview";
    meta.textContent = formatTime(r.ts);
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "list-actions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "mini-btn primary";
    loadBtn.textContent = "載入";
    loadBtn.onclick = () => {
      addMessage("user", r.question);
      addMessage("ai", r.reply, r.sources);
      closeModal("historyModal");
    };

    const delBtn = document.createElement("button");
    delBtn.className = "mini-btn danger";
    delBtn.textContent = "刪除";
    delBtn.onclick = async () => {
      await idbDelete("history", r.id);
      renderHistory();
    };

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

async function clearHistory() {
  if (!confirm("確定清除全部歷史紀錄？此動作無法復原。")) return;
  await idbClear("history");
  renderHistory();
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(md) {
  const codeBlocks = [];
  let text = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\u0000CODE${i}\u0000`;
  });

  text = escapeHtml(text);

  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (m, c) => {
    const i = inlineCodes.length;
    inlineCodes.push(`<code>${c}</code>`);
    return `\u0000ICODE${i}\u0000`;
  });

  function inline(s) {
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return s;
  }

  const lines = text.split(/\r?\n/);
  let html = "";
  let listType = null;
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const line of lines) {
    if (/^\u0000CODE\d+\u0000$/.test(line.trim())) {
      closeList();
      html += line.trim();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      html += `<h${lvl}>${inline(h[2])}</h${lvl}>`;
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      closeList();
      html += "<hr>";
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${inline(ol[1])}</li>`;
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${inline(ul[1])}</li>`;
      continue;
    }
    if (/^\s*$/.test(line)) {
      closeList();
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();

  html = html.replace(/\u0000ICODE(\d+)\u0000/g, (m, i) => inlineCodes[i]);
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => codeBlocks[i]);
  return html;
}

function addMessage(role, text, sources) {
  const div = document.createElement("div");
  div.className = `message ${role}`;

  const body = document.createElement("div");
  if (role === "ai") {
    body.className = "md";
    body.innerHTML = renderMarkdown(text);
  } else {
    body.textContent = text;
  }
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
  resetInputHeight();
  sendBtn.disabled = true;
  sendBtn.textContent = "等待";

  const typingEl = addTyping(useSearch ? "聯網搜尋並整理中" : "思考中");

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
    typingEl.remove();

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
      saveHistory({
        ts: Date.now(),
        question: text,
        reply: data.reply,
        sources: data.sources || [],
        searched: useSearch
      });
    } else {
      addMessage("ai", "沒有收到 Qwen 回覆，請檢查 API Key 或模型設定。");
    }
  } catch (error) {
    typingEl.remove();
    addMessage("ai", "發生錯誤，請確認伺服器 (server.js) 是否有啟動。");
    console.error(error);
  }

  sendBtn.disabled = false;
  sendBtn.textContent = "送出";
}

/* ---------- 讀取動畫 ---------- */
function addTyping(label) {
  const div = document.createElement("div");
  div.className = "message ai typing";
  const span = document.createElement("span");
  span.className = "typing-label";
  span.textContent = label || "思考中";
  const dots = document.createElement("span");
  dots.className = "dots";
  dots.innerHTML = "<span></span><span></span><span></span>";
  div.appendChild(span);
  div.appendChild(dots);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

/* ---------- 輸入框自動長高 ---------- */
function autoGrowInput() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 220) + "px";
}

function resetInputHeight() {
  userInput.style.height = "";
}

/* ---------- 事件綁定 ---------- */
document.getElementById("settingsBtn").onclick = () => openModal("settingsModal");
document.getElementById("usageBtn").onclick = () => openModal("usageModal");
document.getElementById("templatesBtn").onclick = () => openModal("templatesModal");
document.getElementById("historyBtn").onclick = () => openModal("historyModal");

["settingsModal", "usageModal", "templatesModal", "historyModal"].forEach((id) => {
  const overlay = document.getElementById(id);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

searchToggle.addEventListener("change", () => {
  const s = getSettings();
  s.search = searchToggle.checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
});

userInput.addEventListener("input", autoGrowInput);

userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ---------- 初始化 ---------- */
(async function init() {
  const s = getSettings();
  searchToggle.checked = !!s.search;
  loadUsage();
  renderUsage();
  try {
    await seedTemplatesIfNeeded();
  } catch (e) {
    console.error("初始化模板失敗", e);
  }
  if (!s.qwenKey) {
    openModal("settingsModal");
  }
})();
