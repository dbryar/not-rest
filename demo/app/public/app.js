/* =============================================
   OpenCALL Demo Library — Dashboard App JS
   Vanilla JS, no frameworks. Modern async/await.
   ============================================= */

'use strict';

/* ===========================================
   UTILITIES
   =========================================== */

/**
 * Debounce a function call by the given number of milliseconds.
 */
function debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, ms);
  };
}

/**
 * Mask a token for display: "demo_abc123..." -> "demo_***"
 */
function maskToken(token) {
  if (!token) return '***';
  const idx = token.indexOf('_');
  if (idx === -1) return '***';
  return token.slice(0, idx + 1) + '***';
}

/**
 * Format an ISO date string for display.
 */
function formatDate(iso) {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Format an ISO date string with time.
 */
function formatDateTime(iso) {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Copy text to clipboard.
 */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1500);
    }
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1500);
    }
  }
}

/**
 * Escape HTML entities for safe insertion into the DOM.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Produce syntax-highlighted HTML for a JSON value.
 * Supports collapsible nested objects/arrays.
 */
function syntaxHighlight(json, indent, collapsed) {
  indent = indent || 0;
  collapsed = collapsed || false;
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (json === null) {
    return '<span class="json-null">null</span>';
  }

  const type = typeof json;

  if (type === 'string') {
    return '<span class="json-string">"' + escapeHtml(json) + '"</span>';
  }

  if (type === 'number') {
    return '<span class="json-number">' + json + '</span>';
  }

  if (type === 'boolean') {
    return '<span class="json-boolean">' + json + '</span>';
  }

  if (Array.isArray(json)) {
    if (json.length === 0) {
      return '<span class="json-bracket">[]</span>';
    }

    const items = json.map((item, i) => {
      const comma = i < json.length - 1 ? ',' : '';
      return padInner + syntaxHighlight(item, indent + 1) + comma;
    });

    const id = 'json-' + Math.random().toString(36).slice(2, 8);
    const count = json.length;

    return '<span class="json-bracket json-collapsible" onclick="toggleJsonCollapse(\'' + id + '\')">[</span>' +
      '<span class="json-ellipsis" id="' + id + '-ellipsis"> ' + count + ' items... </span>' +
      '<span class="json-content" id="' + id + '">\n' +
      items.join('\n') + '\n' +
      pad + '</span><span class="json-bracket">]</span>';
  }

  if (type === 'object') {
    const keys = Object.keys(json);
    if (keys.length === 0) {
      return '<span class="json-bracket">{}</span>';
    }

    const entries = keys.map((key, i) => {
      const comma = i < keys.length - 1 ? ',' : '';
      return padInner +
        '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' +
        syntaxHighlight(json[key], indent + 1) + comma;
    });

    const id = 'json-' + Math.random().toString(36).slice(2, 8);
    const count = keys.length;

    return '<span class="json-bracket json-collapsible" onclick="toggleJsonCollapse(\'' + id + '\')">{</span>' +
      '<span class="json-ellipsis" id="' + id + '-ellipsis"> ' + count + ' keys... </span>' +
      '<span class="json-content" id="' + id + '">\n' +
      entries.join('\n') + '\n' +
      pad + '</span><span class="json-bracket">}</span>';
  }

  return escapeHtml(String(json));
}

/**
 * Toggle collapsible JSON section.
 */
function toggleJsonCollapse(id) {
  const content = document.getElementById(id);
  const ellipsis = document.getElementById(id + '-ellipsis');
  if (!content) return;

  if (content.style.display === 'none') {
    content.style.display = '';
    if (ellipsis) ellipsis.style.display = 'none';
  } else {
    content.style.display = 'none';
    if (ellipsis) ellipsis.style.display = 'inline';
  }
}

// Make toggleJsonCollapse available globally for onclick handlers
window.toggleJsonCollapse = toggleJsonCollapse;


/* ===========================================
   THEME TOGGLE
   =========================================== */

function initTheme() {
  const stored = localStorage.getItem('opencall-theme');
  const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = stored || preferred;
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('opencall-theme', next);
}

// Initialize theme immediately
initTheme();


/* ===========================================
   AUTH & SESSION
   =========================================== */

/**
 * Get auth info from sessionStorage.
 * Returns { token, apiUrl, user } or null if not authenticated.
 */
function getAuth() {
  const token = sessionStorage.getItem('opencall_token');
  const apiUrl = sessionStorage.getItem('opencall_api_url');
  const userJson = sessionStorage.getItem('opencall_user');

  if (!token || !apiUrl) {
    return null;
  }

  const user = userJson ? JSON.parse(userJson) : null;

  // Check expiry
  if (user && user.expiresAt && Date.now() / 1000 > user.expiresAt) {
    sessionStorage.clear();
    return null;
  }

  return { token, apiUrl, user };
}

/**
 * Clear auth and redirect to login.
 */
function logout() {
  sessionStorage.clear();
  window.location.href = '/logout';
}


/* ===========================================
   CORE API CLIENT
   =========================================== */

/**
 * Call the API directly using token from sessionStorage.
 * All operations go through POST ${apiUrl}/call.
 * Returns { status, data, request }.
 */
async function callApi(op, args, ctx) {
  args = args || {};
  ctx = ctx || {};

  const auth = getAuth();
  if (!auth) {
    window.location.href = '/auth';
    return { status: 401, data: { state: 'error', error: { code: 'AUTH_REQUIRED' } }, request: null };
  }

  const requestBody = { op, args };
  if (Object.keys(ctx).length > 0) {
    requestBody.ctx = ctx;
  }

  const apiUrl = auth.apiUrl + '/call';
  const startTime = Date.now();

  // Build request entry for envelope viewer
  const requestEntry = {
    timestamp: startTime,
    op: op,
    method: 'POST',
    url: apiUrl,
    headers: {
      'Authorization': 'Bearer ' + maskToken(auth.token),
      'Content-Type': 'application/json',
    },
    body: requestBody,
  };

  let res;
  let data;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth.token,
      },
      body: JSON.stringify(requestBody),
    });
    const elapsed = Date.now() - startTime;
    data = await res.json();

    // Store request with requestId from response
    const requestId = data.requestId || crypto.randomUUID();
    requestEntry.requestId = requestId;
    addRequest(requestEntry);

    // Store response
    addResponse(requestId, {
      timestamp: Date.now(),
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: data,
      timeMs: elapsed,
    });

    // Render envelope viewer
    renderEnvelopeViewer();

    // Check for session expiry (401) - redirect to auth
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.href = '/auth?expired=1';
      return { status: 401, data: data, request: requestEntry };
    }

    return { status: res.status, data: data, request: requestEntry };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const errorBody = { state: 'error', error: { code: 'NETWORK_ERROR', message: err.message } };

    const requestId = crypto.randomUUID();
    requestEntry.requestId = requestId;
    addRequest(requestEntry);
    addResponse(requestId, {
      timestamp: Date.now(),
      status: 0,
      headers: {},
      body: errorBody,
      timeMs: elapsed,
    });
    renderEnvelopeViewer();

    return { status: 0, data: errorBody, request: requestEntry };
  }
}

