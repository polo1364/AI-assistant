const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const searchModeSelect = document.getElementById("searchMode");
const answerModeSelect = document.getElementById("answerMode");

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
  searchMode: "auto",
  answerMode: "verified",
  memoryTurns: 6
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

let conversation = [];
let currentWorkPlan = null;
let currentWorkGoal = "";
let workRuntime = null;

const DB_NAME = "qwen_assistant_db";
const DB_VERSION = 1;
const TEMPLATES_SEEDED_KEY = "qwen_assistant_templates_seeded";

const AGENT_RESOURCES = [
  {
    category: "入門路線",
    title: "Hello-Agents 線上教程",
    desc: "Datawhale 的系統性 Agent 教程，從智能體概念、LLM 基礎到多智能體實戰。",
    url: "https://datawhalechina.github.io/hello-agents/"
  },
  {
    category: "核心范式",
    title: "ReAct / Plan-and-Solve / Reflection",
    desc: "學習 Agent 如何思考、規劃、使用工具與自我反思，適合改進本助理的規劃與驗證流程。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter4/%E7%AC%AC%E5%9B%9B%E7%AB%A0%20%E6%99%BA%E8%83%BD%E4%BD%93%E7%BB%8F%E5%85%B8%E8%8C%83%E5%BC%8F%E6%9E%84%E5%BB%BA.md"
  },
  {
    category: "低代碼平台",
    title: "Coze / Dify / n8n",
    desc: "理解流程驅動 Agent 與 AI Native Agent 的差異，可用於設計本助理的半自動工作流。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter5/%E7%AC%AC%E4%BA%94%E7%AB%A0%20%E5%9F%BA%E4%BA%8E%E4%BD%8E%E4%BB%A3%E7%A0%81%E5%B9%B3%E5%8F%B0%E7%9A%84%E6%99%BA%E8%83%BD%E4%BD%93%E6%90%AD%E5%BB%BA.md"
  },
  {
    category: "框架實戰",
    title: "AutoGen / AgentScope / LangGraph",
    desc: "了解主流 Agent 框架如何拆分角色、工具、狀態與多步執行。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter6/%E7%AC%AC%E5%85%AD%E7%AB%A0%20%E6%A1%86%E6%9E%B6%E5%BC%80%E5%8F%91%E5%AE%9E%E8%B7%B5.md"
  },
  {
    category: "自研框架",
    title: "從 0 構建 Agent 框架",
    desc: "適合參考工具註冊、執行器、記憶、規劃與回報架構。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter7/%E7%AC%AC%E4%B8%83%E7%AB%A0%20%E6%9E%84%E5%BB%BA%E4%BD%A0%E7%9A%84Agent%E6%A1%86%E6%9E%B6.md"
  },
  {
    category: "記憶檢索",
    title: "Memory / RAG / 儲存",
    desc: "可用來規劃後續加入長期記憶、知識庫與檢索增強回答。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter8/%E7%AC%AC%E5%85%AB%E7%AB%A0%20%E8%AE%B0%E5%BF%86%E4%B8%8E%E6%A3%80%E7%B4%A2.md"
  },
  {
    category: "上下文工程",
    title: "Context Engineering",
    desc: "學習如何管理多輪對話、工具結果、外部資料與任務狀態。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter9/%E7%AC%AC%E4%B9%9D%E7%AB%A0%20%E4%B8%8A%E4%B8%8B%E6%96%87%E5%B7%A5%E7%A8%8B.md"
  },
  {
    category: "協議",
    title: "MCP / A2A / ANP",
    desc: "適合規劃未來接 Gmail、Sheet、Calendar、GitHub 等外部工具。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter10/%E7%AC%AC%E5%8D%81%E7%AB%A0%20%E6%99%BA%E8%83%BD%E4%BD%93%E9%80%9A%E4%BF%A1%E5%8D%8F%E8%AE%AE.md"
  },
  {
    category: "評估",
    title: "Agent 性能評估",
    desc: "用於設計可信度、查證成功率、工具成功率與回答品質指標。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter12/%E7%AC%AC%E5%8D%81%E4%BA%8C%E7%AB%A0%20%E6%99%BA%E8%83%BD%E4%BD%93%E6%80%A7%E8%83%BD%E8%AF%84%E4%BC%B0.md"
  },
  {
    category: "實戰案例",
    title: "DeepResearch Agent",
    desc: "適合參考多輪搜尋、資料抽取、來源整理與研究報告生成。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/docs/chapter14/%E7%AC%AC%E5%8D%81%E5%9B%9B%E7%AB%A0%20%E8%87%AA%E5%8A%A8%E5%8C%96%E6%B7%B1%E5%BA%A6%E7%A0%94%E7%A9%B6%E6%99%BA%E8%83%BD%E4%BD%93.md"
  },
  {
    category: "延伸",
    title: "Agent Skills 與 MCP 對比",
    desc: "幫助理解 Skills、MCP、工具調用與可插拔能力之間的差異。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/Extra-Chapter/Extra05-AgentSkills%E8%A7%A3%E8%AF%BB.md"
  },
  {
    category: "延伸",
    title: "如何寫出好的 Skill",
    desc: "適合未來把你的助理能力拆成可重用技能，例如查證、改檔、產報告。",
    url: "https://github.com/datawhalechina/hello-agents/blob/main/Extra-Chapter/Extra08-%E5%A6%82%E4%BD%95%E5%86%99%E5%87%BA%E5%A5%BD%E7%9A%84Skill.md"
  },
  {
    category: "角色庫",
    title: "agency-agents-zh 中文 AI 專家角色庫",
    desc: "215 個即插即用專家角色，涵蓋工程、設計、行銷、產品、測試、安全、金融等部門，可作為子 Agent 或提示詞角色參考。",
    url: "https://github.com/jnMetaCode/agency-agents-zh"
  },
  {
    category: "角色索引",
    title: "agency-agents 角色總表",
    desc: "快速查找全部專家角色與適用場景，適合決定某個任務要由哪種專家 Agent 處理。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/blob/main/AGENT-LIST.md"
  },
  {
    category: "工程角色",
    title: "工程部：前端、後端、安全、DevOps、架構",
    desc: "可參考前端開發者、後端架構師、安全工程師、程式碼審查員、SRE 等角色，強化工作 Agent 的改檔與審查能力。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/engineering"
  },
  {
    category: "設計角色",
    title: "設計部：UI / UX / 品牌 / 圖像提示詞",
    desc: "適合用於你的專屬 UI、品牌風格、可用性檢查與圖片提示詞優化。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/design"
  },
  {
    category: "行銷角色",
    title: "行銷部：小紅書、抖音、微信、SEO、內容策略",
    desc: "適合產生社群貼文、短影音腳本、品牌內容、SEO 與本地化行銷策略。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/marketing"
  },
  {
    category: "產品角色",
    title: "產品部：產品經理、趨勢研究、回饋分析",
    desc: "適合需求拆解、MVP、功能優先級、使用者回饋整理與產品路線規劃。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/product"
  },
  {
    category: "支援角色",
    title: "資料分析師與高管摘要師",
    desc: "適合報表整理、資料洞察、KPI 追蹤與把複雜資訊整理成決策摘要。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/support"
  },
  {
    category: "專案角色",
    title: "工作流程規劃與專案管理",
    desc: "適合任務拆解、流程設計、跨角色協作、確認節點與交付管理。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/project-management"
  },
  {
    category: "測試角色",
    title: "測試部：API 測試、效能、無障礙、證據收集",
    desc: "可用來設計測試案例、檢查 UI 截圖、驗證 API 與建立品質把關流程。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/testing"
  },
  {
    category: "特殊專家",
    title: "Specialized：智能體編排、提示詞、合規、資料整合",
    desc: "適合參考多 Agent 編排、提示詞工程、合規審計與資料整合等進階能力。",
    url: "https://github.com/jnMetaCode/agency-agents-zh/tree/main/specialized"
  },
  {
    category: "編排工具",
    title: "Agency Orchestrator",
    desc: "讓多個專家角色像團隊一樣協作，支援自然語言或 YAML 編排，可作為未來工作 Agent 多角色協作參考。",
    url: "https://github.com/jnMetaCode/agency-orchestrator"
  }
];

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
    searchMode: searchModeSelect.value,
    answerMode: answerModeSelect.value,
    memoryTurns: Math.max(0, parseInt(document.getElementById("memoryTurns").value, 10) || 0)
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
  document.getElementById("memoryTurns").value = s.memoryTurns ?? 6;
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

