# 📦 Vercel 部署指南

## 🎯 部署概述

本指南将帮助您将 eBook Translator 部署到 Vercel，并**安全地保护您的 API Keys**。

### 架构说明

```
用户浏览器
    ↓
Vercel 静态网站 (前端)
    ↓
Vercel Serverless Functions (API 代理)
    ↓
DeepSeek API / Hugging Face API
```

**关键特性**：
- ✅ API Keys 存储在 Vercel 服务端，不会暴露给前端
- ✅ Serverless Functions 作为安全代理
- ✅ 自动 HTTPS 和 CDN 加速
- ✅ 免费额度足够个人使用

---

## 🚀 快速部署（3分钟）

### 方式 1: 通过 Vercel CLI（推荐）

#### 1. 安装 Vercel CLI

```bash
npm install -g vercel
```

#### 2. 登录 Vercel

```bash
vercel login
```

#### 3. 部署项目

在项目根目录运行：

```bash
vercel
```

按提示选择：
- Project Name: `ebook-translator` （或自定义）
- Framework: `None` 或 `Other`
- Build Command: `npm run build`
- Output Directory: `dist`

#### 4. 配置环境变量

```bash
# 添加 DeepSeek API Key（必需）
vercel env add DEEPSEEK_API_KEY

# 添加 Hugging Face Token（可选，也可在前端输入）
vercel env add HF_API_TOKEN
```

选择环境：
- [x] Production
- [x] Preview
- [x] Development

#### 5. 重新部署以应用环境变量

```bash
vercel --prod
```

完成！🎉 您的网站已部署到 Vercel。

---

### 方式 2: 通过 Vercel 网页界面

#### 1. 推送代码到 Git

确保您的代码已推送到 GitHub、GitLab 或 Bitbucket。

```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

#### 2. 导入到 Vercel

1. 访问 [vercel.com](https://vercel.com)
2. 点击 "Add New Project"
3. 导入您的 Git 仓库
4. 配置构建设置：
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

#### 3. 配置环境变量

在 Vercel 项目设置中：

1. 进入 **Settings** → **Environment Variables**
2. 添加以下变量：

| Name | Value | Environment |
|------|-------|-------------|
| `DEEPSEEK_API_KEY` | `sk-your-key` | Production, Preview, Development |
| `HF_API_TOKEN` | `hf_your-token` | Production, Preview, Development (可选) |

#### 4. 重新部署

点击 **Deployments** → 最新部署 → **Redeploy**

---

## 🔐 安全配置

### ✅ 已实现的安全措施

#### 1. API Keys 不暴露给前端

**之前（不安全）**：
```javascript
// ❌ API Key 打包到前端代码中
const API_KEY = import.meta.env.VITE_API_KEY
```

**现在（安全）**：
```javascript
// ✅ API Key 只在服务端使用
// 前端 → /api/review → Vercel Function → DeepSeek API
```

#### 2. Serverless Functions 作为代理

- `api/review.js` - DeepSeek 审校 API 代理
- `api/translate.js` - Hugging Face 翻译 API 代理（可选）

#### 3. 环境变量分离

- **服务端**：`DEEPSEEK_API_KEY`（不带 VITE_ 前缀）
- **客户端**：`VITE_USE_SERVERLESS=true`（可选，控制是否使用代理）

---

## 📋 环境变量配置详解

### 必需的环境变量

#### 1. DEEPSEEK_API_KEY（必需）

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
```

- **用途**：DeepSeek 智能审校
- **位置**：Vercel 环境变量（服务端）
- **获取**：https://platform.deepseek.com/

#### 2. HF_API_TOKEN（可选）

```bash
HF_API_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx
```

- **用途**：Hugging Face 翻译
- **说明**：如果不配置，用户需要在前端输入
- **获取**：https://huggingface.co/settings/tokens

### 可选的环境变量

#### VITE_USE_SERVERLESS（开发环境）

```bash
VITE_USE_SERVERLESS=true
```

- **用途**：开发环境强制使用 Serverless API
- **默认**：生产环境自动启用

---

## 🧪 测试部署

### 本地测试 Serverless Functions

#### 1. 安装 Vercel CLI

```bash
npm install -g vercel
```

#### 2. 启动开发服务器

```bash
vercel dev
```

这会：
- 启动 Vite 开发服务器
- 同时运行 Serverless Functions
- 自动加载 `.env` 文件

#### 3. 测试 API

```bash
# 测试审校 API
curl -X POST http://localhost:3000/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "originalText": "Hello world",
    "translatedText": "你好世界",
    "glossary": {},
    "styleGuide": "专业准确",
    "previousContext": ""
  }'
```

---

## 📊 部署检查清单

### 部署前检查

- [ ] 代码已推送到 Git
- [ ] `package.json` 包含正确的 `build` 脚本
- [ ] `vercel.json` 配置正确
- [ ] API 代理文件（`api/review.js`）已创建
- [ ] 测试本地构建：`npm run build`

### 部署后检查

