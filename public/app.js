const promptInput = document.querySelector('#prompt');
const sourceInput = document.querySelector('#source');
const generateButton = document.querySelector('#generate');
const compileButton = document.querySelector('#compile');
const modelInput = document.querySelector('#model');
const providerInput = document.querySelector('#provider');
const lineNumbers = document.querySelector('#line-numbers');
const toast = document.querySelector('#toast');
const buildStrip = document.querySelector('.build-strip');
const exampleInput = document.querySelector('#example-files');
const selectedExamples = document.querySelector('#selected-examples');
const referenceExamples = [];
let depth = 'thorough';
let toastTimer;
const maxExampleBytes = 20_000;

const starter = `#define color yellow
#define glyph smileyFace
#define name Hello, Cherri!

@message = "Hello from Cherri!"
@title = "Welcome"
alert(@message, @title)`;
sourceInput.value = starter;

function setBuildState(title, detail, state = '') {
  document.querySelector('#build-title').textContent = title;
  document.querySelector('#build-detail').textContent = detail;
  buildStrip.classList.remove('error', 'success');
  if (state) buildStrip.classList.add(state);
  document.querySelector('#build-mark').textContent = state === 'success' ? '✓' : state === 'error' ? '!' : '⌁';
}

function updateEditorMeta() {
  const lines = sourceInput.value.split('\n').length;
  lineNumbers.textContent = Array.from({ length: lines }, (_, index) => index + 1).join('\n');
  document.querySelector('#line-count').textContent = lines;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

async function getError(response) {
  const data = await response.json().catch(() => ({}));
  return data.error || `Request failed (${response.status}).`;
}

async function refreshStatus() {
  const modelStatus = document.querySelector('#model-status');
  const modelLabel = modelStatus.querySelector('span');
  const compilerStatus = document.querySelector('#compiler-status');
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    providerInput.value = status.provider;
    modelInput.value = status.model;
    updateProviderStatus(status);
    compilerStatus.textContent = status.compilerAvailable ? 'CHERRI CLI READY' : 'CHERRI CLI NOT FOUND';
    compilerStatus.classList.toggle('ready', status.compilerAvailable);
    compilerStatus.classList.toggle('missing', !status.compilerAvailable);
    if (!status.compilerAvailable) {
      setBuildState('Cherri compiler not connected', 'Install the Cherri CLI or set CHERRI_BIN to compile an unsigned .shortcut. You can still download the .cherri source.');
    }
  } catch {
    modelLabel.textContent = 'Server unavailable';
    modelStatus.classList.add('error');
  }
}

function updateProviderStatus(status = {}) {
  const modelStatus = document.querySelector('#model-status');
  const modelLabel = modelStatus.querySelector('span');
  const provider = providerInput.value;
  const ready = provider === 'ollama' ? status.ollamaAvailable && status.ollamaModelAvailable : status.githubConfigured;
  modelStatus.classList.toggle('ready', Boolean(ready));
  modelStatus.classList.toggle('error', !ready);
  document.querySelector('.model-source').hidden = provider === 'github';
  modelLabel.textContent = provider === 'ollama'
    ? (ready ? 'Local model ready' : status.ollamaAvailable ? 'Download local model' : 'Start local Ollama')
    : (ready ? 'GitHub token set' : 'GitHub token needed');
}

providerInput.addEventListener('change', () => {
  modelInput.value = providerInput.value === 'ollama' ? 'qwen2.5-coder:3b' : 'microsoft/Phi-4-mini-instruct';
  fetch('/api/status').then((response) => response.json()).then(updateProviderStatus).catch(() => {});
});

document.querySelector('#add-examples').addEventListener('click', () => exampleInput.click());

function renderReferenceExamples() {
  selectedExamples.replaceChildren();
  referenceExamples.forEach((example, index) => {
    const row = document.createElement('div');
    row.className = 'reference-file';
    const name = document.createElement('span');
    name.textContent = example.name;
    const remove = document.createElement('button');
    remove.type = 'button';
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
    if (referenceExamples.some((example) => example.name === file.name)) continue;
    const source = await file.text();
    referenceExamples.push({ name: file.name, source });
  }
  exampleInput.value = '';
  renderReferenceExamples();
});