function recordUsage({ inTokens = 0, outTokens = 0, totalTokens = 0, searched = false, searchCount = 0 }) {
  for (const bucket of [usage.session, usage.total]) {
    bucket.inTokens += inTokens;
    bucket.outTokens += outTokens;
    bucket.totalTokens += totalTokens || inTokens + outTokens;
    bucket.searches += searchCount || (searched ? 1 : 0);
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
  if (id === "resourcesModal") renderAgentResources();
  if (id === "templatesModal") {
    resetTemplateForm();
    renderTemplates();
  }
  if (id === "historyModal") renderHistory();
  if (id === "workAgentModal") resetWorkAgentModal();
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function renderAgentResources() {
  const list = document.getElementById("resourcesList");
  if (!list) return;
  list.innerHTML = "";

  AGENT_RESOURCES.forEach((resource) => {
    const a = document.createElement("a");
    a.className = "resource-card";
    a.href = resource.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = `
      <div class="resource-category">${escapeHtml(resource.category)}</div>
      <div class="resource-title">${escapeHtml(resource.title)}</div>
      <div class="resource-desc">${escapeHtml(resource.desc)}</div>
      <div class="resource-url">${escapeHtml(resource.url)}</div>
    `;
    list.appendChild(a);
  });
}

function resetWorkAgentModal() {
  currentWorkPlan = null;
  currentWorkGoal = "";
  workRuntime = null;
  document.getElementById("workPlanBox").classList.add("hidden");
  document.getElementById("workResultBox").classList.add("hidden");
  document.getElementById("workPlanBox").innerHTML = "";
  document.getElementById("workResultBox").innerHTML = "";
  document.getElementById("workExecuteBtn").disabled = true;
  renderWorkRuntime(null);
  loadWorkRuntime();
}

function isLocalWorkHost() {
  const host = window.location.hostname;
  return host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function renderWorkRuntime(runtime) {
  const box = document.getElementById("workRuntimeBox");
  if (!box) return;
  if (!runtime) {
    box.className = "work-runtime";
    box.textContent = "正在確認目前後端位置...";
    return;
  }

  const local = isLocalWorkHost();
  box.className = `work-runtime ${local ? "local" : "remote"}`;
  box.innerHTML = `
    <strong>${local ? "本機模式" : "遠端模式"}</strong><br>
    後端專案根目錄：<code>${escapeHtml(runtime.projectRoot || "未知")}</code><br>
    目前網址：<code>${escapeHtml(window.location.href)}</code><br>
    ${local ? "確認寫入會修改上方後端所在資料夾。" : "遠端網址無法修改你桌面的本機專案，確認寫入已停用。"}
  `;
}

async function loadWorkRuntime() {
  try {
    const response = await fetch("/api/runtime");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "讀取 runtime 失敗");
    workRuntime = data;
    renderWorkRuntime(data);
  } catch (error) {
    const box = document.getElementById("workRuntimeBox");
    if (box) {
      box.className = "work-runtime remote";
      box.textContent = "無法確認目前後端位置，為安全起見請勿寫入。";
    }
  }
}

function renderWorkPlan(plan) {
  const box = document.getElementById("workPlanBox");
  const steps = (plan.steps || []).map((step, index) => {
    const pathText = step.path ? ` <code>${escapeHtml(String(step.path))}</code>` : "";
    return `<li><strong>${escapeHtml(step.tool)}</strong>${pathText}<br><span>${escapeHtml(step.reason || "")}</span></li>`;
  }).join("");

  box.innerHTML = `
    <h3>任務計畫</h3>
    <div class="work-meta">風險：${escapeHtml(plan.riskLevel || "medium")} / 需要確認：${plan.requiresUserConfirmation ? "是" : "否"}</div>
    <ol class="work-steps">${steps}</ol>
  `;
  box.classList.remove("hidden");
  document.getElementById("workExecuteBtn").disabled = false;
}

function renderWorkResult(data) {
  const box = document.getElementById("workResultBox");
  const readFiles = (data.readFiles || []).map((file) => `<li>${escapeHtml(file.path)} (${file.size} chars)</li>`).join("");
  const notes = (data.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const patches = (data.patches || []).map((patch) => `
    <div class="patch-card">
      <div class="patch-title">${escapeHtml(patch.path)}</div>
      <p>${escapeHtml(patch.reason || "AI 建議修改")}</p>
      <pre class="diff-view"><code>${escapeHtml(patch.diff || "")}</code></pre>
      <button class="btn-primary confirm-write-btn" type="button" data-token="${escapeHtml(patch.confirmationToken)}">確認寫入</button>
    </div>
  `).join("");

  box.innerHTML = `
    <h3>執行結果</h3>
    <p>${escapeHtml(data.summary || "已完成執行。")}</p>
    ${readFiles ? `<h4>已讀取檔案</h4><ul>${readFiles}</ul>` : ""}
    ${notes ? `<h4>備註</h4><ul>${notes}</ul>` : ""}
    ${patches ? `<h4>待確認 diff</h4><p class="hint">請確認差異內容正確後再按「確認寫入」。不按就不會修改檔案。</p>${patches}` : "<p>沒有產生需要寫入的 diff。</p>"}
  `;
  box.classList.remove("hidden");

  box.querySelectorAll(".confirm-write-btn").forEach((btn) => {
    btn.addEventListener("click", () => confirmWorkWrite(btn.dataset.token, btn));
  });
}

async function createWorkPlan() {
  const goal = document.getElementById("workGoal").value.trim();
  if (!goal) {
    alert("請先輸入工作目標。");
    return;
  }

  currentWorkGoal = goal;
  document.getElementById("workPlanBtn").disabled = true;
  document.getElementById("workPlanBtn").textContent = "規劃中";

  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "產生計畫失敗");
    currentWorkPlan = data.plan;
    renderWorkPlan(data.plan);
  } catch (error) {
    alert(error.message || "產生計畫失敗。");
  } finally {
    document.getElementById("workPlanBtn").disabled = false;
    document.getElementById("workPlanBtn").textContent = "產生計畫";
  }
}

async function executeWorkPlan() {
  if (!currentWorkPlan) {
    alert("請先產生任務計畫。");
    return;
  }

  const settings = getSettings();
  document.getElementById("workExecuteBtn").disabled = true;
  document.getElementById("workExecuteBtn").textContent = "執行中";

  try {
    const response = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: currentWorkGoal,
        plan: currentWorkPlan,
        qwenKey: settings.qwenKey,
        model: settings.model,
        baseUrl: settings.baseUrl
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "執行計畫失敗");
    renderWorkResult(data);
  } catch (error) {
    alert(error.message || "執行計畫失敗。");
  } finally {
    document.getElementById("workExecuteBtn").disabled = false;
    document.getElementById("workExecuteBtn").textContent = "同意執行";
  }
}

