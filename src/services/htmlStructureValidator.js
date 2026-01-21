function parseHtml(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html || '', 'text/html');
}

function removeNonContent(doc) {
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
}

const TAGS_TO_COUNT = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'blockquote',
  'pre',
  'code',
  'img',
  'a',
];

const BLOCK_SELECTOR =
  'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,pre,code';

const INLINE_TAGS = new Set([
  'A',
  'IMG',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'SPAN',
  'BR',
  'SUP',
  'SUB',
  'CODE',
  'KBD',
  'SMALL',
  'MARK',
  'DEL',
  'INS',
]);

function bodyElementSequence(doc) {
  const out = [];
  const children = Array.from(doc.body?.children || []);
  children.forEach((el) => out.push(el.tagName.toLowerCase()));
  return out;
}

function inlineSignature(el) {
  // 收集 block 内部的“内联结构”签名：只记录内联 tag 的先序遍历序列 + 关键属性（a[href], img[src]）
  const parts = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, null);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!INLINE_TAGS.has(n.tagName)) continue;
    if (n.tagName === 'A') {
      parts.push(`a(${(n.getAttribute('href') || '').trim()})`);
    } else if (n.tagName === 'IMG') {
      parts.push(`img(${(n.getAttribute('src') || '').trim()})`);
    } else {
      parts.push(n.tagName.toLowerCase());
    }
  }
  return parts.join('|');
}

function blockSignatures(doc) {
  const els = Array.from(doc.body?.querySelectorAll(BLOCK_SELECTOR) || []);
  return els.map((el) => ({
    tag: el.tagName.toLowerCase(),
    inline: inlineSignature(el),
  }));
}

function listShapes(doc) {
  const lists = Array.from(doc.body?.querySelectorAll('ul,ol') || []);
  return lists.map((list) => {
    const lis = Array.from(list.querySelectorAll(':scope > li'));
    const nestedCounts = lis.map((li) => li.querySelectorAll(':scope > ul,:scope > ol').length);
    return `${list.tagName.toLowerCase()}:${lis.length}:[${nestedCounts.join(',')}]`;
  });
}

function tableShapes(doc) {
  const tables = Array.from(doc.body?.querySelectorAll('table') || []);
  return tables.map((t) => {
    const rows = Array.from(t.querySelectorAll('tr'));
    const rowCounts = rows.map((r) => r.querySelectorAll('th,td').length);
    const maxCols = rowCounts.length ? Math.max(...rowCounts) : 0;
    return `table:r${rows.length}:c${maxCols}`;
  });
}

function totalTextLength(doc) {
  const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length;
}

function markdownLeakCount(html) {
  // 粗略检查：模型不应输出 markdown 标记
  const s = String(html || '');
  let c = 0;
  if (s.includes('**')) c++;
  if (s.includes('__')) c++;
  if (s.includes('```')) c++;
  return c;
}

function fingerprintHtml(html) {
  const doc = parseHtml(html);
  removeNonContent(doc);

  const counts = {};
  TAGS_TO_COUNT.forEach((t) => (counts[t] = 0));

  TAGS_TO_COUNT.forEach((tag) => {
    counts[tag] = doc.body?.querySelectorAll(tag).length || 0;
  });

  // 目录/可点击依赖的关键元素序列：img/src 与 a/href 不应变化
  const imgSrc = Array.from(doc.body?.querySelectorAll('img') || []).map((el) => el.getAttribute('src') || '');
  const linkHref = Array.from(doc.body?.querySelectorAll('a') || []).map((el) => el.getAttribute('href') || '');

  // list 结构：每个 ul/ol 的 li 数量序列
  const listItemCounts = Array.from(doc.body?.querySelectorAll('ul,ol') || []).map(
    (el) => el.querySelectorAll(':scope > li').length
  );

  // heading presence: if original has any heading, translated should too
  const hasHeading = (doc.body?.querySelectorAll('h1,h2,h3,h4,h5,h6').length || 0) > 0;

  return {
    counts,
    imgSrc,
    linkHref,
    listItemCounts,
    hasHeading,
    bodySeq: bodyElementSequence(doc),
    blocks: blockSignatures(doc),
    listShapes: listShapes(doc),
    tableShapes: tableShapes(doc),
    textLen: totalTextLength(doc),
  };
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function validateHtmlStructure(originalHtml, translatedHtml) {
  const o = fingerprintHtml(originalHtml);
  const t = fingerprintHtml(translatedHtml);

  const issues = [];

  // 1) counts must match for structural tags
  for (const tag of TAGS_TO_COUNT) {
    if (o.counts[tag] !== t.counts[tag]) {
      issues.push(`tag <${tag}> count changed: ${o.counts[tag]} -> ${t.counts[tag]}`);
    }
  }

  // 2) imgs/links should keep href/src sequence
  if (!arraysEqual(o.imgSrc, t.imgSrc)) issues.push('img src sequence changed');
  if (!arraysEqual(o.linkHref, t.linkHref)) issues.push('a href sequence changed');

  // 3) list top-level li distribution should keep
  if (!arraysEqual(o.listItemCounts, t.listItemCounts)) issues.push('list item distribution changed');

  // 4) headings should not disappear
  if (o.hasHeading && !t.hasHeading) issues.push('headings disappeared');

  // 5) body element top-level sequence should keep (prevents major reflow like list->p)
  if (!arraysEqual(o.bodySeq, t.bodySeq)) issues.push('body top-level element sequence changed');

  // 6) block signatures count & per-block inline structure must match
  if (o.blocks.length !== t.blocks.length) {
    issues.push(`block count changed: ${o.blocks.length} -> ${t.blocks.length}`);
  } else {
    for (let i = 0; i < o.blocks.length; i++) {
      if (o.blocks[i].tag !== t.blocks[i].tag) {
        issues.push(`block[${i}] tag changed: ${o.blocks[i].tag} -> ${t.blocks[i].tag}`);
        break;
      }
      if (o.blocks[i].inline !== t.blocks[i].inline) {
        issues.push(`block[${i}] inline structure changed`);
        break;
      }
    }
  }

  // 7) list/table shape must keep
  if (!arraysEqual(o.listShapes, t.listShapes)) issues.push('list shapes changed');
  if (!arraysEqual(o.tableShapes, t.tableShapes)) issues.push('table shapes changed');

  // 8) translated text should not collapse too much
  if (o.textLen > 200 && t.textLen < Math.floor(o.textLen * 0.5)) {
    issues.push(`text length collapsed: ${o.textLen} -> ${t.textLen}`);
  }

  // 9) basic markdown leak check
  if (markdownLeakCount(translatedHtml) > 0) issues.push('markdown markers detected in html');

  return { ok: issues.length === 0, issues };
}

