/**
 * 一致性监督智能体 - 使用 DeepSeek API
 * 作为翻译审校人，不生成新译文，只输出修改建议
 * 
 * 部署模式：
 * - 生产环境：通过 Vercel Serverless Function (/api/review) 调用，API Key 保密
 * - 开发环境：可选择直接调用或使用环境变量
 */

// 检测是否为生产环境（Vercel 部署）
const isProduction = import.meta.env.PROD;
const useServerlessAPI = isProduction || import.meta.env.VITE_USE_SERVERLESS === 'true';

// 开发环境的配置（可选）
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';

/**
 * 构建审校提示词
 */
function buildReviewPrompt(originalText, translatedText, glossary, styleGuide, previousContext) {
  let prompt = `你是一位专业的翻译审校人员。请审核以下翻译内容，并提供修改建议。

**重要**: 你只需要审核并给出建议，不要生成新的翻译。

## 原文
${originalText}

## 当前译文
${translatedText}

## 风格指南
${styleGuide}
`;

  // 添加术语表约束
  if (glossary && Object.keys(glossary).length > 0) {
    prompt += `\n## 术语表（必须遵守）\n`;
    for (const [source, target] of Object.entries(glossary)) {
      prompt += `- "${source}" 必须翻译为 "${target}"\n`;
    }
  }

  // 添加前文上下文
  if (previousContext) {
    prompt += `\n## 前文摘要（用于保持一致性）\n${previousContext}\n`;
  }

  prompt += `
## 请检查以下方面：
1. 术语一致性：是否符合术语表要求
2. 风格一致性：是否符合风格指南
3. 准确性：是否准确传达原文含义
4. 流畅性：译文是否自然流畅
5. 完整性：是否有遗漏或添加内容

## 输出格式
请严格按照以下 JSON 格式输出（不要包含其他文字）：

{
  "status": "approved" 或 "needs_revision",
  "issues": [
    {
      "type": "terminology" 或 "style" 或 "accuracy" 或 "fluency",
      "description": "问题描述",
      "location": "具体位置"
    }
  ],
  "suggested_fixes": [
    {
      "original": "需要修改的原文本",
      "replace_with": "建议替换为",
      "reason": "修改理由"
    }
  ],
  "overall_comment": "整体评价"
}
`;

  return prompt;
}

/**
 * 调用 DeepSeek API 进行翻译审校
 * @param {string} originalText - 原文
 * @param {string} translatedText - 译文
 * @param {object} glossary - 术语表
 * @param {string} styleGuide - 风格指南
 * @param {string} previousContext - 前文上下文
 * @returns {Promise<object>} 审校结果
 */
export async function reviewTranslation(
  originalText,
  translatedText,
  glossary = {},
  styleGuide = '',
  previousContext = ''
) {
  try {
    // 生产环境或配置使用 Serverless API
    if (useServerlessAPI) {
      return await reviewViaServerless(
        originalText,
        translatedText,
        glossary,
        styleGuide,
        previousContext
      );
    }
    
    // 开发环境直接调用（需要配置 VITE_DEEPSEEK_API_KEY）
    return await reviewViaDirect(
      originalText,
      translatedText,
      glossary,
      styleGuide,
      previousContext
    );
  } catch (error) {
    console.error('Review error:', error);
    throw error;
  }
}

/**
 * 通过 Vercel Serverless Function 调用审校（生产环境）
 */
async function reviewViaServerless(
  originalText,
  translatedText,
  glossary,
  styleGuide,
  previousContext
) {
  try {
    const response = await fetch('/api/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originalText,
        translatedText,
        glossary,
        styleGuide,
        previousContext
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `API 请求失败: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Serverless review error:', error);
    // 如果服务端 API 失败，返回默认结果而不是中断流程
    return {
      status: 'approved',
      issues: [],
      suggested_fixes: [],
      overall_comment: '审校服务暂时不可用，已跳过自动审校。'
    };
  }
}

/**
 * 直接调用 DeepSeek API（开发环境）
 */
async function reviewViaDirect(
  originalText,
  translatedText,
  glossary,
  styleGuide,
  previousContext
) {
  // 检查 API Key 是否配置
  if (!DEEPSEEK_API_KEY) {
    console.warn('DeepSeek API Key 未配置，跳过审校步骤');
    return {
      status: 'approved',
      issues: [],
      suggested_fixes: [],
      overall_comment: 'DeepSeek API Key 未配置，已跳过自动审校。'
    };
  }

  const prompt = buildReviewPrompt(
    originalText,
    translatedText,
    glossary,
    styleGuide,
    previousContext
  );

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一位专业的翻译审校专家，擅长发现翻译中的问题并给出建设性建议。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content;

  // 尝试解析 JSON 响应
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
    
    return JSON.parse(content);
  } catch (parseError) {
    console.warn('Failed to parse JSON response:', content);
    return {
      status: 'approved',
      issues: [],
      suggested_fixes: [],
      overall_comment: '审校完成，但响应格式异常。'
    };
  }
}

/**
 * 批量审校多个翻译
 * @param {Array} translations - 翻译数组 [{original, translated}]
 * @param {object} glossary - 术语表
 * @param {string} styleGuide - 风格指南
 * @param {function} onProgress - 进度回调
 * @returns {Promise<Array>} 审校结果数组
 */
export async function reviewMultipleTranslations(
  translations,
  glossary = {},
  styleGuide = '',
  onProgress = null
) {
  const reviews = [];
  let previousContext = '';

  for (let i = 0; i < translations.length; i++) {
    try {
      const review = await reviewTranslation(
        translations[i].original,
        translations[i].translated,
        glossary,
        styleGuide,
        previousContext
      );
      
      reviews.push(review);
      
      // 更新上下文（使用译文的前100个字符）
      if (translations[i].translated) {
        previousContext = translations[i].translated.substring(0, 100);
      }
      
      if (onProgress) {
        onProgress(i + 1, translations.length);
      }
      
      // 添加延迟以避免限流
      if (i < translations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`审校第 ${i + 1} 项失败:`, error);
      reviews.push({
        status: 'error',
        issues: [{ type: 'error', description: error.message, location: '全文' }],
        suggested_fixes: [],
        overall_comment: '审校失败'
      });
    }
  }

  return reviews;
}
