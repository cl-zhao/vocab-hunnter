// Vocab Hunter - Anki Export Library
// 生成 Anki 可导入的文件格式

/**
 * 生成 Anki 制表符分隔的 TXT 内容
 * @param {Array} vocabList - 生词列表
 * @returns {string} - TXT 内容
 */
export function generateAnkiTxt(vocabList) {
  return vocabList.map(item => {
    const front = [
      item.word,
      item.phonetic || '',
      item.pos || ''
    ].filter(Boolean).join(' ');

    const back = [
      item.definition || '',
      item.contextNote ? `<div style="color:#666;margin-top:8px;">💡 ${item.contextNote}</div>` : '',
      item.sentence ? `<div style="color:#888;margin-top:8px;font-style:italic;">"${item.sentence}"</div>` : '',
      item.sourceUrl ? `<div style="color:#aaa;margin-top:8px;font-size:12px;">来源: ${extractDomain(item.sourceUrl)}</div>` : ''
    ].filter(Boolean).join('');

    return `${front}\t${back}`;
  }).join('\n');
}

/**
 * 生成 CSV 格式（兼容更多软件）
 * @param {Array} vocabList - 生词列表
 * @returns {string} - CSV 内容
 */
export function generateCSV(vocabList) {
  const headers = ['单词', '音标', '词性', '释义', '上下文解释', '原句', '来源', '收藏时间', '掌握度'];
  const masteryLabels = ['陌生', '复习中', '已掌握'];

  const rows = vocabList.map(item => [
    item.word,
    item.phonetic || '',
    item.pos || '',
    item.definition || '',
    item.contextNote || '',
    item.sentence || '',
    item.sourceUrl || '',
    item.savedAt ? new Date(item.savedAt).toLocaleDateString('zh-CN') : '',
    masteryLabels[item.mastery] || '陌生'
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}

/**
 * 触发文件下载
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function extractDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