/**
 * Poll for async operation status directly from API.
 */
async function pollOperation(requestId) {
  const auth = getAuth();
  if (!auth) {
    return { status: 401, data: { state: 'error', error: { code: 'AUTH_REQUIRED' } } };
  }

  const apiUrl = auth.apiUrl + '/ops/' + encodeURIComponent(requestId);
  const startTime = Date.now();

  try {
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': 'Bearer ' + auth.token },
    });
    const elapsed = Date.now() - startTime;
    const data = await res.json();

    // Add polling response to existing request's response chain
    addResponse(requestId, {
      timestamp: Date.now(),
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: data,
      timeMs: elapsed,
    });
    renderEnvelopeViewer();

    return { status: res.status, data: data };
  } catch (err) {
    return { status: 0, data: { state: 'error', error: { code: 'NETWORK_ERROR', message: err.message } } };
  }
}

/**
 * Fetch chunks for a completed async operation.
 */
async function fetchChunks(requestId) {
  const auth = getAuth();
  if (!auth) {
    return [];
  }

  const chunks = [];
  let cursor = null;

  do {
    let url = auth.apiUrl + '/ops/' + encodeURIComponent(requestId) + '/chunks';
    if (cursor) url += '?cursor=' + encodeURIComponent(cursor);

    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + auth.token },
    });
    if (!res.ok) break;

    const chunk = await res.json();
    chunks.push(chunk);
    cursor = chunk.cursor;
  } while (cursor);

  return chunks;
}


/* ===========================================
   ENVELOPE VIEWER — Maps Data Model
   =========================================== */

// Map<number, RequestEntry> — keyed by timestamp for chronological sorting
let requests = new Map();

// Map<string, ResponseEntry[]> — keyed by requestId, ARRAY for polling chain
let responses = new Map();

// Currently selected request timestamp
let selectedRequestTimestamp = null;

// Monotonic counter to avoid timestamp collisions when parallel calls resolve in the same ms
let requestSeq = 0;

/**
 * Add a request to the requests Map.
 * Uses a monotonic key to prevent collisions from parallel calls.
 */
function addRequest(entry) {
  let key = entry.timestamp;
  while (requests.has(key)) {
    key = entry.timestamp + (++requestSeq) * 0.001;
  }
  entry.timestamp = key;
  requests.set(key, entry);
  selectedRequestTimestamp = key;
}

/**
 * Add a response to the responses Map (appends to array for polling chain).
 */
function addResponse(requestId, entry) {
  if (!responses.has(requestId)) {
    responses.set(requestId, []);
  }
  responses.get(requestId).push(entry);
}

/**
 * Clear the envelope viewer.
 */
function clearEnvelopeViewer() {
  requests = new Map();
  responses = new Map();
  selectedRequestTimestamp = null;
  renderEnvelopeViewer();
}

/**
 * Get sorted request timestamps (newest first).
 */
function getSortedRequestTimestamps() {
  return Array.from(requests.keys()).sort((a, b) => b - a);
}

// Viewer collapsed state
let viewerCollapsed = false;

/**
 * Select a request by timestamp and re-render.
 */
function selectRequest(timestamp) {
  selectedRequestTimestamp = timestamp;
  renderEnvelopeViewer();
}

/**
 * Navigate to the previous (older) request.
 */
function envelopePrev() {
  const timestamps = getSortedRequestTimestamps();
  const idx = timestamps.indexOf(selectedRequestTimestamp);
  if (idx < timestamps.length - 1) {
    selectedRequestTimestamp = timestamps[idx + 1];
    renderEnvelopeViewer();
  }
}

/**
 * Navigate to the next (newer) request.
 */
function envelopeNext() {
  const timestamps = getSortedRequestTimestamps();
  const idx = timestamps.indexOf(selectedRequestTimestamp);
  if (idx > 0) {
    selectedRequestTimestamp = timestamps[idx - 1];
    renderEnvelopeViewer();
  }
}

/**
 * Toggle viewer collapsed state.
 */
function toggleViewerCollapse() {
  viewerCollapsed = !viewerCollapsed;
  renderEnvelopeViewer();
}

/**
 * Generate a status CSS class from an HTTP status code.
 */
function statusColorClass(status) {
  if (status === 202) return 'status-accepted';
  if (status === 303) return 'status-redirect';
  if (status >= 200 && status < 300) return 'status-ok';
  if (status >= 400 && status < 500) return 'status-error';
  if (status >= 500) return 'status-server-error';
  return '';
}

/**
 * Copy a request as a curl command.
 */
function copyAsCurl(timestamp, btn) {
  const req = requests.get(timestamp);
  if (!req) return;

  const method = req.method || 'POST';
  const url = req.url || '/call';
  let curl = 'curl -X ' + method + " '" + url + "'";

  if (req.headers) {
    Object.entries(req.headers).forEach(function(pair) {
      curl += " \\\n  -H '" + pair[0] + ': ' + pair[1] + "'";
    });
  }
  if (req.body) {
    curl += " \\\n  -d '" + JSON.stringify(req.body) + "'";
  }

  copyToClipboard(curl, btn);
}

/**
 * Render the envelope viewer into the DOM.
 */