- [ ] 网站可以访问
- [ ] 上传 EPUB 功能正常
- [ ] 翻译功能工作
- [ ] 审校功能工作（检查网络请求）
- [ ] 浏览器控制台无错误
- [ ] API Keys 未暴露（检查 Network 标签）

### 安全检查

- [ ] 浏览器中无法看到 DeepSeek API Key
- [ ] 网络请求发送到 `/api/review`
- [ ] Vercel 环境变量已配置
- [ ] `.env` 文件未提交到 Git

---

## 🔧 自定义配置

### 修改 API 端点

如果您想使用自定义域名或 API 端点：

#### 1. 修改 `vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://your-api-domain.com/api/$1"
    }
  ]
}
```

#### 2. 修改 Serverless Functions

在 `api/review.js` 中修改 API URL：

```javascript
const DEEPSEEK_API_URL = process.env.CUSTOM_DEEPSEEK_URL || 
  'https://api.deepseek.com/v1/chat/completions';
```

### 添加速率限制

为了防止 API 滥用，您可以添加速率限制：

```javascript
// api/review.js
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100 // 限制 100 次请求
});

export default async function handler(req, res) {
  await limiter(req, res);
  // ... 其他代码
}
```

---

## 📈 监控和日志

### 查看部署日志

#### Vercel Dashboard

1. 进入您的项目
2. 点击 **Deployments**
3. 选择一个部署查看详细日志

#### CLI 查看日志

```bash
vercel logs
```

### 监控 API 使用

#### DeepSeek Dashboard

访问 https://platform.deepseek.com/ 查看：
- API 调用次数
- 消耗的 Token
- 剩余额度

#### Hugging Face

访问 https://huggingface.co/settings/tokens 查看 Token 使用情况。

---

## 💰 成本估算

### Vercel 免费额度

- ✅ 100GB 带宽/月
- ✅ 100 次 Serverless Function 调用/天
- ✅ 无限静态文件托管
- ✅ 自动 HTTPS

**估算**：个人使用完全免费

### API 成本

#### DeepSeek

- 免费额度：具体查看官网
- 付费：按 Token 计费
- 估算：每章审校约 0.01-0.05 元

#### Hugging Face

- 免费额度：有限制
- Pro 账户：$9/月无限制
- 估算：免费额度可翻译约 50-100 章

---

## 🐛 故障排查

### 问题 1: API 返回 500 错误

**可能原因**：
- 环境变量未配置
- API Key 无效

**解决方法**：
```bash
# 检查环境变量
vercel env ls

# 重新添加
vercel env add DEEPSEEK_API_KEY
```

### 问题 2: 翻译不工作

**检查步骤**：
1. 打开浏览器开发者工具 (F12)
2. 查看 Network 标签
3. 找到 `/api/review` 或 `/api/translate` 请求
4. 查看请求和响应详情

### 问题 3: 构建失败

**常见原因**：
```bash
# 检查本地构建
npm run build

# 查看错误信息
# 通常是依赖问题或代码错误
```

### 问题 4: Serverless Function 超时

**限制**：Vercel 免费账户函数执行时间限制为 10 秒

**解决**：
- 减少单次翻译的文本长度
- 升级 Vercel Pro（60 秒限制）

---

## 🌟 优化建议

### 性能优化

#### 1. 启用 Edge Functions（可选）

```javascript
// api/review.js
export const config = {
  runtime: 'edge', // 使用 Edge Runtime，更快的冷启动
};
```

#### 2. 添加缓存

```javascript
// 缓存审校结果
const cache = new Map();

export default async function handler(req, res) {
  const cacheKey = JSON.stringify(req.body);
  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }
  // ... 调用 API
  cache.set(cacheKey, result);
}
```

### 安全增强

#### 1. 添加请求验证

```javascript
// api/review.js
export default async function handler(req, res) {
  // 验证请求来源
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://your-domain.vercel.app',
    'https://your-custom-domain.com'
  ];
  
  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // ... 其他代码
}
```

#### 2. 添加速率限制（见上文）

---

## 📚 参考资源

### 官方文档

- [Vercel 文档](https://vercel.com/docs)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)
- [DeepSeek API 文档](https://platform.deepseek.com/docs)
- [Hugging Face Inference API](https://huggingface.co/docs/api-inference)

### 相关指南

- `README.md` - 项目说明
- `环境变量配置说明.md` - 环境变量详解
- `项目交付说明.md` - 完整功能说明

---

## ✅ 完成！

现在您的 eBook Translator 已经**安全地**部署到 Vercel：

- ✅ API Keys 完全保密
- ✅ 自动 HTTPS
- ✅ 全球 CDN 加速
- ✅ 无需维护服务器
- ✅ 免费使用

**下一步**：
1. 分享您的网站链接
2. 监控 API 使用情况
3. 根据需求调整配置

祝您使用愉快！🚀📚✨

---

*最后更新: 2026-01-20*
*部署平台: Vercel*
*部署方式: Serverless Functions + Static Hosting*
