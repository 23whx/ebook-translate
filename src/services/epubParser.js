/**
 * EPUB 解析器
 * 使用 epubjs 库解析 EPUB 文件并提取章节内容
 */

import ePub from 'epubjs';

function flattenTocItems(items = [], depth = 0, out = []) {
  if (!Array.isArray(items)) return out;
  items.forEach((item) => {
    const label = item?.label || item?.title || item?.text || '';
    const href = item?.href || item?.url || '';
    if (label && href) out.push({ label, href, depth });
    if (item?.subitems?.length) flattenTocItems(item.subitems, depth + 1, out);
  });
  return out;
}

function normalizeHref(href = '') {
  return String(href).replace(/^(\.\/)+/, '').replace(/#.*$/, '');
}

function guessTitle(contents, spineItem, tocFlat) {
  let title = '';
  try {
    const heading = contents?.querySelector?.('h1, h2, h3, title');
    if (heading) title = heading.textContent?.trim() || '';
  } catch {
    // ignore
  }

  if (!title && tocFlat?.length) {
    const spineHref = normalizeHref(spineItem?.href || spineItem?.canonical || '');
    const matched = tocFlat.find((t) => normalizeHref(t.href) === spineHref);
    if (matched?.label) title = matched.label.trim();
  }

  if (!title) {
    // 兜底：用 href 或 index
    const href = spineItem?.href ? normalizeHref(spineItem.href) : '';
    title = href ? href.split('/').pop() : '';
  }

  return title || 'Untitled';
}

/**
 * 从 HTML 中提取纯文本
 * @param {string} html - HTML 内容
 * @returns {string} 纯文本
 */
function extractTextFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 移除 script 和 style 标签
  const scripts = doc.querySelectorAll('script, style');
  scripts.forEach(el => el.remove());
  
  return doc.body.textContent || '';
}

/**
 * 解析 EPUB 文件
 * @param {File} file - EPUB 文件对象
 * @returns {Promise<object>} 解析结果
 */
