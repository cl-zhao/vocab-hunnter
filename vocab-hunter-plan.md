# Vocab Hunter 插件实施计划

## 插件整体定位

**名称**：Vocab Hunter  
**核心体验**：阅读时划词 → 悬浮卡片即显 AI 释义（含上下文） → 一键收藏 → Popup 管理生词本 → 导出 Anki/JSON

---

## 文件结构

```
vocab-hunter/
├── manifest.json
├── background/
│   └── service-worker.js       # 转发 API 请求、管理存储事件
├── content/
│   ├── content.js              # 监听划词、注入浮层、调用 background
│   └── content.css             # 悬浮卡片样式，隔离页面样式污染
├── popup/
│   ├── popup.html              # 生词本管理界面
│   ├── popup.js                # 列表渲染、搜索过滤、导出逻辑
│   └── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/
    └── anki-export.js          # Anki .apkg 生成工具
```

---

## 各模块实施细节

### 1. manifest.json

使用 Manifest V3，关键配置：

```json
permissions: ["storage", "activeTab", "scripting"]
host_permissions: ["https://api.anthropic.com/*"]
```

API Key 存在 `chrome.storage.local`，不硬编码进代码。首次使用时 Popup 引导用户填入。

---

### 2. Content Script — 核心交互层

#### 划词触发逻辑

- 监听 `mouseup` 事件
- 检测 `window.getSelection()` 是否为 1-3 个英文单词（正则过滤，避免误触）
- 获取选区的 `getBoundingClientRect()` 定位浮层位置
- 同时抓取选中词前后各 100 字符作为「上下文」一并传给 AI

#### 悬浮卡片（Floating Card）

浮层注入 Shadow DOM（`element.attachShadow({mode: 'closed'})`），原因是隔离目标页面的 CSS，防止卡片样式被污染或污染页面。

卡片包含：

- 单词 + 音标（AI 返回）
- 词性 + 中文释义
- 基于上下文的一句话解释（AI 的核心价值点）
- 「收藏」按钮 + 「关闭」按钮
- 状态：loading skeleton → 内容渐显

#### 交互细节

- 点击页面其他区域自动关闭浮层
- 同一单词重复划选时，直接读 `storage` 缓存，不重复请求 API
- 收藏后按钮变为「已收藏 ✓」，再点可取消

---

### 3. Service Worker — API 中转与存储

#### 为什么要在 Service Worker 里调 API 而不是 Content Script 直接调？

Content Script 运行在目标页面的域名下，直接请求 `api.anthropic.com` 会触发 CORS。Service Worker 不受此限制，且更安全（API Key 不暴露在页面 JS 上下文中）。

#### AI 请求设计

System Prompt 设计要点：

```
你是一个英语学习助手。用户会给你一个英文单词和它的上下文句子。
请返回：音标、词性、简洁中文释义（≤15字）、
结合上下文的一句话理解（中文，说明这个词在此处的具体含义）。
返回 JSON 格式，不要多余内容。
```

返回结构：

```json
{
  "word": "ephemeral",
  "phonetic": "/ɪˈfem.ər.əl/",
  "pos": "adj.",
  "definition": "短暂的，转瞬即逝的",
  "contextNote": "此处指这段友谊虽美好但注定不会长久"
}
```

#### 存储结构（`chrome.storage.local`）

```json
{
  "vocab": [
    {
      "id": "uuid",
      "word": "ephemeral",
      "phonetic": "/ɪˈfem.ər.əl/",
      "pos": "adj.",
      "definition": "短暂的，转瞬即逝的",
      "contextNote": "此处指...",
      "sentence": "原句全文",
      "sourceUrl": "https://...",
      "sourceTitle": "页面标题",
      "savedAt": 1748000000000,
      "mastery": 0
    }
  ],
  "apiKey": "sk-ant-...",
  "cache": {
    "ephemeral": { "...释义数据": true, "cachedAt": "timestamp" }
  }
}
```

`mastery` 字段说明：

