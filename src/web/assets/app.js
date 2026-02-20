// @group BusinessLogic : Dashboard JS — fetches process data and renders the UI

const API = '/api/v1';
let autoRefreshTimer = null;
let activeLogStream = null;
let activeLogProcessId = null;
let activeDetailProcess = null; // { id, name, cwd, status }

// @group BusinessLogic > Init : Page load
window.addEventListener('DOMContentLoaded', () => {
  loadProcesses();
  loadHealth();
  startAutoRefresh();
});

// @group BusinessLogic > Cleanup : Close SSE streams when page hides or unloads
window.addEventListener('beforeunload', () => {
  closeDetailStream();
  if (activeLogStream) { activeLogStream.close(); activeLogStream = null; }
  clearInterval(autoRefreshTimer);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    closeDetailStream();
    if (activeLogStream) { activeLogStream.close(); activeLogStream = null; }
  }
});

// @group BusinessLogic > Data : Fetch and render process list
async function loadProcesses() {
  try {
    const res = await fetch(`${API}/processes`);
    if (!res.ok) return; // don't wipe UI on a bad response
    const data = await res.json();
    const processes = data.processes || [];
    renderTable(processes);
    renderSidebarProcesses(processes);
  } catch (e) {
    // Only update the status badge — never wipe the sidebar/table on a transient error
    document.getElementById('daemon-status').textContent = '●  disconnected';
    document.getElementById('daemon-status').className = 'badge badge-err';
  }
}

// @group BusinessLogic > Data : Fetch daemon health info
async function loadHealth() {
  try {
    const res = await fetch(`${API}/system/health`);
    const data = await res.json();
    document.getElementById('uptime-label').textContent =
      `v${data.version} · up ${formatUptime(data.uptime_secs)}`;
    document.getElementById('daemon-status').textContent = '●  connected';
    document.getElementById('daemon-status').className = 'badge badge-ok';
  } catch {}
}

