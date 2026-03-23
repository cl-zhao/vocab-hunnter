// Vocab Hunter - Popup Script

document.addEventListener('DOMContentLoaded', init);

let allVocab = {};
let currentConfig = {};

// 默认提示词
const DEFAULT_PROMPT = `你是一个英语学习助手。用户在阅读时遇到了不理解的单词/词组，请给出清晰的解释。

单词/词组: {{word}}
上下文: {{context}}

请用 JSON 格式回复（只返回 JSON，不要其他内容）：
{
  "word": "原词",
  "phonetic": "音标（国际音标）",
  "partOfSpeech": "词性（如 n./v./adj. 等）",
  "definition": "简明中文释义（一句话）",
  "examples": ["例句1", "例句2"],
  "synonyms": ["同义词1", "同义词2"],
  "memoryTip": "记忆技巧或词根词缀分析（可选）"
}`;

async function init() {
  // 加载配置
  await loadConfig();

  // 加载生词列表
  await loadVocabList();

  // 绑定事件
  bindEvents();
}

function bindEvents() {
  // 设置面板
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);

  // 模型选择
  document.getElementById('model-select').addEventListener('change', handleModelChange);

  // 恢复默认提示词
  document.getElementById('reset-prompt').addEventListener('click', resetPrompt);

  // 保存配置
  document.getElementById('save-config').addEventListener('click', saveConfig);

  // 导出目录设置
  document.getElementById('select-json-dir').addEventListener('click', () => selectExportDir('json'));
  document.getElementById('select-anki-dir').addEventListener('click', () => selectExportDir('anki'));
  document.getElementById('clear-json-dir').addEventListener('click', () => clearExportDir('json'));
  document.getElementById('clear-anki-dir').addEventListener('click', () => clearExportDir('anki'));

  // 搜索
  document.getElementById('search-input').addEventListener('input', handleSearch);

  // 筛选标签
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => handleFilter(tab));
  });

  // 导出
  document.getElementById('export-json').addEventListener('click', () => exportVocab('json'));
  document.getElementById('export-anki').addEventListener('click', () => exportVocab('anki'));
}

async function loadConfig() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
      if (response && response.success) {
        currentConfig = response.data;
        populateConfigForm();
      }
      resolve();
    });
  });
}

function populateConfigForm() {
  // API Key
  const apiKeyInput = document.getElementById('api-key');
  if (currentConfig.apiKey) {
    apiKeyInput.placeholder = '已配置 (点击修改)';
  }

  // 模型选择
  const modelSelect = document.getElementById('model-select');
  const customModelInput = document.getElementById('custom-model');
  const model = currentConfig.model || 'anthropic/claude-3.5-haiku';

  // 检查是否为预设模型
  const presetOption = modelSelect.querySelector(`option[value="${model}"]`);
  if (presetOption) {
    modelSelect.value = model;
    customModelInput.classList.add('hidden');
  } else {
    modelSelect.value = 'custom';
    customModelInput.classList.remove('hidden');
    customModelInput.value = model;
  }

  // 提示词
  const promptTextarea = document.getElementById('prompt-textarea');
  promptTextarea.value = currentConfig.prompt || DEFAULT_PROMPT;
}

function openSettings() {
  document.getElementById('settings-panel').classList.remove('hidden');
  document.getElementById('main-panel').classList.add('hidden');
  loadExportDirPaths();
}

function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('main-panel').classList.remove('hidden');
}

function handleModelChange(e) {
  const customModelInput = document.getElementById('custom-model');
  if (e.target.value === 'custom') {
    customModelInput.classList.remove('hidden');
    customModelInput.focus();
  } else {
    customModelInput.classList.add('hidden');
  }
}

function resetPrompt() {
  document.getElementById('prompt-textarea').value = DEFAULT_PROMPT;
}

