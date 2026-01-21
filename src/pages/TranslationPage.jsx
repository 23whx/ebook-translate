import React, { useState, useEffect } from 'react';
import { useApp, ChapterStatus } from '../context/AppContext';

export default function TranslationPage({ onBack, hfToken }) {
  const { state, dispatch, ActionTypes } = useApp();
  const currentChapter = state.chapters[state.currentChapterIndex];
  
  const [editedTranslation, setEditedTranslation] = useState('');
  const [showOriginal, setShowOriginal] = useState(true);
  const [appliedFixes, setAppliedFixes] = useState(new Set());

  useEffect(() => {
    if (currentChapter?.translatedText) {
      setEditedTranslation(currentChapter.translatedText);
    }
  }, [currentChapter]);

  if (!currentChapter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">未选择章节</p>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回章节列表
          </button>
        </div>
      </div>
    );
  }

  const handleApplyFix = (fix, index) => {
    const newText = editedTranslation.replace(fix.original, fix.replace_with);
    setEditedTranslation(newText);
    setAppliedFixes(prev => new Set([...prev, index]));
  };

  const handleApprove = () => {
    dispatch({
      type: ActionTypes.UPDATE_CHAPTER,
      payload: {
        index: state.currentChapterIndex,
        updates: {
          translatedText: editedTranslation,
          translatedHtml: `<div>${editedTranslation.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}</div>`,
          status: ChapterStatus.APPROVED
        }
      }
    });
    onBack();
  };

  const handleReject = () => {
    if (confirm('确定要重新翻译此章节吗？当前翻译将被丢弃。')) {
      dispatch({
        type: ActionTypes.UPDATE_CHAPTER,
        payload: {
          index: state.currentChapterIndex,
          updates: {
            translatedText: null,
            translatedHtml: null,
            reviewData: null,
            status: ChapterStatus.UNTRANSLATED
          }
        }
      });
      onBack();
    }
  };

  const hasIssues = currentChapter.reviewData?.issues?.length > 0;
  const hasFixes = currentChapter.reviewData?.suggested_fixes?.length > 0;

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                审校章节 #{state.currentChapterIndex + 1}
              </h1>
              <p className="text-gray-600">{currentChapter.title}</p>
            </div>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              ← 返回列表
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm"
            >
              {showOriginal ? '隐藏原文' : '显示原文'}
            </button>
          </div>
        </div>

        {/* Review Summary */}
        {currentChapter.reviewData && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🤖 AI 审校报告</h2>
            
            {/* Overall Comment */}
            {currentChapter.reviewData.overall_comment && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-gray-700">{currentChapter.reviewData.overall_comment}</p>
              </div>
            )}

            {/* Issues */}
            {hasIssues && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2">发现的问题:</h3>
                <div className="space-y-2">
                  {currentChapter.reviewData.issues.map((issue, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                      <span className="text-yellow-600 mt-1">⚠️</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded">
                            {issue.type}
                          </span>
                          {issue.location && (
                            <span className="text-sm text-gray-600">{issue.location}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Fixes */}
            {hasFixes && (
              <div>
                <h3 className="font-semibold mb-2">建议修改:</h3>
                <div className="space-y-3">
                  {currentChapter.reviewData.suggested_fixes.map((fix, index) => (
                    <div key={index} className="p-4 bg-green-50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div>
                            <span className="text-xs font-medium text-gray-500">原文:</span>
                            <p className="text-sm text-red-700 line-through">{fix.original}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-500">建议:</span>
                            <p className="text-sm text-green-700 font-medium">{fix.replace_with}</p>
                          </div>
                          {fix.reason && (
                            <p className="text-xs text-gray-600">💡 {fix.reason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleApplyFix(fix, index)}
                          disabled={appliedFixes.has(index)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-sm whitespace-nowrap"
                        >
                          {appliedFixes.has(index) ? '已应用' : '应用'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!hasIssues && !hasFixes && (
              <div className="p-4 bg-green-50 rounded-lg text-green-700">
                ✓ 翻译质量良好，未发现明显问题
              </div>
            )}
          </div>
        )}

        {/* Content Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Original Text */}
          {showOriginal && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">📄 原文</h2>
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {currentChapter.originalText}
                </div>
              </div>
            </div>
          )}

          {/* Translated Text */}
          <div className={`bg-white rounded-xl shadow-lg p-6 ${!showOriginal ? 'lg:col-span-2' : ''}`}>
            <h2 className="text-lg font-semibold mb-4 text-gray-700">✏️ 译文（可编辑）</h2>
            <textarea
              value={editedTranslation}
              onChange={(e) => setEditedTranslation(e.target.value)}
              className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-serif"
              placeholder="翻译文本..."
            />
            <div className="mt-2 text-sm text-gray-500">
              字数: {editedTranslation.length}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center">
            <button
              onClick={handleReject}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
            >
              重新翻译
            </button>
            
            <button
              onClick={handleApprove}
              className="px-8 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition font-medium shadow-lg"
            >
              ✓ 确认并保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