function renderEnvelopeViewer() {
  const viewer = document.getElementById('envelope-viewer');
  if (!viewer) return;

  if (requests.size === 0) {
    viewer.innerHTML =
      '<div class="viewer-header">' +
        '<span class="viewer-title">Envelope Viewer</span>' +
      '</div>' +
      '<div class="empty-viewer">' +
        '<div class="empty-icon">{ }</div>' +
        '<div>Make an API call to see the<br>request and response envelopes here.</div>' +
      '</div>';
    return;
  }

  const collapseIcon = viewerCollapsed ? '\u25b6' : '\u25bc';
  const timestamps = getSortedRequestTimestamps();
  const currentIdx = timestamps.indexOf(selectedRequestTimestamp);
  const total = timestamps.length;
  const prevDisabled = currentIdx >= total - 1;
  const nextDisabled = currentIdx <= 0;

  // Header
  let html = '<div class="viewer-header">' +
    '<span class="viewer-title">' +
      '<button class="btn-collapse" onclick="toggleViewerCollapse()">' + collapseIcon + '</button>' +
      ' Envelope Viewer' +
    '</span>' +
    '<div class="viewer-nav">' +
      '<button class="btn btn-sm btn-nav" onclick="envelopePrev()"' + (prevDisabled ? ' disabled' : '') + '>&lsaquo;</button>' +
      '<span class="viewer-counter">' + (currentIdx + 1) + '/' + total + '</span>' +
      '<button class="btn btn-sm btn-nav" onclick="envelopeNext()"' + (nextDisabled ? ' disabled' : '') + '>&rsaquo;</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="clearEnvelopeViewer()">Clear</button>' +
    '</div>' +
  '</div>';

  if (viewerCollapsed) {
    viewer.innerHTML = html;
    return;
  }

  // Request list panel
  html += '<div class="viewer-requests">';
  timestamps.forEach(function(ts) {
    const req = requests.get(ts);
    const opName = req?.body?.op || req?.op || 'call';
    const requestId = req?.requestId;
    const chain = requestId ? (responses.get(requestId) || []) : [];
    const lastResp = chain.length > 0 ? chain[chain.length - 1] : null;
    const status = lastResp ? lastResp.status : '';
    const elapsed = lastResp ? (lastResp.timeMs || 0) : '';
    const colorClass = status ? statusColorClass(status) : '';
    const selected = ts === selectedRequestTimestamp ? ' selected' : '';
    const arrow = ts === selectedRequestTimestamp ? '\u25b9' : '\u25b8';

    html += '<div class="viewer-request-row' + selected + '" onclick="selectRequest(' + ts + ')">' +
      '<span class="row-arrow">' + arrow + '</span>' +
      '<span class="row-op">' + escapeHtml(opName) + '</span>' +
      '<span class="row-status ' + colorClass + '">' + status + '</span>' +
      '<span class="row-time">' + (elapsed ? elapsed + 'ms' : '') + '</span>' +
    '</div>';
  });
  html += '</div>';

  // Detail panel — request then response(s) stacked
  const currentRequest = requests.get(selectedRequestTimestamp);
  const requestId = currentRequest?.requestId;
  const responseChain = requestId ? (responses.get(requestId) || []) : [];

  html += '<div class="viewer-detail">';

  // REQUEST section
  html += '<div class="viewer-section-label">' +
    '<span>REQUEST</span>' +
    '<button class="copy-btn" onclick="copyAsCurl(' + selectedRequestTimestamp + ', this)">Copy cURL</button>' +
  '</div>';
  html += renderRequestSection(currentRequest);

  // RESPONSE section(s)
  if (responseChain.length === 0) {
    html += '<div class="viewer-section-label"><span>RESPONSE</span></div>';
    html += '<div class="empty-viewer" style="height:auto;padding:1rem">Waiting for response\u2026</div>';
  } else {
    responseChain.forEach(function(resp, index) {
      const total = responseChain.length;
      const status = resp.status || 0;
      const elapsed = resp.timeMs || resp.elapsed || 0;
      const colorClass = statusColorClass(status);
      const label = total > 1
        ? 'RESPONSE ' + (index + 1) + '/' + total
        : 'RESPONSE';
      const textareaId = 'resp-raw-' + index;
      const jsonStr = resp.body ? JSON.stringify(resp.body, null, 2) : '';

      html += '<div class="viewer-section-label' + (index > 0 ? ' chain-divider' : '') + '">' +
        '<span>' + label +
          ' <span class="' + colorClass + '">' + status + '</span>' +
          ' <span class="resp-time">' + elapsed + 'ms</span>' +
        '</span>' +
        '<button class="copy-btn" onclick="copyToClipboard(document.getElementById(\'' + textareaId + '\').value, this)">Copy</button>' +
      '</div>';

      if (resp.body?.state) {
        html += '<div class="meta-row">' +
          '<span class="meta-label">State</span>' +
          '<span class="meta-value">' +
            '<span class="status-indicator status-' + escapeHtml(resp.body.state) + '">' +
              escapeHtml(resp.body.state) +
            '</span>' +
          '</span>' +
        '</div>';
      }

      if (resp.body) {
        html += '<div class="json-viewer">' +
          '<pre class="code-block">' + syntaxHighlight(resp.body) + '</pre>' +
          '<textarea class="sr-only" id="' + textareaId + '">' + escapeHtml(jsonStr) + '</textarea>' +
        '</div>';
      }
    });
  }

  html += '</div>';

  viewer.innerHTML = html;
}

/**
 * Render the request detail section (method, URL, auth, body).
 */
function renderRequestSection(req) {
  if (!req) return '<div class="empty-viewer" style="height:auto;padding:1rem">No request data</div>';

  let html = '';

  html += '<div class="meta-row">' +
    '<span class="meta-label">Method</span>' +
    '<span class="meta-value">' + escapeHtml(req.method || 'POST') + '</span>' +
  '</div>';

  html += '<div class="meta-row">' +
    '<span class="meta-label">URL</span>' +
    '<span class="meta-value">' + escapeHtml(req.url || '/call') + '</span>' +
  '</div>';

  if (req.headers) {
    html += '<div class="meta-row">' +
      '<span class="meta-label">Auth</span>' +
      '<span class="meta-value">' + escapeHtml(req.headers.Authorization || 'none') + '</span>' +
    '</div>';
  }

  if (req.body) {
    html += '<div class="json-viewer">' +
      '<pre class="code-block">' + syntaxHighlight(req.body) + '</pre>' +
    '</div>';
  }

  return html;
}

// Make functions globally available
window.clearEnvelopeViewer = clearEnvelopeViewer;
window.selectRequest = selectRequest;
window.envelopePrev = envelopePrev;
window.envelopeNext = envelopeNext;
window.toggleViewerCollapse = toggleViewerCollapse;
window.copyAsCurl = copyAsCurl;
window.copyToClipboard = copyToClipboard;


/* ===========================================
   SIDEBAR & NAVIGATION
   =========================================== */

function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('open');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', function () {
      if (sidebar) sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Highlight active nav link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
      link.classList.add('active');
    }
  });
}


/* ===========================================
   SCOPE ERROR DISPLAY
   =========================================== */

/**
 * Render a scope error message into a container.
 */