document.querySelectorAll('.example').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.prompt;
    const enabledFeatures = (button.dataset.features || '').split(',').filter(Boolean);
    document.querySelectorAll('[data-feature]').forEach((checkbox) => {
      checkbox.checked = enabledFeatures.includes(checkbox.value);
    });
    promptInput.focus();
  });
});

document.querySelectorAll('.depth-switch button').forEach((button) => {
  button.addEventListener('click', () => {
    depth = button.dataset.depth;
    document.querySelectorAll('.depth-switch button').forEach((option) => option.classList.toggle('active', option === button));
  });
});

generateButton.addEventListener('click', async () => {
  if (!promptInput.value.trim()) {
    promptInput.focus();
    showToast('Add a short description of the shortcut first.');
    return;
  }
  generateButton.disabled = true;
  generateButton.innerHTML = '<span>◌</span> Writing Cherri…';
  setBuildState(providerInput.value === 'ollama' ? 'Drafting with local SLM' : 'Drafting with GitHub Models', 'The model is composing a Cherri program from your brief.');
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptInput.value,
        depth,
        model: modelInput.value,
        provider: providerInput.value,
        features: Array.from(document.querySelectorAll('[data-feature]:checked'), (checkbox) => checkbox.value),
        examples: referenceExamples
      })
    });
    if (!response.ok) throw new Error(await getError(response));
    const data = await response.json();
    sourceInput.value = data.source;
    document.querySelector('#dirty-dot').hidden = false;
    document.querySelector('#editor-message').textContent = `${data.provider === 'ollama' ? 'Local SLM' : 'GitHub Models'} · ${data.model}`;
    setBuildState('Cherri source drafted', 'Review the source, then compile it into an unsigned .shortcut.');
    updateEditorMeta();
  } catch (error) {
    setBuildState('Could not generate script', error.message, 'error');
    showToast(error.message);
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = '<span>✳</span> Generate Cherri <kbd>⌘ ↵</kbd>';
  }
});

sourceInput.addEventListener('input', () => {
  document.querySelector('#dirty-dot').hidden = false;
  document.querySelector('#editor-message').textContent = 'Edited locally';
  updateEditorMeta();
});

sourceInput.addEventListener('scroll', () => {
  lineNumbers.scrollTop = sourceInput.scrollTop;
});

document.querySelector('#copy-source').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sourceInput.value);
    showToast('Cherri source copied.');
  } catch {
    showToast('Clipboard access is unavailable in this browser.');
  }
});

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.querySelector('#download-source').addEventListener('click', () => {
  download(sourceInput.value, 'MyShortcut.cherri', 'text/plain;charset=utf-8');
});

compileButton.addEventListener('click', async () => {
  compileButton.disabled = true;
  compileButton.innerHTML = '<span>◌</span> Compiling';
  setBuildState('Compiling with Cherri', 'Checking the Cherri program and packaging an unsigned Shortcut file.');
  try {
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourceInput.value, name: 'MyShortcut' })
    });
    if (!response.ok) throw new Error(await getError(response));
    const shortcut = await response.blob();
    download(shortcut, 'MyShortcut_unsigned.shortcut', 'application/octet-stream');
    document.querySelector('#dirty-dot').hidden = true;
    setBuildState('Unsigned Shortcut built', 'Cherri compiled your source. The unsigned .shortcut file is downloaded.', 'success');
    showToast('Unsigned .shortcut downloaded.');
  } catch (error) {
    setBuildState('Build needs attention', error.message, 'error');
    showToast(error.message);
  } finally {
    compileButton.disabled = false;
    compileButton.innerHTML = '<span aria-hidden="true">⌁</span> Build .shortcut';
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') generateButton.click();
});

updateEditorMeta();
refreshStatus();