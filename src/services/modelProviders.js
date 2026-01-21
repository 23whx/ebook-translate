/**
 * 多模型提供商支持
 * 支持用户使用自己的 API Key 调用不同的大模型
 */

// 模型提供商配置
export const MODEL_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    requiresKey: true,
    tokenName: 'API Key',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
  },
  openai: {
    name: 'OpenAI (GPT)',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini', // 使用更经济的模型
    requiresKey: true,
    tokenName: 'API Key',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  claude: {
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20241022',
    requiresKey: true,
    tokenName: 'API Key',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
    headers: { 'anthropic-version': '2023-06-01' }
  },
  gemini: {
    name: 'Google (Gemini)',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash',
    requiresKey: true,
    tokenName: 'API Key',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefix: '',
    useQueryParam: true // Gemini 使用 query 参数传 key
  },
  kimi: {
    name: 'Moonshot (Kimi)',
    apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    requiresKey: true,
    tokenName: 'API Key',
    getKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    keyPrefix: 'sk-',
  },
};

/**
 * 构建翻译提示词
 */
function buildTranslationPrompt(text, sourceLang, targetLang, glossary = {}, previousContext = '') {
  const langMap = {
    'zh': '中文', 'en': '英语', 'ja': '日语', 'ko': '韩语',
    'fr': '法语', 'de': '德语', 'es': '西班牙语', 'ru': '俄语',
  };

  const sourceLangName = langMap[sourceLang] || sourceLang;
  const targetLangName = langMap[targetLang] || targetLang;

  let prompt = `你是一位专业的${sourceLangName}-${targetLangName}翻译专家。请将以下${sourceLangName}文本翻译成${targetLangName}。

## 翻译要求：
1. **准确性**：忠实原文，不遗漏、不添加内容
2. **流畅性**：译文要自然地道，符合${targetLangName}的表达习惯
3. **一致性**：专业术语必须前后统一
4. **术语标注**：对于专业术语（技术词汇、专有名词等），首次出现时必须在译文后用括号标注原文，格式为"译文（原文）"
5. **格式**：不要输出 Markdown（例如 **加粗**、__下划线__、代码块、# 标题 等）；只输出纯文本

`;

  if (glossary && Object.keys(glossary).length > 0) {
    prompt += `## 必须遵守的术语表：\n`;
    for (const [source, target] of Object.entries(glossary)) {
      prompt += `- "${source}" 必须翻译为 "${target}"\n`;
    }
    prompt += '\n';
  }

  if (previousContext) {
    prompt += `## 前文摘要（保持术语一致）：\n${previousContext}\n\n`;
  }

  prompt += `## 待翻译文本：\n${text}\n\n`;
  prompt += `## 输出要求：\n- 只输出译文，不要包含任何解释、说明或其他内容\n- 保持原文的段落结构和格式\n- 专业术语首次出现时加上英文标注`;

  return prompt;
}

/**
 * 调用 OpenAI 兼容的 API（适用于 DeepSeek, OpenAI, Kimi）
 */
async function callOpenAICompatibleAPI(provider, apiKey, text, sourceLang, targetLang, glossary, previousContext) {
  const config = MODEL_PROVIDERS[provider];
  const prompt = buildTranslationPrompt(text, sourceLang, targetLang, glossary, previousContext);

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
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
    throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`);
  }

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

/**
 * 调用 Claude API
 */
async function callClaudeAPI(apiKey, text, sourceLang, targetLang, glossary, previousContext) {
  const config = MODEL_PROVIDERS.claude;
  const prompt = buildTranslationPrompt(text, sourceLang, targetLang, glossary, previousContext);

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': config.headers['anthropic-version'],
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Claude API 请求失败: ${response.status}`);
  }

  const result = await response.json();
  return result.content[0].text.trim();
}

/**
 * 调用 Gemini API
 */
async function callGeminiAPI(apiKey, text, sourceLang, targetLang, glossary, previousContext) {
  const config = MODEL_PROVIDERS.gemini;
  const prompt = buildTranslationPrompt(text, sourceLang, targetLang, glossary, previousContext);

  const url = `${config.apiUrl}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000,
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API 请求失败: ${response.status}`);
  }

  const result = await response.json();
  return result.candidates[0].content.parts[0].text.trim();
}

/**
 * 统一的翻译接口
 * @param {string} provider - 模型提供商
 * @param {string} apiKey - 用户的 API Key
 * @param {string} text - 待翻译文本
 * @param {string} sourceLang - 源语言
 * @param {string} targetLang - 目标语言
 * @param {object} glossary - 术语表
 * @param {string} previousContext - 前文上下文
 * @returns {Promise<string>} 翻译结果
 */
export async function translateWithProvider(
  provider,
  apiKey,
  text,
  sourceLang,
  targetLang,
  glossary = {},
  previousContext = ''
) {
  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }

  if (!MODEL_PROVIDERS[provider]) {
    throw new Error(`不支持的模型提供商: ${provider}`);
  }

  try {
    switch (provider) {
      case 'deepseek':
      case 'openai':
      case 'kimi':
        return await callOpenAICompatibleAPI(provider, apiKey, text, sourceLang, targetLang, glossary, previousContext);
      
      case 'claude':
        return await callClaudeAPI(apiKey, text, sourceLang, targetLang, glossary, previousContext);
      
      case 'gemini':
        return await callGeminiAPI(apiKey, text, sourceLang, targetLang, glossary, previousContext);
      
      default:
        throw new Error(`未实现的模型提供商: ${provider}`);
    }
  } catch (error) {
    console.error(`${MODEL_PROVIDERS[provider].name} 翻译失败:`, error);
    throw error;
  }
}

/**
 * 验证 API Key 格式
 */
export function validateAPIKey(provider, apiKey) {
  if (!apiKey) return false;
  
  const config = MODEL_PROVIDERS[provider];
  if (!config) return false;

  // 检查前缀
  if (config.keyPrefix && !apiKey.startsWith(config.keyPrefix)) {
    return false;
  }

  // 基本长度检查
  return apiKey.length > 20;
}
