/**
 * EPUB 重建器
 * 将翻译后的章节重新打包成 EPUB 文件
 */

import JSZip from 'jszip';

function dirname(path = '') {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx + 1) : '';
}

function joinPath(base = '', rel = '') {
  if (!base) return rel;
  if (!rel) return base;
  if (rel.startsWith('/')) rel = rel.slice(1);
  return base + rel;
}

function parseXml(xmlStr) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlStr, 'application/xml');
}

function xmlToString(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function getContainerOpfPath(containerXml) {
  const m = containerXml.match(/full-path="([^"]+)"/i);
  return m ? m[1] : null;
}

function replaceBodyInner(xhtml, newBodyInner) {
  if (!xhtml) return xhtml;
  const bodyMatch = xhtml.match(/<body\b[^>]*>[\s\S]*?<\/body>/i);
  if (!bodyMatch) return xhtml;
  const openTagMatch = bodyMatch[0].match(/<body\b[^>]*>/i);
  const openTag = openTagMatch ? openTagMatch[0] : '<body>';
  const replacement = `${openTag}\n${newBodyInner}\n</body>`;
  return xhtml.replace(bodyMatch[0], replacement);
}

function safeId(id) {
  return String(id || '')
    .replace(/[^a-zA-Z0-9_\-:.]/g, '_')
    .slice(0, 80);
}

function normalizeBodyHtml(content) {
  if (!content) return '';
  // 如果传进来的是完整 HTML 文档，抽取 body 内容，避免导出时出现嵌套 html 导致排版/标题异常
  if (typeof content === 'string' && /<html[\s>]/i.test(content)) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      return doc.body?.innerHTML || content;
    } catch {
      return content;
    }
  }
  return content;
}

/**
 * 创建 EPUB 文件结构
 * @param {object} metadata - 元数据
 * @param {Array} chapters - 章节数组
 * @param {string} mode - 输出模式 ('single' | 'bilingual')
 * @param {Array} resources - 资源文件数组（图片、CSS、字体等）
 * @returns {Promise<Blob>} EPUB 文件 Blob
 */
export async function buildEpub(metadata, chapters, mode = 'single', resources = []) {
  // ✅ 优先：基于“原始 EPUB”打补丁导出（保留原书 OPF/nav/NCX/CSS/排版/目录）
  // 这样能最大程度保证标准兼容与美观。
  const originalEpubFile = metadata?.__originalEpubFile;
  if (originalEpubFile) {
    return await buildEpubByPatchingOriginal(originalEpubFile, chapters, mode);
  }

  const zip = new JSZip();
  
  // 1. 创建 mimetype 文件（必须是第一个文件，无压缩）
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  
  // 2. 创建 META-INF 目录
  const metaInf = zip.folder('META-INF');
  metaInf.file('container.xml', generateContainerXml());
  
  // 3. 创建 OEBPS 目录
  const oebps = zip.folder('OEBPS');
  
  // 4. 根据模式生成章节列表
  let chapterFiles;
  if (mode === 'bilingual') {
    // 双语模式：每章拆分为原文和译文两页
    chapterFiles = [];
    chapters.forEach((chapter, index) => {
      chapterFiles.push({
        id: `chapter${index + 1}_original`,
        fileName: `chapter${index + 1}_original.xhtml`,
        title: `${chapter.title} (原文)`,
        content: normalizeBodyHtml(chapter.originalHtml)
      });
      chapterFiles.push({
        id: `chapter${index + 1}_translated`,
        fileName: `chapter${index + 1}_translated.xhtml`,
        title: `${chapter.title} (译文)`,
        content: normalizeBodyHtml(chapter.translatedHtml || chapter.originalHtml)
      });
    });
  } else {
    // 单语模式：只保留译文
    chapterFiles = chapters.map((chapter, index) => ({
      id: `chapter${index + 1}`,
      fileName: `chapter${index + 1}.xhtml`,
      title: chapter.title,
      content: normalizeBodyHtml(chapter.translatedHtml || chapter.originalHtml)
    }));
  }
  
  // 5. 添加所有资源文件（图片、CSS、字体等）到 OEBPS
  console.log(`📦 正在打包 ${resources.length} 个资源文件...`);
  resources.forEach(resource => {
    // 提取相对于 OEBPS 的路径
    let relativePath = resource.path;
    
    // 移除可能的 OEBPS/ 前缀
    if (relativePath.startsWith('OEBPS/')) {
      relativePath = relativePath.substring(6);
    } else if (relativePath.startsWith('OPS/')) {
      relativePath = relativePath.substring(4);
    }
    
    // 添加文件到 OEBPS
    oebps.file(relativePath, resource.data, { binary: true });
    console.log(`  ✅ ${relativePath}`);
  });
  
  // 6. 生成 content.opf（包含资源文件的 manifest）
  oebps.file('content.opf', generateContentOpf(metadata, chapterFiles, mode, resources));
  
  // 7. 生成 toc.ncx
  oebps.file('toc.ncx', generateTocNcx(metadata, chapterFiles));
  
  // 8. 生成章节文件
  const text = oebps.folder('Text');
  chapterFiles.forEach(file => {
    const content = generateChapterXhtml(file.title, file.content);
    text.file(file.fileName, content);
  });
  
  // 9. 添加默认样式文件（如果原书没有的话）
  const hasCustomCss = resources.some(r => r.path.toLowerCase().includes('.css'));
  if (!hasCustomCss) {
    const styles = oebps.folder('Styles');
    styles.file('style.css', generateDefaultCss());
  }
  
  // 8. 生成 EPUB 文件
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  return blob;
}