async function confirmWorkWrite(token, button) {
  if (!token) return;
  if (!isLocalWorkHost()) {
    alert("目前不是本機網址。工作 Agent 寫入只會修改後端所在機器，遠端網址無法修改你桌面的專案檔案。請改用 http://localhost:3000。");
    return;
  }
  if (!confirm("確認要寫入這個 diff 嗎？此動作會修改專案檔案。")) return;

  const status = document.createElement("div");
  status.className = "work-write-status";
  status.textContent = "正在寫入並驗證檔案...";
  button.insertAdjacentElement("afterend", status);
  button.disabled = true;
  button.textContent = "寫入中";
  try {
    const response = await fetch("/api/confirm-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationToken: token })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "寫入失敗");
    button.textContent = "已寫入";
    button.classList.add("written");
    status.classList.add("success");
    const writeTime = data.lastWriteTime ? new Date(data.lastWriteTime).toLocaleString() : "";
    const hashText = data.writtenHash ? ` / hash ${String(data.writtenHash).slice(0, 8)}` : "";
    const pathText = data.absolutePath ? ` / 實際路徑：${data.absolutePath}` : "";
    status.textContent = data.verified
      ? `已寫入並驗證成功：${data.path}${writeTime ? ` / ${writeTime}` : ""}${hashText}${pathText}`
      : `已寫入：${data.path}`;
    addMessage("ai", `工作 Agent 已寫入並驗證：${data.path}${writeTime ? `\n修改時間：${writeTime}` : ""}${data.absolutePath ? `\n實際路徑：${data.absolutePath}` : ""}`);
  } catch (error) {
    button.disabled = false;
    button.textContent = "確認寫入";
    status.classList.add("error");
    status.textContent = error.message || "寫入失敗。";
    alert(error.message || "寫入失敗。");
  }
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
      addMessage("ai", r.reply, {
        sources: r.sources || [],
        steps: r.steps || [],
        confidence: r.confidence || null,
        thinkingSummary: r.thinkingSummary || null
      });
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
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(md) {
  const input = String(md || "");
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    return DOMPurify.sanitize(marked.parse(input));
  }

  const codeBlocks = [];
  let text = input.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
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

function renderThinkingSummary(summary) {
  const box = document.createElement("div");
  if (!summary) return box;

  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const roles = Array.isArray(summary.roles) ? summary.roles : [];
  box.className = "thinking-card";
  box.innerHTML = `
    <div class="thinking-header">
      <span class="thinking-dot"></span>
      <span>AI 思考摘要</span>
    </div>
    <div class="thinking-grid">
      <div>
        <div class="thinking-label">模式</div>
        <div class="thinking-value">${escapeHtml(summary.mode || "一般模式")}</div>
      </div>
      <div>
        <div class="thinking-label">查證</div>
        <div class="thinking-value">${escapeHtml(summary.search || "未啟用")}</div>
      </div>
      <div>
        <div class="thinking-label">可信度</div>
        <div class="thinking-value">${escapeHtml(summary.confidence || "中")}</div>
      </div>
    </div>
    ${
      roles.length
        ? `<div class="thinking-roles">
            <div class="thinking-label">啟用角色</div>
            <div class="thinking-role-list">${roles.map((role) => `<span>${escapeHtml(role)}</span>`).join("")}</div>
          </div>`
        : ""
    }
    <div class="thinking-source">${escapeHtml(summary.sourceSummary || "")}</div>
    ${
      steps.length
        ? `<details class="thinking-steps">
            <summary>查看查證流程</summary>
            <ol>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
          </details>`
        : ""
    }
  `;
  return box;
}

function renderConfidence(confidence) {
  const box = document.createElement("div");
  if (!confidence) return box;

  box.className = `confidence confidence-${confidence.level || "medium"}`;
  box.innerHTML = `
    <div class="confidence-title">可信度：${escapeHtml(confidence.label || "中")}</div>
    <div class="confidence-reason">${escapeHtml(confidence.reason || "")}</div>
  `;
  return box;
}

function renderSources(sources) {
  const wrap = document.createElement("div");
  if (!Array.isArray(sources) || sources.length === 0) return wrap;

  wrap.className = "sources";
  const title = document.createElement("div");
  title.className = "sources-title";
  title.textContent = "來源";
  wrap.appendChild(title);

  sources.forEach((src, index) => {
    if (!src || !src.url) return;
    const a = document.createElement("a");
    a.className = "source-card";
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = `
      <div class="source-meta">${index + 1}. ${src.official ? "官方來源" : "第三方來源"}</div>
      <div class="source-name">${escapeHtml(src.title || "未命名來源")}</div>
      <div class="source-url">${escapeHtml(src.url || "")}</div>
    `;
    wrap.appendChild(a);
  });

  return wrap;
}

function addMessage(role, text, sources, steps, confidence) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const extra = sources && !Array.isArray(sources) && typeof sources === "object"
    ? sources
    : { sources, steps, confidence };

  if (role === "ai") {
    if (extra.thinkingSummary) {
      div.appendChild(renderThinkingSummary(extra.thinkingSummary));
    }

    const body = document.createElement("div");
    body.className = "ai-content";
    body.innerHTML = renderMarkdown(text);
    div.appendChild(body);
  } else {
    const body = document.createElement("div");
    body.textContent = text;
    div.appendChild(body);
  }

  if (role === "ai") {
    if (extra.confidence) {
      div.appendChild(renderConfidence(extra.confidence));
    }

    if (Array.isArray(extra.sources) && extra.sources.length > 0) {
      div.appendChild(renderSources(extra.sources));
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

function getRecentMessages(nextUserText) {
  const s = getSettings();
  const limit = Math.max(0, Number(s.memoryTurns ?? 6));
  const recent = limit === 0 ? [] : conversation.slice(-limit);
  return [...recent, { role: "user", content: nextUserText }];
}

function resetConversation() {
  conversation = [];
  chatBox.innerHTML = "";
  const div = document.createElement("div");
  div.className = "message ai";
  div.textContent = "已開始新對話。請輸入你想整理或查詢的內容。";
  chatBox.appendChild(div);
}

function fallbackAgentSteps(searchMode, searchCount) {
  if (searchMode === "off") {
    return ["關閉搜尋：直接由 Qwen 回答"];
  }
  if (searchMode === "force") {
    return [
      "強制搜尋模式：先使用 Tavily 查資料",
      "將搜尋結果交給 Qwen 整理回答"
    ];
  }
  return [
    "自動模式：Qwen 判斷是否需要搜尋",
    searchCount > 0 ? `判斷結果：已使用 Tavily 搜尋 ${searchCount} 次` : "判斷結果：不需要搜尋，直接回答",
    "Qwen 產生最終回答"
  ];
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

  const searchMode = searchModeSelect.value;
  if (searchMode !== "off" && !s.tavilyKey) {
    alert("目前搜尋模式需要 Tavily API Key。請到「設定」填入，或改成「關閉」。");
    openModal("settingsModal");
    return;
  }
  const requestMessages = getRecentMessages(text);

  addMessage("user", text);
  userInput.value = "";
  resetInputHeight();
  sendBtn.disabled = true;
  sendBtn.textContent = "等待";

  const typingEl = addTyping(searchMode === "off" ? "思考中" : searchMode === "auto" ? "Agent 判斷是否搜尋中" : "聯網搜尋並整理中");

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        messages: requestMessages,
        searchMode,
        answerMode: answerModeSelect.value,
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
      const agentSteps = Array.isArray(data.steps) && data.steps.length > 0
        ? data.steps
        : fallbackAgentSteps(searchMode, data.searchCount || 0);
      addMessage("ai", data.reply, {
        sources: data.sources || [],
        steps: agentSteps,
        confidence: data.confidence || null,
        thinkingSummary: data.thinkingSummary || null,
        usage: data.usage || null
      });
      recordUsage({
        inTokens: data.usage?.prompt_tokens || 0,
        outTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        searchCount: data.searchCount || 0
      });
      conversation.push({ role: "user", content: text }, { role: "assistant", content: data.reply });
      saveHistory({
        ts: Date.now(),
        question: text,
        reply: data.reply,
        sources: data.sources || [],
        steps: agentSteps,
        confidence: data.confidence,
        thinkingSummary: data.thinkingSummary || null,
        searched: (data.searchCount || 0) > 0
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
document.getElementById("workAgentBtn").onclick = () => openModal("workAgentModal");
document.getElementById("resourcesBtn").onclick = () => openModal("resourcesModal");
document.getElementById("templatesBtn").onclick = () => openModal("templatesModal");
document.getElementById("historyBtn").onclick = () => openModal("historyModal");
document.getElementById("newChatBtn").onclick = resetConversation;
document.getElementById("workPlanBtn").onclick = createWorkPlan;
document.getElementById("workExecuteBtn").onclick = executeWorkPlan;

["settingsModal", "usageModal", "templatesModal", "historyModal", "workAgentModal", "resourcesModal"].forEach((id) => {
  const overlay = document.getElementById(id);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

searchModeSelect.addEventListener("change", () => {
  const s = getSettings();
  s.searchMode = searchModeSelect.value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
});

answerModeSelect.addEventListener("change", () => {
  const s = getSettings();
  s.answerMode = answerModeSelect.value;
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
  searchModeSelect.value = s.searchMode || (s.search ? "force" : "auto");
  answerModeSelect.value = s.answerMode || "verified";
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
