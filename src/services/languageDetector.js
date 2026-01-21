/**
 * 语言检测服务
 * 使用启发式方法检测文本语言
 */

/**
 * 支持的语言列表
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'zh', name: '中文', nativeName: '中文' },
  { code: 'zh-CN', name: '中文（简体）', nativeName: '简体中文' },
  { code: 'zh-TW', name: '中文（繁体）', nativeName: '繁體中文' },
  { code: 'en', name: '英语', nativeName: 'English' },
  { code: 'ja', name: '日语', nativeName: '日本語' },
  { code: 'ko', name: '韩语', nativeName: '한국어' },
  { code: 'fr', name: '法语', nativeName: 'Français' },
  { code: 'de', name: '德语', nativeName: 'Deutsch' },
  { code: 'es', name: '西班牙语', nativeName: 'Español' },
  { code: 'ru', name: '俄语', nativeName: 'Русский' },
  { code: 'it', name: '意大利语', nativeName: 'Italiano' },
  { code: 'pt', name: '葡萄牙语', nativeName: 'Português' },
  { code: 'ar', name: '阿拉伯语', nativeName: 'العربية' },
  { code: 'hi', name: '印地语', nativeName: 'हिन्दी' },
  { code: 'th', name: '泰语', nativeName: 'ไทย' },
  { code: 'vi', name: '越南语', nativeName: 'Tiếng Việt' }
];

/**
 * 语言检测规则（基于字符范围）
 */
const LANGUAGE_PATTERNS = {
  // CJK 统一表意文字（中文、日文汉字、韩文汉字）
  zh: /[\u4e00-\u9fff]/,
  // 平假名和片假名（日语）
  ja: /[\u3040-\u309f\u30a0-\u30ff]/,
  // 韩文字母
  ko: /[\uac00-\ud7af\u1100-\u11ff]/,
  // 西里尔字母（俄语）
  ru: /[\u0400-\u04ff]/,
  // 阿拉伯字母
  ar: /[\u0600-\u06ff]/,
  // 天城文（印地语）
  hi: /[\u0900-\u097f]/,
  // 泰文
  th: /[\u0e00-\u0e7f]/,
  // 拉丁字母（英语、法语、德语、西班牙语等）
  latin: /[a-zA-Z]/
};

/**
 * 检测文本语言
 * @param {string} text - 待检测文本
 * @param {number} sampleLength - 采样长度（默认 500 字符）
 * @returns {string} 检测到的语言代码
 */
export function detectLanguage(text, sampleLength = 500) {
  if (!text || text.trim().length === 0) {
    return 'en'; // 默认英语
  }

  // 取样本文本（前面部分）
  const sample = text.substring(0, sampleLength);
  
  // 计算各语言特征字符数量
  const scores = {
    zh: 0,
    ja: 0,
    ko: 0,
    ru: 0,
    ar: 0,
    hi: 0,
    th: 0,
    latin: 0
  };

  // 统计各类字符
  for (const char of sample) {
    if (LANGUAGE_PATTERNS.zh.test(char)) scores.zh++;
    if (LANGUAGE_PATTERNS.ja.test(char)) scores.ja++;
    if (LANGUAGE_PATTERNS.ko.test(char)) scores.ko++;
    if (LANGUAGE_PATTERNS.ru.test(char)) scores.ru++;
    if (LANGUAGE_PATTERNS.ar.test(char)) scores.ar++;
    if (LANGUAGE_PATTERNS.hi.test(char)) scores.hi++;
    if (LANGUAGE_PATTERNS.th.test(char)) scores.th++;
    if (LANGUAGE_PATTERNS.latin.test(char)) scores.latin++;
  }

  // 中日韩特殊处理（因为都可能包含汉字）
  if (scores.zh > 0 || scores.ja > 0 || scores.ko > 0) {
    // 如果有韩文字母，优先判定为韩语
    if (scores.ko > 5) {
      return 'ko';
    }
    // 如果有假名，判定为日语
    if (scores.ja > 5) {
      return 'ja';
    }
    // 汉字为主且没有假名，判定为中文
    if (scores.zh > 10) {
      return 'zh';
    }
  }

  // 其他语言判定
  if (scores.ru > 10) return 'ru';
  if (scores.ar > 10) return 'ar';
  if (scores.hi > 10) return 'hi';
  if (scores.th > 10) return 'th';
  
  // 拉丁字母系语言（英法德西意葡等）
  if (scores.latin > 20) {
    // 更细致的检测可以通过常用词判断
    return detectLatinLanguage(sample);
  }

  // 默认返回英语
  return 'en';
}