function renderScopeError(container, errorData) {
  const missingScopes = errorData?.cause || [];
  let html = '<div class="scope-error">' +
    '<div class="scope-error-title">Access Denied: Insufficient Scopes</div>' +
    '<p class="text-sm mb-2">' + escapeHtml(errorData?.message || 'You do not have permission to perform this action.') + '</p>';

  if (Array.isArray(missingScopes) && missingScopes.length > 0) {
    html += '<div class="missing-scopes">';
    missingScopes.forEach(function(scope) {
      html += '<span class="badge badge-scope">' + escapeHtml(scope) + '</span>';
    });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Render a generic error message.
 */
function renderError(container, errorData) {
  if (errorData?.code === 'INSUFFICIENT_SCOPES') {
    renderScopeError(container, errorData);
    return;
  }

  container.innerHTML = '<div class="alert alert-danger">' +
    '<strong>' + escapeHtml(errorData?.code || 'Error') + '</strong>: ' +
    escapeHtml(errorData?.message || 'An unexpected error occurred.') +
  '</div>';
}

/**
 * Show a loading state in a container.
 */
function showLoading(container, message) {
  container.innerHTML = '<div class="loading">' + escapeHtml(message || 'Loading...') + '</div>';
}


/* ===========================================
   PAGE: DASHBOARD (/)
   =========================================== */

async function initDashboard() {
  const content = document.getElementById('dashboard-content');
  if (!content) return;

  showLoading(content, 'Loading patron data...');

  const result = await callApi('v1:patron.get');

  if (result.data?.state === 'error') {
    renderError(content, result.data.error);
    return;
  }

  const patron = result.data?.result || result.data;

  let html = '';

  // Overdue warning banner
  if (patron.totalOverdue > 0) {
    html += '<div class="overdue-banner mb-3">' +
      '<span>You have <strong>' + patron.totalOverdue + ' overdue item' +
      (patron.totalOverdue !== 1 ? 's' : '') + '</strong>. ' +
      'Please return them to reserve new items. </span>' +
      '<a href="/account">View Account</a>' +
    '</div>';
  }

  // Welcome
  html += '<div class="page-header">' +
    '<h1>Welcome back!</h1>' +
    '<p>Explore the OpenCALL Demo Library to see the protocol in action.</p>' +
  '</div>';

  // Quick links
  html += '<div class="quick-links">';

  html += '<a href="/catalog" class="card card-clickable quick-link-card">' +
    '<div class="quick-icon">&#128218;</div>' +
    '<div class="quick-title">Browse Catalog</div>' +
    '<div class="quick-desc">Search and browse the library collection. Filter by type and availability.</div>' +
  '</a>';

  html += '<a href="/account" class="card card-clickable quick-link-card">' +
    '<div class="quick-icon">&#128100;</div>' +
    '<div class="quick-title">My Account</div>' +
    '<div class="quick-desc">View your lending history, return overdue items, and manage reservations.</div>' +
  '</a>';

  html += '<a href="/reports" class="card card-clickable quick-link-card">' +
    '<div class="quick-icon">&#128202;</div>' +
    '<div class="quick-title">Reports</div>' +
    '<div class="quick-desc">Generate lending reports. Demonstrates async operations and chunked retrieval.</div>' +
  '</a>';

  html += '</div>';

  // Agent instructions callout
  html += '<div class="card mt-4">' +
    '<h3>AI Agent Integration</h3>' +
    '<p class="card-meta mt-1">This API supports AI agent discovery. Agents can authenticate using a library card number and interact with all available operations.</p>' +
    '<div class="mt-2">' +
      '<a href="' + (document.body.dataset.agentsUrl || '/') + '" target="_blank" rel="noopener" class="btn btn-sm btn-outline">View Agent Instructions</a>' +
    '</div>' +
  '</div>';

  content.innerHTML = html;
}


/* ===========================================
   PAGE: CATALOG (/catalog)
   =========================================== */

const catalogState = {
  search: '',
  type: '',
  available: null,
  limit: 20,
  offset: 0,
  total: 0,
};

async function initCatalog() {
  const content = document.getElementById('catalog-content');
  if (!content) return;

  renderCatalogFilters();
  await loadCatalog();
}

function renderCatalogFilters() {
  const filtersEl = document.getElementById('catalog-filters');
  if (!filtersEl) return;

  filtersEl.innerHTML =
    '<div class="filter-bar">' +
      '<input type="text" class="input input-search" id="catalog-search" placeholder="Search titles, authors..." value="' + escapeHtml(catalogState.search) + '">' +
      '<select class="input" id="catalog-type">' +
        '<option value="">All Types</option>' +
        '<option value="book"' + (catalogState.type === 'book' ? ' selected' : '') + '>Books</option>' +
        '<option value="cd"' + (catalogState.type === 'cd' ? ' selected' : '') + '>CDs</option>' +
        '<option value="dvd"' + (catalogState.type === 'dvd' ? ' selected' : '') + '>DVDs</option>' +
        '<option value="boardgame"' + (catalogState.type === 'boardgame' ? ' selected' : '') + '>Board Games</option>' +
      '</select>' +
      '<label class="checkbox-label">' +
        '<input type="checkbox" id="catalog-available"' + (catalogState.available === true ? ' checked' : '') + '>' +
        '<span>Available only</span>' +
      '</label>' +
    '</div>';

  // Attach event listeners
  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(function () {
      catalogState.search = searchInput.value.trim();
      catalogState.offset = 0;
      loadCatalog();
    }, 300));
  }

  const typeSelect = document.getElementById('catalog-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      catalogState.type = typeSelect.value;
      catalogState.offset = 0;
      loadCatalog();
    });
  }

  const availableCheckbox = document.getElementById('catalog-available');
  if (availableCheckbox) {
    availableCheckbox.addEventListener('change', function () {
      catalogState.available = availableCheckbox.checked ? true : null;
      catalogState.offset = 0;
      loadCatalog();
    });
  }
}

