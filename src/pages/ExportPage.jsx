import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { buildEpub, downloadEpub } from '../services/epubBuilder';

export default function ExportPage({ onBack, onHome }) {
  const { state } = useApp();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [exportMode, setExportMode] = useState('single'); // 'single' | 'bilingual'
  const [exportEpubFile, setExportEpubFile] = useState(null);

  const effectiveEpubFile = useMemo(() => {
    return exportEpubFile || state.epubFile || null;
  }, [exportEpubFile, state.epubFile]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      if (!effectiveEpubFile) {
        throw new Error('缺少原始 EPUB 文件：请在导出页重新上传原 EPUB（仅用于本地导出，不会上传服务器）。');
      }

      console.log('📦 开始导出 EPUB（优先保留原书排版/目录/样式）...');
      
      // 构建 EPUB：
      // - 优先：基于原始 EPUB 打补丁（保留 OPF/nav/NCX/CSS/排版），只替换章节内容
      // - 通过 metadata.__originalEpubFile 传入
      const blob = await buildEpub(
        { ...(state.epubMetadata || {}), __originalEpubFile: effectiveEpubFile },
        state.chapters,
        exportMode,
        state.epubResources || []
      );
      
      // 生成文件名
      const originalName = state.epubFile?.name || 'translated-book';
      const baseName = originalName.replace(/\.epub$/i, '');
      const modeSuffix = exportMode === 'bilingual' ? '_bilingual' : '_translated';
      const fileName = `${baseName}${modeSuffix}.epub`;
      
      // 下载文件
      downloadEpub(blob, fileName);
      
      alert(`✅ 导出成功！\n\n文件已开始下载。\n包含 ${state.chapters.length} 个章节和 ${state.epubResources?.length || 0} 个资源文件（图片、CSS等）。`);
    } catch (err) {
      console.error('Export error:', err);
      setError(err.message || '导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const approvedChapters = state.chapters.filter(ch => ch.status === 'APPROVED');
  const translatedChapters = state.chapters.filter(
    ch => ch.status === 'APPROVED' || ch.status === 'TRANSLATED'
  );
  const allTranslated = translatedChapters.length === state.chapters.length;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">🎉 导出翻译结果</h1>

        {state.chapters.length === 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
            当前导出页没有加载到进度数据。请返回首页点击“恢复进度”，或刷新重试。
          </div>
        )}

        {!effectiveEpubFile && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 font-medium mb-2">📎 请重新上传原 EPUB（仅用于导出）</p>
            <p className="text-sm text-blue-700 mb-3">
              为了保证导出 EPUB 的排版、目录、样式完全符合原书并可点击，我们会在原文件基础上“打补丁”替换译文内容。
              文件仅在浏览器本地使用，不会上传到服务器。
            </p>
            <input
              type="file"
              accept=".epub"
              onChange={(e) => setExportEpubFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
          </div>
        )}

        {/* Summary */}
        <div className="mb-8 space-y-4">
          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">📊 翻译统计</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">书籍标题</p>
                <p className="font-medium text-gray-800">{state.epubMetadata?.title}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">作者</p>
                <p className="font-medium text-gray-800">{state.epubMetadata?.creator}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">总章节数</p>
                <p className="font-medium text-gray-800">{state.chapters.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">已翻译章节</p>
                <p className="font-medium text-gray-800">{translatedChapters.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">资源文件</p>
                <p className="font-medium text-gray-800">{state.epubResources?.length || 0} 个（图片/CSS等）</p>
              </div>
            </div>
          </div>

          {/* Glossary Summary */}
          {Object.keys(state.glossary).length > 0 && (
            <div className="p-6 bg-purple-50 rounded-xl">
              <h2 className="text-xl font-semibold mb-3">📚 使用的术语表</h2>
              <div className="space-y-1 text-sm">
                {Object.entries(state.glossary).slice(0, 5).map(([source, target]) => (
                  <div key={source} className="flex justify-between">
                    <span className="text-gray-600">{source}</span>
                    <span className="text-gray-800 font-medium">{target}</span>
                  </div>
                ))}
                {Object.keys(state.glossary).length > 5 && (
                  <p className="text-gray-500 italic">
                    ...以及其他 {Object.keys(state.glossary).length - 5} 个术语
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Warning if not all translated */}
          {!allTranslated && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800">
                ⚠️ 注意：仍有 {state.chapters.length - translatedChapters.length} 个章节未翻译完成。
                导出的 EPUB 将包含所有章节（未翻译章节将保留原文）。
              </p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Export Mode Selection */}
        <div className="mb-6 p-6 bg-purple-50 rounded-xl">
          <h2 className="text-xl font-semibold mb-4">📖 选择输出模式</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 bg-white rounded-lg cursor-pointer hover:bg-purple-100 transition">
              <input
                type="radio"
                name="exportMode"
                value="single"
                checked={exportMode === 'single'}
                onChange={(e) => setExportMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-semibold text-gray-800">单语模式</div>
                <div className="text-sm text-gray-600">
                  只保留译文，替换原文。适合阅读译本。
                </div>
              </div>
            </label>
            
            <label className="flex items-start gap-3 p-4 bg-white rounded-lg cursor-pointer hover:bg-purple-100 transition">
              <input
                type="radio"
                name="exportMode"
                value="bilingual"
                checked={exportMode === 'bilingual'}
                onChange={(e) => setExportMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-semibold text-gray-800">双语对照模式</div>
                <div className="text-sm text-gray-600">
                  保留原文和译文。第一页原文，第二页译文，交替显示。适合对照学习。
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Export Button */}
        <div className="space-y-4">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-4 rounded-xl font-semibold hover:from-green-700 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition shadow-lg text-lg"
          >
            {exporting ? (
              <span className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                正在生成 EPUB...
              </span>
            ) : (
              '📥 下载翻译后的 EPUB'
            )}
          </button>

          <div className="flex gap-4">
            <button
              onClick={onBack}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-medium"
            >
              ← 返回章节列表
            </button>
            <button
              onClick={onHome}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium"
            >
              🏠 返回首页
            </button>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg text-sm text-gray-600">
          <p className="font-semibold mb-2">💡 使用提示</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>导出的 EPUB 可以在大多数电子书阅读器中打开</li>
            <li>推荐使用 Calibre 等工具进行进一步编辑</li>
            <li>所有数据仅在浏览器本地处理，未上传到服务器</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
