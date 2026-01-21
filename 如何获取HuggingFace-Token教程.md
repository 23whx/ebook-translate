# 📖 如何获取 Hugging Face Access Token 完整教程

## 🎯 为什么需要 Token？

### 什么是 Hugging Face Token？

Hugging Face Token 是一个**访问凭证**，就像您的账号密码一样，用来证明"您有权使用 Hugging Face 的 API 服务"。

### 为什么我们的项目需要它？

在我们的 eBook Translator 项目中：

```
用户浏览器
    ↓ (需要 Token 来证明身份)
Hugging Face API
    ↓
TranslateGemma 翻译模型
    ↓
返回翻译结果
```

**不使用 Token** ❌
- 无法调用 API
- 无法使用翻译功能
- 项目无法工作

**使用 Token** ✅
- 可以调用 Hugging Face 托管的 TranslateGemma 模型
- 不需要自己的 GPU 服务器
- 不需要下载 5GB 的模型文件
- 在浏览器中直接翻译

### Token 是免费的吗？

✅ **是的，完全免费！**

Hugging Face 提供免费的 Inference API 额度：
- 免费账户：约 1000 次请求/小时
- 足够个人使用
- 升级到 Pro ($9/月) 可获得更高额度

---

## 📋 获取 Token 完整步骤

### 准备工作

您需要：
- ✅ 一个 Hugging Face 账号（免费注册）
- ✅ 一个浏览器
- ✅ 5 分钟时间

---

## 第一步：访问 Hugging Face 网站

### 1.1 打开浏览器

访问以下网址：

```
https://huggingface.co/
```

或者直接访问：

```
https://huggingface.co/settings/tokens
```

### 1.2 如果您还没有账号

点击右上角的 **"Sign Up"**（注册）按钮：

**注册信息**：
- Email（邮箱）
- Username（用户名）
- Password（密码）

✅ 注册是**完全免费**的！

### 1.3 如果您已有账号

点击右上角的 **"Log In"**（登录）按钮，输入：
- Email 或 Username
- Password

---

## 第二步：进入 Token 设置页面

### 2.1 登录后

有两种方式到达 Token 设置页面：

**方式 A：通过菜单**
1. 点击右上角的头像
2. 选择 **"Settings"**（设置）
3. 在左侧菜单找到 **"Access Tokens"**
4. 点击进入

**方式 B：直接访问**（推荐）

直接访问这个网址：

```
https://huggingface.co/settings/tokens
```

### 2.2 您会看到

页面标题：**"Access Tokens"**

如果您之前创建过 Token，会显示列表。

---

## 第三步：创建新的 Token

### 3.1 点击"New token"按钮

在页面右上角或中间，找到并点击：

```
🔑 New token
```

或者

```
➕ Create new token
```

### 3.2 进入创建页面

页面标题显示：**"Create new Access Token"**

---

## 第四步：配置 Token 设置（重要！）

### 4.1 选择 Token 类型

您会看到三个选项：

```
◯ Fine-grained    ⚫ Read    ◯ Write
```

**请选择**：⚫ **Read** （点击它）

#### 为什么选 Read？

| Token 类型 | 权限 | 是否推荐 | 原因 |
|-----------|------|---------|------|
| **Read** | 只读 | ✅ **推荐** | 安全，够用 |
| Write | 读写 | ❌ 不推荐 | 权限过大，不安全 |
| Fine-grained | 细粒度 | ❌ 不需要 | 太复杂，不需要 |

**Read 类型足够我们使用翻译功能！**

### 4.2 输入 Token 名称

在 **"Token name"** 输入框中输入一个名字，例如：

```
translategemma-api
```

或者：

```
ebook-translator
```

或者：

```
my-translation-app
```

**注意**：
- 名字可以随便起
- 只是帮您识别这个 Token 的用途
- 建议起一个有意义的名字

### 4.3 Token 类型确认

您会看到说明文字（灰色字）：

```
This token has read-only access to all your and your orgs 
resources and can make calls to Inference Providers on 
your behalf. It can also be used to open pull requests 
and comment on discussions.
```

