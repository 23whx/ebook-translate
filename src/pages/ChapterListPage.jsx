import React, { useState, useEffect } from 'react';
import { useApp, ChapterStatus } from '../context/AppContext';
import { translateText } from '../services/translationEngine';
import { reviewTranslation } from '../services/consistencyReviewer';
import GlossaryManager from '../components/GlossaryManager';
import { saveProgress, getProgressSummary } from '../services/progressStorage';
import { SUPPORTED_LANGUAGES, detectBookLanguage, getLanguageName } from '../services/languageDetector';
import { translateHtmlPreserveMarkup } from '../services/htmlTranslator';

export default function ChapterListPage({ onBack, onTranslate, onExport }) {
  const { state, dispatch, ActionTypes } = useApp();
  const [translating, setTranslating] = useState(false);
  const [currentTranslating, setCurrentTranslating] = useState(-1);
  const [sourceLang, setSourceLang] = useState('');
  const [targetLang, setTargetLang] = useState('zh');
  const [detectedLang, setDetectedLang] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoTranslating, setAutoTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState({ current: 0, total: 0 });
  const [pauseRequested, setPauseRequested] = useState(false);

  // 自动检测原书语言
  useEffect(() => {
    if (state.chapters && state.chapters.length > 0 && !detectedLang) {
      const detected = detectBookLanguage(state.chapters);
      setDetectedLang(detected);
      setSourceLang(detected);
      console.log('检测到的语言:', getLanguageName(detected));
    }
  }, [state.chapters, detectedLang]);

  // 暂存进度
  const handleSaveProgress = async () => {
    setSaving(true);
    try {
      await saveProgress({
        chapters: state.chapters,
        glossary: state.glossary,
        styleGuide: state.styleGuide,
        epubMetadata: state.epubMetadata,
        epubResources: state.epubResources,
        epubFile: state.epubFile,
        currentChapterIndex: state.currentChapterIndex
      });
      
      // 显示成功提示
      alert('✅ 进度已保存！\n\n下次打开时可以选择恢复进度。');
      
      // 可选：显示存储摘要
      const summary = await getProgressSummary();
      console.log('保存的进度摘要:', summary);
    } catch (error) {
      console.error('保存进度失败:', error);
      alert('❌ 保存进度失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      [ChapterStatus.UNTRANSLATED]: { text: '未翻译', color: 'bg-gray-200 text-gray-700' },
      [ChapterStatus.TRANSLATING]: { text: '翻译中...', color: 'bg-blue-200 text-blue-700 animate-pulse' },
      [ChapterStatus.TRANSLATED]: { text: '已翻译', color: 'bg-green-200 text-green-700' },
      [ChapterStatus.REVIEW_NEEDED]: { text: '待审核', color: 'bg-yellow-200 text-yellow-700' },
      [ChapterStatus.APPROVED]: { text: '已确认', color: 'bg-indigo-200 text-indigo-700' }
    };
    
    const badge = badges[status] || badges[ChapterStatus.UNTRANSLATED];
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const handleTranslateChapter = async (chapterIndex) => {
    const chapter = state.chapters[chapterIndex];
    setCurrentTranslating(chapterIndex);
    setTranslating(true);

    try {
      // 更新状态为翻译中
      dispatch({
        type: ActionTypes.UPDATE_CHAPTER,
        payload: {
          index: chapterIndex,
          updates: { status: ChapterStatus.TRANSLATING }
        }
      });

      // 翻译文本
      const { translatedHtml, translatedText } = await translateHtmlPreserveMarkup({
        html: chapter.originalHtml,
        sourceLang,
        targetLang,
        apiKey: state.apiKey,
        modelProvider: state.modelProvider,
        glossary: state.glossary,
      });

      // 调用审校智能体
      let reviewData = null;
      try {
        reviewData = await reviewTranslation(
          chapter.originalText,
          translatedText,
          state.glossary,
          state.styleGuide
        );
      } catch (reviewError) {
        console.warn('审校失败，跳过审校步骤:', reviewError);
      }

      // 更新章节数据
      const status = reviewData?.status === 'needs_revision' 
        ? ChapterStatus.REVIEW_NEEDED 
        : ChapterStatus.TRANSLATED;

      dispatch({
        type: ActionTypes.UPDATE_CHAPTER,
        payload: {
          index: chapterIndex,
          updates: {
            translatedText,
            translatedHtml,
            reviewData,
            status
          }
        }
      });

    } catch (error) {
      console.error('翻译失败:', error);
      alert(`翻译失败: ${error.message}`);
      
      dispatch({
        type: ActionTypes.UPDATE_CHAPTER,
        payload: {
          index: chapterIndex,
          updates: { status: ChapterStatus.UNTRANSLATED }
        }
      });
    } finally {
      setTranslating(false);
      setCurrentTranslating(-1);
    }
  };

  const handleTranslateAll = async () => {
    for (let i = 0; i < state.chapters.length; i++) {
      if (state.chapters[i].status === ChapterStatus.UNTRANSLATED) {
        await handleTranslateChapter(i);
        // 添加延迟避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  };

  // 自动翻译全文（无需人工监督）
  const handleAutoTranslateAll = async () => {
    setAutoTranslating(true);
    setPauseRequested(false);
    
    const untranslatedChapters = state.chapters.map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => ch.status === ChapterStatus.UNTRANSLATED || ch.status === ChapterStatus.TRANSLATING);
    
    const totalToTranslate = untranslatedChapters.length;
    
    if (totalToTranslate === 0) {
      alert('所有章节都已翻译完成！');
      setAutoTranslating(false);
      return;
    }

    setTranslationProgress({ current: 0, total: totalToTranslate });

    try {
      for (let i = 0; i < untranslatedChapters.length; i++) {
        // 检查是否请求暂停
        if (pauseRequested) {
          alert(`⏸️ 翻译已暂停\n\n已完成 ${i} / ${totalToTranslate} 章节\n进度已自动保存。`);
          break;
        }

        const { idx } = untranslatedChapters[i];
        const chapter = state.chapters[idx];
        
        setCurrentTranslating(idx);
        setTranslationProgress({ current: i + 1, total: totalToTranslate });

        try {
          // 更新状态为翻译中
          dispatch({
            type: ActionTypes.UPDATE_CHAPTER,
            payload: {
              index: idx,
              updates: { status: ChapterStatus.TRANSLATING }
            }
          });

          // 翻译文本
          const { translatedHtml, translatedText } = await translateHtmlPreserveMarkup({
            html: chapter.originalHtml,
            sourceLang,
            targetLang,
            apiKey: state.apiKey,
            modelProvider: state.modelProvider,
            glossary: state.glossary,
          });

          // 调用审校智能体（可选，失败不影响流程）
          let reviewData = null;
          try {
            reviewData = await reviewTranslation(
              chapter.originalText,
              translatedText,
              state.glossary,
              state.styleGuide
            );
          } catch (reviewError) {
            console.warn(`章节 ${idx + 1} 审校失败，跳过审校:`, reviewError);
          }

          // 更新章节数据（自动确认为已翻译状态）
          dispatch({
            type: ActionTypes.UPDATE_CHAPTER,
            payload: {
              index: idx,
              updates: {
                translatedText,
                translatedHtml,
                reviewData,
                status: ChapterStatus.TRANSLATED // 自动标记为已翻译
              }
            }
          });

          // 每章翻译完成后自动保存进度
          try {
            await saveProgress({
              chapters: state.chapters,
              glossary: state.glossary,
              styleGuide: state.styleGuide,
              epubMetadata: state.epubMetadata,
              epubResources: state.epubResources,
              epubFile: state.epubFile,
              currentChapterIndex: idx
            });
            console.log(`✅ 章节 ${idx + 1} 翻译完成，进度已保存`);
          } catch (saveError) {
            console.error('保存进度失败:', saveError);
            // 保存失败不影响翻译继续
          }

          // 延迟避免 API 限流
          if (i < untranslatedChapters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }

        } catch (error) {
          console.error(`章节 ${idx + 1} 翻译失败:`, error);
          
          // 标记为未翻译，继续下一章
          dispatch({
            type: ActionTypes.UPDATE_CHAPTER,
            payload: {
              index: idx,
              updates: { 
                status: ChapterStatus.UNTRANSLATED,
                error: error.message 
              }
            }
          });

          // 询问是否继续
          const shouldContinue = window.confirm(
            `章节 ${idx + 1} 翻译失败：${error.message}\n\n是否继续翻译剩余章节？`
          );
          
          if (!shouldContinue) {
            alert(`⏹️ 翻译已停止\n\n已完成 ${i} / ${totalToTranslate} 章节\n进度已自动保存。`);
            break;
          }
        }
      }

      // 全部完成
      if (!pauseRequested && translationProgress.current === totalToTranslate) {
        // 最终保存一次
        await saveProgress({
          chapters: state.chapters,
          glossary: state.glossary,
          styleGuide: state.styleGuide,
          epubMetadata: state.epubMetadata,
          epubResources: state.epubResources,
          epubFile: state.epubFile,
          currentChapterIndex: state.chapters.length - 1
        });
        
        alert(`🎉 全文翻译完成！\n\n共翻译 ${totalToTranslate} 个章节\n进度已自动保存。`);
      }

    } catch (error) {
      console.error('自动翻译过程出错:', error);
      alert(`翻译过程出错: ${error.message}`);
    } finally {
      setAutoTranslating(false);
      setCurrentTranslating(-1);
      setPauseRequested(false);
      setTranslationProgress({ current: 0, total: 0 });
    }
  };

  // 暂停自动翻译
  const handlePauseAutoTranslate = () => {
    setPauseRequested(true);
  };

  const handleReviewChapter = (chapterIndex) => {
    dispatch({
      type: ActionTypes.SET_CURRENT_CHAPTER,
      payload: chapterIndex
    });
    onTranslate();
  };

  const completedCount = state.chapters.filter(
    ch => ch.status === ChapterStatus.APPROVED || ch.status === ChapterStatus.TRANSLATED
  ).length;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                {state.epubMetadata?.title || '未知书籍'}
              </h1>
              <p className="text-gray-600">
                进度: {completedCount} / {state.chapters.length} 章节已完成
              </p>
            </div>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              ← 返回
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-500"
              style={{ width: `${(completedCount / state.chapters.length) * 100}%` }}
            />
          </div>

          {/* Quick Actions */}
          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              onClick={() => setShowGlossary(!showGlossary)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
            >
              {showGlossary ? '隐藏术语表' : '📚 术语表管理'}
            </button>
            
            <button
              onClick={handleSaveProgress}
              disabled={saving || state.chapters.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-sm flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  保存中...
                </>
              ) : (
                <>💾 暂存进度</>
              )}
            </button>

            {!autoTranslating ? (
              <button
                onClick={handleAutoTranslateAll}
                disabled={translating || state.chapters.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition text-sm font-semibold flex items-center gap-2 shadow-lg"
              >
                <span>🚀</span>
                <span>自动翻译全文</span>
              </button>
            ) : (
              <button
                onClick={handlePauseAutoTranslate}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition text-sm font-semibold flex items-center gap-2 shadow-lg"
              >
                <span>⏸️</span>
                <span>暂停翻译</span>
              </button>
            )}
          </div>

          {/* Auto Translation Progress */}
          {autoTranslating && (
            <div className="mt-4 bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600"></div>
                  <span className="font-semibold text-orange-800">
                    自动翻译进行中...
                  </span>
                </div>
                <span className="text-sm text-orange-700 font-medium">
                  {translationProgress.current} / {translationProgress.total} 章节
                </span>
              </div>
              <div className="bg-white rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-orange-400 to-red-500 h-full transition-all duration-500"
                  style={{ width: `${(translationProgress.current / translationProgress.total) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-orange-600">
                💡 翻译完成后会自动保存进度，你可以关闭页面，下次继续。
              </p>
            </div>
          )}
        </div>

        {/* Glossary Manager */}
        {showGlossary && (
          <div className="mb-6">
            <GlossaryManager />
          </div>
        )}

        {/* Settings Panel */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="text-xl font-semibold">⚙️ 翻译设置</h2>
            <span>{showSettings ? '▲' : '▼'}</span>
          </button>
          
          {showSettings && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    源语言 {detectedLang && (
                      <span className="text-green-600 text-xs">
                        (已自动检测: {getLanguageName(detectedLang)})
                      </span>
                    )}
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                  {detectedLang && sourceLang !== detectedLang && (
                    <p className="mt-1 text-xs text-yellow-600">
                      ⚠️ 选择的语言与检测结果不同
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    目标语言
                  </label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleTranslateAll}
                  disabled={translating || autoTranslating}
                  className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-3 rounded-lg font-medium hover:from-green-700 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition"
                >
                  {translating ? '翻译进行中...' : '批量翻译（需逐章确认）'}
                </button>
                <p className="text-xs text-gray-500 text-center">
                  💡 提示：使用上方"🚀 自动翻译全文"可无需确认，自动保存进度
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chapter List */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 bg-gray-50 border-b">
            <h2 className="text-xl font-semibold">📑 章节列表</h2>
          </div>
          
          <div className="divide-y">
            {state.chapters.map((chapter, index) => (
              <div 
                key={chapter.id}
                className={`p-6 hover:bg-gray-50 transition ${
                  currentTranslating === index ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-gray-500 font-medium">#{index + 1}</span>
                      <h3 className="text-lg font-medium text-gray-800">
                        {chapter.title}
                      </h3>
                      {getStatusBadge(chapter.status)}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {chapter.originalText.substring(0, 150)}...
                    </p>
                    
                    {chapter.reviewData?.issues?.length > 0 && (
                      <div className="mt-2 text-sm text-yellow-700">
                        ⚠️ {chapter.reviewData.issues.length} 个需要关注的问题
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-6 flex gap-2">
                    {chapter.status === ChapterStatus.UNTRANSLATED && (
                      <button
                        onClick={() => handleTranslateChapter(index)}
                        disabled={translating}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-sm"
                      >
                        翻译
                      </button>
                    )}
                    
                    {(chapter.status === ChapterStatus.TRANSLATED || 
                      chapter.status === ChapterStatus.REVIEW_NEEDED ||
                      chapter.status === ChapterStatus.APPROVED) && (
                      <button
                        onClick={() => handleReviewChapter(index)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
                      >
                        审校
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Export Button */}
        {completedCount === state.chapters.length && completedCount > 0 && (
          <div className="mt-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 shadow-lg border-2 border-purple-200">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-purple-800 mb-3">
                🎉 翻译完成！
              </h3>
              <p className="text-gray-700 mb-4">
                所有章节已完成翻译，点击下方按钮进入导出页面
              </p>
              <button
                onClick={() => {
                  // hash 如果已经是 #export，单纯改 hash 不会触发 hashchange；这里直接切页保证有反应
                  window.location.hash = '#export';
                  onExport?.();
                }}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 transition shadow-lg text-lg"
              >
                📥 进入导出页面
              </button>
              <div className="mt-4 pt-4 border-t border-purple-200">
                <p className="text-sm text-gray-600 mb-2">
                  💡 导出页面可选择输出模式：
                </p>
                <div className="flex gap-4 justify-center text-sm">
                  <div className="bg-white px-4 py-2 rounded-lg">
                    <span className="font-semibold text-purple-700">📖 单语模式</span>
                    <span className="text-gray-600 ml-2">（只保留译文）</span>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-lg">
                    <span className="font-semibold text-purple-700">📚 双语对照</span>
                    <span className="text-gray-600 ml-2">（原文+译文交替）</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
