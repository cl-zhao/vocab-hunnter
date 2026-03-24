// Vocab Hunter - Service Worker
// 处理 API 请求中转和消息路由

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// 默认配置
const DEFAULT_CONFIG = {
  model: 'anthropic/claude-3.5-haiku',
  prompt: `你是一个英语学习助手。用户在阅读时遇到了不理解的单词/词组，请给出清晰的解释。

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
}`
};

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOOKUP_WORD') {
    handleLookupWord(message.data).then(sendResponse);
    return true; // 异步响应
  }

  if (message.type === 'SAVE_VOCAB') {
    handleSaveVocab(message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_VOCAB_LIST') {
    handleGetVocabList().then(sendResponse);
    return true;
  }

  if (message.type === 'UPDATE_VOCAB') {
    handleUpdateVocab(message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'DELETE_VOCAB') {
    handleDeleteVocab(message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'EXPORT_VOCAB') {
    handleExportVocab(message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'IMPORT_VOCAB') {
    handleImportVocab(message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_CONFIG') {
    handleGetConfig().then(sendResponse);
    return true;
  }

  if (message.type === 'SAVE_CONFIG') {
    handleSaveConfig(message.data).then(sendResponse);
    return true;
  }
});

// 查询单词释义
async function handleLookupWord({ word, context }) {
  // 先查缓存
  const cacheKey = `cache_${word.toLowerCase()}`;
  const cached = await storageGet(cacheKey);
  if (cached) {
    return { success: true, data: cached, fromCache: true };
  }

  // 获取配置
  const config = await getConfig();
  const apiKey = config.apiKey;

  if (!apiKey) {
    return { success: false, error: 'NO_API_KEY', message: '请先在设置中配置 API Key' };
  }

  // 调用 OpenRouter API
  try {
    const prompt = buildPrompt(word, context, config.prompt);

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://vocab-hunter.local',
        'X-Title': 'Vocab Hunter'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: 'API_ERROR', message: error.error?.message || 'API 请求失败' };
    }

    const data = await response.json();
    const result = parseAIResponse(data.choices[0].message.content, word);

    // 缓存结果
    await storageSet(cacheKey, { ...result, cachedAt: Date.now() });

    return { success: true, data: result, fromCache: false };
  } catch (e) {
    return { success: false, error: 'NETWORK_ERROR', message: e.message };
  }
}

// 获取配置
async function getConfig() {
  const savedConfig = await storageGet('config');
  return {
    apiKey: savedConfig?.apiKey || '',
    model: savedConfig?.model || DEFAULT_CONFIG.model,
    prompt: savedConfig?.prompt || DEFAULT_CONFIG.prompt
  };
}

// 保存配置
async function handleSaveConfig(config) {
  await storageSet('config', config);
  return { success: true };
}

// 获取配置（供 popup 调用）
async function handleGetConfig() {
  const config = await getConfig();
  return { success: true, data: config };
}

// 构建 AI Prompt
function buildPrompt(word, context, promptTemplate) {
  return promptTemplate
    .replace(/\{\{word\}\}/g, word)
    .replace(/\{\{context\}\}/g, context || '无');
}

// 解析 AI 响应
function parseAIResponse(text, originalWord) {
  try {
    // 尝试提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // 解析失败，返回基础结构
  }

  return {
    word: originalWord,
    definition: text.slice(0, 200),
    examples: [],
    synonyms: []
  };
}

// 保存生词
async function handleSaveVocab(vocabItem) {
  const vocab = (await storageGet('vocab')) || {};
  const key = vocabItem.word.toLowerCase();

  vocab[key] = {
    ...vocabItem,
    savedAt: Date.now(),
    mastery: 0 // 0=未掌握, 1=熟悉, 2=掌握
  };

  await storageSet('vocab', vocab);
  return { success: true };
}

// 获取生词列表
async function handleGetVocabList() {
  const vocab = (await storageGet('vocab')) || {};
  return { success: true, data: vocab };
}

// 更新生词（如掌握度）
async function handleUpdateVocab({ word, updates }) {
  const vocab = (await storageGet('vocab')) || {};
  const key = word.toLowerCase();

  if (vocab[key]) {
    vocab[key] = { ...vocab[key], ...updates };
    await storageSet('vocab', vocab);
    return { success: true };
  }

  return { success: false, error: 'NOT_FOUND' };
}

// 删除生词
async function handleDeleteVocab(word) {
  const vocab = (await storageGet('vocab')) || {};
  const key = word.toLowerCase();

  if (vocab[key]) {
    delete vocab[key];
    await storageSet('vocab', vocab);
    return { success: true };
  }

  return { success: false, error: 'NOT_FOUND' };
}

// 导出生词
async function handleExportVocab(format) {
  const vocab = (await storageGet('vocab')) || {};
  const items = Object.values(vocab);

  if (format === 'json') {
    return { success: true, data: JSON.stringify(items, null, 2), filename: 'vocab.json' };
  }

  if (format === 'anki') {
    // Anki 导入格式: front\tback
    const lines = items.map(item =>
      `${item.word}\t${item.definition || ''}\t${(item.examples || []).join('<br>')}`
    );
    return { success: true, data: lines.join('\n'), filename: 'vocab.txt' };
  }

  return { success: false, error: 'UNKNOWN_FORMAT' };
}

// 导入生词
async function handleImportVocab(items) {
  const vocab = (await storageGet('vocab')) || {};
  let imported = 0;

  for (const item of items) {
    if (!item.word) continue;
    const key = item.word.toLowerCase();

    // 只导入不存在的单词，或者覆盖已存在的
    vocab[key] = {
      ...item,
      word: item.word,
      savedAt: item.savedAt || Date.now(),
      mastery: 0 // 导入的单词默认为未掌握
    };
    imported++;
  }

  await storageSet('vocab', vocab);
  return { success: true, imported };
}

// 存储 helper
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

console.log('Vocab Hunter Service Worker loaded');