// @group BusinessLogic > Render : Build the process table rows
function renderTable(processes) {
  const tbody = document.getElementById('process-tbody');
  if (!processes.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No processes running.</td></tr>';
    return;
  }
  tbody.innerHTML = processes.map(p => `
    <tr>
      <td><code title="${p.id}">${p.id.slice(0, 8)}</code></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td><span class="status-${p.status}">● ${p.status}</span></td>
      <td>${p.pid ?? '-'}</td>
      <td>${p.uptime_secs != null ? formatUptime(p.uptime_secs) : '-'}</td>
      <td>${p.restart_count}</td>
      <td>${p.watch ? '✓' : '-'}</td>
      <td>
        <button class="action-btn" onclick="restartProcess('${p.id}')">Restart</button>
        <button class="action-btn" onclick="stopProcess('${p.id}', '${esc(p.name)}')">Stop</button>
        <button class="action-btn" onclick="openLogs('${p.id}', '${esc(p.name)}')">Logs</button>
        <button class="action-btn" onclick="openEdit('${p.id}')">Edit</button>
        <button class="action-btn action-btn-danger" onclick="deleteProcess('${p.id}', '${esc(p.name)}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// @group BusinessLogic > Render : Build sidebar process list
function renderSidebarProcesses(processes) {
  const container = document.getElementById('sidebar-process-list');
  if (!processes.length) {
    container.innerHTML = '<div class="sidebar-proc-empty">No processes</div>';
    return;
  }
  container.innerHTML = processes.map(p => `
    <button class="sidebar-proc-btn${activeDetailProcess && activeDetailProcess.id === p.id ? ' sidebar-proc-active' : ''}"
            onclick="openProcessDetail('${p.id}', '${esc(p.name)}', '${esc(p.cwd || '')}', '${p.status}')">
      <span class="sidebar-proc-dot status-${p.status}">●</span>
      <span class="sidebar-proc-name">${esc(p.name)}</span>
    </button>
  `).join('');

  // Keep detail view header in sync if it's open
  if (activeDetailProcess) {
    const current = processes.find(p => p.id === activeDetailProcess.id);
    if (current) {
      activeDetailProcess.status = current.status;
      activeDetailProcess.cwd = current.cwd || activeDetailProcess.cwd;
      updateDetailHeader();
    }
  }
}

// @group BusinessLogic > Navigation : Scroll to and highlight a process row in the table
function jumpToProcess(id) {
  showView('processes');
  // Find the row whose first cell title matches the full id
  const rows = document.querySelectorAll('#process-tbody tr');
  for (const row of rows) {
    const code = row.querySelector('code');
    if (code && code.title === id) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('row-highlight');
      setTimeout(() => row.classList.remove('row-highlight'), 1500);
      break;
    }
  }
}

// @group BusinessLogic > Actions : Process control buttons
async function stopProcess(id, name) {
  if (!confirm(`Stop '${name}'?`)) return;
  await fetch(`${API}/processes/${id}/stop`, { method: 'POST' });
  setTimeout(loadProcesses, 300);
}

async function restartProcess(id) {
  await fetch(`${API}/processes/${id}/restart`, { method: 'POST' });
  loadProcesses();
}

async function deleteProcess(id, name) {
  if (!confirm(`Delete '${name}'? This will stop and remove the process.`)) return;
  await fetch(`${API}/processes/${id}`, { method: 'DELETE' });
  setTimeout(loadProcesses, 300);
}

async function saveState() {
  await fetch(`${API}/system/save`, { method: 'POST' });
  alert('State saved.');
}

// @group BusinessLogic > Navigation : Switch between sidebar views
function showView(name) {
  ['processes', 'start', 'edit', 'process-detail'].forEach(v => {
    document.getElementById(`view-${v}`).style.display = v === name ? 'block' : 'none';
  });
  // Update active nav button (only processes/start have nav buttons)
  document.querySelectorAll('.nav-btn').forEach((btn, i) => {
    const views = ['processes', 'start'];
    btn.classList.toggle('nav-btn-active', views[i] === name);
  });
  if (name === 'start') document.getElementById('sf-script').focus();
  // Close detail stream when leaving process-detail
  if (name !== 'process-detail') {
    closeDetailStream();
    activeDetailProcess = null;
    // Re-render sidebar to clear active highlight
    document.querySelectorAll('.sidebar-proc-btn').forEach(b => b.classList.remove('sidebar-proc-active'));
  }
}

// @group BusinessLogic > Actions : Open edit view pre-filled with process config
async function openEdit(id) {
  try {
    const res = await fetch(`${API}/processes/${id}`);
    const p = await res.json();

    document.getElementById('ef-id').value = p.id;
    document.getElementById('ef-script').value = p.script || '';
    document.getElementById('ef-name').value = p.name || '';
    document.getElementById('ef-cwd').value = p.cwd || '';
    document.getElementById('ef-args').value = (p.args || []).join(' ');
    document.getElementById('ef-max-restarts').value = p.max_restarts ?? 10;
    document.getElementById('ef-autorestart').checked = !!p.autorestart;
    document.getElementById('ef-watch').checked = !!p.watch;

    // env: serialise object back to KEY=VAL,KEY=VAL
    const env = p.env || {};
    document.getElementById('ef-env').value =
      Object.entries(env).map(([k, v]) => `${k}=${v}`).join(',');

    document.getElementById('edit-form-error').textContent = '';
    showView('edit');
  } catch (e) {
    alert('Failed to load process config.');
  }
}

// @group BusinessLogic > Actions : Submit edited process config via PATCH
async function saveProcessEdit(event) {
  event.preventDefault();
  const errEl = document.getElementById('edit-form-error');
  errEl.textContent = '';

  const id      = document.getElementById('ef-id').value;
  const script  = document.getElementById('ef-script').value.trim();
  const name    = document.getElementById('ef-name').value.trim() || null;
  const cwd     = document.getElementById('ef-cwd').value.trim() || null;
  const argsRaw = document.getElementById('ef-args').value.trim();
  const envRaw  = document.getElementById('ef-env').value.trim();
  const maxR    = parseInt(document.getElementById('ef-max-restarts').value, 10) || 10;

  const args = argsRaw ? argsRaw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) : [];

  const env = {};
  if (envRaw) {
    for (const pair of envRaw.split(',')) {
      const idx = pair.indexOf('=');
      if (idx > 0) env[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }

  const body = {
    script,
    ...(name && { name }),
    ...(cwd  && { cwd }),
    ...(args.length && { args }),
    ...(Object.keys(env).length && { env }),
    autorestart: document.getElementById('ef-autorestart').checked,
    watch: document.getElementById('ef-watch').checked,
    max_restarts: maxR,
  };

  try {
    const res = await fetch(`${API}/processes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || `Error ${res.status}`;
      return;
    }
    showView('processes');
    loadProcesses();
  } catch (e) {
    errEl.textContent = 'Cannot reach daemon.';
  }
}