这段话的意思是：
- ✅ 这个 Token 有只读权限
- ✅ 可以调用 Inference Providers（这就是我们需要的！）
- ✅ 可以用于 API 调用

**完美！这正是我们需要的！**

### 4.4 ⚠️ 重要提示

页面上会显示：

```
⚠️ This cannot be changed after token creation.
```

意思是：Token 创建后无法修改类型

**不用担心**：选择 "Read" 就对了！

---

## 第五步：创建 Token

### 5.1 点击创建按钮

滚动到页面底部，点击：

```
🔑 Create token
```

按钮通常是蓝色的。

### 5.2 等待创建

几秒钟后，页面会跳转或刷新。

---

## 第六步：复制您的 Token（最重要！）

### 6.1 Token 显示

创建成功后，页面会显示您的 Token：

```
Token: hf_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

**格式特点**：
- 以 `hf_` 开头
- 后面跟着一串随机字符
- 总长度约 40-50 个字符

### 6.2 ⚠️ 立即复制！（非常重要）

**关键提醒**：

```
⚠️ Token 只显示一次！
⚠️ 关闭页面后就无法再看到！
⚠️ 如果丢失，只能删除重新创建！
```

**如何复制**：

**方式 A：点击复制按钮**
- Token 旁边通常有一个 📋 复制按钮
- 点击它，Token 会自动复制到剪贴板

**方式 B：手动选择复制**
1. 用鼠标选中整个 Token
2. 右键 → "复制"
3. 或者按 `Ctrl+C` (Windows) / `Cmd+C` (Mac)

### 6.3 保存 Token

**临时保存**（现在立即使用）：
- 复制后直接粘贴到我们的应用中

**永久保存**（以后也能用）：
1. 打开记事本或其他文本编辑器
2. 粘贴 Token
3. 保存文件到安全的地方
4. **不要分享给别人！**

### 6.4 验证复制成功

在记事本中粘贴，确认格式：

```
✅ 正确格式：
hf_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890

❌ 错误格式：
Token: hf_...（不要包含 "Token:" 文字）
hf_AbC...（不完整）
```

---

## 第七步：在我们的应用中使用 Token

### 7.1 打开应用

访问：

```
http://localhost:3000
```

### 7.2 输入 Token

在首页找到：

```
┌─────────────────────────────────────────┐
│ Hugging Face API Token                  │
│ ┌─────────────────────────────────────┐ │
│ │ hf_...                              │ │
│ └─────────────────────────────────────┘ │
│              [验证] 按钮                 │
└─────────────────────────────────────────┘
```

**操作**：
1. 点击输入框
2. 粘贴您刚才复制的 Token（`Ctrl+V` 或 `Cmd+V`）
3. 点击 **"验证"** 按钮

### 7.3 验证成功

如果看到：

```
✓ Token 有效
```

**恭喜！Token 配置成功！** 🎉

### 7.4 如果验证失败

显示：

```
✗ Token 无效
```

**可能原因**：
1. Token 复制不完整（检查是否以 `hf_` 开头）
2. 复制时包含了多余的空格或文字
3. Token 已被删除或失效

**解决方法**：
- 重新复制 Token（确保完整）
- 或者回到 Hugging Face 重新创建一个

---

## 第八步：开始使用

### 8.1 上传 EPUB

Token 验证成功后：
1. 点击或拖拽上传 EPUB 文件
2. 等待解析完成
3. 点击 **"开始翻译"**

### 8.2 翻译设置

在章节列表页面：
1. 展开 **"⚙️ 翻译设置"**
2. Token 应该已经自动填入
3. 选择源语言和目标语言
4. 点击 **"翻译"** 或 **"批量翻译所有章节"**

### 8.3 享受翻译

✅ 一切就绪！开始翻译您的电子书吧！

---

## 🔒 Token 安全须知

### ✅ 应该做的

- ✅ 保存 Token 在安全的地方
- ✅ 定期更换 Token（可选）
- ✅ 如果怀疑泄露，立即删除并重新创建

### ❌ 不应该做的

- ❌ **不要**分享 Token 给别人
- ❌ **不要**上传 Token 到 GitHub
- ❌ **不要**在公开场合展示 Token
- ❌ **不要**在截图中包含完整 Token

### 🛡️ 如果 Token 泄露了

**立即操作**：
1. 访问 https://huggingface.co/settings/tokens
2. 找到泄露的 Token
3. 点击 **"Delete"**（删除）
4. 创建一个新的 Token
5. 在应用中更新为新 Token

---

## ❓ 常见问题

### Q1: Token 会过期吗？

**A:** 默认不会过期，但是：
- 如果您删除了 Token，它会失效
- 如果您修改了账号密码，Token 可能失效
- Hugging Face 有权撤销 Token（极少发生）

### Q2: 我可以创建多个 Token 吗？

**A:** 可以！
- 不同项目可以用不同 Token
- 方便管理和撤销
- 建议每个应用一个 Token

### Q3: Read 类型的 Token 够用吗？

**A:** 完全够用！
- ✅ 可以调用 Inference API
- ✅ 可以使用 TranslateGemma 模型
- ✅ 权限足够且安全

### Q4: 我忘记保存 Token 了怎么办？

**A:** 只能重新创建：
1. 回到 https://huggingface.co/settings/tokens
2. 删除旧的 Token（如果记得名字）
3. 创建新的 Token
4. 这次记得保存！

### Q5: Token 有使用次数限制吗？

**A:** 有速率限制：
- 免费账户：约 1000 次请求/小时
- Pro 账户 ($9/月)：更高额度
- 对于个人使用完全够用

### Q6: 如何查看 Token 的使用情况？

**A:** 
1. 访问 https://huggingface.co/settings/tokens
2. 查看 Token 列表
3. 点击 Token 名称
4. 可以看到最后使用时间等信息

### Q7: Token 可以用于其他项目吗？

**A:** 可以！
- 只要项目需要调用 Hugging Face API
- Read 类型 Token 适用于大多数情况
- 注意保护好 Token

---

## 📊 完整流程图

```
开始
  ↓