/**
 * 检测拉丁字母语言
 * @param {string} text - 文本样本
 * @returns {string} 语言代码
 */
function detectLatinLanguage(text) {
  const lowerText = text.toLowerCase();
  
  // 法语特征词
  const frenchWords = ['le ', 'la ', 'les ', 'un ', 'une ', 'des ', 'du ', 'de ', 'et ', 'est ', 'pour ', 'dans '];
  const frenchCount = frenchWords.filter(word => lowerText.includes(word)).length;
  
  // 德语特征词
  const germanWords = ['der ', 'die ', 'das ', 'den ', 'dem ', 'des ', 'ein ', 'eine ', 'und ', 'ist ', 'für ', 'von '];
  const germanCount = germanWords.filter(word => lowerText.includes(word)).length;
  
  // 西班牙语特征词
  const spanishWords = ['el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'de ', 'y ', 'en ', 'es ', 'por ', 'para '];
  const spanishCount = spanishWords.filter(word => lowerText.includes(word)).length;
  
  // 意大利语特征词
  const italianWords = ['il ', 'lo ', 'la ', 'i ', 'gli ', 'le ', 'un ', 'una ', 'di ', 'e ', 'è ', 'per '];
  const italianCount = italianWords.filter(word => lowerText.includes(word)).length;
  
  // 葡萄牙语特征词
  const portugueseWords = ['o ', 'a ', 'os ', 'as ', 'um ', 'uma ', 'de ', 'e ', 'em ', 'é ', 'para ', 'do '];
  const portugueseCount = portugueseWords.filter(word => lowerText.includes(word)).length;
  
  // 英语特征词
  const englishWords = ['the ', 'a ', 'an ', 'and ', 'or ', 'is ', 'are ', 'was ', 'were ', 'of ', 'to ', 'in '];
  const englishCount = englishWords.filter(word => lowerText.includes(word)).length;
  
  // 比较得分
  const maxScore = Math.max(frenchCount, germanCount, spanishCount, italianCount, portugueseCount, englishCount);
  
  if (frenchCount === maxScore && frenchCount > 2) return 'fr';
  if (germanCount === maxScore && germanCount > 2) return 'de';
  if (spanishCount === maxScore && spanishCount > 2) return 'es';
  if (italianCount === maxScore && italianCount > 2) return 'it';
  if (portugueseCount === maxScore && portugueseCount > 2) return 'pt';
  if (englishCount === maxScore && englishCount > 2) return 'en';
  
  // 默认英语
  return 'en';
}

/**
 * 批量检测章节语言
 * @param {Array} chapters - 章节数组
 * @returns {string} 最可能的语言代码
 */
export function detectBookLanguage(chapters) {
  if (!chapters || chapters.length === 0) {
    return 'en';
  }

  // 取前 3 章进行检测
  const sampleChapters = chapters.slice(0, Math.min(3, chapters.length));
  const detections = sampleChapters.map(chapter => 
    detectLanguage(chapter.originalText || '', 1000)
  );

  // 找出最常见的语言
  const langCounts = {};
  detections.forEach(lang => {
    langCounts[lang] = (langCounts[lang] || 0) + 1;
  });

  const mostCommon = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return mostCommon ? mostCommon[0] : 'en';
}

/**
 * 获取语言的显示名称
 * @param {string} code - 语言代码
 * @returns {string} 语言名称
 */
export function getLanguageName(code) {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang ? `${lang.name} (${lang.nativeName})` : code;
}

/**
 * 验证语言代码是否支持
 * @param {string} code - 语言代码
 * @returns {boolean}
 */
export function isLanguageSupported(code) {
  return SUPPORTED_LANGUAGES.some(l => l.code === code);
}
