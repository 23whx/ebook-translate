import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { parseEpub, validateEpubFile } from '../services/epubParser';
import { loadProgress, hasProgress, clearProgress, getProgressSummary } from '../services/progressStorage';
import EpubPreview from '../components/EpubPreview';
import { MODEL_PROVIDERS, validateAPIKey } from '../services/modelProviders';

export default function HomePage({ onNext }) {
  const { state, dispatch, ActionTypes } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [progressSummary, setProgressSummary] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // 检查是否有保存的进度
  useEffect(() => {
    async function checkProgress() {
      const hasSavedProgress = await hasProgress();
      if (hasSavedProgress) {
        const summary = await getProgressSummary();
        setProgressSummary(summary);
        setShowRestorePrompt(true);
      }
    }
    checkProgress();
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!validateEpubFile(file)) {
      setError('请选择有效的 EPUB 文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('文件大小不能超过 10MB');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await parseEpub(file);

      // ✅ 如果用户重新上传同一本书：自动加载浏览器缓存的翻译进度
      // 匹配策略（无后端/无文件 hash 的情况下尽量可靠）：
      // - 文件名 + 文件大小
      // - 以及（可选）书名/作者
      const savedProgress = await loadProgress();
      const isSameBook =
        savedProgress &&
        savedProgress.epubFileName &&
        savedProgress.epubFileSize &&
        savedProgress.epubFileName === file.name &&
        savedProgress.epubFileSize === file.size &&
        // 可选：进一步用元数据兜底
        (!savedProgress.epubMetadata ||
          !savedProgress.epubMetadata.title ||
          savedProgress.epubMetadata.title === result.metadata?.title);
      
      dispatch({
        type: ActionTypes.SET_EPUB,
        payload: {
          file: file,
          metadata: result.metadata,
          resources: result.resources // 新增：保存资源文件
        }
      });

      if (isSameBook && savedProgress?.chapters?.length) {
        // 用缓存的 chapters（含 translatedText/translatedHtml）覆盖解析结果，避免“已翻译章节变 0”
        dispatch({ type: ActionTypes.SET_CHAPTERS, payload: savedProgress.chapters });
        if (savedProgress.glossary) {
          dispatch({ type: ActionTypes.UPDATE_GLOSSARY, payload: savedProgress.glossary });
        }
        if (savedProgress.styleGuide) {
          dispatch({ type: ActionTypes.UPDATE_STYLE_GUIDE, payload: savedProgress.styleGuide });
        }
        if (typeof savedProgress.currentChapterIndex === 'number' && savedProgress.currentChapterIndex >= 0) {
          dispatch({ type: ActionTypes.SET_CURRENT_CHAPTER, payload: savedProgress.currentChapterIndex });
        }
        alert(
          `✅ 检测到你重新上传的是同一本书，已自动加载浏览器缓存的翻译进度。\n\n` +
            `章节：${savedProgress.chapters.length} 章（含已翻译内容）\n` +
            `图片/样式等资源已从新上传的 EPUB 重新读取，导出可正常保留图片。`
        );
      } else {
        dispatch({
          type: ActionTypes.SET_CHAPTERS,
          payload: result.chapters
        });
      }

      // 保存文件用于预览
      setPreviewFile(file);

      console.log(`✅ EPUB 解析完成：${result.chapters.length} 个章节，${result.resources.length} 个资源文件`);
      setError(null);
    } catch (err) {
      console.error('EPUB parsing error:', err);
      setError(err.message || '文件解析失败，请检查文件格式');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    if (previewFile) {
      setShowPreview(true);
    } else if (state.epubFile) {
      setPreviewFile(state.epubFile);
      setShowPreview(true);
    }
  };

  const handleRestoreProgress = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const savedProgress = await loadProgress();
      
      if (!savedProgress) {
        throw new Error('未找到保存的进度');
      }
      
      // 恢复状态
      dispatch({
        type: ActionTypes.SET_CHAPTERS,
        payload: savedProgress.chapters
      });
      
      dispatch({
        type: ActionTypes.UPDATE_GLOSSARY,
        payload: savedProgress.glossary
      });
      
      dispatch({
        type: ActionTypes.UPDATE_STYLE_GUIDE,
        payload: savedProgress.styleGuide
      });
      
      dispatch({
        type: ActionTypes.SET_EPUB,
        payload: {
          file: null, // 实际文件无法恢复，需要用户重新上传
          metadata: savedProgress.epubMetadata,
          resources: savedProgress.epubResources || []
        }
      });
      
      if (savedProgress.currentChapterIndex >= 0) {
        dispatch({
          type: ActionTypes.SET_CURRENT_CHAPTER,
          payload: savedProgress.currentChapterIndex
        });
      }
      
      setShowRestorePrompt(false);
      alert(`✅ 进度恢复成功！\n\n已恢复 ${savedProgress.chapters.length} 个章节的翻译进度。\n你现在可以直接进入导出页面下载（图片等资源也会一起导出）。`);
    } catch (err) {
      console.error('恢复进度失败:', err);
      setError('恢复进度失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardProgress = async () => {
    if (confirm('确定要丢弃保存的进度吗？此操作无法撤销。')) {
      try {
        await clearProgress();
        setShowRestorePrompt(false);
        setProgressSummary(null);
        alert('✅ 已清除保存的进度');
      } catch (err) {
        console.error('清除进度失败:', err);
        alert('清除进度失败: ' + err.message);
      }
    }
  };

  const canProceed = state.chapters.length > 0 && state.apiKey && validateAPIKey(state.modelProvider, state.apiKey);

  return (
    <>
      {/* EPUB 预览器 */}
      {showPreview && previewFile && (
        <EpubPreview
          epubFile={previewFile}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white">
          <h1 className="text-4xl font-bold mb-2">📚 eBook Translator</h1>
          <p className="text-blue-100">AI 驱动的 EPUB 电子书翻译工具</p>
        </div>

        <div className="p-8">
          {/* Restore Progress Prompt */}
          {showRestorePrompt && progressSummary && (
            <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl p-6 shadow-lg">
              <div className="flex items-start gap-4">
                <div className="text-4xl">💾</div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-green-800 mb-2">
                    发现保存的翻译进度！
                  </h3>
                  <div className="text-sm text-gray-700 space-y-2 mb-4">
                    <p>
                      <span className="font-semibold">保存时间:</span>{' '}
                      {new Date(progressSummary.timestamp).toLocaleString('zh-CN')}
                    </p>
                    <p>
                      <span className="font-semibold">书籍:</span>{' '}
                      {progressSummary.epubFileName || '未知'}
                    </p>
                    <p>
                      <span className="font-semibold">进度:</span>{' '}
                      已翻译 {progressSummary.translatedChapters}/{progressSummary.totalChapters} 章
                      ({progressSummary.progress}%)
                    </p>
                    <p>
                      <span className="font-semibold">已确认:</span>{' '}
                      {progressSummary.approvedChapters} 章
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleRestoreProgress}
                      disabled={loading}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
                    >
                      ✅ 恢复进度
                    </button>
                    <button
                      onClick={handleDiscardProgress}
                      disabled={loading}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
                    >
                      ❌ 丢弃
                    </button>
                    <button
                      onClick={() => setShowRestorePrompt(false)}
                      className="px-6 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition"
                    >
                      稍后决定
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Introduction */}
          <div className="mb-8 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <h2 className="font-semibold text-lg mb-2">🎯 功能特点</h2>
            <ul className="space-y-1 text-gray-700">
              <li>✅ 纯前端处理，无需上传到服务器</li>
              <li>✅ 使用自己的大模型 API（支持 DeepSeek/GPT/Claude/Gemini/Kimi）</li>
              <li>✅ 保持术语前后一致性，专业术语自动标注英文</li>
              <li>✅ 支持术语表自定义</li>
              <li>✅ 人工最终审核确认</li>
              <li>✅ 支持多语言互译（中、英、日、韩、法、德、俄等）</li>
              <li>✅ 支持单语/双语对照模式导出</li>
            </ul>
          </div>

          {/* API Configuration */}
          <div className="mb-6 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6">
            <h2 className="font-semibold text-lg mb-4 text-purple-800">🔑 API 配置（使用您自己的 API）</h2>
            
            {/* Model Provider Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                选择模型提供商
              </label>
              <select
                value={state.modelProvider}
                onChange={(e) => {
                  dispatch({
                    type: ActionTypes.SET_API_CONFIG,
                    payload: { modelProvider: e.target.value }
                  });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {Object.entries(MODEL_PROVIDERS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.name} ({config.model})
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  {MODEL_PROVIDERS[state.modelProvider].tokenName}
                </label>
                <a
                  href={MODEL_PROVIDERS[state.modelProvider].getKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-600 hover:underline"
                >
                  获取 API Key →
                </a>
              </div>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={state.apiKey}
                  onChange={(e) => {
                    dispatch({
                      type: ActionTypes.SET_API_CONFIG,
                      payload: { apiKey: e.target.value }
                    });
                  }}
                  onPaste={(e) => {
                    // 确保粘贴功能正常工作
                    e.stopPropagation();
                  }}
                  placeholder={`输入您的 ${MODEL_PROVIDERS[state.modelProvider].name} API Key`}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
                  title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                >
                  {showApiKey ? "🙈" : "👁️"}
                </button>
              </div>
              {state.apiKey && validateAPIKey(state.modelProvider, state.apiKey) && (
                <p className="mt-2 text-sm text-green-600 flex items-center gap-2">
                  <span>✓</span>
                  <span>API Key 格式正确</span>
                </p>
              )}
              {state.apiKey && !validateAPIKey(state.modelProvider, state.apiKey) && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-2">
                  <span>✗</span>
                  <span>API Key 格式不正确</span>
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                💡 提示：如果无法粘贴，点击右侧 👁️ 图标切换为明文输入
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-purple-100 border border-purple-300 rounded-lg p-3 text-sm text-purple-800">
              <p className="font-semibold mb-1">💡 为什么需要您的 API Key？</p>
              <ul className="space-y-1 text-xs">
                <li>• 本工具完全免费，不收集您的数据</li>
                <li>• API Key 仅保存在您的浏览器本地，不会上传到服务器</li>
                <li>• 使用自己的 API 可以避免被他人滥用</li>
                <li>• 您可以根据自己的需求选择最合适的模型</li>
              </ul>
            </div>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              上传 EPUB 文件 (最大 10MB)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-gray-600">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm">
                  {state.epubFile ? (
                    <span className="text-blue-600 font-medium">{state.epubFile.name}</span>
                  ) : (
                    <>点击选择或拖拽 EPUB 文件到此处</>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Book Info */}
          {state.epubMetadata && (
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold mb-2 text-green-800">📖 书籍信息</h3>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">标题:</span> {state.epubMetadata.title}</p>
                    <p><span className="font-medium">作者:</span> {state.epubMetadata.creator}</p>
                    <p><span className="font-medium">章节数:</span> {state.chapters.length}</p>
                    <p><span className="font-medium">资源文件:</span> {state.epubResources?.length || 0} 个</p>
                  </div>
                </div>
                <button
                  onClick={handlePreview}
                  className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium shadow-md flex items-center gap-2"
                >
                  <span>👁️</span>
                  <span>预览书籍</span>
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="mb-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">处理中...</p>
            </div>
          )}

          {/* Next Button */}
          <button
            onClick={onNext}
            disabled={!canProceed || loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition shadow-lg"
          >
            {state.chapters.length === 0 ? '请先上传 EPUB 文件' : 
             !state.apiKey ? '请配置 API Key' :
             !validateAPIKey(state.modelProvider, state.apiKey) ? 'API Key 格式不正确' :
             '开始翻译 →'}
          </button>

          {/* Legal Disclaimer */}
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-gray-600">
            <p className="font-semibold mb-1">⚠️ 免责声明</p>
            <p>本工具仅供个人学习研究使用。用户需自行承担版权责任，请勿用于商业用途。所有数据仅在浏览器本地处理，不会上传到服务器。</p>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
