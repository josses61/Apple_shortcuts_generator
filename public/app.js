/* ─── DOM refs ─────────────────────────────────────────────────── */
const promptInput      = document.querySelector('#prompt');
const sourceInput      = document.querySelector('#source');
const generateButton   = document.querySelector('#generate');
const compileButton    = document.querySelector('#compile');
const modelInput       = document.querySelector('#model');
const providerInput    = document.querySelector('#provider');
const lineNumbers      = document.querySelector('#line-numbers');
const toast            = document.querySelector('#toast');
const buildStrip       = document.querySelector('.build-strip');
const exampleInput     = document.querySelector('#example-files');
const selectedExamples = document.querySelector('#selected-examples');
const shortcutNameInput = document.querySelector('#shortcut-name');
const footerModel      = document.querySelector('#footer-model');
const buildErrorCopy   = document.querySelector('#build-error-copy');

const referenceExamples = [];
let depth      = 'thorough';
let toastTimer = null;
const STORAGE_KEY  = 'cherri-workbench-draft';
const maxExampleBytes = 20_000;

/* ─── Starter source ────────────────────────────────────────────── */
const starter = `#define color yellow
#define glyph smileyFace
#define name Hello, Cherri!

@message = "Hello from Cherri!"
@title = "Welcome"
alert(@message, @title)`;

/* ─── Persistence ───────────────────────────────────────────────── */
function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      source: sourceInput.value,
      prompt: promptInput.value,
      name: shortcutNameInput.value
    }));
  } catch { /* quota exceeded – silently ignore */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (draft.source) sourceInput.value = draft.source;
    if (draft.prompt) promptInput.value = draft.prompt;
    if (draft.name)   shortcutNameInput.value = draft.name;
    return Boolean(draft.source);
  } catch {
    return false;
  }
}

/* ─── Build state ───────────────────────────────────────────────── */
function setBuildState(title, detail, state = '') {
  document.querySelector('#build-title').textContent  = title;
  document.querySelector('#build-detail').textContent = detail;
  buildStrip.classList.remove('error', 'success', 'generating');
  if (state) buildStrip.classList.add(state);
  document.querySelector('#build-mark').textContent =
    state === 'success' ? '✓' : state === 'error' ? '!' : '⌁';
  // Show/hide copy-error button
  if (buildErrorCopy) buildErrorCopy.hidden = state !== 'error';
}

/* ─── Editor helpers ────────────────────────────────────────────── */
function updateEditorMeta() {
  const lines = sourceInput.value.split('\n').length;
  lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  document.querySelector('#line-count').textContent = lines;
}

function scrollToLine(lineNumber) {
  const lines   = sourceInput.value.split('\n');
  const before  = lines.slice(0, lineNumber - 1).join('\n');
  const lineH   = sourceInput.scrollHeight / lines.length;
  sourceInput.scrollTop = Math.max(0, (lineNumber - 4) * lineH);
  // Set cursor to beginning of the error line
  const charIndex = before.length + (lineNumber > 1 ? 1 : 0);
  sourceInput.setSelectionRange(charIndex, charIndex + (lines[lineNumber - 1] || '').length);
  sourceInput.focus();
}

function markDirty() {
  document.querySelector('#dirty-dot').hidden = false;
}

/* ─── Toast ─────────────────────────────────────────────────────── */
function showToast(message, duration = 3200) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

/* ─── Error helper ──────────────────────────────────────────────── */
async function getError(response) {
  const data = await response.json().catch(() => ({}));
  return data.error || `Request failed (${response.status}).`;
}

/* ─── Footer ────────────────────────────────────────────────────── */
function updateFooter() {
  if (!footerModel) return;
  const provider = providerInput.value;
  const model    = modelInput.value || (provider === 'ollama' ? 'qwen2.5-coder' : 'phi-4-mini');
  const label    = provider === 'github' ? 'GitHub Models · ' : 'Ollama · ';
  footerModel.textContent = (label + model).toUpperCase();
}