访问 huggingface.co/settings/tokens
  ↓
登录账号（如果还没登录）
  ↓
点击 "New token" 按钮
  ↓
选择 Token 类型: Read ⚫
  ↓
输入 Token 名称
  ↓
点击 "Create token" 按钮
  ↓
⚠️ 立即复制 Token！⚠️
  ↓
保存 Token 到安全的地方
  ↓
在我们的应用中粘贴 Token
  ↓
点击 "验证" 按钮
  ↓
✓ Token 有效
  ↓
开始翻译！ 🎉
```

---

## 🎓 总结

### 关键步骤（5步）

1. **访问** https://huggingface.co/settings/tokens
2. **创建** 新 Token（选择 Read 类型）
3. **复制** Token（⚠️ 只显示一次！）
4. **粘贴** 到我们的应用中
5. **验证** 成功后开始使用

### 重要提醒

- ⚠️ Token 只显示一次，立即保存！
- ✅ 选择 "Read" 类型就够用
- 🔒 不要分享 Token 给别人
- 💰 完全免费，无需付费

---

## 📞 需要帮助？

如果您在获取 Token 过程中遇到问题：

### 问题排查

1. **无法访问 Hugging Face**
   - 检查网络连接
   - 尝试使用 VPN

2. **Token 验证失败**
   - 确认 Token 完整复制（以 hf_ 开头）
   - 检查是否有多余空格
   - 重新创建一个试试

3. **忘记保存 Token**
   - 删除旧 Token
   - 重新创建新 Token

### 联系支持

- Hugging Face 官方文档：https://huggingface.co/docs
- Hugging Face 论坛：https://discuss.huggingface.co/

---

## 🎉 完成！

现在您已经知道如何获取和使用 Hugging Face Token 了！

**下一步**：
1. ✅ 获取 Token
2. ✅ 在应用中验证
3. ✅ 上传 EPUB
4. ✅ 开始翻译

**祝您使用愉快！** 📚✨🚀

---

*最后更新: 2026-01-20*
*难度级别: ⭐⭐☆☆☆ (简单)*
*预计时间: 5 分钟*