| 值 | 含义 |
|---|---|
| 0 | 陌生 |
| 1 | 复习中 |
| 2 | 已掌握 |

---

### 4. Popup — 生词本管理界面

#### 页面布局（三个 Tab）

**单词本 Tab**

- 搜索框（实时过滤）
- 筛选条：全部 / 陌生 / 复习中 / 已掌握
- 列表卡片：单词 + 释义摘要 + 来源网站 favicon + 掌握度切换
- 点击展开：显示原句、上下文解释、来源链接

**导出 Tab**

- 导出 Anki（`.txt` 制表符格式，Anki 可直接导入）
- 导出 JSON（完整数据）
- 可选：只导出「陌生」和「复习中」的词
- 显示统计：共 N 词 / 已掌握 N 词

**设置 Tab**

- API Key 输入框（`type="password"`）
- 开关：是否在所有网站启用 / 黑名单域名
- 清除缓存按钮

---

### 5. Anki 导出实现

Anki 的 `.apkg` 格式本质是一个 SQLite 数据库打包成 zip。在纯前端实现有两个选择：

#### 方案 A（推荐首期实现）

导出为 Anki 可直接导入的 `txt` 格式（制表符分隔），在 Anki 里「文件 → 导入」即可，无需操作 SQLite。

卡片格式示例：

```
正面                                    背面
ephemeral /ɪˈfem.ər.əl/ adj.    短暂的，转瞬即逝的
                                        [上下文] 此处指这段友谊虽美好但注定不会长久
                                        [例句] The beauty of cherry blossoms is ephemeral.
                                        [来源] nytimes.com
```

#### 方案 B（后期升级）

引入 `sql.js`（WebAssembly 版 SQLite）生成真正的 `.apkg` 包，体验更好但包体增加约 800KB。建议先做方案 A 跑通主流程，有需要再升级 B。

---

## 开发顺序

按以下顺序开发，每步都能独立测试：

| 阶段 | 任务 | 验收标准 |
|---|---|---|
| 1 | 搭骨架 | `manifest.json` + 目录结构，Chrome 能加载不报错 |
| 2 | 划词 + 浮层 | Content Script 用 mock 数据显示卡片，Shadow DOM 和定位逻辑正常 |
| 3 | API 接入 | Service Worker 接通 Anthropic，浮层显示真实 AI 释义 |
| 4 | 存储 + 收藏 | 点击收藏写入 storage，数据结构正确 |
| 5 | Popup 列表 | 读取 storage 渲染生词本，掌握度可切换 |
| 6 | 导出 | Anki txt + JSON 导出，浏览器 download 正常 |
| 7 | 细节打磨 | 缓存逻辑、错误处理、API Key 设置、样式完善 |

---

## 注意事项与已知坑

### API Key 安全

存在 `chrome.storage.local`，**不要存 `localStorage`**（页面 JS 能读到）。Service Worker 读取后用完即弃，不缓存在变量里。

### Shadow DOM 与 z-index

浮层用 Shadow DOM 但还是要设足够高的 `z-index`（如 `9999999`），部分网站（如 Medium）有全局层叠上下文会压住浮层。

### MV3 Service Worker 生命周期

MV3 的 Service Worker 会被随时终止，**不能用全局变量存状态**，所有状态都要走 `chrome.storage`。

### Content Script 注入时机

默认 `document_idle`，在大多数页面够用。对于 SPA（React/Vue 应用），可能需要监听 `MutationObserver` 重新绑定事件。

### CORS 处理

所有对 `api.anthropic.com` 的请求必须经由 Service Worker 发出，Content Script 直接请求会被浏览器拦截。

---

## 后续可扩展方向

- **朗读发音**：调用浏览器内置 `speechSynthesis` API，点击音标即播放
- **智能例句**：让 AI 额外生成一个贴近用户阅读场景的例句
- **复习模式**：Popup 内置简易闪卡，随机抽取「陌生」词做听写/选择
- **同步备份**：接入 Google Drive API，生词本跨设备同步
- **生词高亮**：在网页上自动高亮已收藏的生词，悬停显示释义
