/**
 * AlphaFinder — Chat UI · app.js
 * Connects to the ElizaOS REST API running on localhost:3000
 */

/* ══════════════════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════════════════ */
const CONFIG = {
  // Always use the current page's origin.
  // - Dev (port 5500): the serve.js proxy forwards /api/* to ElizaOS on :3000
  // - Production (port 3000): ElizaOS itself handles /api/* directly
  API_BASE: window.location.origin,

  AGENT_NAME:   'AlphaFinder',
  USER_INITIALS: 'U',
  /** How long (ms) to wait before showing the typing indicator */
  TYPING_DELAY: 400,
  /** Character count threshold for warning colour */
  CHAR_WARN:  3500,
  MAX_CHARS:  4000,
  /** LocalStorage keys */
  LS_MESSAGES:  'af_messages',
  LS_AGENT_ID:  'af_agent_id',
};

/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */
const state = {
  agentId:   null,
  roomId:    null,
  userId:    'user-' + crypto.randomUUID(),
  messages:  [],          // { role, text, ts }[]
  loading:   false,
  sidebarOpen: true,
};

/* ══════════════════════════════════════════════════════════
   DOM REFS
   ══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dom = {
  sidebar:        $('sidebar'),
  sidebarToggle:  $('sidebarToggle'),
  statusPill:     $('statusPill'),
  statusDot:      $('statusDot'),
  statusText:     $('statusText'),
  messages:       $('messagesContainer'),
  welcomeState:   $('welcomeState'),
  input:          $('messageInput'),
  sendBtn:        $('sendBtn'),
  clearBtn:       $('clearBtn'),
  charCount:      $('charCount'),
  suggestionList: $('suggestionList'),
};

/* ══════════════════════════════════════════════════════════
   UTILITY HELPERS
   ══════════════════════════════════════════════════════════ */

/** Escape HTML entities to prevent XSS */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Very lightweight markdown → HTML renderer.
 * Supports: **bold**, *italic*, `code`, ```blocks```,
 *           # headings, - lists, numbered lists, newlines.
 */
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings (## Heading)
  html = html.replace(/^### (.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^## (.+)$/gm,  '<strong>$1</strong>');
  html = html.replace(/^# (.+)$/gm,   '<strong>$1</strong>');

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered list items (- item)
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Paragraphs: double newline → paragraph break
  html = html.replace(/\n\n/g, '</p><p>');

  // Single newline → <br>
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) html = `<p>${html}</p>`;

  return html;
}

/** Format a Date as HH:MM */
function fmtTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Scroll messages panel to the bottom */
function scrollToBottom(smooth = true) {
  dom.messages.scrollTo({
    top: dom.messages.scrollHeight,
    behavior: smooth ? 'smooth' : 'instant',
  });
}

/* ══════════════════════════════════════════════════════════
   STATUS INDICATOR
   ══════════════════════════════════════════════════════════ */
function setStatus(status, text) {
  dom.statusPill.className = `status-pill ${status}`;
  dom.statusText.textContent = text;
}

/* ══════════════════════════════════════════════════════════
   ELIZAOS API — AGENT DISCOVERY
   ══════════════════════════════════════════════════════════ */

/** Fetch the list of agents and pick AlphaFinder (or the first one). */
async function discoverAgent() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/agents`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    // ElizaOS v1 returns { agents: [...] } or an array directly
    const agents = Array.isArray(data) ? data : (data.agents || data.data || []);

    if (!agents.length) throw new Error('No agents found');

    // Try to find our named agent, else fall back to first
    const agent =
      agents.find(a => a.name?.toLowerCase() === CONFIG.AGENT_NAME.toLowerCase()) ||
      agents[0];

    state.agentId = agent.id;
    // Persist so we survive a page refresh
    localStorage.setItem(CONFIG.LS_AGENT_ID, agent.id);

    return agent.id;
  } catch (err) {
    console.warn('[AlphaFinder] Agent discovery failed:', err.message);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   ELIZAOS API — SEND MESSAGE
   ══════════════════════════════════════════════════════════ */

/**
 * Send a message to the ElizaOS agent via the REST API.
 * POST /api/agents/:agentId/message
 */
async function sendToAgent(text) {
  if (!state.agentId) {
    // Try again — agent might have started after page load
    await discoverAgent();
    if (!state.agentId) {
      throw new Error('Agent not available — is the ElizaOS server running?');
    }
  }

  const body = {
    text,
    userId:   state.userId,
    roomId:   state.roomId || `room-${state.userId}`,
    userName: 'User',
    name:     'User',
  };

  const res = await fetch(`${CONFIG.API_BASE}/api/agents/${state.agentId}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Agent error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();

  // ElizaOS returns an array of response messages
  const responses = Array.isArray(data) ? data : [data];
  return responses
    .map(r => r.text || r.content?.text || '')
    .filter(Boolean)
    .join('\n\n');
}

