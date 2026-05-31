document.addEventListener('DOMContentLoaded', function() {
  const knowledge = window.spotKnowledgeBase || null;
  if (!knowledge || document.querySelector('.assistant-shell')) return;

  const historyKey = 'spot-assistant-history-v3';
  const providerKeyStorage = 'spot-assistant-provider-key';
  const expandedStorage = 'spot-assistant-expanded';
  const state = {
    open: false,
    expanded: loadExpanded(),
    sending: false,
    config: null,
    history: loadHistory()
  };
  const assistantIcons = {
    expand: '<svg class="assistant-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4M9 5 5 9M15 5l4 4M9 19l-4-4M15 19l4-4"/></svg>',
    shrink: '<svg class="assistant-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5M9 9 4 4M15 9l5-5M9 15l-5 5M15 15l5 5"/></svg>',
    key: '<svg class="assistant-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 9a5 5 0 1 1-1.45-3.53L20 13v3h-3v3h-3l-4.1-4.1"/><circle cx="9" cy="9" r="1.4"/></svg>',
    clear: '<svg class="assistant-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13"/></svg>',
    close: '<svg class="assistant-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  function assistantIcon(name) {
    return assistantIcons[name] || '';
  }

  const shell = document.createElement('div');
  shell.className = 'assistant-shell';
  shell.innerHTML = `
    <button type="button" class="assistant-launcher" aria-expanded="false" aria-controls="spot-assistant-panel">
      <span class="assistant-launcher__icon" aria-hidden="true">AI</span>
      <span class="assistant-launcher__label">Assistant</span>
    </button>
    <section id="spot-assistant-panel" class="assistant-panel" hidden aria-hidden="true">
      <header class="assistant-panel__header">
        <div>
          <p class="assistant-panel__eyebrow">spot.ph Assistant</p>
          <h3>Transport Help</h3>
        </div>
        <div class="assistant-panel__header-actions">
          <button type="button" class="assistant-icon-btn" data-assistant-expand aria-label="Enlarge assistant" title="Enlarge assistant">${assistantIcon('expand')}</button>
          <button type="button" class="assistant-icon-btn" data-assistant-config-toggle aria-label="AI key settings" title="AI key settings">${assistantIcon('key')}</button>
          <button type="button" class="assistant-icon-btn" data-assistant-clear aria-label="Clear chat" title="Clear chat">${assistantIcon('clear')}</button>
          <button type="button" class="assistant-icon-btn" data-assistant-close aria-label="Close assistant" title="Close assistant">${assistantIcon('close')}</button>
        </div>
      </header>
      <div class="assistant-panel__status" data-assistant-status data-mode="loading">Checking assistant mode...</div>
      <div class="assistant-panel__config" data-assistant-config hidden>
        <label for="assistant-provider-key">Pollinations API key</label>
        <input id="assistant-provider-key" class="assistant-input" type="password" placeholder="sk_... or pk_..." autocomplete="off" />
        <p class="assistant-panel__hint">Stored only in this browser. Leave blank to use local grounded answers.</p>
        <div class="assistant-panel__config-actions">
          <button type="button" class="assistant-action-btn" data-assistant-save-key>Save Key</button>
          <button type="button" class="assistant-action-btn assistant-action-btn--ghost" data-assistant-clear-key>Clear</button>
        </div>
      </div>
      <div class="assistant-messages" data-assistant-messages></div>
      <div class="assistant-quick-actions" data-assistant-quick-actions>
        <button type="button" class="assistant-chip">How many vehicles are available now?</button>
        <button type="button" class="assistant-chip">What routes are available?</button>
        <button type="button" class="assistant-chip">How much is the fare from Indang to Trece?</button>
        <button type="button" class="assistant-chip">Cheapest gas in Trece?</button>
        <button type="button" class="assistant-chip">Cheapest gas in GMA Cavite?</button>
        <button type="button" class="assistant-chip">What fuel areas are available?</button>
      </div>
      <form class="assistant-form" data-assistant-form>
        <textarea class="assistant-input assistant-input--message" data-assistant-input rows="2" placeholder="Ask about routes, fares, gas, or vehicles..."></textarea>
        <button type="submit" class="assistant-send-btn" data-assistant-send>Send</button>
      </form>
    </section>
  `;

  document.body.appendChild(shell);

  const launcher = shell.querySelector('.assistant-launcher');
  const panel = shell.querySelector('.assistant-panel');
  const closeButton = shell.querySelector('[data-assistant-close]');
  const statusEl = shell.querySelector('[data-assistant-status]');
  const messagesEl = shell.querySelector('[data-assistant-messages]');
  const quickActionsEl = shell.querySelector('[data-assistant-quick-actions]');
  const form = shell.querySelector('[data-assistant-form]');
  const input = shell.querySelector('[data-assistant-input]');
  const sendButton = shell.querySelector('[data-assistant-send]');
  const expandButton = shell.querySelector('[data-assistant-expand]');
  const configToggle = shell.querySelector('[data-assistant-config-toggle]');
  const clearChatButton = shell.querySelector('[data-assistant-clear]');
  const configPanel = shell.querySelector('[data-assistant-config]');
  const keyInput = shell.querySelector('#assistant-provider-key');
  const saveKeyButton = shell.querySelector('[data-assistant-save-key]');
  const clearKeyButton = shell.querySelector('[data-assistant-clear-key]');

  function loadHistory() {
    try {
      const raw = localStorage.getItem(historyKey);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function loadExpanded() {
    try {
      return localStorage.getItem(expandedStorage) === 'true';
    } catch (error) {
      return false;
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(historyKey, JSON.stringify(state.history.slice(-12)));
    } catch (error) {
      return;
    }
  }

  function readProviderKey() {
    try {
      return localStorage.getItem(providerKeyStorage) || '';
    } catch (error) {
      return '';
    }
  }

  function writeProviderKey(value) {
    try {
      if (value) {
        localStorage.setItem(providerKeyStorage, value);
      } else {
        localStorage.removeItem(providerKeyStorage);
      }
    } catch (error) {
      return;
    }
  }

  function saveExpanded() {
    try {
      localStorage.setItem(expandedStorage, String(state.expanded));
    } catch (error) {
      return;
    }
  }

  function setStatus(text, mode) {
    statusEl.textContent = text;
    statusEl.dataset.mode = mode || 'neutral';
  }

  function appendFormattedText(target, text) {
    const source = String(text || '');
    const lines = source.split(/\r?\n/);

    lines.forEach(function(line) {
      const lineEl = document.createElement('span');
      const trimmed = line.trim();
      let content = line;

      lineEl.className = 'assistant-message__line';

      if (!trimmed) {
        lineEl.classList.add('assistant-message__line--spacer');
        target.appendChild(lineEl);
        return;
      }

      if (/^(final fare|kabuuang pamasahe|cheapest price|highest price|current price|pinakamurang presyo|pinakamataas na presyo|kasalukuyang presyo)$/i.test(trimmed)) {
        lineEl.classList.add('assistant-message__line--fare-label');
        lineEl.classList.add('assistant-message__line--price-label');
      }

      if (/^\*\*[^*]*(?:PHP|₱)[^*]*\*\*$/i.test(trimmed)) {
        lineEl.classList.add('assistant-message__line--fare-total');
        lineEl.classList.add('assistant-message__line--price-total');
      }

      const matcher = /\*\*(.+?)\*\*/gs;
      let cursor = 0;
      let match;

      while ((match = matcher.exec(content)) !== null) {
        if (match.index > cursor) {
          lineEl.appendChild(document.createTextNode(content.slice(cursor, match.index)));
        }

        const strong = document.createElement('strong');
        strong.textContent = match[1];
        lineEl.appendChild(strong);
        cursor = matcher.lastIndex;
      }

      if (cursor < content.length) {
        lineEl.appendChild(document.createTextNode(content.slice(cursor)));
      }

      target.appendChild(lineEl);
    });
  }

  function addMessage(role, text, meta) {
    const item = document.createElement('article');
    item.className = `assistant-message assistant-message--${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'assistant-message__bubble';
    if (role === 'assistant') {
      appendFormattedText(bubble, text);
    } else {
      bubble.textContent = text;
    }
    item.appendChild(bubble);

    if (meta) {
      const foot = document.createElement('div');
      foot.className = 'assistant-message__meta';
      foot.textContent = meta;
      item.appendChild(foot);
    }

    if (role === 'assistant' && text) {
      const tools = document.createElement('div');
      tools.className = 'assistant-message__tools';

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'assistant-copy-btn';
      copyButton.textContent = 'Copy';
      copyButton.addEventListener('click', function() {
        copyMessageText(text, copyButton);
      });

      tools.appendChild(copyButton);
      item.appendChild(tools);
    }

    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return item;
  }

  function copyMessageText(text, button) {
    const value = String(text || '');
    if (!value) return;

    function markCopied() {
      button.textContent = 'Copied';
      window.setTimeout(function() {
        button.textContent = 'Copy';
      }, 1400);
    }

    function fallbackCopy() {
      const temp = document.createElement('textarea');
      temp.value = value;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand('copy');
        markCopied();
      } catch (error) {
        return;
      } finally {
        temp.remove();
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(value).then(markCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function showTypingIndicator() {
    const item = document.createElement('article');
    item.className = 'assistant-message assistant-message--assistant assistant-message--typing';
    item.dataset.typing = 'true';
    item.innerHTML = `
      <div class="assistant-message__bubble assistant-typing" aria-label="Assistant is typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return item;
  }

  function removeTypingIndicator(indicator) {
    if (indicator && indicator.isConnected) {
      indicator.remove();
    }
  }

  function clearChat() {
    state.history = [];
    saveHistory();
    renderHistory();
    setStatus(readProviderKey() ? 'Real AI enabled on this device.' : 'Local grounded answers are active. Add a key for real AI chat.', readProviderKey() ? 'ai' : 'local');
  }

  function renderHistory() {
    messagesEl.innerHTML = '';
    if (!state.history.length) {
      addMessage('assistant', 'Ask me about available vehicles, routes, fares, driver records, or live gas prices.');
      return;
    }

    state.history.forEach(function(entry) {
      addMessage(entry.role, entry.content, entry.meta || '');
    });
  }

  function togglePanel(forceOpen) {
    state.open = typeof forceOpen === 'boolean' ? forceOpen : !state.open;
    launcher.setAttribute('aria-expanded', String(state.open));
    panel.hidden = !state.open;
    panel.setAttribute('aria-hidden', String(!state.open));
    shell.classList.toggle('is-open', state.open);
    shell.classList.toggle('is-expanded', state.expanded);
    if (state.open) {
      input.focus();
    }
  }

  function syncExpandedButton() {
    shell.classList.toggle('is-expanded', state.expanded);
    expandButton.innerHTML = assistantIcon(state.expanded ? 'shrink' : 'expand');
    expandButton.setAttribute('aria-label', state.expanded ? 'Shrink assistant' : 'Enlarge assistant');
    expandButton.setAttribute('title', state.expanded ? 'Shrink assistant' : 'Enlarge assistant');
    expandButton.setAttribute('aria-pressed', String(state.expanded));
  }

  function toggleExpanded(forceExpanded) {
    state.expanded = typeof forceExpanded === 'boolean' ? forceExpanded : !state.expanded;
    saveExpanded();
    syncExpandedButton();
    if (state.open) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      input.focus();
    }
  }

  function toggleConfig(forceOpen) {
    const next = typeof forceOpen === 'boolean' ? forceOpen : configPanel.hidden;
    configPanel.hidden = !next;
    if (next) keyInput.focus();
  }

  function buildContext() {
    const snapshot = knowledge.getFleetSnapshot();
    const summary = knowledge.getFleetSummary(snapshot);
    const selections = {};

    ['route-select', 'vehicle-select', 'driver-vehicle-filter', 'fuel-area-select', 'fuel-type-select', 'start-location', 'destination', 'vehicle-type', 'passenger-type'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el && typeof el.value === 'string' && el.value) {
        selections[id] = el.value;
      }
    });

    return {
      page: window.location.pathname.split('/').pop() || 'index.html',
      title: document.title,
      timestamp: new Date().toISOString(),
      routes: knowledge.getRouteCatalog(),
      fleet: {
        entries: snapshot.map(function(entry) {
          return {
            id: entry.id,
            route: entry.route,
            type: entry.type,
            status: entry.status,
            driverName: entry.driverName || '',
            source: entry.source || 'demo'
          };
        }),
        summary
      },
      drivers: knowledge.getPublishedDrivers ? knowledge.getPublishedDrivers() : [],
      selections
    };  }

  function buildClientSystemPrompt(context) {
    const routeSummary = (context.routes || []).map(function(route) {
      return `${route.label}: ${route.origin} to ${route.destination}. Vehicles: ${route.vehicleTypes.join(', ')}.`;
    }).join('\n');

    let fleetText = '';
    if (context.fleet && context.fleet.summary && context.fleet.summary.byType) {
      fleetText = Object.keys(context.fleet.summary.byType).map(function(type) {
        const item = context.fleet.summary.byType[type];
        return `${type}: total ${item.total}, available ${item.available}, limited ${item.limited}, unavailable ${item.unavailable}`;
      }).join('\n');
    }

    const drivers = (context.drivers || []).slice(0, 5).map(function(driver) {
      const contact = driver.phone || driver.contactText || 'No phone';
      return `${driver.name} | ${driver.routeLabel || driver.route} | ${driver.vehicleType} | ${contact}`;
    }).join('\n');

    const formatCurrency = function(val) {
      return 'PHP ' + Number(val || 0).toFixed(2);
    };

    const fareExamples = [
      knowledge.getFareEstimate('dasma', 'indang', 'jeepney', 'regular'),
      knowledge.getFareEstimate('trece', 'indang', 'jeepney', 'regular'),
      knowledge.getFareEstimate('trece', 'indang', 'bus', 'regular'),
      knowledge.getFareEstimate('alfonso', 'indang', 'bus', 'student'),
      knowledge.getFareEstimate('olivarez', 'indang', 'jeepney', 'senior')
    ].filter(Boolean).map(function(item) {
      const titleCase = function(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
      };
      return `${titleCase(item.vehicleType)} ${titleCase(item.startLocation)} to ${titleCase(item.destination)} (${item.passengerType}): ${formatCurrency(item.fare)} over ${item.distanceKm} km.`;
    }).join('\n');

    return [
      'You are the spot.ph assistant for a local public transport site in Cavite, Philippines.',
      'Answer briefly and directly.',
      'Reply in the same language and style as the user when possible, including Tagalog or Taglish.',
      'Only answer questions about spot.ph transport topics: routes, fares, vehicles, driver records, the driver portal, and Cavite gas prices.',
      'If the user asks about unrelated topics, refuse briefly and invite a transport-related question.',
      'Use only the provided context. If the data is not present, say that clearly.',
      'If the user asks for fares, prefer exact estimates from the fare matrix.',
      'If the user asks for routes or vehicles, answer from the current fleet and route context.',
      '',
      'Routes:',
      routeSummary,
      '',
      'Fleet:',
      fleetText || 'No fleet data available.',
      '',
      'Published drivers:',
      drivers || 'No published drivers.',
      '',
      'Fare matrix examples:',
      fareExamples || 'Fare data unavailable.'
    ].join('\n');
  }

  async function loadConfig() {
    const localKey = readProviderKey();
    keyInput.value = localKey;

    try {
      const response = await fetch('/api/assistant/config', { cache: 'no-store' });
      const config = await response.json();
      state.config = config;

      if (localKey) {
        setStatus('Real AI enabled on this device.', 'ai');
      } else if (config.mode === 'ai') {
        setStatus('Server AI is ready.', 'ai');
      } else {
        setStatus('Local grounded answers are active. Add a key for real AI chat.', 'local');
      }
    } catch (error) {
      if (localKey) {
        setStatus('Real AI enabled on this device (offline mode).', 'ai');
      } else {
        setStatus('Assistant config unavailable. Local answers may still work.', 'warning');
      }
    }
  }

  async function sendMessage(message) {
    if (state.sending) return;

    const text = String(message || '').trim();
    if (!text) return;

    state.sending = true;
    sendButton.disabled = true;
    input.disabled = true;

    state.history.push({ role: 'user', content: text });
    addMessage('user', text);
    input.value = '';
    saveHistory();
    setStatus('Thinking...', 'loading');
    const typingIndicator = showTypingIndicator();

    const providerKey = readProviderKey();

    // If key is present on static client-side (Netlify), call Pollinations directly from the browser!
    if (providerKey) {
      try {
        let answer = '';
        let meta = 'Real AI reply (client)';
        let mode = 'ai';

        const exactFareAnswer = clientFareAnswer(text);
        if (exactFareAnswer) {
          answer = exactFareAnswer;
          meta = 'Calculated from site fare data';
          mode = 'grounded';
        } else {
          const clientContext = buildContext();
          const clientSystemPrompt = buildClientSystemPrompt(clientContext);
          const messages = [{ role: 'system', content: clientSystemPrompt }];
          state.history.slice(-8).forEach(function(entry) {
            messages.push({ role: entry.role, content: entry.content });
          });

          const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + providerKey
            },
            body: JSON.stringify({
              model: 'openai',
              messages: messages,
              temperature: 0.2,
              max_tokens: 280
            })
          });

          if (!response.ok) {
            throw new Error('AI provider request failed');
          }

          const payload = await response.json();
          answer = payload && payload.choices && payload.choices[0] && payload.choices[0].message
            ? payload.choices[0].message.content
            : '';
          if (!answer) {
            throw new Error('AI provider returned an empty response');
          }
        }

        removeTypingIndicator(typingIndicator);
        state.history.push({ role: 'assistant', content: answer, meta: meta });
        addMessage('assistant', answer, meta);
        saveHistory();

        if (mode === 'ai') {
          setStatus('Real AI is active.', 'ai');
        } else {
          setStatus('Local grounded answers are active.', 'local');
        }
      } catch (error) {
        const fallback = 'The assistant could not reply right now.';
        removeTypingIndicator(typingIndicator);
        state.history.push({ role: 'assistant', content: fallback, meta: 'Request error' });
        addMessage('assistant', fallback, 'Request error');
        saveHistory();
        setStatus('Assistant request failed.', 'warning');
      } finally {
        state.sending = false;
        sendButton.disabled = false;
        input.disabled = false;
        input.focus();
      }
      return;
    }

    // Default server-side API call fallback
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          providerKey: providerKey,
          history: state.history.slice(-10).map(function(entry) {
            return { role: entry.role, content: entry.content };
          }),
          context: buildContext()
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : 'Assistant request failed.');
      }

      const exactFareAnswer = clientFareAnswer(text);
      if (exactFareAnswer) {
        payload.answer = exactFareAnswer;
        payload.mode = 'grounded';
        payload.provider = 'local';
        payload.note = 'Calculated from site fare data';
      }

      const meta = payload.note || (payload.mode === 'ai'
        ? 'Real AI reply'
        : 'Grounded local reply');

      removeTypingIndicator(typingIndicator);
      state.history.push({ role: 'assistant', content: payload.answer, meta });
      addMessage('assistant', payload.answer, meta);
      saveHistory();

      if (payload.mode === 'ai') {
        setStatus('Real AI is active.', 'ai');
      } else {
        setStatus('Local grounded answers are active.', 'local');
      }
    } catch (error) {
      const fallback = 'The assistant could not reply right now.';
      removeTypingIndicator(typingIndicator);
      state.history.push({ role: 'assistant', content: fallback, meta: 'Request error' });
      addMessage('assistant', fallback, 'Request error');
      saveHistory();
      setStatus('Assistant request failed.', 'warning');
    } finally {
      state.sending = false;
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  launcher.addEventListener('click', function() {
    togglePanel();
  });

  expandButton.addEventListener('click', function() {
    toggleExpanded();
  });

  closeButton.addEventListener('click', function() {
    togglePanel(false);
  });

  panel.addEventListener('click', function(event) {
    if (event.target.closest('[data-assistant-close]')) {
      togglePanel(false);
    }
  });

  configToggle.addEventListener('click', function() {
    toggleConfig();
  });

  clearChatButton.addEventListener('click', clearChat);

  saveKeyButton.addEventListener('click', function() {
    const value = keyInput.value.trim();
    writeProviderKey(value);
    toggleConfig(false);
    loadConfig();
  });

  clearKeyButton.addEventListener('click', function() {
    keyInput.value = '';
    writeProviderKey('');
    toggleConfig(false);
    loadConfig();
  });

  quickActionsEl.addEventListener('click', function(event) {
    const chip = event.target.closest('.assistant-chip');
    if (!chip) return;
    sendMessage(chip.textContent || '');
  });

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input.value);
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      toggleConfig(false);
      togglePanel(false);
    }
  });

  renderHistory();
  syncExpandedButton();
  loadConfig();
});