async function saveConfig() {
  const apiKey = document.getElementById('api-key').value.trim();
  const modelSelect = document.getElementById('model-select');
  const customModel = document.getElementById('custom-model').value.trim();
  const prompt = document.getElementById('prompt-textarea').value.trim();

  const model = modelSelect.value === 'custom' ? customModel : modelSelect.value;

  if (!apiKey && !currentConfig.apiKey) {
    showStatus('请输入 API Key', 'error');
    return;
  }

  if (modelSelect.value === 'custom' && !customModel) {
    showStatus('请输入自定义模型名称', 'error');
    return;
  }

  if (!prompt) {
    showStatus('请输入提示词模板', 'error');
    return;
  }

  const config = {
    apiKey: apiKey || currentConfig.apiKey,
    model: model,
    prompt: prompt
  };

  chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', data: config }, (response) => {
    if (response && response.success) {
      currentConfig = config;
      showStatus('设置已保存', 'success');

      // 清空 API Key 输入框
      document.getElementById('api-key').value = '';
      document.getElementById('api-key').placeholder = '已配置 (点击修改)';

      // 2秒后关闭设置面板
      setTimeout(closeSettings, 1500);
    } else {
      showStatus('保存失败，请重试', 'error');
    }
  });
}

function showStatus(message, type) {
  const status = document.getElementById('save-status');
  status.textContent = message;
  status.className = `status-text ${type}`;

  setTimeout(() => {
    status.textContent = '';
    status.className = 'status-text';
  }, 3000);
}

async function loadVocabList() {
  chrome.runtime.sendMessage({ type: 'GET_VOCAB_LIST' }, (response) => {
    if (response && response.success) {
      allVocab = response.data || {};
      renderVocabList();
      updateCount();
    }
  });
}

