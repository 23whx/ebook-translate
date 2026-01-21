/**
 * Vercel Serverless Function - DeepSeek 翻译 API 代理
 * 用于保护 API Key，不暴露到前端代码
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * 构建翻译提示词
 */
function buildTranslationPrompt(text, sourceLang, targetLang, glossary = {}, previousContext = '') {
  const langMap = {
    'zh': '中文',
    'en': '英语',
    'ja': '日语',
    'ko': '韩语',
    'fr': '法语',
    'de': '德语',
    'es': '西班牙语',
    'ru': '俄语',
    'it': '意大利语',
    'pt': '葡萄牙语',
  };

  const sourceLangName = langMap[sourceLang] || sourceLang;
  const targetLangName = langMap[targetLang] || targetLang;

  let prompt = `你是一位专业的${sourceLangName}-${targetLangName}翻译专家。请将以下${sourceLangName}文本翻译成${targetLangName}。

## 翻译要求：
1. **准确性**：忠实原文，不遗漏、不添加内容
2. **流畅性**：译文要自然地道，符合${targetLangName}的表达习惯
3. **一致性**：专业术语必须前后统一
4. **术语标注**：对于专业术语（技术词汇、专有名词等），首次出现时必须在译文后用括号标注原文，格式为"译文（原文）"

`;

  // 添加术语表（如果有）
  if (glossary && Object.keys(glossary).length > 0) {
    prompt += `## 必须遵守的术语表：\n`;
    for (const [source, target] of Object.entries(glossary)) {
      prompt += `- "${source}" 必须翻译为 "${target}"\n`;
    }
    prompt += '\n';
  }

  // 添加前文上下文（用于保持术语一致性）
  if (previousContext) {
    prompt += `## 前文摘要（保持术语一致）：\n${previousContext}\n\n`;
  }

  prompt += `## 待翻译文本：\n${text}\n\n`;

  prompt += `## 输出要求：
- 只输出译文，不要包含任何解释、说明或其他内容
- 保持原文的段落结构和格式
- 专业术语首次出现时加上英文标注`;

  return prompt;
}

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 从环境变量获取 API Key
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'API Key not configured',
      message: 'DeepSeek API Key 未在服务器端配置'
    });
  }

  try {
    const { text, sourceLang, targetLang, glossary, previousContext } = req.body;

    // 验证必需参数
    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: '缺少必需参数：text, sourceLang 或 targetLang'
      });
    }

    // 构建翻译 prompt
    const prompt = buildTranslationPrompt(
      text,
      sourceLang,
      targetLang,
      glossary || {},
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
            content: '你是一位专业的翻译专家，擅长准确、流畅地翻译各类文本，并能保持术语的前后一致性。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // 处理常见错误
      if (response.status === 401) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'DeepSeek API 认证失败，请检查服务器端 API Key 配置'
        });
      }

      if (response.status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'API 请求频率超限，请稍后重试'
        });
      }
      
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    
    // 提取翻译结果
    if (result.choices && result.choices.length > 0) {
      const translatedText = result.choices[0].message.content.trim();
      
      return res.status(200).json({ 
        translatedText,
        sourceLang,
        targetLang
      });
    }
    
    throw new Error('无法解析 DeepSeek API 返回结果');

  } catch (error) {
    console.error('Translation API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      message: '翻译服务暂时不可用，请稍后重试'
    });
  }
}
