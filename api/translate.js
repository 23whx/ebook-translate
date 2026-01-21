/**
 * Vercel Serverless Function - Hugging Face TranslateGemma API 代理
 * 用于保护 API Token，不暴露到前端代码
 */

// ✅ Hugging Face 新 Inference 路由（旧 api-inference 已下线，返回 410 Gone）
// 注意：该模型页面目前显示 “This model isn't deployed by any Inference Provider.”
// 因此 router 的 hf-inference 路由可能返回 404。生产环境建议使用你自己部署的 Inference Endpoint。
const HF_ROUTER_API_URL = 'https://router.huggingface.co/hf-inference/models/google/translategemma-4b-it';

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 从环境变量或请求头获取 API Token
  const apiToken = process.env.HF_API_TOKEN || req.headers['x-hf-token'];
  
  if (!apiToken) {
    return res.status(401).json({ 
      error: 'API Token not provided',
      message: '请提供 Hugging Face API Token'
    });
  }

  try {
    const { text, sourceLang, targetLang, glossary } = req.body;

    // 验证必需参数
    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: '缺少必需参数：text, sourceLang 或 targetLang'
      });
    }

    // 构建提示词，包含术语表约束
    let prompt = text;
    if (glossary && Object.keys(glossary).length > 0) {
      const glossaryInstructions = Object.entries(glossary)
        .map(([source, target]) => `"${source}" → "${target}"`)
        .join(', ');
      prompt = `术语表: ${glossaryInstructions}\n\n原文: ${text}`;
    }

    // 构建 TranslateGemma 消息格式
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            source_lang_code: sourceLang,
            target_lang_code: targetLang,
            text: prompt
          }
        ]
      }
    ];

    // 优先使用你自己部署的 Inference Endpoint（最稳定，不依赖 Providers 是否托管该模型）
    // 在 Vercel 环境变量里配置：HF_INFERENCE_ENDPOINT_URL
    // 形如：https://xxxxxx.us-east-1.aws.endpoints.huggingface.cloud
    const endpointUrl = process.env.HF_INFERENCE_ENDPOINT_URL;
    const url = endpointUrl || HF_ROUTER_API_URL;

    // 调用 Hugging Face API / Endpoint
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
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
      const errorData = await response.json().catch(() => ({}));
      
      // 处理模型加载中的情况
      if (response.status === 503 && errorData.error?.includes('loading')) {
        const estimatedTime = errorData.estimated_time || 20;
        return res.status(503).json({
          error: 'Model loading',
          message: `模型正在加载中，预计等待 ${estimatedTime} 秒。请稍后重试。`,
          estimated_time: estimatedTime
        });
      }

      // 鉴权/授权问题（gated 模型常见）
      if (response.status === 401) {
        return res.status(401).json({
          error: 'Unauthorized',
          message:
            '鉴权失败(401)：请检查 Hugging Face Token 是否正确；并确保你已在模型页同意并获得访问权限（gated license）。',
        });
      }

      if (response.status === 403) {
        return res.status(403).json({
          error: 'Forbidden',
          message:
            '无法访问模型(403)：请确认你的账号已获得 gated 权限（模型页显示 “You have been granted access”），并确认 Token 没问题。',
        });
      }

      if (response.status === 404) {
        const provider = response.headers.get('x-inference-provider') || '';
        // Provider 路由 404：常见原因是“该模型未被任何 Inference Provider 托管”
        if (!endpointUrl && provider.includes('hf-inference')) {
          return res.status(404).json({
            error: 'NotFound',
            message:
              '模型调用返回 404：这通常不是你没同意条款，而是该模型目前未被 Hugging Face Inference Providers 托管（模型页右侧会显示 “This model isn\\'t deployed by any Inference Provider.”）。\\n\\n解决方案：到模型页点 Deploy → Inference Endpoints，自行创建一个 Endpoint；然后把该 Endpoint URL 配到 Vercel 环境变量 HF_INFERENCE_ENDPOINT_URL。',
          });
        }
        return res.status(404).json({
          error: 'NotFound',
          message:
            '模型调用返回 404：请检查 Endpoint URL 是否正确（如你配置了 HF_INFERENCE_ENDPOINT_URL），或确认该模型是否可通过 Providers 调用。',
        });
      }
      
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    
    // 处理不同的响应格式
    let translatedText;
    if (Array.isArray(result) && result.length > 0) {
      translatedText = result[0].generated_text || result[0].translation_text || text;
    } else if (result.generated_text) {
      translatedText = result.generated_text;
    } else if (result.translation_text) {
      translatedText = result.translation_text;
    } else {
      throw new Error('Unable to parse translation result');
    }

    // 返回翻译结果
    return res.status(200).json({ 
      translatedText,
      sourceLang,
      targetLang
    });

  } catch (error) {
    console.error('Translation API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      message: '翻译服务暂时不可用，请稍后重试'
    });
  }
}
