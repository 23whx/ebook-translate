/**
 * 翻译引擎 - 支持多种大模型（用户使用自己的 API Key）
 * 提供章节级翻译，保持术语一致性，专业术语自动标注英文
 */

import { translateWithProvider } from './modelProviders';


/**
 * 翻译文本（核心函数）
 * @param {string} text - 待翻译文本
 * @param {string} sourceLang - 源语言代码
 * @param {string} targetLang - 目标语言代码
 * @param {string} apiKey - 用户的 API Key
 * @param {string} modelProvider - 模型提供商
 * @param {object} glossary - 术语表
 * @param {string} previousContext - 前文上下文
 * @returns {Promise<string>} 翻译后的文本
 */
export async function translateText(
  text,
  sourceLang,
  targetLang,
  apiKey,
  modelProvider = 'deepseek',
  glossary = {},
  previousContext = ''
) {
  try {
    return await translateWithProvider(
      modelProvider,
      apiKey,
      text,
      sourceLang,
      targetLang,
      glossary,
      previousContext
    );
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}


/**
 * 批量翻译段落
 * @param {string[]} paragraphs - 段落数组
 * @param {string} sourceLang - 源语言
 * @param {string} targetLang - 目标语言
 * @param {string} apiKey - API Key
 * @param {string} modelProvider - 模型提供商
 * @param {object} glossary - 术语表
 * @param {function} onProgress - 进度回调
 * @returns {Promise<string[]>} 翻译结果数组
 */
export async function translateParagraphs(
  paragraphs,
  sourceLang,
  targetLang,
  apiKey,
  modelProvider,
  glossary = {},
  onProgress = null
) {
  const results = [];
  let previousContext = '';
  
  for (let i = 0; i < paragraphs.length; i++) {
    try {
      const translated = await translateText(
        paragraphs[i],
        sourceLang,
        targetLang,
        apiKey,
        modelProvider,
        glossary,
        previousContext
      );
      results.push(translated);
      
      previousContext = translated.substring(0, 200);
      
      if (onProgress) {
        onProgress(i + 1, paragraphs.length);
      }
      
      if (i < paragraphs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } catch (error) {
      console.error(`翻译段落 ${i + 1} 失败:`, error);
      results.push(paragraphs[i]);
    }
  }
  
  return results;
}

/**
 * 翻译整个章节
 * @param {object} chapter - 章节对象 {title, content}
 * @param {string} sourceLang - 源语言
 * @param {string} targetLang - 目标语言
 * @param {string} apiKey - API Key
 * @param {string} modelProvider - 模型提供商
 * @param {object} glossary - 术语表
 * @param {function} onProgress - 进度回调
 * @returns {Promise<object>} 翻译后的章节
 */
export async function translateChapter(
  chapter,
  sourceLang,
  targetLang,
  apiKey,
  modelProvider,
  glossary = {},
  onProgress = null
) {
  try {
    const translatedTitle = await translateText(
      chapter.title,
      sourceLang,
      targetLang,
      apiKey,
      modelProvider,
      glossary,
      ''
    );
    
    if (onProgress) {
      onProgress(0.1);
    }
    
    const paragraphs = chapter.content.split(/\n\n+/);
    const translatedParagraphs = [];
    let previousContext = translatedTitle;
    
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].trim()) {
        const translated = await translateText(
          paragraphs[i],
          sourceLang,
          targetLang,
          apiKey,
          modelProvider,
          glossary,
          previousContext
        );
        translatedParagraphs.push(translated);
        
        previousContext = translated.substring(0, 200);
        
        if (onProgress) {
          const contentProgress = 0.1 + (0.9 * (i + 1) / paragraphs.length);
          onProgress(contentProgress);
        }
        
        if (i < paragraphs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } else {
        translatedParagraphs.push('');
      }
    }
    
    return {
      title: translatedTitle,
      content: translatedParagraphs.join('\n\n'),
      originalTitle: chapter.title,
      originalContent: chapter.content
    };
  } catch (error) {
    console.error('Chapter translation error:', error);
    throw error;
  }
}