function renderVocabList(filter = 'all', search = '') {
  const container = document.getElementById('vocab-list');
  let items = Object.values(allVocab);

  // 筛选掌握度
  if (filter !== 'all') {
    const mastery = parseInt(filter);
    items = items.filter(item => item.mastery === mastery);
  }

  // 搜索
  if (search) {
    const query = search.toLowerCase();
    items = items.filter(item =>
      item.word.toLowerCase().includes(query) ||
      (item.definition && item.definition.toLowerCase().includes(query))
    );
  }

  // 按保存时间排序（最新在前）
  items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${search ? '未找到匹配的单词' : '暂无生词'}</p>
        ${!search ? '<p class="hint">在网页中划选英文单词即可收藏</p>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="vocab-item" data-word="${item.word}">
      <div class="vocab-header">
        <span class="vocab-word">${escapeHtml(item.word)}</span>
        <div class="vocab-actions">
          <button class="speak-btn" title="朗读">🔊</button>
          <button class="delete-btn" title="删除">×</button>
        </div>
      </div>
      ${item.definition ? `<div class="vocab-definition">${escapeHtml(item.definition)}</div>` : ''}
      <div class="vocab-meta">
        <span class="mastery-badge mastery-${item.mastery || 0}">${getMasteryText(item.mastery)}</span>
        <span>${formatDate(item.savedAt)}</span>
      </div>
    </div>
  `).join('');

  // 绑定项目事件
  container.querySelectorAll('.vocab-item').forEach(el => {
    const word = el.dataset.word;

    el.querySelector('.speak-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      speakWord(word);
    });

    el.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteVocab(word);
    });

    // 点击切换掌握度
    el.addEventListener('click', () => cycleMastery(word));
  });
}

function handleSearch(e) {
  const search = e.target.value.trim();
  const activeFilter = document.querySelector('.tab.active').dataset.filter;
  renderVocabList(activeFilter, search);
}

function handleFilter(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const search = document.getElementById('search-input').value.trim();
  renderVocabList(tab.dataset.filter, search);
}

function getMasteryText(mastery) {
  const texts = ['未掌握', '熟悉', '已掌握'];
  return texts[mastery] || texts[0];
}

function cycleMastery(word) {
  const item = allVocab[word.toLowerCase()];
  if (!item) return;

  const newMastery = ((item.mastery || 0) + 1) % 3;

  chrome.runtime.sendMessage({
    type: 'UPDATE_VOCAB',
    data: { word, updates: { mastery: newMastery } }
  }, (response) => {
    if (response && response.success) {
      item.mastery = newMastery;
      const activeFilter = document.querySelector('.tab.active').dataset.filter;
      const search = document.getElementById('search-input').value.trim();
      renderVocabList(activeFilter, search);
    }
  });
}

function deleteVocab(word) {
  if (!confirm(`确定删除 "${word}"?`)) return;

  chrome.runtime.sendMessage({
    type: 'DELETE_VOCAB',
    data: word
  }, (response) => {
    if (response && response.success) {
      delete allVocab[word.toLowerCase()];
      renderVocabList();
      updateCount();
    }
  });
}

function speakWord(word) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    speechSynthesis.speak(utterance);
  }
}

function updateCount() {
  const count = Object.keys(allVocab).length;
  document.getElementById('vocab-count').textContent = `${count} 个单词`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

  return date.toLocaleDateString('zh-CN');
}

function exportVocab(format) {
  chrome.runtime.sendMessage({
    type: 'EXPORT_VOCAB',
    data: format
  }, async (response) => {
    if (response && response.success) {
      await exportToDir(response.data, response.filename, format);
    }
  });
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// IndexedDB 操作 - 存储目录句柄
const DB_NAME = 'vocab-hunter-db';
const DB_VERSION = 1;
const STORE_NAME = 'directory-handles';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function saveDirHandle(key, handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDirHandle(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteDirHandle(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 选择导出目录
async function selectExportDir(format) {
  try {
    if (!('showDirectoryPicker' in window)) {
      showStatus('您的浏览器不支持目录选择功能', 'error');
      return;
    }

    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const key = `export-dir-${format}`;
    await saveDirHandle(key, handle);

    // 更新显示
    const pathInput = document.getElementById(`${format}-dir-path`);
    pathInput.value = handle.name;
    pathInput.title = handle.name;
    showStatus(`${format.toUpperCase()} 导出目录已设置`, 'success');
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('选择目录失败:', e);
      showStatus('选择目录失败', 'error');
    }
  }
}

// 清除导出目录
async function clearExportDir(format) {
  try {
    const key = `export-dir-${format}`;
    await deleteDirHandle(key);

    const pathInput = document.getElementById(`${format}-dir-path`);
    pathInput.value = '';
    pathInput.title = '';
    showStatus(`${format.toUpperCase()} 导出目录已清除`, 'success');
  } catch (e) {
    console.error('清除目录失败:', e);
  }
}

// 加载已保存的目录路径
async function loadExportDirPaths() {
  for (const format of ['json', 'anki']) {
    try {
      const key = `export-dir-${format}`;
      const handle = await getDirHandle(key);
      if (handle) {
        const pathInput = document.getElementById(`${format}-dir-path`);
        pathInput.value = handle.name;
        pathInput.title = handle.name;
      }
    } catch (e) {
      console.error('加载目录路径失败:', e);
    }
  }
}

// 导出单词到指定目录
async function exportToDir(content, filename, format) {
  const key = `export-dir-${format}`;
  const handle = await getDirHandle(key);

  if (!handle) {
    // 没有配置目录，使用默认下载
    downloadFile(content, filename);
    return true;
  }

  try {
    // 检查权限
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      const request = await handle.requestPermission({ mode: 'readwrite' });
      if (request !== 'granted') {
        // 权限被拒绝，使用默认下载
        downloadFile(content, filename);
        return true;
      }
    }

    // 写入文件
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    showStatus(`已导出到 ${handle.name}/${filename}`, 'success');
    return true;
  } catch (e) {
    console.error('导出到目录失败:', e);
    // 失败时回退到默认下载
    downloadFile(content, filename);
    return true;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
