/**
 * 进度存储服务 - 使用 IndexedDB 持久化翻译进度
 * 支持保存和恢复翻译状态
 */

const DB_NAME = 'EbookTranslatorDB';
const DB_VERSION = 1;
const STORE_NAME = 'translationProgress';
const PROGRESS_KEY = 'currentProgress'; // 只保存一份，新的覆盖旧的

/**
 * 初始化 IndexedDB
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 创建对象存储
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * 保存翻译进度（覆盖旧的）
 * @param {object} progressData - 进度数据
 * @returns {Promise<void>}
 */
export async function saveProgress(progressData) {
  try {
    const db = await initDB();
    
    // 准备保存的数据
    const dataToSave = {
      id: PROGRESS_KEY, // 固定 key，新的会覆盖旧的
      timestamp: Date.now(),
      chapters: progressData.chapters,
      glossary: progressData.glossary,
      styleGuide: progressData.styleGuide,
      epubMetadata: progressData.epubMetadata,
      epubResources: progressData.epubResources || [],
      currentChapterIndex: progressData.currentChapterIndex,
      // 保存文件信息（但不保存实际文件内容，太大了）
      epubFileName: progressData.epubFile?.name || null,
      epubFileSize: progressData.epubFile?.size || null
    };
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // put 方法会覆盖同 id 的数据
    const request = store.put(dataToSave);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('进度已保存:', new Date(dataToSave.timestamp).toLocaleString());
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('保存进度失败:', error);
    throw error;
  }
}

/**
 * 加载保存的进度
 * @returns {Promise<object|null>} 进度数据或 null
 */
export async function loadProgress() {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(PROGRESS_KEY);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          console.log('找到保存的进度:', new Date(data.timestamp).toLocaleString());
        }
        resolve(data || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('加载进度失败:', error);
    return null;
  }
}

/**
 * 检查是否有保存的进度
 * @returns {Promise<boolean>}
 */
export async function hasProgress() {
  const progress = await loadProgress();
  return progress !== null;
}

/**
 * 删除保存的进度
 * @returns {Promise<void>}
 */
export async function clearProgress() {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(PROGRESS_KEY);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('进度已清除');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('清除进度失败:', error);
    throw error;
  }
}

/**
 * 获取进度摘要信息
 * @returns {Promise<object|null>} 进度摘要
 */
export async function getProgressSummary() {
  const progress = await loadProgress();
  
  if (!progress) {
    return null;
  }
  
  const totalChapters = progress.chapters?.length || 0;
  const translatedChapters = progress.chapters?.filter(
    ch => ch.status === 'TRANSLATED' || ch.status === 'APPROVED' || ch.status === 'REVIEW_NEEDED'
  ).length || 0;
  const approvedChapters = progress.chapters?.filter(
    ch => ch.status === 'APPROVED'
  ).length || 0;
  
  return {
    timestamp: progress.timestamp,
    epubFileName: progress.epubFileName,
    epubFileSize: progress.epubFileSize,
    totalChapters,
    translatedChapters,
    approvedChapters,
    currentChapterIndex: progress.currentChapterIndex,
    progress: totalChapters > 0 ? Math.round((translatedChapters / totalChapters) * 100) : 0
  };
}

/**
 * 计算存储使用情况
 * @returns {Promise<object>} 存储信息
 */
export async function getStorageInfo() {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        usageInMB: (estimate.usage / (1024 * 1024)).toFixed(2),
        quotaInMB: (estimate.quota / (1024 * 1024)).toFixed(2),
        percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2)
      };
    }
  } catch (error) {
    console.error('获取存储信息失败:', error);
  }
  return null;
}