async function buildEpubByPatchingOriginal(originalEpubFile, chapters, mode) {
  const inZip = await JSZip.loadAsync(await originalEpubFile.arrayBuffer());

  // 读取 container.xml 找到 OPF 路径
  const containerEntry = inZip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('EPUB 缺少 META-INF/container.xml');
  const containerXml = await containerEntry.async('string');
  const opfPath = getContainerOpfPath(containerXml);
  if (!opfPath) throw new Error('无法从 container.xml 解析 OPF 路径');

  const opfEntry = inZip.file(opfPath);
  if (!opfEntry) throw new Error(`无法读取 OPF: ${opfPath}`);
  const opfXmlStr = await opfEntry.async('string');
  const opfDoc = parseXml(opfXmlStr);

  const opfDir = dirname(opfPath);
  const manifestItems = new Map();
  const manifest = opfDoc.getElementsByTagName('manifest')[0];
  const spine = opfDoc.getElementsByTagName('spine')[0];
  if (!manifest || !spine) throw new Error('OPF 缺少 manifest/spine');

  Array.from(manifest.getElementsByTagName('item')).forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href) manifestItems.set(id, { href, mediaType, el: item });
  });

  const chapterByHref = new Map();
  const chapterByIndex = new Map();
  chapters.forEach((ch) => {
    if (ch?.href) chapterByHref.set(String(ch.href).replace(/#.*$/, ''), ch);
    if (typeof ch?.index === 'number') chapterByIndex.set(ch.index, ch);
  });

  // 构建输出 zip：确保 mimetype 无压缩且尽量靠前
  const outZip = new JSZip();
  outZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 复制并/或替换文件
  const patchedFiles = new Map(); // fullPath -> content (string)

  const spineItemrefs = Array.from(spine.getElementsByTagName('itemref'));

  // 单语：只替换原文件 body
  // 双语：为每个 spine 文档生成一个 “_translated” 副本，并插入到 spine（toc 保持原样可点）
  for (let spinePos = 0; spinePos < spineItemrefs.length; spinePos++) {
    const itemref = spineItemrefs[spinePos];
    const idref = itemref.getAttribute('idref');
    if (!idref) continue;
    const mi = manifestItems.get(idref);
    if (!mi) continue;
    if (!/xhtml|html/i.test(mi.mediaType)) continue;

    const fullPath = joinPath(opfDir, mi.href);
    const entry = inZip.file(fullPath);
    if (!entry) continue;

    const originalXhtml = await entry.async('string');

    const chapter =
      chapterByHref.get(mi.href) ||
      chapterByHref.get(fullPath) ||
      chapterByIndex.get(spinePos) ||
      null;

    const translatedBody = normalizeBodyHtml(chapter?.translatedHtml || '');

    if (mode === 'single') {
      if (translatedBody) {
        patchedFiles.set(fullPath, replaceBodyInner(originalXhtml, translatedBody));
      }
    } else if (mode === 'bilingual') {
      // 原文保持不变；译文副本插入
      if (translatedBody) {
        const extIdx = fullPath.lastIndexOf('.');
        const translatedPath =
          extIdx >= 0
            ? `${fullPath.slice(0, extIdx)}_translated${fullPath.slice(extIdx)}`
            : `${fullPath}_translated.xhtml`;

        patchedFiles.set(translatedPath, replaceBodyInner(originalXhtml, translatedBody));

        // 在 OPF 中新增 manifest item + spine itemref（紧跟在原文后面）
        const newId = safeId(`${idref}__translated`);
        if (!manifestItems.has(newId)) {
          const newItem = opfDoc.createElement('item');
          newItem.setAttribute('id', newId);
          // href 必须相对 opf
          const translatedHref = translatedPath.startsWith(opfDir)
            ? translatedPath.slice(opfDir.length)
            : translatedPath;
          newItem.setAttribute('href', translatedHref);
          newItem.setAttribute('media-type', mi.mediaType);
          manifest.appendChild(newItem);
          manifestItems.set(newId, { href: translatedHref, mediaType: mi.mediaType, el: newItem });

          const newItemref = opfDoc.createElement('itemref');
          newItemref.setAttribute('idref', newId);
          // linear 继承原来的（默认 yes）
          const linear = itemref.getAttribute('linear');
          if (linear) newItemref.setAttribute('linear', linear);

          // 插入到当前 itemref 后
          const nextSibling = itemref.nextSibling;
          if (nextSibling) spine.insertBefore(newItemref, nextSibling);
          else spine.appendChild(newItemref);
        }
      }
    }
  }

  // 更新 OPF（双语时 spine/manifest 已修改）
  patchedFiles.set(opfPath, xmlToString(opfDoc));

  // 复制原 zip 文件到 outZip（mimetype 由我们重新写）
  const entries = Object.keys(inZip.files);
  for (const path of entries) {
    const file = inZip.files[path];
    if (file.dir) {
      outZip.folder(path);
      continue;
    }
    if (path === 'mimetype') continue;

    if (patchedFiles.has(path)) {
      outZip.file(path, patchedFiles.get(path));
      continue;
    }

    // 新增的 translatedPath 可能不在原 zip 里
    // 这里先复制原有；新增的我们后面补写
    const buf = await inZip.file(path).async('arraybuffer');
    outZip.file(path, buf, { binary: true });
  }

  // 写入新增/被替换但原 zip 没有的文件（主要是 bilingual 的 translatedPath）
  for (const [path, content] of patchedFiles.entries()) {
    if (path === 'mimetype') continue;
    if (outZip.file(path)) continue;
    outZip.file(path, content);
  }

  return await outZip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/**
 * 生成 container.xml
 */
function generateContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

/**
 * 生成 content.opf
 */
function generateContentOpf(metadata, chapterFiles, mode, resources = []) {
  const timestamp = new Date().toISOString();
  const uuid = `urn:uuid:${generateUUID()}`;
  
  // Manifest items - 章节
  const chapterManifestItems = chapterFiles.map(file => 
    `    <item id="${file.id}" href="Text/${file.fileName}" media-type="application/xhtml+xml"/>`
  ).join('\n');
  
  // Manifest items - 资源文件（图片、CSS、字体等）
  const resourceManifestItems = resources.map((resource, index) => {
    let relativePath = resource.path;
    // 移除 OEBPS/ 或 OPS/ 前缀
    if (relativePath.startsWith('OEBPS/')) {
      relativePath = relativePath.substring(6);
    } else if (relativePath.startsWith('OPS/')) {
      relativePath = relativePath.substring(4);
    }
    
    // 生成唯一的资源 ID
    const resourceId = `resource-${index + 1}`;
    return `    <item id="${resourceId}" href="${relativePath}" media-type="${resource.type}"/>`;
  }).join('\n');
  
  // Spine items
  const spineItems = chapterFiles.map(file =>
    `    <itemref idref="${file.id}"/>`
  ).join('\n');
  
  const titleSuffix = mode === 'bilingual' ? ' (双语版)' : ' (翻译版)';
  
  // 检查是否有自定义 CSS
  const hasCustomCss = resources.some(r => r.path.toLowerCase().includes('.css'));
  const styleItem = hasCustomCss ? '' : '    <item id="style" href="Styles/style.css" media-type="text/css"/>';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}${titleSuffix}</dc:title>
    <dc:creator>${escapeXml(metadata.creator)}</dc:creator>
    <dc:language>${metadata.language}</dc:language>
    <dc:date>${timestamp}</dc:date>
    <dc:publisher>${escapeXml(metadata.publisher || 'eBook Translator')}</dc:publisher>
    <meta property="dcterms:modified">${timestamp}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${styleItem}
${chapterManifestItems}
${resourceManifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}

/**
 * 生成 toc.ncx
 */
function generateTocNcx(metadata, chapterFiles) {
  const uuid = generateUUID();
  
  const navPoints = chapterFiles.map((file, index) => `
    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
      <navLabel>
        <text>${escapeXml(file.title)}</text>
      </navLabel>
      <content src="Text/${file.fileName}"/>
    </navPoint>`).join('');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)} (翻译版)</text>
  </docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
}

/**
 * 生成章节 XHTML
 */
function generateChapterXhtml(title, content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/style.css"/>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  ${content}
</body>
</html>`;
}

/**
 * 生成默认 CSS
 */
function generateDefaultCss() {
  return `body {
  font-family: serif;
  margin: 5%;
  text-align: justify;
}

h1, h2, h3, h4, h5, h6 {
  text-align: center;
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 1em;
}

p {
  text-indent: 2em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.chapter-title {
  page-break-before: always;
}
`;
}

/**
 * 生成 UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * XML 转义
 */
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 触发文件下载
 * @param {Blob} blob - 文件 Blob
 * @param {string} filename - 文件名
 */
export function downloadEpub(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