async function loadCatalog() {
  const content = document.getElementById('catalog-list');
  if (!content) return;

  showLoading(content, 'Loading catalog...');

  const args = {
    limit: catalogState.limit,
    offset: catalogState.offset,
  };
  if (catalogState.search) args.search = catalogState.search;
  if (catalogState.type) args.type = catalogState.type;
  if (catalogState.available !== null) args.available = catalogState.available;

  const result = await callApi('v1:catalog.list', args);

  if (result.data?.state === 'error') {
    renderError(content, result.data.error);
    return;
  }

  const data = result.data?.result || result.data;
  const items = data?.items || [];
  catalogState.total = data?.total || 0;

  if (items.length === 0) {
    content.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">&#128218;</div>' +
      '<div class="empty-title">No items found</div>' +
      '<div class="empty-text">Try adjusting your search or filter criteria.</div>' +
    '</div>';
    renderCatalogPagination();
    return;
  }

  let html = '<div class="catalog-list">';
  items.forEach(function(item) {
    const available = item.available || item.availableCopies > 0;
    const badgeClass = available ? 'badge-available' : 'badge-overdue';
    const badgeText = available ? 'Available' : 'Unavailable';
    const copies = (item.availableCopies !== undefined ? item.availableCopies : '?') +
      '/' + (item.totalCopies !== undefined ? item.totalCopies : '?');

    html += '<div class="card card-clickable catalog-item" onclick="navigateToItem(\'' + escapeHtml(item.id) + '\')">' +
      '<div class="item-type">' + escapeHtml(item.type || '') + '</div>' +
      '<div class="card-title">' + escapeHtml(item.title || 'Untitled') + '</div>' +
      '<div class="item-creator">' + escapeHtml(item.creator || '') + '</div>' +
      (item.year ? '<div class="item-year">' + item.year + '</div>' : '') +
      '<div class="item-availability">' +
        '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
        '<span class="text-muted text-sm">' + copies + ' copies</span>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';

  content.innerHTML = html;
  renderCatalogPagination();
}

function renderCatalogPagination() {
  const paginationEl = document.getElementById('catalog-pagination');
  if (!paginationEl) return;

  const start = catalogState.offset + 1;
  const end = Math.min(catalogState.offset + catalogState.limit, catalogState.total);
  const hasPrev = catalogState.offset > 0;
  const hasNext = catalogState.offset + catalogState.limit < catalogState.total;

  paginationEl.innerHTML = '<div class="pagination">' +
    '<span class="pagination-info">' +
      (catalogState.total > 0 ? 'Showing ' + start + '-' + end + ' of ' + catalogState.total : 'No results') +
    '</span>' +
    '<div class="pagination-buttons">' +
      '<button class="btn btn-sm btn-secondary" onclick="catalogPrev()"' + (hasPrev ? '' : ' disabled') + '>Previous</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="catalogNext()"' + (hasNext ? '' : ' disabled') + '>Next</button>' +
    '</div>' +
  '</div>';
}

function catalogPrev() {
  if (catalogState.offset > 0) {
    catalogState.offset = Math.max(0, catalogState.offset - catalogState.limit);
    loadCatalog();
  }
}

function catalogNext() {
  if (catalogState.offset + catalogState.limit < catalogState.total) {
    catalogState.offset += catalogState.limit;
    loadCatalog();
  }
}

function navigateToItem(itemId) {
  window.location.href = '/catalog/' + encodeURIComponent(itemId);
}

window.catalogPrev = catalogPrev;
window.catalogNext = catalogNext;
window.navigateToItem = navigateToItem;


/* ===========================================
   PAGE: ITEM DETAIL (/catalog/:id)
   =========================================== */

async function initItemDetail() {
  const content = document.getElementById('item-detail-content');
  if (!content) return;

  const itemId = content.getAttribute('data-item-id');
  if (!itemId) {
    content.innerHTML = '<div class="alert alert-danger">No item ID specified.</div>';
    return;
  }

  showLoading(content, 'Loading item details...');

  // Fetch item data and media in parallel
  const [itemResult, mediaResult] = await Promise.all([
    callApi('v1:item.get', { itemId: itemId }),
    callApi('v1:item.getMedia', { itemId: itemId }),
  ]);

  if (itemResult.data?.state === 'error') {
    renderError(content, itemResult.data.error);
    return;
  }

  const item = itemResult.data?.result || itemResult.data;

  // Determine cover image URL
  let coverUrl = null;
  if (mediaResult.data?.location?.uri) {
    coverUrl = mediaResult.data.location.uri;
  } else if (mediaResult.data?.result?.url) {
    coverUrl = mediaResult.data.result.url;
  }

  const available = item.available || (item.availableCopies > 0);
  const badgeClass = available ? 'badge-available' : 'badge-overdue';
  const badgeText = available ? 'Available' : 'Unavailable';

  let html = '<div class="item-detail">';

  // Cover image
  if (coverUrl) {
    html += '<img class="item-cover" src="' + escapeHtml(coverUrl) + '" alt="Cover image for ' + escapeHtml(item.title || '') + '" onerror="this.outerHTML=\'<div class=item-cover-placeholder>No Cover</div>\'">';
  } else {
    html += '<div class="item-cover-placeholder">No Cover</div>';
  }

  // Item info
  html += '<div class="item-info">';
  html += '<h2>' + escapeHtml(item.title || 'Untitled') + '</h2>';

  // Detail rows
  const details = [
    ['Type', item.type],
    ['Creator', item.creator],
    ['Year', item.year],
    ['ISBN', item.isbn],
    ['Copies', (item.availableCopies !== undefined ? item.availableCopies : '?') + ' / ' + (item.totalCopies !== undefined ? item.totalCopies : '?') + ' available'],
  ];

  details.forEach(function(pair) {
    if (pair[1]) {
      html += '<div class="detail-row">' +
        '<span class="detail-label">' + escapeHtml(pair[0]) + '</span>' +
        '<span class="detail-value">' + escapeHtml(String(pair[1])) + '</span>' +
      '</div>';
    }
  });

  // Status badge
  html += '<div class="detail-row">' +
    '<span class="detail-label">Status</span>' +
    '<span class="detail-value"><span class="badge ' + badgeClass + '">' + badgeText + '</span></span>' +
  '</div>';

  // Description
  if (item.description) {
    html += '<div class="detail-row">' +
      '<span class="detail-label">Description</span>' +
      '<span class="detail-value">' + escapeHtml(item.description) + '</span>' +
    '</div>';
  }

  // Tags
  const tags = Array.isArray(item.tags) ? item.tags
    : (typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : []);
  if (tags.length > 0) {
    html += '<div class="detail-row">' +
      '<span class="detail-label">Tags</span>' +
      '<span class="detail-value">';
    tags.forEach(function(tag) {
      html += '<span class="badge badge-info mr-2">' + escapeHtml(tag) + '</span>';
    });
    html += '</span></div>';
  }

  // Reserve button
  html += '<div class="card-actions mt-3">' +
    '<button class="btn btn-primary" id="reserve-btn" onclick="reserveItem(\'' + escapeHtml(itemId) + '\')">' +
      'Reserve This Item' +
    '</button>' +
  '</div>';

  // Reservation result area
  html += '<div id="reserve-result" class="mt-2"></div>';

  html += '</div>'; // end item-info
  html += '</div>'; // end item-detail

  content.innerHTML = html;
}

async function reserveItem(itemId) {
  const btn = document.getElementById('reserve-btn');
  const resultEl = document.getElementById('reserve-result');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Reserving...';
  }

  const result = await callApi('v1:item.reserve', { itemId: itemId });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Reserve This Item';
  }

  if (!resultEl) return;

  if (result.data?.state === 'error') {
    const error = result.data.error;

    if (error?.code === 'OVERDUE_ITEMS_EXIST') {
      resultEl.innerHTML = '<div class="alert alert-warning mt-2">' +
        '<strong>Cannot reserve:</strong> You have overdue items that must be returned first. ' +
        '<a href="/account">Go to Account</a> to return them.' +
      '</div>';
    } else if (error?.code === 'ITEM_NOT_AVAILABLE') {
      resultEl.innerHTML = '<div class="alert alert-warning mt-2">' +
        '<strong>Not Available:</strong> There are no copies of this item currently available for reservation.' +
      '</div>';
    } else if (error?.code === 'ALREADY_RESERVED') {
      resultEl.innerHTML = '<div class="alert alert-info mt-2">' +
        'You already have an active reservation for this item.' +
      '</div>';
    } else if (error?.code === 'INSUFFICIENT_SCOPES') {
      renderScopeError(resultEl, error);
    } else {
      renderError(resultEl, error);
    }
    return;
  }

  const reservation = result.data?.result || result.data;
  resultEl.innerHTML = '<div class="alert alert-success mt-2">' +
    'Reserved successfully! Reservation ID: <strong class="text-mono">' +
    escapeHtml(reservation.reservationId || '') + '</strong>' +
    (reservation.message ? ' -- ' + escapeHtml(reservation.message) : '') +
  '</div>';
}