/* ══════════════════════════════════════════════════════════
   RENDER MESSAGES
   ══════════════════════════════════════════════════════════ */

function renderMessage({ role, text, ts, isError = false }) {
  const isUser = role === 'user';

  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user' : 'assistant'}`;
  row.setAttribute('role', 'article');  // for a11y

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = isUser ? CONFIG.USER_INITIALS : '✦';

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble${isError ? ' error' : ''}`;

  if (isUser) {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = renderMarkdown(text);
  }

  // Timestamp
  const timestamp = document.createElement('div');
  timestamp.className = 'msg-timestamp';
  timestamp.textContent = ts || fmtTime();

  const inner = document.createElement('div');
  inner.style.display = 'flex';
  inner.style.flexDirection = 'column';
  inner.style.minWidth = '0';
  inner.appendChild(bubble);
  inner.appendChild(timestamp);

  if (isUser) {
    row.appendChild(inner);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(inner);
  }

  return row;
}

/** Append a message to the container and push to state */
function addMessage(role, text, opts = {}) {
  const msg = { role, text, ts: fmtTime(), ...opts };
  state.messages.push(msg);

  // Hide welcome screen once we have messages
  if (state.messages.length === 1) {
    dom.welcomeState.classList.add('hidden');
  }

  const el = renderMessage(msg);
  dom.messages.appendChild(el);
  scrollToBottom();
  return el;
}

/* ══════════════════════════════════════════════════════════
   TYPING INDICATOR
   ══════════════════════════════════════════════════════════ */
let typingRow = null;

function showTyping() {
  if (typingRow) return;

  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'typingRow';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '✦';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.setAttribute('aria-label', 'AlphaFinder is thinking');

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  [1, 2, 3].forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'typing-dot';
    indicator.appendChild(dot);
  });

  bubble.appendChild(indicator);
  row.appendChild(avatar);
  row.appendChild(bubble);

  dom.messages.appendChild(row);
  scrollToBottom();
  typingRow = row;
}

function hideTyping() {
  if (typingRow) {
    typingRow.remove();
    typingRow = null;
  }
}

/* ══════════════════════════════════════════════════════════
   SEND FLOW
   ══════════════════════════════════════════════════════════ */
async function handleSend() {
  const text = dom.input.value.trim();
  if (!text || state.loading) return;

  // Add user message immediately
  addMessage('user', text);
  dom.input.value = '';
  dom.input.style.height = 'auto';
  updateCharCount();
  updateSendBtn();

  state.loading = true;
  dom.sendBtn.disabled = true;

  // Show typing indicator after a short delay (feels more natural)
  const typingTimer = setTimeout(showTyping, CONFIG.TYPING_DELAY);

  try {
    const reply = await sendToAgent(text);
    clearTimeout(typingTimer);
    hideTyping();
    addMessage('assistant', reply);
  } catch (err) {
    clearTimeout(typingTimer);
    hideTyping();
    console.error('[AlphaFinder] Send error:', err);
    addMessage('assistant', `⚠️ ${err.message}`, { isError: true });
  } finally {
    state.loading = false;
    updateSendBtn();
    dom.input.focus();
  }
}

/* ══════════════════════════════════════════════════════════
   INPUT CONTROLS
   ══════════════════════════════════════════════════════════ */
function updateCharCount() {
  const len = dom.input.value.length;
  if (len > 3000) {
    dom.charCount.textContent = `${len}/${CONFIG.MAX_CHARS}`;
    dom.charCount.className = `char-count ${len >= CONFIG.MAX_CHARS ? 'limit' : 'warn'}`;
  } else {
    dom.charCount.textContent = '';
    dom.charCount.className = 'char-count';
  }
}

function updateSendBtn() {
  const hasText = dom.input.value.trim().length > 0;
  dom.sendBtn.disabled = !hasText || state.loading;
}

/** Auto-grow textarea */
function autoResize() {
  dom.input.style.height = 'auto';
  dom.input.style.height = Math.min(dom.input.scrollHeight, 200) + 'px';
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════════════════════ */

// Mobile overlay element (created dynamically)
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
overlay.id = 'sidebarOverlay';
document.body.appendChild(overlay);

function toggleSidebar(forceOpen) {
  const open = forceOpen !== undefined ? forceOpen : !state.sidebarOpen;
  state.sidebarOpen = open;

  dom.sidebar.classList.toggle('collapsed', !open);
  dom.sidebarToggle.setAttribute('aria-expanded', String(open));

  // Mobile overlay
  if (window.innerWidth <= 700) {
    overlay.classList.toggle('visible', open);
  }
}

overlay.addEventListener('click', () => toggleSidebar(false));

/* ══════════════════════════════════════════════════════════
   CLEAR CONVERSATION
   ══════════════════════════════════════════════════════════ */
function clearConversation() {
  state.messages = [];

  // Remove all message rows but keep the welcome state
  const rows = dom.messages.querySelectorAll('.message-row');
  rows.forEach(r => r.remove());

  // Show welcome state again
  dom.welcomeState.classList.remove('hidden');

  localStorage.removeItem(CONFIG.LS_MESSAGES);
}

/* ══════════════════════════════════════════════════════════
   QUICK PROMPTS (sidebar + welcome chips)
   ══════════════════════════════════════════════════════════ */
function attachPromptButtons() {
  document.querySelectorAll('[data-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (!prompt) return;
      dom.input.value = prompt;
      autoResize();
      updateCharCount();
      updateSendBtn();
      dom.input.focus();

      // On mobile, close sidebar when picking a suggestion
      if (window.innerWidth <= 700) toggleSidebar(false);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   HEALTH CHECK + INIT LOOP
   ══════════════════════════════════════════════════════════ */
async function checkHealth() {
  setStatus('', 'Connecting…');

  const id = await discoverAgent();

  if (id) {
    setStatus('online', 'Agent online');
    console.info(`[AlphaFinder] Connected to agent: ${id}`);
  } else {
    setStatus('offline', 'Agent offline');
    console.warn('[AlphaFinder] Could not reach ElizaOS server.');
    // Retry in 8 seconds
    setTimeout(checkHealth, 8000);
  }
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════ */
function setupKeyboard() {
  dom.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

/* ══════════════════════════════════════════════════════════
   EVENT WIRING
   ══════════════════════════════════════════════════════════ */
function wireEvents() {
  // Send button
  dom.sendBtn.addEventListener('click', handleSend);

  // Input — resize, char count, send button state
  dom.input.addEventListener('input', () => {
    autoResize();
    updateCharCount();
    updateSendBtn();
  });

  // Sidebar toggle
  dom.sidebarToggle.addEventListener('click', () => toggleSidebar());

  // Clear conversation
  dom.clearBtn.addEventListener('click', () => {
    if (state.messages.length === 0) return;
    if (confirm('Clear the conversation? This cannot be undone.')) {
      clearConversation();
    }
  });

  // Quick prompt buttons
  attachPromptButtons();

  // Keyboard shortcuts
  setupKeyboard();

  // Responsive: close sidebar on small screens on load
  if (window.innerWidth <= 700) {
    state.sidebarOpen = false;
    dom.sidebar.classList.add('collapsed');
  }
}

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════════════════════ */
async function init() {
  wireEvents();

  // Restore cached agent ID so we don't have to discover every load
  const cached = localStorage.getItem(CONFIG.LS_AGENT_ID);
  if (cached) state.agentId = cached;

  // Health check
  await checkHealth();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
