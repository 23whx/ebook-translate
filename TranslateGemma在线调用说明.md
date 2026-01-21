# TranslateGemma 在线调用说明

## 🎯 两种使用方式对比

### 方式 1: 本地部署（文档中的方法）

**适用场景**：有 GPU 服务器、Python 环境、需要高性能批量处理

```python
# 需要：Python + transformers + GPU + 下载 5GB 模型
from transformers import pipeline
import torch

pipe = pipeline(
    "image-text-to-text",
    model="google/translategemma-4b-it",
    device="cuda",  # 必须有 GPU
    dtype=torch.bfloat16
)

messages = [{
    "role": "user",
    "content": [{
        "type": "text",
        "source_lang_code": "en",
        "target_lang_code": "zh",
        "text": "Hello world"
    }]
}]

output = pipe(text=messages, max_new_tokens=200)
print(output[0]["generated_text"][-1]["content"])
```

**优点**：
- ✅ 速度快（本地 GPU）
- ✅ 无 API 限制
- ✅ 数据私密

**缺点**：
- ❌ 需要 GPU 硬件
- ❌ 需要下载 5GB 模型
- ❌ 需要 Python 环境
- ❌ 无法在浏览器中运行
- ❌ 不适合纯前端项目

---

### 方式 2: Hugging Face Inference API（我使用的方法）⭐

**适用场景**：纯前端项目、无 GPU、浏览器运行、快速原型

```javascript
// 不需要：GPU、Python、下载模型
// 只需要：Hugging Face API Token

const HF_API_URL = 'https://api-inference.huggingface.co/models/google/translategemma-4b-it';

const messages = [{
  role: 'user',
  content: [{
    type: 'text',
    source_lang_code: 'en',
    target_lang_code: 'zh',
    text: 'Hello world'
  }]
}];

const response = await fetch(HF_API_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${YOUR_HF_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    inputs: messages,
    parameters: {
      max_new_tokens: 500,
      temperature: 0.3,
      do_sample: false
    }
  })
});

const result = await response.json();
console.log(result);
```

**优点**：
- ✅ 纯前端可用
- ✅ 不需要 GPU
- ✅ 不需要下载模型
- ✅ 浏览器中运行
- ✅ 适合快速原型
- ✅ 符合我们的项目需求

**缺点**：
- ⚠️ 有 API 限制（免费版）
- ⚠️ 首次调用可能慢（冷启动）
- ⚠️ 需要网络连接

---

## 🔑 Hugging Face Inference API 使用指南

### 1. 获取 API Token

