// Vocab Hunter - Content Script
(function() {
  'use strict';

  let debounceTimer = null;
  let currentCard = null;
  let currentShadow = null;
  let currentWord = null;
  let currentData = null;

  init();

  // 检测扩展上下文是否有效
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function init() {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleOutsideClick);
  }

  function handleMouseUp(e) {
    if (currentCard && currentCard.contains(e.target)) return;
    // 检查扩展上下文是否有效
    if (!isExtensionContextValid()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => processSelection(), 150);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && currentCard) closeCard();
    if (e.key === 's' && currentWord && currentCard) saveCurrentWord();
  }

  function handleOutsideClick(e) {
    if (!currentCard) return;
    // Use composedPath to check if click is inside shadow DOM
    const path = e.composedPath();
    // Check if the click path contains the card host element
    if (path.includes(currentCard)) return;
    closeCard();
  }

  function processSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text || !isValidWord(text)) return;
    const context = getContext(selection);
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    showCard(text, context, rect);
  }

  function isValidWord(text) {
    const pattern = /^[a-zA-Z]+(?:[-'\x27][a-zA-Z]+)*(?:\s+[a-zA-Z]+(?:[-'\x27][a-zA-Z]+)*){0,2}$/;
    return pattern.test(text) && text.length <= 50;
  }

  function getContext(selection) {
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const fullText = container.nodeType === Node.TEXT_NODE ? container.textContent : container.innerText || '';
      const startOffset = Math.max(0, range.startOffset - 100);
      const endOffset = Math.min(fullText.length, range.endOffset + 100);
      return fullText.slice(startOffset, endOffset);
    } catch (e) { return ''; }
  }

  function showCard(word, context, rect) {
    currentWord = word;
    currentData = null;
    closeCard();

    const host = document.createElement('div');
    host.id = 'vocab-hunter-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = getCardStyles();
    shadow.appendChild(style);

    const card = document.createElement('div');
    card.className = 'vocab-card loading';
    card.innerHTML = getLoadingHTML(word);
    shadow.appendChild(card);

    positionCard(card, rect);
    card.querySelector('.close-btn').addEventListener('click', closeCard);
    currentCard = host;
    currentShadow = shadow;
    lookupWord(word, context, card);
  }

  function getCardStyles() {
    return ':host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.vocab-card{position:fixed;z-index:2147483647;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);padding:16px;min-width:280px;max-width:360px;font-size:14px;line-height:1.5;color:#1a1a1a;animation:fadeIn .15s ease-out}@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}.vocab-card.loading .content{opacity:.5}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.word-info{flex:1}.word{font-size:18px;font-weight:600;color:#1a1a1a}.phonetic{font-size:13px;color:#666;margin-left:8px}.part-of-speech{font-size:12px;color:#888;margin-top:2px}.close-btn{background:none;border:none;font-size:18px;color:#999;cursor:pointer;padding:0 4px}.close-btn:hover{color:#333}.definition{font-size:15px;color:#333;margin-bottom:12px;padding-left:12px;border-left:3px solid #6366f1}.examples{margin-bottom:12px}.examples-title,.synonyms-title{font-size:12px;color:#888;margin-bottom:6px}.example{font-size:13px;color:#555;font-style:italic;margin-bottom:4px;padding-left:12px}.synonyms{margin-bottom:12px}.synonym-tag{display:inline-block;background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;color:#555;margin-right:6px;margin-bottom:4px}.memory-tip{font-size:13px;color:#666;background:#fefce8;padding:8px 10px;border-radius:6px;margin-bottom:12px}.actions{display:flex;gap:8px;padding-top:12px;border-top:1px solid #eee}.btn{flex:1;padding:8px 16px;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer}.btn-primary{background:#6366f1;color:#fff}.btn-primary:hover{background:#4f46e5}.btn-primary:disabled{background:#a5b4fc;cursor:not-allowed}.btn-secondary{background:#f0f0f0;color:#333}.btn-secondary:hover{background:#e0e0e0}.error{color:#dc2626;padding:12px;text-align:center}.loading-skeleton{background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;height:16px;margin-bottom:8px}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}.cache-badge{font-size:10px;color:#10b981;margin-left:8px}';
  }

  function getLoadingHTML(word) {
    return '<div class="header"><div class="word-info"><span class="word">' + escapeHtml(word) + '</span></div><button class="close-btn">&times;</button></div><div class="content"><div class="loading-skeleton"></div><div class="loading-skeleton" style="width:80%"></div><div class="loading-skeleton" style="width:60%"></div></div>';
  }

  function positionCard(card, rect) {
    const cardRect = card.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;
    if (left + cardRect.width > window.innerWidth) left = window.innerWidth - cardRect.width - 16;
    if (top + cardRect.height > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - cardRect.height - 8;
    card.style.top = Math.max(8, top) + 'px';
    card.style.left = Math.max(8, left) + 'px';
  }

  function lookupWord(word, context, card) {
    if (!isExtensionContextValid()) {
      showError(card, '插件已更新，请刷新页面');
      return;
    }
    chrome.runtime.sendMessage({ type: 'LOOKUP_WORD', data: { word: word, context: context } }, function(response) {
      if (chrome.runtime.lastError) {
        showError(card, '连接失败，请刷新页面');
        return;
      }
      card.classList.remove('loading');
      if (!response) { showError(card, 'Connection failed'); return; }
      if (!response.success) { showError(card, response.message || 'Query failed'); return; }
      renderResult(card, response.data, response.fromCache);
    });
  }

  function renderResult(card, data, fromCache) {
    currentData = data;
    const content = card.querySelector('.content');
    const headerInfo = card.querySelector('.word-info');

    let headerHTML = '<span class="word">' + escapeHtml(data.word || currentWord) + '</span>';
    if (data.phonetic) headerHTML += '<span class="phonetic">' + escapeHtml(data.phonetic) + '</span>';
    if (fromCache) headerHTML += '<span class="cache-badge">Cached</span>';
    if (data.partOfSpeech) headerHTML += '<div class="part-of-speech">' + escapeHtml(data.partOfSpeech) + '</div>';
    headerInfo.innerHTML = headerHTML;

    let html = '';
    if (data.definition) html += '<div class="definition">' + escapeHtml(data.definition) + '</div>';
    if (data.examples && data.examples.length) {
      html += '<div class="examples"><div class="examples-title">Examples</div>';
      for (let i = 0; i < data.examples.length; i++) {
        html += '<div class="example">' + escapeHtml(data.examples[i]) + '</div>';
      }
      html += '</div>';
    }
    if (data.synonyms && data.synonyms.length) {
      html += '<div class="synonyms"><div class="synonyms-title">Synonyms</div>';
      for (let i = 0; i < data.synonyms.length; i++) {
        html += '<span class="synonym-tag">' + escapeHtml(data.synonyms[i]) + '</span>';
      }
      html += '</div>';
    }
    if (data.memoryTip) html += '<div class="memory-tip">' + escapeHtml(data.memoryTip) + '</div>';
    html += '<div class="actions"><button class="btn btn-primary" id="save-btn">Save</button><button class="btn btn-secondary" id="speak-btn">Speak</button></div>';
    content.innerHTML = html;

    content.querySelector('#save-btn').addEventListener('click', saveCurrentWord);
    content.querySelector('#speak-btn').addEventListener('click', function() { speakWord(currentWord); });
  }

  function showError(card, message) {
    card.querySelector('.content').innerHTML = '<div class="error">' + escapeHtml(message) + '</div>';
  }

  function saveCurrentWord() {
    if (!currentWord || !currentShadow) return;
    if (!isExtensionContextValid()) {
      let saveBtn = currentShadow.querySelector('#save-btn');
      if (saveBtn) { saveBtn.textContent = '请刷新页面'; }
      return;
    }
    let saveBtn = currentShadow.querySelector('#save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    const saveData = { word: currentWord, context: '', savedAt: Date.now() };
    if (currentData) Object.assign(saveData, currentData);

    chrome.runtime.sendMessage({ type: 'SAVE_VOCAB', data: saveData }, function(response) {
      if (chrome.runtime.lastError) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '请刷新页面'; }
        return;
      }
      if (response && response.success) {
        if (saveBtn) saveBtn.textContent = 'Saved';
      } else {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Retry'; }
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

  function closeCard() {
    if (currentCard) { currentCard.remove(); currentCard = null; currentShadow = null; currentWord = null; currentData = null; }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
