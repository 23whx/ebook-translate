import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import HomePage from './pages/HomePage';
import ChapterListPage from './pages/ChapterListPage';
import TranslationPage from './pages/TranslationPage';
import ExportPage from './pages/ExportPage';
import { loadProgress } from './services/progressStorage';

function AppInner() {
  const { state, dispatch, ActionTypes } = useApp();
  const [currentPage, setCurrentPage] = useState('home');

  const goTo = (page) => {
    setCurrentPage(page);
    if (page === 'export') {
      if (window.location.hash !== '#export') window.location.hash = '#export';
    } else {
      if (window.location.hash === '#export') {
        // 清掉 hash，避免回到章节页后再点“进入导出页面”因为 hash 不变而无反应
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  };

  const tryAutoRestore = async () => {
    // 只有当内存状态为空时才自动恢复，避免覆盖用户当前会话
    if (state.chapters && state.chapters.length > 0) return;
    const saved = await loadProgress();
    if (!saved || !saved.chapters || saved.chapters.length === 0) return;

    dispatch({ type: ActionTypes.SET_CHAPTERS, payload: saved.chapters });
    dispatch({ type: ActionTypes.UPDATE_GLOSSARY, payload: saved.glossary || {} });
    dispatch({ type: ActionTypes.UPDATE_STYLE_GUIDE, payload: saved.styleGuide || '' });
    dispatch({
      type: ActionTypes.SET_EPUB,
      payload: {
        file: null,
        metadata: saved.epubMetadata || null,
        resources: saved.epubResources || [],
      },
    });
    if (typeof saved.currentChapterIndex === 'number' && saved.currentChapterIndex >= 0) {
      dispatch({ type: ActionTypes.SET_CURRENT_CHAPTER, payload: saved.currentChapterIndex });
    }
  };

  // 监听 hash 变化用于导出页面跳转
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#export') {
        setCurrentPage('export');
        // 用户直接打开 /#export 时自动恢复进度
        void tryAutoRestore();
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    // 初次加载也处理一次（用户直接进 /#export）
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNext={() => goTo('chapters')} />;
      case 'chapters':
        return (
          <ChapterListPage
            onBack={() => goTo('home')}
            onTranslate={() => goTo('translate')}
            onExport={() => goTo('export')}
          />
        );
      case 'translate':
        return <TranslationPage onBack={() => goTo('chapters')} />;
      case 'export':
        return <ExportPage onBack={() => goTo('chapters')} onHome={() => goTo('home')} />;
      default:
        return <HomePage onNext={() => goTo('chapters')} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {renderPage()}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}

export default App;
