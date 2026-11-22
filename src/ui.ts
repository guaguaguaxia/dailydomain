const SHARED_STYLES = `
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --surface-2: #f1f5f9;
    --border: #e2e8f0;
    --border-strong: #cbd5e1;
    --text: #0f172a;
    --text-muted: #475569;
    --text-subtle: #64748b;
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --accent-soft: #eef2ff;
    --ok: #059669;
    --ok-bg: #ecfdf5;
    --warn: #d97706;
    --warn-bg: #fffbeb;
    --err: #dc2626;
    --err-bg: #fef2f2;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05);
    --shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  button, input, select { font-family: inherit; font-size: inherit; }
  .mono { font-family: var(--mono); }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 13px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .btn:hover:not(:disabled) { background: var(--surface-2); }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .btn-sm { padding: 4px 10px; font-size: 12px; border-radius: 6px; }
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge-ok { background: var(--ok-bg); color: var(--ok); }
  .badge-warn { background: var(--warn-bg); color: var(--warn); }
  .badge-err { background: var(--err-bg); color: var(--err); }
  .badge-muted { background: var(--surface-2); color: var(--text-muted); }
`;

export function sanitizeNextPath(nextPath: string | null): string {
  if (!nextPath) return "/";
  if (!nextPath.startsWith("/") || nextPath.startsWith("//") || nextPath.startsWith("/\\")) {
    return "/";
  }
  return nextPath;
}

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function renderLoginPage(nextPath = "/"): string {
  const safeNext = sanitizeNextPath(nextPath);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录 · DailyDomain (domains.guaxiaai.com)</title>
  <style>
    ${SHARED_STYLES}
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: radial-gradient(circle at top right, #e0e7ff 0%, #f8fafc 45%, #f1f5f9 100%);
    }
    .login-card {
      width: 100%;
      max-width: 400px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 28px;
      box-shadow: var(--shadow);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .brand-icon {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      background: var(--accent);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-family: var(--mono);
      font-size: 14px;
    }
    h1 { font-size: 18px; margin: 0; }
    .subtitle { color: var(--text-muted); font-size: 13px; margin: 0 0 22px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
    .input-wrap { position: relative; display: flex; }
    .input-wrap input {
      width: 100%;
      padding: 10px 64px 10px 12px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      outline: none;
      background: var(--surface);
    }
    .input-wrap input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,70,229,0.12); }
    .toggle-btn {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      border: none;
      background: transparent;
      color: var(--text-subtle);
      cursor: pointer;
      padding: 4px 8px;
      font-size: 12px;
    }
    .error-msg {
      display: none;
      background: var(--err-bg);
      color: var(--err);
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 13px;
      margin-bottom: 14px;
    }
    .submit-btn { width: 100%; padding: 10px 14px; }
    .foot { margin-top: 16px; font-size: 12px; color: var(--text-subtle); text-align: center; }
  </style>
</head>
<body>
  <main class="login-card">
    <div class="brand">
      <div class="brand-icon">DD</div>
      <div>
        <h1>DailyDomain 域名归档库</h1>
      </div>
    </div>
    <p class="subtitle mono">domains.guaxiaai.com · 受保护站点</p>
    <div id="errorBox" class="error-msg" role="alert"></div>
    <form id="loginForm">
      <div class="field">
        <label for="passwordInput">访问密码 / Access Key</label>
        <div class="input-wrap">
          <input id="passwordInput" name="password" type="password" autocomplete="current-password" placeholder="请输入访问密钥" required autofocus />
          <button type="button" id="togglePwd" class="toggle-btn">显示</button>
        </div>
      </div>
      <button type="submit" id="submitBtn" class="btn btn-primary submit-btn">进入控制台</button>
    </form>
    <div class="foot">已启用 HttpOnly 签名会话保护</div>
  </main>
  <script>
    const nextPath = ${safeJsonForScript(safeNext)};
    const form = document.getElementById("loginForm");
    const input = document.getElementById("passwordInput");
    const toggleBtn = document.getElementById("togglePwd");
    const errorBox = document.getElementById("errorBox");
    const submitBtn = document.getElementById("submitBtn");

    toggleBtn.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      toggleBtn.textContent = hidden ? "隐藏" : "显示";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.textContent = "验证中...";
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: input.value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errorBox.textContent = data.error || "访问密钥错误，请重试";
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "进入控制台";
          return;
        }
        const target = typeof nextPath === "string" && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
        window.location.assign(target);
      } catch (err) {
        errorBox.textContent = "网络请求失败，请检查连接后重试";
        errorBox.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "进入控制台";
      }
    });
  </script>
