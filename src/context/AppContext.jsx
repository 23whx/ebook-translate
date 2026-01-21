import React, { createContext, useContext, useReducer } from 'react';

// 章节状态枚举
export const ChapterStatus = {
  UNTRANSLATED: 'UNTRANSLATED',
  TRANSLATING: 'TRANSLATING',
  TRANSLATED: 'TRANSLATED',
  REVIEW_NEEDED: 'REVIEW_NEEDED',
  APPROVED: 'APPROVED'
};

// 初始状态
const initialState = {
  chapters: [],
  glossary: {}, // { "source": "target" }
  currentChapterIndex: -1,
  styleGuide: '请使用专业、准确的翻译风格，保持原文的语气和格调。',
  epubFile: null,
  epubMetadata: null,
  epubResources: [], // 新增：存储图片、CSS、字体等资源文件
  // API 配置（用户自己的 API Key）
  apiKey: localStorage.getItem('user_api_key') || '',
  modelProvider: localStorage.getItem('model_provider') || 'deepseek', // deepseek, openai, claude, gemini, kimi
  isProcessing: false,
  error: null
};

// Action 类型
const ActionTypes = {
  SET_EPUB: 'SET_EPUB',
  SET_CHAPTERS: 'SET_CHAPTERS',
  UPDATE_CHAPTER: 'UPDATE_CHAPTER',
  SET_CURRENT_CHAPTER: 'SET_CURRENT_CHAPTER',
  UPDATE_GLOSSARY: 'UPDATE_GLOSSARY',
  UPDATE_STYLE_GUIDE: 'UPDATE_STYLE_GUIDE',
  SET_RESOURCES: 'SET_RESOURCES', // 新增：设置资源文件
  SET_API_CONFIG: 'SET_API_CONFIG', // 新增：设置 API 配置
  SET_PROCESSING: 'SET_PROCESSING',
  SET_ERROR: 'SET_ERROR',
  RESET: 'RESET'
};

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_EPUB:
      return {
        ...state,
        epubFile: action.payload.file,
        epubMetadata: action.payload.metadata,
        epubResources: action.payload.resources || []
      };
    
    case ActionTypes.SET_CHAPTERS:
      return {
        ...state,
        chapters: action.payload
      };
    
    case ActionTypes.SET_RESOURCES:
      return {
        ...state,
        epubResources: action.payload
      };
    
    case ActionTypes.SET_API_CONFIG:
      // 同时保存到 localStorage
      if (action.payload.apiKey !== undefined) {
        localStorage.setItem('user_api_key', action.payload.apiKey);
      }
      if (action.payload.modelProvider !== undefined) {
        localStorage.setItem('model_provider', action.payload.modelProvider);
      }
      return {
        ...state,
        apiKey: action.payload.apiKey !== undefined ? action.payload.apiKey : state.apiKey,
        modelProvider: action.payload.modelProvider !== undefined ? action.payload.modelProvider : state.modelProvider
      };
    
    case ActionTypes.UPDATE_CHAPTER:
      return {
        ...state,
        chapters: state.chapters.map((chapter, index) =>
          index === action.payload.index
            ? { ...chapter, ...action.payload.updates }
            : chapter
        )
      };
    
    case ActionTypes.SET_CURRENT_CHAPTER:
      return {
        ...state,
        currentChapterIndex: action.payload
      };
    
    case ActionTypes.UPDATE_GLOSSARY:
      return {
        ...state,
        glossary: { ...state.glossary, ...action.payload }
      };
    
    case ActionTypes.UPDATE_STYLE_GUIDE:
      return {
        ...state,
        styleGuide: action.payload
      };
    
    case ActionTypes.SET_PROCESSING:
      return {
        ...state,
        isProcessing: action.payload
      };
    
    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload
      };
    
    case ActionTypes.RESET:
      return initialState;
    
    default:
      return state;
  }
}

// Context
const AppContext = createContext();

// Provider Component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch, ActionTypes }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