window.reserveItem = reserveItem;


/* ===========================================
   PAGE: ACCOUNT (/account)
   =========================================== */

async function initAccount() {
  const content = document.getElementById('account-content');
  if (!content) return;

  showLoading(content, 'Loading account data...');

  // Fetch patron data and history in parallel
  const [patronResult, historyResult] = await Promise.all([
    callApi('v1:patron.get'),
    callApi('v1:patron.history', { limit: 20, offset: 0 }),
  ]);

  if (patronResult.data?.state === 'error') {
    renderError(content, patronResult.data.error);
    return;
  }

  const patron = patronResult.data?.result || patronResult.data;
  const history = historyResult.data?.result || historyResult.data;

  let html = '';

  // Patron info card
  html += '<div class="card mb-3">' +
    '<div class="d-flex align-center gap-3">' +
      '<div>' +
        '<div class="text-mono font-bold" style="font-size:1.3rem; letter-spacing:0.05em">' + escapeHtml(patron.cardNumber || '') + '</div>' +
        '<div class="text-muted text-sm">' + escapeHtml(patron.patronName || '') + '</div>' +
      '</div>' +
      '<div class="ml-2 d-flex gap-2 flex-wrap">' +
        '<span class="badge badge-info">' + (patron.totalCheckedOut || 0) + ' checked out</span>' +
        '<span class="badge badge-accepted">' + (patron.activeReservations || 0) + ' reserved</span>' +
        (patron.totalOverdue > 0 ? '<span class="badge badge-overdue">' + patron.totalOverdue + ' overdue</span>' : '') +
      '</div>' +
    '</div>' +
  '</div>';

  // Overdue items section
  if (patron.overdueItems && patron.overdueItems.length > 0) {
    html += '<h3 class="mb-2">Overdue Items</h3>';
    html += '<div class="overdue-list mb-4" id="overdue-list">';

    patron.overdueItems.forEach(function(item) {
      html += '<div class="overdue-item" id="overdue-' + escapeHtml(item.itemId) + '">' +
        '<div class="overdue-item-info">' +
          '<div class="overdue-item-title">' + escapeHtml(item.title || 'Unknown Item') + '</div>' +
          '<div class="overdue-item-meta">' +
            'Due: ' + formatDate(item.dueDate) +
            (item.daysLate ? ' (' + item.daysLate + ' days late)' : '') +
          '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-danger" onclick="returnItem(\'' + escapeHtml(item.itemId) + '\')">' +
          'Return' +
        '</button>' +
      '</div>';
    });

    html += '</div>';
  }

  // Lending history section
  html += '<h3 class="mb-2">Lending History</h3>';

  if (history?.records && history.records.length > 0) {
    html += '<div style="overflow-x:auto">' +
      '<table class="history-table">' +
      '<thead><tr>' +
        '<th>Title</th>' +
        '<th>Checkout</th>' +
        '<th>Due</th>' +
        '<th>Returned</th>' +
        '<th>Status</th>' +
      '</tr></thead><tbody>';

    history.records.forEach(function(record) {
      const isOverdue = !record.returnDate && record.daysLate > 0;
      const isActive = !record.returnDate && !isOverdue;

      let statusBadge = '';
      if (record.returnDate) {
        statusBadge = '<span class="badge badge-complete">Returned</span>';
        if (record.daysLate > 0) {
          statusBadge += ' <span class="badge badge-overdue">' + record.daysLate + 'd late</span>';
        }
      } else if (isOverdue) {
        statusBadge = '<span class="badge badge-overdue">Overdue</span>';
      } else {
        statusBadge = '<span class="badge badge-pending">Active</span>';
      }

      html += '<tr>' +
        '<td>' + escapeHtml(record.title || record.itemId || '') + '</td>' +
        '<td>' + formatDate(record.checkoutDate) + '</td>' +
        '<td>' + formatDate(record.dueDate) + '</td>' +
        '<td>' + (record.returnDate ? formatDate(record.returnDate) : '--') + '</td>' +
        '<td>' + statusBadge + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';

    // History pagination
    const histTotal = history.total || 0;
    const histOffset = history.offset || 0;
    const histLimit = history.limit || 20;
    html += '<div id="history-pagination" data-total="' + histTotal + '" data-offset="' + histOffset + '" data-limit="' + histLimit + '"></div>';
  } else {
    html += '<div class="empty-state">' +
      '<div class="empty-icon">&#128214;</div>' +
      '<div class="empty-title">No lending history</div>' +
      '<div class="empty-text">Your borrowing history will appear here.</div>' +
    '</div>';
  }

  content.innerHTML = html;

  // Render history pagination
  renderHistoryPagination(history);
}

let historyState = {
  limit: 20,
  offset: 0,
  total: 0,
};

function renderHistoryPagination(history) {
  if (!history) return;
  historyState.total = history.total || 0;
  historyState.offset = history.offset || 0;
  historyState.limit = history.limit || 20;

  const el = document.getElementById('history-pagination');
  if (!el) return;

  const start = historyState.offset + 1;
  const end = Math.min(historyState.offset + historyState.limit, historyState.total);
  const hasPrev = historyState.offset > 0;
  const hasNext = historyState.offset + historyState.limit < historyState.total;

  el.innerHTML = '<div class="pagination">' +
    '<span class="pagination-info">' +
      (historyState.total > 0 ? start + '-' + end + ' of ' + historyState.total + ' records' : 'No records') +
    '</span>' +
    '<div class="pagination-buttons">' +
      '<button class="btn btn-sm btn-secondary" onclick="historyPrev()"' + (hasPrev ? '' : ' disabled') + '>Previous</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="historyNext()"' + (hasNext ? '' : ' disabled') + '>Next</button>' +
    '</div>' +
  '</div>';
}

async function historyPrev() {
  if (historyState.offset <= 0) return;
  historyState.offset = Math.max(0, historyState.offset - historyState.limit);
  await loadHistoryPage();
}

async function historyNext() {
  if (historyState.offset + historyState.limit >= historyState.total) return;
  historyState.offset += historyState.limit;
  await loadHistoryPage();
}

async function loadHistoryPage() {
  const result = await callApi('v1:patron.history', {
    limit: historyState.limit,
    offset: historyState.offset,
  });
  // Re-render the full account page with new data
  // For simplicity, just re-initialize
  await initAccount();
}

async function returnItem(itemId) {
  const itemEl = document.getElementById('overdue-' + itemId);
  const btn = itemEl?.querySelector('button');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  }

  const result = await callApi('v1:item.return', { itemId: itemId });

  if (result.data?.state === 'error') {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Return';
    }

    const error = result.data.error;
    if (error?.code === 'INSUFFICIENT_SCOPES') {
      if (itemEl) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mt-1';
        renderScopeError(errorDiv, error);
        itemEl.appendChild(errorDiv);
      }
    } else {
      alert((error?.code || 'Error') + ': ' + (error?.message || 'Failed to return item.'));
    }
    return;
  }

  // Success - update the UI
  if (itemEl) {
    const returnData = result.data?.result || result.data;
    itemEl.innerHTML = '<div class="overdue-item-info">' +
      '<div class="overdue-item-title text-success">' + escapeHtml(returnData.title || 'Item') + ' -- Returned!</div>' +
      '<div class="overdue-item-meta">' + escapeHtml(returnData.message || '') + '</div>' +
    '</div>' +
    '<span class="badge badge-complete">Done</span>';
    itemEl.style.borderLeftColor = 'var(--success)';
  }
}

