import type { Session } from "./session.ts";

const AGENTS_URL = process.env.AGENTS_URL || "http://localhost:8888";
const WWW_URL = process.env.WWW_URL || "http://localhost:8080";

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Shared HTML layout wrapper. Produces a full HTML document with sidebar navigation,
 * patron badge, and a split-pane structure (left = content, right = envelope viewer).
 */
function layout(page: string, title: string, content: string, session: Session): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="ai-instructions" content="${AGENTS_URL}">
  <title>${title} - OpenCALL Demo Library</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body data-page="${page}" data-agents-url="${AGENTS_URL}">
  <button class="sidebar-toggle" id="sidebar-toggle">&#9776;</button>
  <div class="sidebar-overlay" id="sidebar-overlay"></div>

  <div class="layout">
    <!-- Sidebar Navigation -->
    <nav class="layout-sidebar" id="sidebar">
      <a href="${WWW_URL}" target="_blank" rel="noopener" class="sidebar-logo">OpenCALL<br />
      <span class="text-muted text-sm">Demo Library</span></a>

      <div class="sidebar-nav">
        <a href="/" class="nav-link${page === "dashboard" ? " active" : ""}">
          <span class="nav-icon">&#128200;</span> Dashboard
        </a>
        <a href="/catalog" class="nav-link${page === "catalog" || page === "item-detail" ? " active" : ""}">
          <span class="nav-icon">&#128218;</span> Catalog
        </a>
        <a href="/account" class="nav-link${page === "account" ? " active" : ""}">
          <span class="nav-icon">&#128100;</span> My Account
        </a>
        <a href="/reports" class="nav-link${page === "reports" ? " active" : ""}">
          <span class="nav-icon">&#128202;</span> Reports
        </a>
      </div>

      <!-- Patron Badge -->
      <a href="/account" class="patron-badge" style="text-decoration:none">
        <div class="card-number">${escapeHtml(session.cardNumber)}</div>
        <div class="username">${escapeHtml(session.username)}</div>
      </a>

      <div class="sidebar-footer">
        <a href="/logout" class="btn btn-sm btn-outline">Sign Out</a>
        <button class="theme-toggle" aria-label="Toggle theme">
          <span class="icon-light">&#9790;</span>
          <span class="icon-dark">&#9728;</span>
        </button>
      </div>
    </nav>

    <!-- Main Content Area -->
    <div class="layout-main">
      <div class="split-pane">
        <!-- Left Pane: Page Content -->
        <div class="split-pane-left">
          ${content}
        </div>

        <!-- Right Pane: Envelope Viewer -->
        <div class="split-pane-right">
          <div class="envelope-viewer" id="envelope-viewer"></div>
        </div>
      </div>
    </div>
  </div>
  <script src="/app.js"></script>
</body>
</html>`;
}

/**
 * Render the Dashboard page.
 */
export function renderDashboard(session: Session): string {
  const content = `
    <div id="dashboard-content">
      <div class="loading">Loading patron data...</div>
    </div>`;

  return layout("dashboard", "Dashboard", content, session);
}

/**
 * Render the Catalog browsing page.
 */
export function renderCatalog(session: Session): string {
  const content = `
    <div id="catalog-content">
      <div class="page-header">
        <h1>Library Catalog</h1>
        <p>Browse and search the library's collection.</p>
      </div>

      <div id="catalog-filters"></div>

      <div id="catalog-list">
        <div class="loading">Loading catalog...</div>
      </div>

      <div id="catalog-pagination"></div>
    </div>`;

  return layout("catalog", "Catalog", content, session);
}

/**
 * Render an individual item detail page.
 */
export function renderItem(session: Session, itemId: string): string {
  const content = `
    <div id="item-detail-content" data-item-id="${escapeHtml(itemId)}">
      <div class="page-header">
        <h1>Item Detail</h1>
        <p>Viewing item: <code>${escapeHtml(itemId)}</code></p>
      </div>
      <div class="loading">Loading item details...</div>
    </div>`;

  return layout("item-detail", "Item Detail", content, session);
}

/**
 * Render the Account / Patron page.
 */
export function renderAccount(session: Session): string {
  const content = `
    <div id="account-content">
      <div class="page-header">
        <h1>My Account</h1>
        <p>View your patron profile, borrowing history, and overdue items.</p>
      </div>
      <div class="loading">Loading account data...</div>
    </div>`;

  return layout("account", "Account", content, session);
}

/**
 * Render the Reports page.
 */
export function renderReports(session: Session): string {
  const content = `
    <div id="reports-content">
      <div class="page-header">
        <h1>Library Reports</h1>
        <p>Generate lending reports. Demonstrates async operations and chunked retrieval.</p>
      </div>

      <div id="report-form"></div>

      <div id="report-progress"></div>

      <div id="report-result"></div>
    </div>`;

  return layout("reports", "Reports", content, session);
}