/* ─── Status refresh ────────────────────────────────────────────── */
async function refreshStatus() {
  const modelStatus  = document.querySelector('#model-status');
  const modelLabel   = modelStatus.querySelector('span');
  const compilerStatus = document.querySelector('#compiler-status');
  try {
    const response = await fetch('/api/status');
    const status   = await response.json();
    providerInput.value = status.provider;
    modelInput.value    = status.model;
    updateProviderStatus(status);
    updateFooter();
    compilerStatus.textContent = status.compilerAvailable ? 'CHERRI CLI READY' : 'CHERRI CLI NOT FOUND';
    compilerStatus.classList.toggle('ready',   status.compilerAvailable);
    compilerStatus.classList.toggle('missing', !status.compilerAvailable);
    if (!status.compilerAvailable) {
      setBuildState(
        'Cherri compiler not connected',
        'Install the Cherri CLI or set CHERRI_BIN to compile an unsigned .shortcut. You can still download the .cherri source.'
      );
    }
  } catch {
    modelLabel.textContent = 'Server unavailable';
    modelStatus.classList.add('error');
  }
}

function updateProviderStatus(status = {}) {
  const modelStatus = document.querySelector('#model-status');
  const modelLabel  = modelStatus.querySelector('span');
  const provider    = providerInput.value;
  const ready       = provider === 'ollama'
    ? status.ollamaAvailable && status.ollamaModelAvailable
    : status.githubConfigured;
  modelStatus.classList.toggle('ready', Boolean(ready));
  modelStatus.classList.toggle('error', !ready);
  const modelSourceLink = document.querySelector('.model-source');
  if (modelSourceLink) modelSourceLink.hidden = provider === 'github';
  modelLabel.textContent = provider === 'ollama'
    ? (ready ? 'Local model ready' : status.ollamaAvailable ? 'Download local model' : 'Start local Ollama')
    : (ready ? 'GitHub token set'  : 'GitHub token needed');
}

/* ─── Provider change ───────────────────────────────────────────── */
providerInput.addEventListener('change', () => {
  modelInput.value = providerInput.value === 'ollama' ? 'qwen2.5-coder:3b' : 'microsoft/Phi-4-mini-instruct';
  fetch('/api/status').then((r) => r.json()).then(updateProviderStatus).catch(() => {});
  updateFooter();
});

/* Recheck Ollama readiness when user manually changes the model name */
modelInput.addEventListener('blur', () => {
  fetch('/api/status').then((r) => r.json()).then(updateProviderStatus).catch(() => {});
  updateFooter();
});

/* ─── Reference examples ────────────────────────────────────────── */
document.querySelector('#add-examples').addEventListener('click', () => exampleInput.click());