window.returnItem = returnItem;
window.historyPrev = historyPrev;
window.historyNext = historyNext;


/* ===========================================
   PAGE: REPORTS (/reports)
   =========================================== */

let reportState = {
  requestId: null,
  pollTimer: null,
  generating: false,
};

async function initReports() {
  const content = document.getElementById('reports-content');
  if (!content) return;

  renderReportForm(content);
}

function renderReportForm() {
  const form = document.getElementById('report-form');
  if (!form) return;

  form.innerHTML =
    '<div class="report-form">' +
      '<div class="form-row">' +
        '<div class="form-group">' +
          '<label for="report-format">Format</label>' +
          '<select class="input" id="report-format">' +
            '<option value="csv">CSV</option>' +
            '<option value="json">JSON</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="report-type">Item Type (optional)</label>' +
          '<select class="input" id="report-type">' +
            '<option value="">All Types</option>' +
            '<option value="book">Books</option>' +
            '<option value="cd">CDs</option>' +
            '<option value="dvd">DVDs</option>' +
            '<option value="boardgame">Board Games</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="report-from">Date From (optional)</label>' +
          '<input type="date" class="input" id="report-from">' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="report-to">Date To (optional)</label>' +
          '<input type="date" class="input" id="report-to">' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<button class="btn btn-primary" id="generate-btn" onclick="generateReport()">Generate Report</button>' +
      '</div>' +
    '</div>';
}

async function generateReport() {
  const btn = document.getElementById('generate-btn');
  const progressEl = document.getElementById('report-progress');
  const resultEl = document.getElementById('report-result');

  if (reportState.generating) return;
  reportState.generating = true;

  // Clear previous state
  if (reportState.pollTimer) {
    clearInterval(reportState.pollTimer);
    reportState.pollTimer = null;
  }
  reportState.requestId = null;
  if (resultEl) resultEl.innerHTML = '';

  // Get form values
  const format = document.getElementById('report-format')?.value || 'csv';
  const itemType = document.getElementById('report-type')?.value || undefined;
  const dateFrom = document.getElementById('report-from')?.value || undefined;
  const dateTo = document.getElementById('report-to')?.value || undefined;

  const args = { format: format };
  if (itemType) args.itemType = itemType;
  if (dateFrom) args.dateFrom = dateFrom;
  if (dateTo) args.dateTo = dateTo;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating...';
  }

  // Show initial progress
  if (progressEl) {
    progressEl.innerHTML = '<div class="report-progress">' +
      '<div class="progress-step active">' +
        '<span class="step-icon">&#9679;</span>' +
        '<span class="step-label">Submitting request...</span>' +
      '</div>' +
    '</div>';
  }

  // Clear previous envelope exchanges for clean lifecycle view
  clearEnvelopeViewer();

  const result = await callApi('v1:report.generate', args);

  if (result.data?.state === 'error') {
    reportState.generating = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }
    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step failed">' +
          '<span class="step-icon">&#10007;</span>' +
          '<span class="step-label">Failed: ' + escapeHtml(result.data.error?.message || 'Unknown error') + '</span>' +
        '</div>' +
      '</div>';
    }
    return;
  }

  // Handle 202 accepted (async operation)
  if (result.status === 202 || result.data?.state === 'accepted') {
    reportState.requestId = result.data?.requestId;

    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
          '<span class="step-time">' + formatDateTime(new Date().toISOString()) + '</span>' +
        '</div>' +
        '<div class="progress-step active">' +
          '<span class="step-icon">&#8987;</span>' +
          '<span class="step-label">Generating report...</span>' +
        '</div>' +
      '</div>';
    }

    // Start polling
    if (reportState.requestId) {
      const retryMs = result.data?.retryAfterMs || 1000;
      reportState.pollTimer = setInterval(function () {
        pollReportStatus();
      }, retryMs);
    }
  } else {
    // Synchronous completion (unlikely for reports, but handle it)
    reportState.generating = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }
    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Complete</span>' +
        '</div>' +
      '</div>';
    }
  }
}

