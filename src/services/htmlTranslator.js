import { MODEL_PROVIDERS } from './modelProviders';
import { validateHtmlStructure } from './htmlStructureValidator';

function stripHtmlToText(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');
    return (doc.body?.textContent || '').trim();
  } catch {
    return '';
  }
}

function collectTranslatableTextNodes(doc) {
  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'MATH', 'CODE', 'PRE']);
  const nodes = [];

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentNode;
      if (!parent || skipTags.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue || '';
      if (!text.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  return nodes;
}

function cleanModelText(s) {
  // 防止模型输出 Markdown 标记影响阅读（** __ ` 等）
  // 这里做“保守删除”：只要出现这些符号，就移除符号本身，保留文字。
  return String(s || '')
    .replace(/[`]/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\u0000/g, '');
}

async function callProvider(provider, apiKey, prompt) {
  const cfg = MODEL_PROVIDERS[provider];
  if (!cfg) throw new Error(`不支持的模型提供商: ${provider}`);
  if (!apiKey) throw new Error('请先配置 API Key');

  // OpenAI-compatible: deepseek/openai/kimi
  if (provider === 'deepseek' || provider === 'openai' || provider === 'kimi') {
    const resp = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          {
            role: 'system',
            content:
              '你是专业翻译引擎。严格遵守格式要求；不要输出 Markdown（例如 **bold** / __bold__ / `code`）。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `API 请求失败: ${resp.status}`);
    }
    const json = await resp.json();
    return json.choices?.[0]?.message?.content?.trim() || '';
  }

  if (provider === 'claude') {
    const resp = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': cfg.headers?.['anthropic-version'] || '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API 请求失败: ${resp.status}`);
    }
    const json = await resp.json();
    return json.content?.[0]?.text?.trim() || '';
  }

  if (provider === 'gemini') {
    const url = `${cfg.apiUrl}?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API 请求失败: ${resp.status}`);
    }
    const json = await resp.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  throw new Error(`未实现的模型提供商: ${provider}`);
}

async function translateSegmentsAsJsonArray({
  provider,
  apiKey,
  segments,
  sourceLang,
  targetLang,
  glossary,
  previousContext,
}) {
  const glossaryLines =
    glossary && Object.keys(glossary).length
      ? Object.entries(glossary)
          .map(([s, t]) => `- "${s}" 必须翻译为 "${t}"`)
          .join('\n')
      : '';

  const prompt = `你要把一段 HTML 文本里的“纯文本片段”逐条翻译。\n\n要求：\n- 源语言: ${sourceLang}\n- 目标语言: ${targetLang}\n- 不要输出 Markdown（不要使用 **、__、*、\` 等格式符号）\n- 不要添加解释，只返回 JSON\n${glossaryLines ? `\n术语表（必须遵守）：\n${glossaryLines}\n` : ''}\n${
    previousContext
      ? `\n前文摘要（保持一致性）：\n${previousContext}\n`
      : ''
  }\n输入是 JSON 数组，每个元素是一个独立片段。请输出“同长度”的 JSON 数组，逐项对应翻译。\n\n输入：\n${JSON.stringify(segments)}\n\n输出：`;

  const out = await callProvider(provider, apiKey, prompt);

  // 尝试解析 JSON 数组
  try {
    const m = out.match(/\[[\s\S]*\]/);
    const jsonStr = m ? m[0] : out;
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr) && arr.length === segments.length) return arr.map((s) => String(s));
  } catch {
    // fallthrough
  }

  // fallback：按行拆（不完美，但避免完全失败）
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === segments.length) return lines;

  throw new Error('无法解析模型返回的分段翻译结果（JSON 解析失败）');
}

export async function translateHtmlPreserveMarkup({
  html,
  sourceLang,
  targetLang,
  apiKey,
  modelProvider,
  glossary = {},
  previousContext = '',
}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');

  // 移除 script/style（避免预览/渲染风险）
  doc.querySelectorAll('script, style').forEach((el) => el.remove());

  // 结构指纹（用于校验“列表变段落/标题缺失/链接不可点”等）
  const originalFingerprintHtml = doc.body?.innerHTML || html || '';

  const textNodes = collectTranslatableTextNodes(doc);
  if (textNodes.length === 0) {
    return { translatedHtml: html || '', translatedText: stripHtmlToText(html || '') };
  }

  // 分批，避免一次 prompt 太大
  const BATCH_SIZE = 24;
  let ctx = previousContext;

  for (let i = 0; i < textNodes.length; i += BATCH_SIZE) {
    const batchNodes = textNodes.slice(i, i + BATCH_SIZE);
    const segments = batchNodes.map((n) => n.nodeValue);

    const translated = await translateSegmentsAsJsonArray({
      provider: modelProvider,
      apiKey,
      segments,
      sourceLang,
      targetLang,
      glossary,
      previousContext: ctx,
    });

    translated.forEach((t, idx) => {
      batchNodes[idx].nodeValue = cleanModelText(t);
    });

    // 更新上下文（取最近一段文本）
    const last = translated[translated.length - 1] || '';
    ctx = String(last).slice(0, 200);
  }

  const translatedHtml = doc.body?.innerHTML || html || '';
  const translatedText = stripHtmlToText(translatedHtml);

  // ✅ 最终结构校验：如果结构异常，直接回退到“原结构”（避免导出 EPUB 排版被破坏）
  const check = validateHtmlStructure(originalFingerprintHtml, translatedHtml);
  if (!check.ok) {
    console.warn('HTML 结构校验失败，已回退到原结构以保证 EPUB 标准与排版:', check.issues);
    return {
      translatedHtml: originalFingerprintHtml,
      translatedText: stripHtmlToText(originalFingerprintHtml),
      validationIssues: check.issues,
    };
  }

  return { translatedHtml, translatedText };
}