// @group BusinessLogic > Actions : Submit start-process form
async function startProcess(event) {
  event.preventDefault();
  const errEl = document.getElementById('start-form-error');
  errEl.textContent = '';

  const script = document.getElementById('sf-script').value.trim();
  const name   = document.getElementById('sf-name').value.trim() || null;
  const cwd    = document.getElementById('sf-cwd').value.trim() || null;
  const argsRaw = document.getElementById('sf-args').value.trim();
  const envRaw  = document.getElementById('sf-env').value.trim();

  // Parse space-separated args
  const args = argsRaw ? argsRaw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) : [];

  // Parse KEY=VAL,KEY=VAL env pairs
  const env = {};
  if (envRaw) {
    for (const pair of envRaw.split(',')) {
      const idx = pair.indexOf('=');
      if (idx > 0) env[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }

  const body = {
    script,
    ...(name && { name }),
    ...(cwd  && { cwd }),
    ...(args.length && { args }),
    ...(Object.keys(env).length && { env }),
    autorestart: document.getElementById('sf-autorestart').checked,
    watch: document.getElementById('sf-watch').checked,
  };

  try {
    const res = await fetch(`${API}/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || `Error ${res.status}`;
      return;
    }
    // Success — reset form, go back to processes view
    document.querySelector('.start-form').reset();
    showView('processes');
    loadProcesses();
  } catch (e) {
    errEl.textContent = 'Cannot reach daemon.';
  }
}

// @group BusinessLogic > Logs : Open log panel and stream logs via SSE
function openLogs(id, name) {
  const section = document.getElementById('log-section');
  const output = document.getElementById('log-output');
  const title = document.getElementById('log-title');

  title.textContent = `Logs — ${name}`;
  output.innerHTML = '';
  section.style.display = 'block';

  // Close any existing stream
  if (activeLogStream) activeLogStream.close();

  activeLogProcessId = id;

  // Load last 100 lines first
  fetch(`${API}/processes/${id}/logs?lines=100`)
    .then(r => r.json())
    .then(data => {
      (data.lines || []).forEach(entry => appendLogLine(entry.stream, entry.content));
      output.scrollTop = output.scrollHeight;
    });

  // Start SSE stream for live lines
  activeLogStream = new EventSource(`${API}/processes/${id}/logs/stream`);
  activeLogStream.onmessage = (e) => {
    try {
      const line = JSON.parse(e.data);
      appendLogLine(line.stream, line.content);
      output.scrollTop = output.scrollHeight;
    } catch {}
  };
  // Close (don't auto-reconnect) when process stops or connection drops
  activeLogStream.onerror = () => {
    if (activeLogStream) { activeLogStream.close(); activeLogStream = null; }
  };
}

function appendLogLine(stream, content) {
  const output = document.getElementById('log-output');
  const div = document.createElement('div');
  div.className = `log-line ${stream === 'stderr' ? 'log-err' : 'log-out'}`;
  div.textContent = content;
  output.appendChild(div);
}

function closeLogs() {
  if (activeLogStream) { activeLogStream.close(); activeLogStream = null; }
  document.getElementById('log-section').style.display = 'none';
}

// @group BusinessLogic > ProcessDetail : Full-screen process detail view with live logs
function openProcessDetail(id, name, cwd, status) {
  // Close old stream if switching processes
  closeDetailStream();

  activeDetailProcess = { id, name, cwd: cwd || '', status };

  // Switch to detail view
  ['processes', 'start', 'edit', 'process-detail'].forEach(v => {
    document.getElementById(`view-${v}`).style.display = v === 'process-detail' ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-btn-active'));
  // Mark active in sidebar
  document.querySelectorAll('.sidebar-proc-btn').forEach(b => {
    const nameEl = b.querySelector('.sidebar-proc-name');
    b.classList.toggle('sidebar-proc-active', nameEl && nameEl.textContent === name);
  });

  updateDetailHeader();

  // Clear and load logs
  const output = document.getElementById('detail-log-output');
  output.innerHTML = '';

  fetch(`${API}/processes/${id}/logs?lines=200`)
    .then(r => r.json())
    .then(data => {
      (data.lines || []).forEach(entry => appendDetailLogLine(entry.stream, entry.content));
      output.scrollTop = output.scrollHeight;
    });

  // SSE live stream
  activeLogStream = new EventSource(`${API}/processes/${id}/logs/stream`);
  activeLogStream.onmessage = (e) => {
    try {
      const line = JSON.parse(e.data);
      appendDetailLogLine(line.stream, line.content);
      output.scrollTop = output.scrollHeight;
    } catch {}
  };
  activeLogStream.onerror = () => {
    if (activeLogStream) { activeLogStream.close(); activeLogStream = null; }
  };
}

function updateDetailHeader() {
  if (!activeDetailProcess) return;
  const { name, status } = activeDetailProcess;
  document.getElementById('detail-proc-name').textContent = name;
  const dot = document.getElementById('detail-proc-dot');
  const stat = document.getElementById('detail-proc-status');
  dot.className = `sidebar-proc-dot status-${status}`;
  stat.textContent = status;
  stat.className = `detail-proc-status status-${status}`;
}

function appendDetailLogLine(stream, content) {
  const output = document.getElementById('detail-log-output');
  const div = document.createElement('div');
  div.className = `log-line ${stream === 'stderr' ? 'log-err' : 'log-out'}`;
  div.textContent = content;
  output.appendChild(div);
}

function closeDetailStream() {
  if (activeLogStream) { activeLogStream.close(); activeLogStream = null; }
}

// @group BusinessLogic > ProcessDetail : Toolbar action buttons
async function detailRestart() {
  if (!activeDetailProcess) return;
  await fetch(`${API}/processes/${activeDetailProcess.id}/restart`, { method: 'POST' });
  loadProcesses();
}

async function detailStop() {
  if (!activeDetailProcess) return;
  if (!confirm(`Stop '${activeDetailProcess.name}'?`)) return;
  await fetch(`${API}/processes/${activeDetailProcess.id}/stop`, { method: 'POST' });
  loadProcesses();
}

function detailEdit() {
  if (!activeDetailProcess) return;
  openEdit(activeDetailProcess.id);
}

async function detailDelete() {
  if (!activeDetailProcess) return;
  if (!confirm(`Delete '${activeDetailProcess.name}'? This will stop and remove the process.`)) return;
  await fetch(`${API}/processes/${activeDetailProcess.id}`, { method: 'DELETE' });
  activeDetailProcess = null;
  showView('processes');
  loadProcesses();
}

function detailOpenVSCode() {
  if (!activeDetailProcess) return;
  const cwd = activeDetailProcess.cwd;
  if (!cwd) { alert('No working directory set for this process.'); return; }
  window.open(`vscode://file/${cwd.replace(/\\/g, '/')}`);
}

// @group BusinessLogic > AutoRefresh : Periodic process list refresh
function startAutoRefresh() {
  autoRefreshTimer = setInterval(() => {
    loadProcesses();
    loadHealth();
  }, 3000);
}

function toggleAutoRefresh() {
  const enabled = document.getElementById('auto-refresh').checked;
  if (enabled) startAutoRefresh();
  else { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

// @group Utilities : Helpers
function formatUptime(secs) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ${secs%60}s`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m`;
  return `${Math.floor(secs/86400)}d ${Math.floor((secs%86400)/3600)}h`;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