</body>
</html>`;
}

export function renderAppPage(initialDay?: string): string {
  const safeInitialDay = initialDay ?? "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DailyDomain · 每日新注域名库 (domains.guaxiaai.com)</title>
  <style>
    ${SHARED_STYLES}
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-right: auto;
    }
    .brand-logo {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-family: var(--mono);
      font-size: 13px;
    }
    .brand-title { font-weight: 700; font-size: 15px; }
    .brand-sub { font-size: 12px; color: var(--text-subtle); font-family: var(--mono); }
    .global-search {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      max-width: 520px;
      min-width: 240px;
    }
    .global-search input[type="search"] {
      width: 100%;
      padding: 7px 12px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--bg);
      outline: none;
    }
    .global-search input[type="search"]:focus { border-color: var(--accent); background: #fff; }
    .regex-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 12px;
      font-family: var(--mono);
      cursor: pointer;
      white-space: nowrap;
      user-select: none;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .regex-toggle input { margin: 0; accent-color: var(--accent); cursor: pointer; }
    .regex-toggle:has(input:checked) {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }
    .regex-hints {
      display: none;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .regex-hints.open { display: flex; }
    .regex-chip {
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #fff;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--text);
      cursor: pointer;
    }
    .regex-chip:hover { border-color: var(--accent); color: var(--accent); }
    .top-actions { display: flex; align-items: center; gap: 8px; }
    .container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 18px 20px 40px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: var(--shadow-sm);
    }
    .kpi-label { font-size: 12px; color: var(--text-subtle); margin-bottom: 4px; }
    .kpi-value { font-size: 22px; font-weight: 700; font-family: var(--mono); }
    .kpi-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .chart-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 16px;
      box-shadow: var(--shadow-sm);
    }
    .chart-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 600;
    }
    .chart-bars {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      height: 88px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .chart-bar-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 44px;
      flex: 1;
      max-width: 72px;
      cursor: pointer;
      gap: 4px;
    }
    .chart-bar-track {
      width: 100%;
      height: 58px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: var(--surface-2);
      border-radius: 6px;
      padding: 3px;
    }
    .chart-bar {
      width: 100%;
      border-radius: 4px;
      background: #818cf8;
      transition: background 0.15s, height 0.2s;
      min-height: 4px;
    }
    .chart-bar-wrap.active .chart-bar { background: var(--accent); }
    .chart-bar-wrap:hover .chart-bar { background: var(--accent-hover); }
    .chart-date { font-size: 11px; font-family: var(--mono); color: var(--text-subtle); }
    .chart-bar-wrap.active .chart-date { color: var(--accent); font-weight: 700; }
    .workspace {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: var(--shadow-sm);
    }
    .panel-head {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-weight: 600;
    }
    .day-list {
      max-height: 760px;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .day-item {
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      background: var(--bg);
    }
    .day-item:hover { background: var(--surface-2); }
    .day-item.active {
      background: var(--accent-soft);
      border-color: #c7d2fe;
    }
    .day-row-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 4px;
    }
    .day-title { font-weight: 700; font-family: var(--mono); font-size: 14px; }
    .day-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
    }
    .main-body { padding: 16px; }
    .day-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 14px;
    }
    .day-banner h2 { margin: 0; font-size: 20px; font-family: var(--mono); }
    .day-submeta { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    .dl-group { display: flex; flex-wrap: wrap; gap: 6px; }
    .tld-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 14px;
    }
    .tld-chip {
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .tld-chip:hover { border-color: var(--accent); }
    .tld-chip.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .tld-chip-cnt { opacity: 0.78; font-family: var(--mono); font-size: 11px; }
    .filters-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .filter-row input, .filter-row select {
      padding: 7px 10px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: #fff;
      outline: none;
    }
    .filter-row input:focus, .filter-row select:focus { border-color: var(--accent); }
    .alpha-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .alpha-btn {
      padding: 3px 7px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #fff;
      font-family: var(--mono);
      font-size: 11px;
      cursor: pointer;
    }
    .alpha-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 9px 12px;
      border-bottom: 1px solid var(--border);
    }
    th { background: var(--surface-2); font-size: 12px; color: var(--text-muted); font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }
    .domain-cell {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .domain-name { font-family: var(--mono); font-weight: 500; word-break: break-all; }
    .row-actions { display: flex; align-items: center; gap: 6px; }
    .pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 14px;
    }
    .pager-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .jump-input {
      width: 72px;
      padding: 5px 8px;
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      text-align: center;
    }
    .empty-state {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-subtle);
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 50;
      padding: 16px;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      width: 100%;
      max-width: 480px;
      background: var(--surface);
      border-radius: 14px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .modal h3 { margin: 0 0 8px; font-size: 17px; }
    .modal p { margin: 0 0 14px; color: var(--text-muted); font-size: 13px; }
    .modal-field { margin-bottom: 12px; }
    .modal-field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
    .modal-field input[type="date"], .modal-field input[type="text"] {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
    }
    .sync-log {
      margin-top: 12px;
      max-height: 160px;
      overflow-y: auto;
      font-family: var(--mono);
      font-size: 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      display: none;
    }
    .toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      background: #0f172a;
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      box-shadow: var(--shadow);
      display: none;
      z-index: 60;
    }
    @media (max-width: 960px) {
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .workspace { grid-template-columns: 1fr; }
      .day-list { max-height: 280px; }
    }
    @media (max-width: 560px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="brand-logo">DD</div>
      <div>
        <div class="brand-title">DailyDomain 每日域名数据库</div>
        <div class="brand-sub">domains.guaxiaai.com</div>
      </div>
    </div>
    <form id="globalSearchForm" class="global-search">
      <input id="globalSearchInput" type="search" placeholder="跨天全局搜索域名关键词（至少 2 个字符，如 openai）" />
      <label class="regex-toggle" title="启用正则表达式跨天搜索"><input id="globalRegexCheck" type="checkbox" /><span>正则</span></label>
      <button type="submit" class="btn btn-primary">全局搜索</button>
    </form>
    <div class="top-actions">
      <button type="button" id="openSyncBtn" class="btn">+ 同步 / 补拉日期</button>
      <button type="button" id="logoutBtn" class="btn">退出登录</button>
    </div>
  </header>

  <div class="container">
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">已收录天数</div>
        <div id="kpiDays" class="kpi-value">-</div>
        <div class="kpi-sub">按天归档索引</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">累计新注域名数</div>
        <div id="kpiTotal" class="kpi-value">-</div>
        <div class="kpi-sub">去重校验入库</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">最新日期及新增量</div>
        <div id="kpiLatest" class="kpi-value">-</div>
        <div id="kpiLatestSub" class="kpi-sub">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">定时同步策略</div>
        <div class="kpi-value" style="font-size:16px;padding-top:4px;">每日自动拉取</div>
        <div class="kpi-sub mono">UTC 06:15 / 12:15 / 18:15</div>
      </div>
    </section>

    <section class="chart-card">
      <div class="chart-head">
        <span>每日域名数量趋势（点击柱条切换日期）</span>
        <span id="chartRangeInfo" class="mono" style="font-weight:400;color:var(--text-subtle);"></span>
      </div>
      <div id="chartBars" class="chart-bars"></div>
    </section>

    <section class="workspace">
      <aside class="panel">
        <div class="panel-head">
          <span>按天归类归档</span>
          <button type="button" id="refreshBtn" class="btn btn-sm">刷新</button>
        </div>
        <div id="dayList" class="day-list"></div>
      </aside>

      <main class="panel">
        <div id="globalSearchPanel" style="display:none;" class="main-body">
          <div class="day-banner">
            <div>
              <h2 id="globalResultTitle">跨天搜索结果</h2>
              <div id="globalResultMeta" class="day-submeta"></div>
            </div>
            <button type="button" id="closeGlobalSearchBtn" class="btn">返回按天浏览</button>
          </div>
          <div id="globalDaySummary" class="tld-chips"></div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:120px;">日期</th>
                  <th>域名</th>
                  <th style="width:90px;">后缀</th>
                  <th style="width:120px;">操作</th>
                </tr>
              </thead>
              <tbody id="globalResultBody"></tbody>
            </table>
          </div>
        </div>

        <div id="dayWorkspacePanel" class="main-body">
          <div class="day-banner">
            <div>
              <h2 id="selectedDayHeading">请选择日期</h2>
              <div id="selectedDayMeta" class="day-submeta">加载中...</div>
            </div>
            <div class="dl-group">
              <button type="button" id="dlTxtBtn" class="btn btn-sm">下载 TXT</button>
              <button type="button" id="dlCsvBtn" class="btn btn-sm">下载 CSV</button>
              <button type="button" id="dlZipBtn" class="btn btn-sm">下载原始 ZIP</button>
              <button type="button" id="resyncDayBtn" class="btn btn-sm">重拉当天</button>
            </div>
          </div>

          <div id="tldChips" class="tld-chips"></div>

          <div class="filters-box">
            <div class="filter-row">
              <input id="filterQuery" type="text" placeholder="当天关键词过滤（如 ai / cloud）" style="flex:1;min-width:180px;" />
              <label class="regex-toggle" title="启用正则表达式过滤当天域名"><input id="filterRegexCheck" type="checkbox" /><span>正则</span></label>
              <input id="filterTld" type="text" placeholder="后缀 TLD（如 com / ai）" style="width:150px;" />
              <input id="filterPrefix" type="text" placeholder="前缀（如 a / shop）" style="width:150px;" />
              <select id="pageSizeSelect" aria-label="每页数量">
                <option value="50">50 / 页</option>
                <option value="100" selected>100 / 页</option>
                <option value="200">200 / 页</option>
                <option value="500">500 / 页</option>
              </select>
              <button type="button" id="applyFiltersBtn" class="btn btn-primary btn-sm">筛选</button>
              <button type="button" id="resetFiltersBtn" class="btn btn-sm">重置</button>
            </div>
            <div id="regexHints" class="regex-hints">
              <span>正则示例：</span>
              <button type="button" class="regex-chip" data-regex="^[a-z]{4}\\.ai$">4字母.ai</button>
              <button type="button" class="regex-chip" data-regex="^\\d{4,6}\\.com$">纯数字.com</button>
              <button type="button" class="regex-chip" data-regex="([a-z0-9])\\1{2}">3连叠字</button>
              <button type="button" class="regex-chip" data-regex="^(ai|gpt|agent).*\\.com$">AI前缀.com</button>
            </div>
            <div id="alphaBar" class="alpha-bar"></div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:84px;">序号</th>
                  <th>域名</th>
                  <th style="width:100px;">TLD</th>
                  <th style="width:130px;">操作</th>
                </tr>
              </thead>
              <tbody id="domainTableBody"></tbody>
            </table>
          </div>

          <div class="pagination">
            <div id="pageSummary" class="day-submeta"></div>
            <div class="pager-controls">
              <button type="button" id="prevPageBtn" class="btn btn-sm">上一页</button>
              <span id="pageIndicator" class="mono" style="font-size:12px;">1 / 1</span>
              <button type="button" id="nextPageBtn" class="btn btn-sm">下一页</button>
              <input id="jumpPageInput" class="jump-input" type="number" min="1" placeholder="页码" />
              <button type="button" id="jumpPageBtn" class="btn btn-sm">跳转</button>
            </div>
          </div>
        </div>
      </main>
    </section>
  </div>

  <div id="syncModal" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal">
      <h3>同步 / 补拉指定日期数据</h3>
      <p>从 WhoisExtractor Daily API 拉取指定日期的域名压缩包，存档至 R2 并入库 D1。</p>
      <div class="modal-field">
        <label for="syncStartDate">起始日期（UTC）</label>
        <input id="syncStartDate" type="date" />
      </div>
      <div class="modal-field">
        <label for="syncEndDate">结束日期（可选，单次最多 7 天）</label>
        <input id="syncEndDate" type="date" />
      </div>
      <div class="modal-field" style="display:flex;align-items:center;gap:8px;">
        <input id="syncForceCheck" type="checkbox" />
        <label for="syncForceCheck" style="margin:0;">强制重新拉取覆盖已完成日期</label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button type="button" id="closeSyncBtn" class="btn">关闭</button>
        <button type="button" id="runSyncBtn" class="btn btn-primary">开始同步</button>
      </div>
      <div id="syncLog" class="sync-log"></div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    const INITIAL_DAY = ${safeJsonForScript(safeInitialDay)};
    const state = {
      overview: null,
      selectedDay: INITIAL_DAY || "",
      dayDetail: null,
      page: 1,
      pageSize: 100,
      q: "",
      regex: false,
      tld: "",
      prefix: "",
      totalPages: 1,
      globalMode: false,
    };

    const $ = (id) => document.getElementById(id);

    function esc(str) {
      return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function fmtNum(n) {
      return Number(n || 0).toLocaleString("en-US");
    }

    function fmtBytes(bytes) {
      const b = Number(bytes || 0);
      if (b < 1024) return b + " B";
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
      return (b / (1024 * 1024)).toFixed(2) + " MB";
    }

    function getWeekday(dayStr) {
      const dt = new Date(dayStr + "T00:00:00Z");
      if (Number.isNaN(dt.getTime())) return "";
      const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return names[dt.getUTCDay()];
    }

    function showToast(msg) {
      const el = $("toast");
      el.textContent = msg;
      el.style.display = "block";
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => { el.style.display = "none"; }, 2600);
    }

    function statusBadge(status) {
      if (status === "completed") return '<span class="badge badge-ok">已完成</span>';
      if (status === "unavailable") return '<span class="badge badge-warn">未发布</span>';
      if (status === "failed") return '<span class="badge badge-err">失败</span>';
      if (status === "syncing") return '<span class="badge badge-muted">同步中</span>';
      return '<span class="badge badge-muted">' + esc(status) + '</span>';
    }

    async function apiFetch(url, options) {
      const res = await fetch(url, options);
      if (res.status === 401) {
        window.location.assign("/login?next=" + encodeURIComponent(window.location.pathname));
        throw new Error("未登录");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "请求失败 (" + res.status + ")");
      }
      return data;
    }

    function renderAlphaBar() {
      const prefixes = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
      for (let c = 97; c <= 122; c++) prefixes.push(String.fromCharCode(c));
      $("alphaBar").innerHTML = prefixes
        .map((p) => {
          const active = state.prefix === p ? " active" : "";
          const label = p === "" ? "全部" : p.toUpperCase();
          return '<button type="button" class="alpha-btn' + active + '" data-prefix="' + esc(p) + '">' + esc(label) + '</button>';
        })
        .join("");
    }

    function renderOverview() {
      const ov = state.overview;
      if (!ov) return;

      $("kpiDays").textContent = fmtNum(ov.totalDays);
      $("kpiTotal").textContent = fmtNum(ov.totalDomains);
      if (ov.latestDay) {
        $("kpiLatest").textContent = ov.latestDay.day;
        $("kpiLatestSub").textContent = fmtNum(ov.latestDay.total_count) + " 个域名 · " + fmtNum(ov.latestDay.tld_count) + " 种后缀";
      } else {
        $("kpiLatest").textContent = "暂无数据";
        $("kpiLatestSub").textContent = "请点击右上角同步数据";
      }

      const days = ov.days || [];
      if (!state.selectedDay || !days.some((d) => d.day === state.selectedDay)) {
        const firstDone = days.find((d) => d.status === "completed") || days[0];
        state.selectedDay = firstDone ? firstDone.day : "";
      }

      const completedDesc = days.filter((d) => d.status === "completed").slice(0, 30);
      const chartDays = completedDesc.slice().reverse();
      const maxCount = Math.max(1, ...chartDays.map((d) => Number(d.total_count || 0)));
      $("chartRangeInfo").textContent = chartDays.length ? chartDays[0].day + " ~ " + chartDays[chartDays.length - 1].day : "";
      $("chartBars").innerHTML = chartDays.length
        ? chartDays
            .map((d) => {
              const pct = Math.max(6, Math.round((Number(d.total_count || 0) / maxCount) * 100));
              const active = d.day === state.selectedDay ? " active" : "";
              return (
                '<div class="chart-bar-wrap' + active + '" data-day="' + esc(d.day) + '" title="' + esc(d.day + ": " + fmtNum(d.total_count) + " 个域名") + '">' +
                '<div class="chart-bar-track"><div class="chart-bar" style="height:' + pct + '%"></div></div>' +
                '<span class="chart-date">' + esc(d.day.slice(5)) + '</span>' +
                '</div>'
              );
            })
            .join("")
        : '<div style="color:var(--text-subtle);font-size:13px;">暂无已完成日期的统计数据</div>';

      $("dayList").innerHTML = days.length
        ? days
            .map((d) => {
              const active = d.day === state.selectedDay ? " active" : "";
              return (
                '<div class="day-item' + active + '" data-day="' + esc(d.day) + '">' +
                '<div class="day-row-top">' +
                '<span class="day-title">' + esc(d.day) + '</span>' +
                statusBadge(d.status) +
                '</div>' +
                '<div class="day-meta">' +
                '<span>' + esc(getWeekday(d.day)) + ' · ' + fmtNum(d.total_count) + ' 域名</span>' +
                '<span>' + fmtNum(d.tld_count) + ' TLD</span>' +
                '</div>' +
                '</div>'
              );
            })
            .join("")
        : '<div class="empty-state">尚未同步任何日期，请点击右上角「同步 / 补拉日期」。</div>';
    }

    function updateDownloadButtons() {
      const hasFilter = Boolean(state.tld || state.q);
      $("dlTxtBtn").textContent = hasFilter ? "下载筛选 TXT" : "下载 TXT";
      $("dlCsvBtn").textContent = hasFilter ? "下载筛选 CSV" : "下载 CSV";
      $("dlZipBtn").disabled = !state.dayDetail || !state.dayDetail.batch || !state.dayDetail.batch.r2_key;
    }

    async function loadDay(day) {
      if (!day) {
        $("selectedDayHeading").textContent = "暂无已同步日期";
        $("selectedDayMeta").textContent = "请点击右上角「同步 / 补拉日期」开始拉取数据";
        $("tldChips").innerHTML = "";
        $("domainTableBody").innerHTML = "";
        return;
      }
      state.selectedDay = day;
      state.globalMode = false;
      $("globalSearchPanel").style.display = "none";
      $("dayWorkspacePanel").style.display = "block";

      if (window.location.pathname !== "/day/" + day && window.location.pathname !== "/") {
        history.replaceState(null, "", "/day/" + day);
      }

      renderOverview();
      $("selectedDayHeading").textContent = day + " · " + getWeekday(day);
      $("selectedDayMeta").textContent = "正在加载当日详情...";

      const detail = await apiFetch("/api/days/" + encodeURIComponent(day));
      state.dayDetail = detail;
      const b = detail.batch;
      $("selectedDayMeta").textContent =
        "共 " + fmtNum(b.total_count) + " 个域名 · " +
        fmtNum(b.tld_count) + " 种后缀 · 原始压缩包 " + fmtBytes(b.zip_size_bytes) +
        (b.synced_at ? " · 同步于 " + new Date(b.synced_at).toLocaleString("zh-CN") : "");

      const total = Math.max(1, Number(b.total_count || 0));
      const chips = (detail.topTlds || []).slice(0, 20);
      $("tldChips").innerHTML =
        '<button type="button" class="tld-chip' + (state.tld === "" ? " active" : "") + '" data-tld="">全部后缀 <span class="tld-chip-cnt">' + fmtNum(b.total_count) + '</span></button>' +
        chips
          .map((item) => {
            const pct = ((Number(item.domain_count) / total) * 100).toFixed(1);
            const active = state.tld === item.tld ? " active" : "";
            return (
              '<button type="button" class="tld-chip' + active + '" data-tld="' + esc(item.tld) + '">' +
              '.' + esc(item.tld) +
              ' <span class="tld-chip-cnt">' + fmtNum(item.domain_count) + ' (' + pct + '%)</span>' +
              '</button>'
            );
          })
          .join("");

      updateDownloadButtons();
      await loadDayDomains();
    }

    async function loadDayDomains() {
      if (!state.selectedDay) return;
      renderAlphaBar();
      updateDownloadButtons();
      $("domainTableBody").innerHTML = '<tr><td colspan="4" class="empty-state">查询中...</td></tr>';

      const qs = new URLSearchParams({
        page: String(state.page),
        pageSize: String(state.pageSize),
      });
      if (state.q) {
        qs.set("q", state.q);
        if (state.regex) qs.set("regex", "1");
      }
      if (state.tld) qs.set("tld", state.tld);
      if (state.prefix) qs.set("prefix", state.prefix);

      const data = await apiFetch("/api/days/" + encodeURIComponent(state.selectedDay) + "/domains?" + qs.toString());
      state.page = data.page;
      state.totalPages = data.totalPages;

      $("pageIndicator").textContent = data.page + " / " + data.totalPages;
      $("prevPageBtn").disabled = data.page <= 1;
      $("nextPageBtn").disabled = data.page >= data.totalPages;
      $("pageSummary").textContent =
        "匹配 " + fmtNum(data.total) + " 条 · 当前显示第 " +
        (data.items.length ? fmtNum((data.page - 1) * data.pageSize + 1) + " - " + fmtNum((data.page - 1) * data.pageSize + data.items.length) : "0") +
        " 条";

      if (!data.items.length) {
        $("domainTableBody").innerHTML = '<tr><td colspan="4" class="empty-state">当前筛选条件下没有匹配的域名</td></tr>';
        return;
      }

      $("domainTableBody").innerHTML = data.items
        .map((item) => {
          return (
            '<tr>' +
            '<td class="mono" style="color:var(--text-subtle);">#' + fmtNum(item.rank) + '</td>' +
            '<td><div class="domain-cell"><span class="domain-name">' + esc(item.domain) + '</span></div></td>' +
            '<td><button type="button" class="btn btn-sm mono" data-pick-tld="' + esc(item.tld) + '">.' + esc(item.tld) + '</button></td>' +
            '<td><div class="row-actions">' +
            '<button type="button" class="btn btn-sm" data-copy="' + esc(item.domain) + '">复制</button>' +
            '<a class="btn btn-sm" href="https://' + esc(item.domain) + '" target="_blank" rel="noopener noreferrer">访问</a>' +
            '</div></td>' +
            '</tr>'
          );
        })
        .join("");
    }

    async function loadOverviewAndInit() {
      state.overview = await apiFetch("/api/overview");
      renderOverview();
      if (state.selectedDay) {
        await loadDay(state.selectedDay);
      } else {
        await loadDay("");
      }
    }

    function validateClientRegex(raw) {
      let pat = raw.trim();
      const m = pat.match(new RegExp("^/(.+)/([a-z]*)$", "i"));
      if (m) {
        if (!/^i?$/i.test(m[2])) {
          return "仅支持 i 标志或直接输入表达式，无需 g/m 等标志";
        }
        pat = m[1];
      }
      if (!pat) return "正则表达式不能为空";
      if (pat.length > 120) return "正则表达式长度不能超过 120 个字符";
      try {
        new RegExp(pat, "i");
        return "";
      } catch (e) {
        return "正则表达式语法错误: " + e.message;
      }
    }

    async function runGlobalSearch(q) {
      const useRegex = $("globalRegexCheck").checked;
      const trimmed = useRegex ? q.trim() : q.trim().toLowerCase();
      if (useRegex) {
        const err = validateClientRegex(trimmed);
        if (err) {
          showToast(err);
          return;
        }
      } else if (trimmed.length < 2) {
        showToast("全局搜索请至少输入 2 个字符");
        return;
      }
      state.globalMode = true;
      $("dayWorkspacePanel").style.display = "none";
      $("globalSearchPanel").style.display = "block";
      $("globalResultTitle").textContent = (useRegex ? "全局正则搜索：" : "全局搜索：") + trimmed;
      $("globalResultMeta").textContent = "正在跨天检索...";
      $("globalDaySummary").innerHTML = "";
      $("globalResultBody").innerHTML = '<tr><td colspan="4" class="empty-state">检索中...</td></tr>';

      const qs = new URLSearchParams({ q: trimmed, limit: "150" });
      if (useRegex) qs.set("regex", "1");
      if (state.tld) qs.set("tld", state.tld);
      const res = await apiFetch("/api/search?" + qs.toString());

      $("globalResultMeta").textContent =
        "返回 " + fmtNum(res.totalReturned) + " 条匹配" + (res.truncated ? "（已达展示上限或扫描超时，请细化规则）" : "");
      $("globalDaySummary").innerHTML = (res.perDayCounts || [])
        .map((d) => '<span class="tld-chip" data-jump-day="' + esc(d.day) + '">' + esc(d.day) + ' <span class="tld-chip-cnt">' + fmtNum(d.count) + '</span></span>')
        .join("");

      $("globalResultBody").innerHTML = res.items.length
        ? res.items
            .map(
              (item) =>
                '<tr>' +
                '<td class="mono"><a href="#" data-jump-day="' + esc(item.day) + '">' + esc(item.day) + '</a></td>' +
                '<td class="mono">' + esc(item.domain) + '</td>' +
                '<td class="mono">.' + esc(item.tld) + '</td>' +
                '<td><div class="row-actions">' +
                '<button type="button" class="btn btn-sm" data-copy="' + esc(item.domain) + '">复制</button>' +
                '<a class="btn btn-sm" href="https://' + esc(item.domain) + '" target="_blank" rel="noopener noreferrer">访问</a>' +
                '</div></td>' +
                '</tr>',
            )
            .join("")
        : '<tr><td colspan="4" class="empty-state">未找到匹配该关键词的域名</td></tr>';
    }

    function triggerDownload(format) {
      if (!state.selectedDay) return;
      const qs = new URLSearchParams({ format });
      if (format !== "zip") {
        if (state.tld) qs.set("tld", state.tld);
        if (state.q) {
          qs.set("q", state.q);
          if (state.regex) qs.set("regex", "1");
        }
      }
      window.location.assign("/api/days/" + encodeURIComponent(state.selectedDay) + "/download?" + qs.toString());
    }

    function applyFilterInputs(resetPage = true) {
      const useRegex = $("filterRegexCheck").checked;
      const rawQ = $("filterQuery").value.trim();
      if (useRegex && rawQ) {
        const err = validateClientRegex(rawQ);
        if (err) {
          showToast(err);
          return;
        }
      }
      state.regex = useRegex;
      state.q = useRegex ? rawQ : rawQ.toLowerCase();
      state.tld = $("filterTld").value.trim().toLowerCase().replace(/^\\.+/, "");
      state.prefix = $("filterPrefix").value.trim().toLowerCase();
      state.pageSize = Number($("pageSizeSelect").value) || 100;
      if (resetPage) state.page = 1;
      loadDayDomains().catch((e) => showToast(e.message));
    }

    $("chartBars").addEventListener("click", (e) => {
      const wrap = e.target.closest("[data-day]");
      if (wrap) {
        state.page = 1;
        loadDay(wrap.dataset.day).catch((err) => showToast(err.message));
      }
    });

    $("dayList").addEventListener("click", (e) => {
      const item = e.target.closest("[data-day]");
      if (item) {
        state.page = 1;
        loadDay(item.dataset.day).catch((err) => showToast(err.message));
      }
    });

    $("tldChips").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tld]");
      if (!chip) return;
      const nextTld = chip.dataset.tld || "";
      state.tld = state.tld === nextTld ? "" : nextTld;
      $("filterTld").value = state.tld;
      state.page = 1;
      loadDay(state.selectedDay).catch((err) => showToast(err.message));
    });

    $("alphaBar").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-prefix]");
      if (!btn) return;
      state.prefix = btn.dataset.prefix || "";
      $("filterPrefix").value = state.prefix;
      state.page = 1;
      loadDayDomains().catch((err) => showToast(err.message));
    });

    document.body.addEventListener("click", async (e) => {
      const copyBtn = e.target.closest("[data-copy]");
      if (copyBtn) {
        try {
          await navigator.clipboard.writeText(copyBtn.dataset.copy);
          showToast("已复制: " + copyBtn.dataset.copy);
        } catch {
          showToast("复制失败，请手动复制");
        }
        return;
      }
      const pickTld = e.target.closest("[data-pick-tld]");
      if (pickTld) {
        state.tld = pickTld.dataset.pickTld;
        $("filterTld").value = state.tld;
        state.page = 1;
        loadDay(state.selectedDay).catch((err) => showToast(err.message));
        return;
      }
      const jumpDay = e.target.closest("[data-jump-day]");
      if (jumpDay) {
        e.preventDefault();
        state.page = 1;
        loadDay(jumpDay.dataset.jumpDay).catch((err) => showToast(err.message));
      }
    });

    $("applyFiltersBtn").addEventListener("click", () => applyFilterInputs(true));
    $("pageSizeSelect").addEventListener("change", () => applyFilterInputs(true));
    $("globalRegexCheck").addEventListener("change", () => {
      $("globalSearchInput").placeholder = $("globalRegexCheck").checked
        ? "跨天正则搜索（如 ^[a-z]{4}\\\\.ai$ 或 ^(ai|gpt).*\\\\.com$）"
        : "跨天全局搜索域名关键词（至少 2 个字符，如 openai）";
    });
    $("filterRegexCheck").addEventListener("change", () => {
      const checked = $("filterRegexCheck").checked;
      state.regex = checked;
      $("regexHints").classList.toggle("open", checked);
      $("filterQuery").placeholder = checked
        ? "输入正则表达式（如 ^[a-z]{4}\\\\.ai$ 或 ^\\\\d{4,6}\\\\.com$）"
        : "当天关键词过滤（如 ai / cloud）";
      if ($("filterQuery").value.trim()) {
        applyFilterInputs(true);
      }
    });
    $("regexHints").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-regex]");
      if (!chip) return;
      $("filterRegexCheck").checked = true;
      $("regexHints").classList.add("open");
      $("filterQuery").value = chip.dataset.regex || "";
      applyFilterInputs(true);
    });
    ["filterQuery", "filterTld", "filterPrefix"].forEach((id) => {
      $(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyFilterInputs(true);
        }
      });
    });

    $("resetFiltersBtn").addEventListener("click", () => {
      state.q = "";
      state.regex = false;
      state.tld = "";
      state.prefix = "";
      state.page = 1;
      $("filterRegexCheck").checked = false;
      $("regexHints").classList.remove("open");
      $("filterQuery").placeholder = "当天关键词过滤（如 ai / cloud）";
      $("filterQuery").value = "";
      $("filterTld").value = "";
      $("filterPrefix").value = "";
      loadDay(state.selectedDay).catch((err) => showToast(err.message));
    });

    $("prevPageBtn").addEventListener("click", () => {
      if (state.page > 1) {
        state.page--;
        loadDayDomains().catch((err) => showToast(err.message));
      }
    });
    $("nextPageBtn").addEventListener("click", () => {
      if (state.page < state.totalPages) {
        state.page++;
        loadDayDomains().catch((err) => showToast(err.message));
      }
    });
    $("jumpPageBtn").addEventListener("click", () => {
      const target = Number($("jumpPageInput").value);
      if (target >= 1 && target <= state.totalPages) {
        state.page = Math.floor(target);
        loadDayDomains().catch((err) => showToast(err.message));
      }
    });

    $("dlTxtBtn").addEventListener("click", () => triggerDownload("txt"));
    $("dlCsvBtn").addEventListener("click", () => triggerDownload("csv"));
    $("dlZipBtn").addEventListener("click", () => triggerDownload("zip"));

    $("resyncDayBtn").addEventListener("click", async () => {
      if (!state.selectedDay) return;
      const btn = $("resyncDayBtn");
      btn.disabled = true;
      btn.textContent = "同步中...";
      try {
        const res = await apiFetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: state.selectedDay, force: true }),
        });
        const r = res.results && res.results[0];
        showToast("同步完成：" + (r ? fmtNum(r.totalCount) + " 个域名" : "OK"));
        await loadOverviewAndInit();
      } catch (err) {
        showToast(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "重拉当天";
      }
    });

    $("globalSearchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      runGlobalSearch($("globalSearchInput").value).catch((err) => showToast(err.message));
    });

    $("closeGlobalSearchBtn").addEventListener("click", () => {
      state.globalMode = false;
      $("globalSearchPanel").style.display = "none";
      $("dayWorkspacePanel").style.display = "block";
    });

    $("refreshBtn").addEventListener("click", () => {
      loadOverviewAndInit().catch((err) => showToast(err.message));
    });

    $("logoutBtn").addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    $("syncStartDate").value = todayStr;

    $("openSyncBtn").addEventListener("click", () => {
      $("syncLog").style.display = "none";
      $("syncLog").textContent = "";
      $("syncModal").classList.add("open");
    });
    $("closeSyncBtn").addEventListener("click", () => $("syncModal").classList.remove("open"));

    $("runSyncBtn").addEventListener("click", async () => {
      const start = $("syncStartDate").value;
      const end = $("syncEndDate").value || start;
      const force = $("syncForceCheck").checked;
      if (!start) {
        showToast("请选择起始日期");
        return;
      }
      const dates = [];
      let cur = new Date(start + "T00:00:00Z");
      const stop = new Date(end + "T00:00:00Z");
      if (cur > stop) {
        showToast("起始日期不能晚于结束日期");
        return;
      }
      while (cur <= stop && dates.length < 8) {
        dates.push(cur.toISOString().slice(0, 10));
        cur = new Date(cur.getTime() + 86400000);
      }
      if (dates.length > 7) {
        showToast("单次同步最多支持 7 天");
        return;
      }

      const btn = $("runSyncBtn");
      const logEl = $("syncLog");
      btn.disabled = true;
      btn.textContent = "同步中...";
      logEl.style.display = "block";
      logEl.textContent = "";

      try {
        for (const d of dates) {
          logEl.textContent += "正在拉取 " + d + "...\\n";
          const res = await apiFetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: d, force }),
          });
          const item = res.results && res.results[0];
          if (item) {
            logEl.textContent += " -> " + item.status + (item.totalCount ? " (" + fmtNum(item.totalCount) + " 域名)" : "") + (item.error ? " [" + item.error + "]" : "") + "\\n";
          }
        }
        await loadOverviewAndInit();
        showToast("批量同步完成");
      } catch (err) {
        logEl.textContent += "错误: " + err.message + "\\n";
      } finally {
        btn.disabled = false;
        btn.textContent = "开始同步";
      }
    });

    renderAlphaBar();
    loadOverviewAndInit().catch((err) => {
      $("selectedDayMeta").textContent = "加载失败: " + err.message;
    });
  </script>
</body>
</html>`;
}