async function pollReportStatus() {
  if (!reportState.requestId) return;

  const result = await pollOperation(reportState.requestId);
  const state = result.data?.state;

  const progressEl = document.getElementById('report-progress');
  const resultEl = document.getElementById('report-result');
  const btn = document.getElementById('generate-btn');

  if (state === 'complete') {
    // Stop polling
    if (reportState.pollTimer) {
      clearInterval(reportState.pollTimer);
      reportState.pollTimer = null;
    }
    reportState.generating = false;

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }

    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
        '</div>' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Generated</span>' +
        '</div>' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Complete</span>' +
          '<span class="step-time">' + formatDateTime(new Date().toISOString()) + '</span>' +
        '</div>' +
      '</div>';
    }

    // Show download link and chunks button
    if (resultEl) {
      const downloadUrl = result.data?.location?.uri;
      let html = '<div class="card mt-2">';
      html += '<h4 class="mb-2">Report Ready</h4>';

      if (downloadUrl) {
        html += '<a href="' + escapeHtml(downloadUrl) + '" target="_blank" class="btn btn-success mr-2">Download Report</a>';
      }

      html += '<button class="btn btn-outline" onclick="viewChunks(\'' + escapeHtml(reportState.requestId) + '\')">View Chunks</button>';
      html += '<div id="chunks-container" class="mt-3"></div>';
      html += '</div>';
      resultEl.innerHTML = html;
    }

  } else if (state === 'error') {
    // Stop polling
    if (reportState.pollTimer) {
      clearInterval(reportState.pollTimer);
      reportState.pollTimer = null;
    }
    reportState.generating = false;

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }

    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
        '</div>' +
        '<div class="progress-step failed">' +
          '<span class="step-icon">&#10007;</span>' +
          '<span class="step-label">Error: ' + escapeHtml(result.data?.error?.message || 'Generation failed') + '</span>' +
        '</div>' +
      '</div>';
    }

  } else if (state === 'pending') {
    // Still in progress, update display
    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
        '</div>' +
        '<div class="progress-step active">' +
          '<span class="step-icon">&#8987;</span>' +
          '<span class="step-label">Generating report...</span>' +
        '</div>' +
      '</div>';
    }
  }
  // else: still accepted, keep polling
}

async function viewChunks(requestId) {
  const container = document.getElementById('chunks-container');
  if (!container) return;

  showLoading(container, 'Fetching chunks...');

  const chunks = await fetchChunks(requestId);

  if (chunks.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No chunks available.</div>';
    return;
  }

  let html = '<div class="chunks-viewer">' +
    '<h4 class="mb-2">Chunked Retrieval (' + chunks.length + ' chunk' + (chunks.length !== 1 ? 's' : '') + ')</h4>';

  let previousChecksum = null;

  chunks.forEach(function(chunk, i) {
    // Verify checksum chain
    const chainValid = chunk.checksumPrevious === previousChecksum;
    previousChecksum = chunk.checksum;

    html += '<div class="chunk">' +
      '<div class="chunk-header">' +
        '<span>Chunk ' + (i + 1) + ' / ' + chunks.length + ' | Offset: ' + (chunk.offset || 0) + ' | Length: ' + (chunk.length || 0) + '</span>' +
        '<span class="chunk-checksum' + (chainValid ? '' : ' invalid') + '">' +
          (chainValid ? 'Chain valid' : 'Chain INVALID') +
          ' | ' + escapeHtml((chunk.checksum || '').slice(0, 20)) + '...' +
        '</span>' +
      '</div>' +
      '<div class="chunk-data">' + escapeHtml(chunk.data || '') + '</div>' +
    '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

window.generateReport = generateReport;
window.viewChunks = viewChunks;


/* ===========================================
   PAGE: AUTH (/auth)
   =========================================== */

function initAuth() {
  const form = document.getElementById('auth-form');
  if (!form) return;

  // Check for reset banner
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') {
    const banner = document.getElementById('auth-banner');
    if (banner) {
      banner.innerHTML = '<div class="alert alert-warning mb-3">The demo has been reset. Please authenticate again.</div>';
      banner.style.display = 'block';
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = document.getElementById('auth-username')?.value?.trim() || undefined;
    const submitBtn = document.getElementById('auth-submit');
    const errorEl = document.getElementById('auth-error');

    // Gather selected scopes
    const scopeCheckboxes = form.querySelectorAll('input[name="scopes"]:checked');
    const scopes = Array.from(scopeCheckboxes).map(function(cb) { return cb.value; });

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Starting Demo...';
    }

    if (errorEl) errorEl.innerHTML = '';

    try {
      const res = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, scopes: scopes.length > 0 ? scopes : undefined }),
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      if (res.ok) {
        window.location.href = '/';
        return;
      }

      const data = await res.json().catch(function() { return {}; });
      if (errorEl) {
        errorEl.innerHTML = '<div class="alert alert-danger mt-2">' +
          escapeHtml(data.error?.message || data.message || 'Authentication failed. Please try again.') +
        '</div>';
      }
    } catch (err) {
      if (errorEl) {
        errorEl.innerHTML = '<div class="alert alert-danger mt-2">Network error: ' + escapeHtml(err.message) + '</div>';
      }
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Demo';
    }
  });
}


/* ===========================================
   INITIALIZATION
   =========================================== */

document.addEventListener('DOMContentLoaded', function () {
  // Initialize theme toggle buttons
  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.addEventListener('click', toggleTheme);
  });

  // Initialize sidebar
  initSidebar();

  // Detect which page we are on and initialize the appropriate handler
  const page = document.body.getAttribute('data-page');

  switch (page) {
    case 'auth':
      initAuth();
      break;
    case 'dashboard':
      initDashboard();
      break;
    case 'catalog':
      initCatalog();
      break;
    case 'item-detail':
      initItemDetail();
      break;
    case 'account':
      initAccount();
      break;
    case 'reports':
      initReports();
      break;
    default:
      // Unknown page, do nothing
      break;
  }

  // Render initial envelope viewer state
  renderEnvelopeViewer();
});