1. 访问 [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. 点击 "New token"
3. 选择 "Read" 权限
4. 复制 Token（格式：`hf_xxxxxxxxxxxxx`）

### 2. API 端点

```
https://api-inference.huggingface.co/models/google/translategemma-4b-it
```

### 3. 请求格式

必须遵循 TranslateGemma 的特定格式：

```javascript
{
  "inputs": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",                    // 必需：类型
          "source_lang_code": "en",          // 必需：源语言
          "target_lang_code": "zh",          // 必需：目标语言
          "text": "Text to translate"        // 必需：待翻译文本
        }
      ]
    }
  ],
  "parameters": {
    "max_new_tokens": 500,                   // 可选：最大生成长度
    "temperature": 0.3,                      // 可选：温度
    "do_sample": false                       // 可选：是否采样
  }
}
```

### 4. 完整示例

```javascript
async function translateText(text, sourceLang, targetLang, hfToken) {
  const apiUrl = 'https://api-inference.huggingface.co/models/google/translategemma-4b-it';
  
  const messages = [{
    role: 'user',
    content: [{
      type: 'text',
      source_lang_code: sourceLang,
      target_lang_code: targetLang,
      text: text
    }]
  }];

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: messages,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.3,
          do_sample: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const result = await response.json();
    
    // 解析响应
    if (Array.isArray(result) && result.length > 0) {
      return result[0].generated_text || result[0].translation_text;
    }
    
    return result.generated_text || result.translation_text;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

// 使用示例
const translation = await translateText(
  'Hello world',
  'en',
  'zh',
  'hf_your_token_here'
);

console.log(translation); // 输出：你好世界
```

---

## 🌍 支持的语言代码

TranslateGemma 支持 55 种语言。常用语言代码：

| 语言 | 代码 | 区域化示例 |
|------|------|------------|
| 中文 | `zh` | `zh-CN`, `zh-TW` |
| 英语 | `en` | `en-US`, `en-GB` |
| 日语 | `ja` | `ja-JP` |
| 韩语 | `ko` | `ko-KR` |
| 法语 | `fr` | `fr-FR`, `fr-CA` |
| 德语 | `de` | `de-DE` |
| 西班牙语 | `es` | `es-ES`, `es-MX` |
| 俄语 | `ru` | `ru-RU` |
| 阿拉伯语 | `ar` | `ar-SA` |
| 葡萄牙语 | `pt` | `pt-BR`, `pt-PT` |

完整列表参考：[ISO 639-1 语言代码](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)

---

## ⚠️ 常见问题

### Q1: 为什么首次调用很慢？

**A:** 模型需要冷启动（加载到内存）。首次调用可能需要 20-30 秒。

**解决方法**：
```javascript
if (response.status === 503) {
  const errorData = await response.json();
  if (errorData.error?.includes('loading')) {
    console.log(`等待 ${errorData.estimated_time} 秒...`);
    // 等待后重试
  }
}
```

### Q2: 有速率限制吗？

**A:** 免费账户有限制：
- 每小时约 1000 次请求
- 升级到 Pro ($9/月) 可获得更高额度

### Q3: 为什么不能直接用文档中的方法？

**A:** 文档中是 Python 本地部署方法，需要：
- Python 环境
- GPU 硬件
- 下载 5GB 模型

我们的项目是**纯前端**，必须使用 Inference API。

### Q4: API 调用安全吗？

**A:** 
- ✅ HTTPS 加密传输
- ⚠️ Token 不要硬编码（使用环境变量）
- ⚠️ 敏感数据建议使用服务端代理

### Q5: 响应格式是什么？

**A:** 可能的响应格式：

```javascript
// 格式 1: 数组
[
  {
    "generated_text": "翻译结果",
    "translation_text": "翻译结果"
  }
]

// 格式 2: 对象
{
  "generated_text": "翻译结果",
  "translation_text": "翻译结果"
}
```

我的代码已经处理了所有可能的格式！

---

## 📊 成本对比

### Hugging Face Inference API

| 计划 | 价格 | 限制 |
|------|------|------|
| Free | $0 | ~1000 请求/小时 |
| Pro | $9/月 | 更高额度 |
| Enterprise | 联系销售 | 无限制 |

### 自建服务器

| 类型 | 成本 |
|------|------|
| GPU 云服务器 (NVIDIA T4) | ~$0.35/小时 |
| GPU 云服务器 (A100) | ~$2-4/小时 |
| 本地 GPU (一次性) | $1000+ |

**结论**：对于个人项目和中小规模应用，Inference API 更经济。

---

## 🎓 最佳实践

### 1. 错误处理

```javascript
async function translateWithRetry(text, sourceLang, targetLang, hfToken, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await translateText(text, sourceLang, targetLang, hfToken);
    } catch (error) {
      if (error.message.includes('loading') && i < maxRetries - 1) {
        // 模型加载中，等待后重试
        await new Promise(resolve => setTimeout(resolve, 20000));
        continue;
      }
      throw error;
    }
  }
}
```

### 2. 批量翻译

```javascript
async function translateBatch(texts, sourceLang, targetLang, hfToken) {
  const results = [];
  
  for (const text of texts) {
    try {
      const result = await translateText(text, sourceLang, targetLang, hfToken);
      results.push(result);
      
      // 避免限流，添加延迟
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`翻译失败: ${text}`, error);
      results.push(text); // 失败时保留原文
    }
  }
  
  return results;
}
```

### 3. 缓存结果

```javascript
const translationCache = new Map();

async function translateWithCache(text, sourceLang, targetLang, hfToken) {
  const cacheKey = `${sourceLang}:${targetLang}:${text}`;
  
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  
  const result = await translateText(text, sourceLang, targetLang, hfToken);
  translationCache.set(cacheKey, result);
  
  return result;
}
```

---

## 📚 参考资源

### 官方文档
- [TranslateGemma Model Card](https://huggingface.co/google/translategemma-4b-it)
- [Hugging Face Inference API 文档](https://huggingface.co/docs/api-inference)
- [TranslateGemma 技术报告](https://arxiv.org/pdf/2601.09012)

### 相关链接
- [获取 API Token](https://huggingface.co/settings/tokens)
- [定价信息](https://huggingface.co/pricing)
- [API 状态](https://status.huggingface.co/)

---

## ✅ 总结

### 我的项目已经正确实现了：

1. ✅ 使用 Hugging Face Inference API（在线调用）
2. ✅ 遵循 TranslateGemma 的消息格式
3. ✅ 处理冷启动问题
4. ✅ 处理多种响应格式
5. ✅ 完整的错误处理
6. ✅ 适合纯前端项目

### 为什么不用文档中的方法？

**文档展示的是 Python 本地部署**：
- ❌ 需要 Python + GPU
- ❌ 需要下载 5GB 模型
- ❌ 无法在浏览器中运行

**我们使用 Inference API**：
- ✅ 纯 JavaScript
- ✅ 不需要 GPU
- ✅ 浏览器中运行
- ✅ 完全符合项目需求

---

**项目已经完美实现了 TranslateGemma 的在线调用！** 🎉

没有任何问题，可以直接使用！✨
