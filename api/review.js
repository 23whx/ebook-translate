/**
 * Vercel Serverless Function - DeepSeek API 代理
 * 用于保护 API Key，不暴露到前端代码
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 从环境变量获取 API Key（服务端，不会暴露给前端）
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'DeepSeek API Key not configured',
      message: '服务端未配置 API Key，请联系管理员'
    });
  }

  try {
    const { originalText, translatedText, glossary, styleGuide, previousContext } = req.body;

    // 验证必需参数
    if (!originalText || !translatedText) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: '缺少必需参数：originalText 或 translatedText'
      });
    }

    // 构建审校提示词
    const prompt = buildReviewPrompt(
      originalText,
      translatedText,
      glossary || {},
      styleGuide || '',
      previousContext || ''
    );

    // 调用 DeepSeek API
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;

    // 解析 JSON 响应
    let reviewResult;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        reviewResult = JSON.parse(jsonStr);
      } else {
        reviewResult = JSON.parse(content);
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON response:', content);
      reviewResult = {
        status: 'approved',
        issues: [],
        suggested_fixes: [],
        overall_comment: '审校完成，但响应格式异常。'
      };
    }

    // 返回审校结果
    return res.status(200).json(reviewResult);

  } catch (error) {
    console.error('Review API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      message: '审校服务暂时不可用，请稍后重试'
    });
  }
}

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
