import React, { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';

function flattenTocItems(items = [], depth = 0, out = []) {
  if (!Array.isArray(items)) return out;
  items.forEach((item) => {
    const label = item?.label || item?.title || item?.text || '';
    const href = item?.href || item?.url || '';
    if (label && href) {
      out.push({ label, href, depth });
    }
    // epubjs uses `subitems` for nested toc
    if (item?.subitems?.length) {
      flattenTocItems(item.subitems, depth + 1, out);
    }
  });
  return out;
}

export default function EpubPreview({ epubFile, onClose }) {
  const viewerRef = useRef(null);
  const [book, setBook] = useState(null);
  const [rendition, setRendition] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const lastCfiRef = useRef(null);
  const [toc, setToc] = useState([]);
  const [showToc, setShowToc] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flowMode, setFlowMode] = useState('scrolled-doc'); // 'scrolled-doc' | 'paginated'
  const [spineIndex, setSpineIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (!epubFile || !viewerRef.current) return;

    let isMounted = true;
    let currentBook = null;
    let currentRendition = null;

    const loadEpub = async () => {
      try {
        setLoading(true);
        setError(null);

        // 清空旧的容器内容，避免 epubjs 复用旧 iframe 导致渲染异常
        viewerRef.current.innerHTML = '';

        // 读取文件
        const arrayBuffer = await epubFile.arrayBuffer();
        
        // 创建 Book 对象
        currentBook = ePub(arrayBuffer);
        await currentBook.ready;

        if (!isMounted) return;

        // 在序列化阶段移除脚本（避免 iframe srcdoc 解析时触发 “Blocked script execution …” 警告）
        // 这会在内容进入 iframe 之前就移除 <script>，比 content hook 更早更干净
        try {
          currentBook.spine.hooks.serialize.register((output) => {
            if (typeof output !== 'string') return output;
            return output.replace(/<script\b[\s\S]*?<\/script>/gi, '');
          });
        } catch (e) {
          console.warn('注册 serialize hook 失败（可忽略）:', e);
        }

        // 获取元数据
        setMetadata({
          title: currentBook.packaging.metadata.title || '未知标题',
          creator: currentBook.packaging.metadata.creator || '未知作者',
          description: currentBook.packaging.metadata.description || '',
        });

        // 获取目录（必须等待 loaded.navigation，否则很多书会返回空目录）
        try {
          const nav = await currentBook.loaded.navigation;
          const tocItems = nav?.toc || currentBook.navigation?.toc || [];
          const flat = flattenTocItems(tocItems);
          setToc(flat);
        } catch (navErr) {
          console.warn('目录加载失败（可继续阅读）:', navErr);
          const tocItems = currentBook.navigation?.toc || [];
          setToc(flattenTocItems(tocItems));
        }

        // 创建渲染器
        // 关键点：
        // - allowScriptedContent 设为 false：避免 allow-scripts + allow-same-origin 的 sandbox 安全警告
        // - 同时我们会在内容注入前移除 <script>，保证大部分 EPUB 正常显示且更安全
        currentRendition = currentBook.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          flow: flowMode,
          spread: 'none',
          allowScriptedContent: false,
          snap: true,
        });

        // 移除 EPUB 内嵌脚本（解决 “Blocked script execution …” 以及部分书后续章节空白/卡死问题）
        currentRendition.hooks.content.register((contents) => {
          try {
            const doc = contents?.document;
            if (!doc) return;

            // 1) 移除所有 script
            doc.querySelectorAll('script').forEach((el) => el.remove());

            // 2) 移除常见的内联事件处理器（防止带脚本的属性触发）
            const inlineHandlers = [
              'onload',
              'onclick',
              'onerror',
              'onmouseover',
              'onmouseenter',
              'onmouseleave',
              'onfocus',
              'onblur',
              'onkeydown',
              'onkeyup',
            ];
            inlineHandlers.forEach((attr) => {
              doc.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
            });
          } catch (hookErr) {
            console.warn('内容清理失败（可忽略）:', hookErr);
          }
        });

        // 监听位置变化
        currentRendition.on('relocated', (location) => {
          if (isMounted) {
            setCurrentLocation(location);
            if (location?.start?.cfi) lastCfiRef.current = location.start.cfi;
            if (typeof location?.start?.index === 'number') setSpineIndex(location.start.index);
          }
        });

        // 监听显示事件
        currentRendition.on('displayed', (section) => {
          console.log('显示章节:', section.href);
        });

        // 监听渲染错误
        currentRendition.on('renderFailed', (section, error) => {
          console.error('渲染失败 - 章节:', section?.href, '错误:', error);
        });

        // 显示第一页
        try {
          // 优先尝试恢复上次位置（切换模式时）
          if (lastCfiRef.current) {
            await currentRendition.display(lastCfiRef.current);
          } else {
            await currentRendition.display();
          }
        } catch (displayError) {
          console.error('初始显示失败:', displayError);
          // 尝试显示第一个章节
          if (currentBook.spine && currentBook.spine.first()) {
            await currentRendition.display(currentBook.spine.first().href);
          }
        }

        if (isMounted) {
          setBook(currentBook);
          setRendition(currentRendition);
          setLoading(false);
        }

      } catch (err) {
        console.error('EPUB 预览加载失败:', err);
        if (isMounted) {
          setError('加载 EPUB 失败: ' + err.message);
          setLoading(false);
        }
      }
    };

    loadEpub();

    // 清理函数
    return () => {
      isMounted = false;
      if (currentRendition) {
        try {
          currentRendition.destroy();
        } catch (e) {
          console.warn('Rendition destroy error:', e);
        }
      }
      if (currentBook) {
        try {
          currentBook.destroy();
        } catch (e) {
          console.warn('Book destroy error:', e);
        }
      }
    };
  }, [epubFile, flowMode]);

  const handlePrev = async () => {
    if (!rendition || isNavigating) return;
    setIsNavigating(true);
    try {
      if (flowMode === 'paginated') {
        await rendition.prev();
        return;
      }
      // scrolled-doc：按章节跳转更稳定
      const prev = Math.max(0, spineIndex - 1);
      const section = book?.spine?.get(prev);
      if (section?.href) await rendition.display(section.href);
    } catch (err) {
      console.warn('上一页/章失败:', err);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleNext = async () => {
    if (!rendition || isNavigating) return;
    setIsNavigating(true);
    try {
      if (flowMode === 'paginated') {
        await rendition.next();
        return;
      }
      const next = Math.min((book?.spine?.length || 1) - 1, spineIndex + 1);
      const section = book?.spine?.get(next);
      if (section?.href) await rendition.display(section.href);
    } catch (err) {
      console.warn('下一页/章失败:', err);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleGoToChapter = (href) => {
    if (rendition) {
      rendition.display(href).catch(err => {
        console.error('跳转章节失败:', err);
      });
      setShowToc(false);
    }
  };

  // 键盘导航
  useEffect(() => {
    if (!rendition) return;

    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        setShowToc(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [rendition]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">
              📖 {metadata?.title || '加载中...'}
            </h2>
            {metadata?.creator && (
              <p className="text-blue-100 text-sm truncate">
                作者: {metadata.creator}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition flex items-center gap-2"
          >
            <span>✕</span>
            <span className="hidden sm:inline">关闭</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Table of Contents Sidebar */}
            {showToc && toc.length > 0 && (
            <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center justify-between">
                <span>📑 目录</span>
                <button
                  onClick={() => setShowToc(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </h3>
              <ul className="space-y-2">
                  {toc.map((item, index) => (
                    <li key={`${item.href}-${index}`}>
                      <button
                        onClick={() => handleGoToChapter(item.href)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-100 transition text-sm text-gray-700 hover:text-blue-800"
                        style={{ paddingLeft: `${12 + item.depth * 12}px` }}
                        title={item.label}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Viewer */}
          <div className="flex-1 relative bg-white">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">加载中...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <div className="text-center text-red-600 p-6">
                  <p className="text-xl mb-2">⚠️ 加载失败</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            <div
              ref={viewerRef}
              className="w-full h-full overflow-hidden"
              style={{ 
                fontSize: '16px',
                position: 'relative',
                minHeight: '500px'
              }}
            />

            {/* Navigation Arrows */}
            {!loading && !error && (
              <>
                <button
                  onClick={handlePrev}
                  disabled={isNavigating}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full flex items-center justify-center transition shadow-lg"
                  title={flowMode === 'paginated' ? '上一页 (←)' : '上一章 (←)'}
                >
                  ←
                </button>
                <button
                  onClick={handleNext}
                  disabled={isNavigating}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full flex items-center justify-center transition shadow-lg"
                  title={flowMode === 'paginated' ? '下一页 (→)' : '下一章 (→)'}
                >
                  →
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer Controls */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 flex items-center justify-between">
          <div className="flex gap-2">
            {toc.length > 0 && (
              <button
                onClick={() => setShowToc(!showToc)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
              >
                {showToc ? '隐藏目录' : '📑 显示目录'}
              </button>
            )}
            <button
              onClick={() => setFlowMode((m) => (m === 'paginated' ? 'scrolled-doc' : 'paginated'))}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-sm"
              title="切换阅读模式"
            >
              {flowMode === 'paginated' ? '📜 滚动阅读' : '📄 分页阅读'}
            </button>
          </div>

          <div className="text-sm text-gray-600">
            {currentLocation && (
              <span>
                进度: {Math.round(currentLocation.start.percentage * 100)}%
              </span>
            )}
          </div>

          <div className="text-sm text-gray-500">
            💡 提示: 使用 ← → 键{flowMode === 'paginated' ? '翻页' : '切章'}
          </div>
        </div>
      </div>
    </div>
  );
}