function renderReferenceExamples() {
  selectedExamples.replaceChildren();
  referenceExamples.forEach((example, index) => {
    const row    = document.createElement('div');
    row.className = 'reference-file';
    const name   = document.createElement('span');
    name.textContent = example.name;
    const remove = document.createElement('button');
    remove.type  = 'button';
    remove.title = `Remove ${example.name}`;
    remove.setAttribute('aria-label', `Remove ${example.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      referenceExamples.splice(index, 1);
      renderReferenceExamples();
    });
    row.append(name, remove);
    selectedExamples.append(row);
  });
}

exampleInput.addEventListener('change', async () => {
  for (const file of exampleInput.files || []) {
    if (referenceExamples.length >= 3) {
      showToast('Choose up to 3 reference files. Remove one before adding another.');
      break;
    }
    if (file.size > maxExampleBytes) {
      showToast(`${file.name} is over the 20 KB per-file limit.`);
      continue;
    }
    if (!/\.(cherri|txt|md)$/i.test(file.name)) {
      showToast('Use Cherri source or plain-text files (.cherri, .txt, .md).');
      continue;
    }
    if (referenceExamples.some((e) => e.name === file.name)) continue;
    const source = await file.text();
    referenceExamples.push({ name: file.name, source });
  }
  exampleInput.value = '';
  renderReferenceExamples();
});

/* ─── Example prompt buttons ────────────────────────────────────── */
document.querySelectorAll('.example').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.prompt;
    const enabled = (button.dataset.features || '').split(',').filter(Boolean);
    document.querySelectorAll('[data-feature]').forEach((cb) => {
      cb.checked = enabled.includes(cb.value);
    });
    promptInput.focus();
  });
});

/* ─── Depth switch ──────────────────────────────────────────────── */
document.querySelectorAll('.depth-switch button').forEach((button) => {
  button.addEventListener('click', () => {
    depth = button.dataset.depth;
    document.querySelectorAll('.depth-switch button').forEach((b) => {
      b.classList.toggle('active', b === button);
    });
  });
});

/* ─── Generate (streaming SSE) ──────────────────────────────────── */
generateButton.addEventListener('click', async () => {
  if (!promptInput.value.trim()) {
    promptInput.focus();
    showToast('Add a short description of the shortcut first.');
    return;
  }
  generateButton.disabled = true;
  generateButton.innerHTML = '<span class="spin" aria-hidden="true">◌</span> Writing Cherri…';
  setBuildState(
    providerInput.value === 'ollama' ? 'Drafting with local SLM' : 'Drafting with GitHub Models',
    'The model is composing a Cherri program from your brief.',
    'generating'
  );

  // Clear editor for streaming output
  sourceInput.value = '';
  document.querySelector('#dirty-dot').hidden = true;
  updateEditorMeta();

  let finalSource = '';
  let errorMessage = '';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt:   promptInput.value,
        depth,
        model:    modelInput.value,
        provider: providerInput.value,
        features: Array.from(document.querySelectorAll('[data-feature]:checked'), (cb) => cb.value),
        examples: referenceExamples
      })
    });

    if (!response.ok) {
      errorMessage = await getError(response);
      throw new Error(errorMessage);
    }

    // Read the SSE stream
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events end with \n\n
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // keep incomplete trailing chunk

      for (const part of parts) {
        const lines     = part.split('\n');
        let eventName   = 'message';
        let dataPayload = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventName   = line.slice(7).trim();
          if (line.startsWith('data: '))  dataPayload = line.slice(6).trim();
        }
        if (!dataPayload) continue;

        let parsed;
        try { parsed = JSON.parse(dataPayload); } catch { continue; }

        if (eventName === 'token') {
          sourceInput.value += parsed.token;
          // Auto-scroll editor to bottom during streaming
          sourceInput.scrollTop = sourceInput.scrollHeight;
          updateEditorMeta();
        } else if (eventName === 'done') {
          finalSource = parsed.source;
          sourceInput.value = finalSource;
          document.querySelector('#dirty-dot').hidden = false;
          document.querySelector('#editor-message').textContent =
            `${parsed.provider === 'ollama' ? 'Local SLM' : 'GitHub Models'} · ${parsed.model}`;
          setBuildState('Cherri source drafted', 'Review the source, then compile it into an unsigned .shortcut.');
          updateEditorMeta();
          saveDraft();
        } else if (eventName === 'error') {
          errorMessage = parsed.error || 'Generation failed.';
        }
      }
    }

    if (!finalSource && errorMessage) throw new Error(errorMessage);
  } catch (error) {
    setBuildState('Could not generate script', error.message, 'error');
    showToast(error.message, 5000);
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = '<span>✳</span> Generate Cherri <kbd>⌘ ↵</kbd>';
  }
});

/* ─── Editor events ─────────────────────────────────────────────── */
sourceInput.addEventListener('input', () => {
  markDirty();
  document.querySelector('#editor-message').textContent = 'Edited locally';
  updateEditorMeta();
  saveDraft();
});

sourceInput.addEventListener('scroll', () => {
  lineNumbers.scrollTop = sourceInput.scrollTop;
});

/* Tab key → insert 2 spaces instead of moving focus */
sourceInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  const start = sourceInput.selectionStart;
  const end   = sourceInput.selectionEnd;
  const val   = sourceInput.value;
  if (start === end) {
    // No selection — insert 2 spaces at cursor
    sourceInput.value = val.slice(0, start) + '  ' + val.slice(end);
    sourceInput.selectionStart = sourceInput.selectionEnd = start + 2;
  } else {
    // Multi-line selection — indent/dedent each selected line
    const before       = val.slice(0, start);
    const selected     = val.slice(start, end);
    const after        = val.slice(end);
    const indented     = event.shiftKey
      ? selected.replace(/^  /gm, '')
      : selected.replace(/^/gm, '  ');
    sourceInput.value  = before + indented + after;
    sourceInput.selectionStart = start;
    sourceInput.selectionEnd   = start + indented.length;
  }
  updateEditorMeta();
});

/* Prompt textarea — also save draft on change */
promptInput.addEventListener('input', saveDraft);
shortcutNameInput.addEventListener('input', saveDraft);

/* ─── Copy source ───────────────────────────────────────────────── */
document.querySelector('#copy-source').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sourceInput.value);
    showToast('Cherri source copied.');
  } catch {
    showToast('Clipboard access is unavailable in this browser.');
  }
});

/* ─── Download helper ───────────────────────────────────────────── */
function download(content, name, type) {
  const url    = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href  = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getShortcutName() {
  const val = (shortcutNameInput?.value || '').trim();
  return val || 'MyShortcut';
}

/* ─── Download source ───────────────────────────────────────────── */
document.querySelector('#download-source').addEventListener('click', () => {
  download(sourceInput.value, `${getShortcutName()}.cherri`, 'text/plain;charset=utf-8');
});

/* ─── Compile ───────────────────────────────────────────────────── */
compileButton.addEventListener('click', async () => {
  compileButton.disabled = true;
  compileButton.innerHTML = '<span class="spin" aria-hidden="true">◌</span> Compiling';
  setBuildState('Compiling with Cherri', 'Checking the Cherri program and packaging an unsigned Shortcut file.');
  try {
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourceInput.value, name: getShortcutName() })
    });
    if (!response.ok) {
      const err = await getError(response);
      // Try to parse a line number from the error, e.g. "line 12:" or ":12:"
      const lineMatch = err.match(/(?:line\s+|:)(\d+)(?:\s*:|\s)/i);
      if (lineMatch) {
        const lineNo = parseInt(lineMatch[1], 10);
        if (lineNo > 0) scrollToLine(lineNo);
      }
      throw new Error(err);
    }
    const shortcut = await response.blob();
    download(shortcut, `${getShortcutName()}_unsigned.shortcut`, 'application/octet-stream');
    document.querySelector('#dirty-dot').hidden = true;
    setBuildState('Unsigned Shortcut built', 'Cherri compiled your source. The unsigned .shortcut file is downloaded.', 'success');
    showToast('Unsigned .shortcut downloaded.');
  } catch (error) {
    setBuildState('Build needs attention', error.message, 'error');
    showToast(error.message, 5000);
  } finally {
    compileButton.disabled = false;
    compileButton.innerHTML = '<span aria-hidden="true">⌁</span> Build .shortcut';
  }
});

/* ─── Copy build error ──────────────────────────────────────────── */
if (buildErrorCopy) {
  buildErrorCopy.addEventListener('click', async () => {
    const detail = document.querySelector('#build-detail').textContent;
    try {
      await navigator.clipboard.writeText(detail);
      showToast('Error message copied.');
    } catch {
      showToast('Clipboard unavailable.');
    }
  });
}

/* ─── Global keyboard shortcuts ────────────────────────────────── */
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') generateButton.click();
});

/* ─── Init ──────────────────────────────────────────────────────── */
const hasDraft = loadDraft();
if (!hasDraft) sourceInput.value = starter;
updateEditorMeta();
refreshStatus();