export async function parseEpub(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const book = ePub(arrayBuffer);
        
        await book.ready;

        // 目录需要异步加载，否则很多书会拿到空 toc
        let tocFlat = [];
        try {
          const nav = await book.loaded.navigation;
          tocFlat = flattenTocItems(nav?.toc || book.navigation?.toc || []);
        } catch {
          tocFlat = flattenTocItems(book.navigation?.toc || []);
        }
        
        // 获取元数据
        const metadata = {
          title: book.packaging.metadata.title || '未知标题',
          creator: book.packaging.metadata.creator || '未知作者',
          language: book.packaging.metadata.language || 'unknown',
          description: book.packaging.metadata.description || '',
          publisher: book.packaging.metadata.publisher || '',
          cover: null
        };
        
        // 尝试获取封面
        try {
          const coverUrl = await book.coverUrl();
          metadata.cover = coverUrl;
        } catch (err) {
          console.warn('无法获取封面:', err);
        }
        
        // 获取章节列表
        const spine = book.spine;
        const chapters = [];
        
        for (let i = 0; i < spine.length; i++) {
          const spineItem = spine.get(i);
          
          try {
            // 加载章节内容
            await spineItem.load(book.load.bind(book));
            const contents = spineItem.contents;
            
            if (!contents) {
              console.warn(`章节 ${i} 内容为空`);
              chapters.push({
                id: spineItem.idref || `chapter-${i}`,
                idref: spineItem.idref,
                href: spineItem.href,
                index: i,
                title: `Chapter ${i + 1}`,
                originalHtml: '',
                originalFullHtml: '',
                originalText: '',
                translatedHtml: null,
                translatedText: null,
                status: 'UNTRANSLATED',
                reviewData: null,
              });
              continue;
            }
            
            // 获取 HTML 内容
            // 注意：contents 是 Document，序列化会包含 <html><head><body>，后续导出时不能再套一层 <body>（会导致排版/标题异常）
            const htmlContent = new XMLSerializer().serializeToString(contents);
            const bodyHtml = contents.body?.innerHTML || htmlContent;
            
            // 提取文本内容
            const textContent = extractTextFromHtml(htmlContent);

            // 章节标题（优先：正文标题 -> TOC -> href 兜底）
            const title = guessTitle(contents, spineItem, tocFlat);
            
            chapters.push({
              id: spineItem.idref || `chapter-${i}`,
              idref: spineItem.idref,
              href: spineItem.href,
              index: i,
              title: title,
              // 仅保存 body 内部 HTML，保证后续翻译/导出能保留排版且不产生嵌套 html
              originalHtml: bodyHtml,
              // 兼容：保留完整 HTML（如有需要）
              originalFullHtml: htmlContent,
              originalText: textContent.trim(),
              translatedHtml: null,
              translatedText: null,
              status: 'UNTRANSLATED',
              reviewData: null
            });
            
            spineItem.unload();
          } catch (error) {
            console.error(`解析章节 ${i} 失败:`, error);
          }
        }
        
        // 提取所有资源文件（图片、CSS、字体等）
        const resources = await extractResources(book, arrayBuffer);
        
        resolve({
          metadata,
          chapters,
          resources, // 新增：所有资源文件
          rawBook: book
        });
      } catch (error) {
        reject(new Error(`EPUB 解析失败: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 将文本分割成段落
 * @param {string} text - 文本内容
 * @returns {string[]} 段落数组
 */
export function splitIntoParagraphs(text) {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * 将 HTML 分割成段落元素
 * @param {string} html - HTML 内容
 * @returns {Array} 段落信息数组 [{tag, content, html}]
 */
export function splitHtmlIntoParagraphs(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs = [];
  
  // 查找所有段落级元素
  const elements = doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li');
  
  elements.forEach((el, index) => {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      paragraphs.push({
        index,
        tag: el.tagName.toLowerCase(),
        content: text,
        html: el.outerHTML,
        attributes: Array.from(el.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {})
      });
    }
  });
  
  return paragraphs;
}

/**
 * 提取 EPUB 中的所有资源文件（图片、CSS、字体等）
 * @param {object} book - epubjs book 对象
 * @param {ArrayBuffer} arrayBuffer - 原始 EPUB 文件数据
 * @returns {Promise<Array>} 资源文件数组
 */
async function extractResources(book, arrayBuffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const resources = [];
  
  // 资源文件的扩展名（图片、CSS、字体等）
  const resourceExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',  // 图片
    '.css',  // 样式
    '.ttf', '.otf', '.woff', '.woff2',  // 字体
    '.js'  // 脚本（少见但可能存在）
  ];
  
  // 遍历 ZIP 中的所有文件
  for (const [filepath, zipEntry] of Object.entries(zip.files)) {
    // 跳过目录
    if (zipEntry.dir) continue;
    
    // 检查是否是资源文件
    const isResource = resourceExtensions.some(ext => 
      filepath.toLowerCase().endsWith(ext)
    );
    
    if (isResource) {
      try {
        // 读取文件内容（二进制）
        const content = await zipEntry.async('arraybuffer');
        
        resources.push({
          path: filepath,  // 原始路径（如 OEBPS/Images/cover.jpg）
          data: content,   // 二进制数据
          type: getMediaType(filepath)  // MIME 类型
        });
        
        console.log(`✅ 提取资源: ${filepath}`);
      } catch (error) {
        console.error(`提取资源失败 ${filepath}:`, error);
      }
    }
  }
  
  console.log(`📦 共提取 ${resources.length} 个资源文件`);
  return resources;
}

/**
 * 根据文件路径获取 MIME 类型
 * @param {string} filepath - 文件路径
 * @returns {string} MIME 类型
 */
function getMediaType(filepath) {
  const ext = filepath.toLowerCase().split('.').pop();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'css': 'text/css',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'js': 'application/javascript'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 验证 EPUB 文件
 * @param {File} file - 文件对象
 * @returns {boolean} 是否有效
 */
export function validateEpubFile(file) {
  if (!file) {
    return false;
  }
  
  const validExtensions = ['.epub'];
  const fileName = file.name.toLowerCase();
  
  return validExtensions.some(ext => fileName.endsWith(ext));
}
