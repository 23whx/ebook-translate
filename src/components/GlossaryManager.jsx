import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function GlossaryManager() {
  const { state, dispatch, ActionTypes } = useApp();
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [editingKey, setEditingKey] = useState(null);

  const handleAdd = () => {
    if (!newSource.trim() || !newTarget.trim()) {
      alert('请输入源术语和目标术语');
      return;
    }

    if (state.glossary[newSource]) {
      if (!confirm(`术语 "${newSource}" 已存在，是否覆盖？`)) {
        return;
      }
    }

    dispatch({
      type: ActionTypes.UPDATE_GLOSSARY,
      payload: { [newSource]: newTarget }
    });

    setNewSource('');
    setNewTarget('');
  };

  const handleDelete = (key) => {
    if (confirm(`确定要删除术语 "${key}" 吗？`)) {
      const newGlossary = { ...state.glossary };
      delete newGlossary[key];
      
      dispatch({
        type: ActionTypes.UPDATE_GLOSSARY,
        payload: newGlossary
      });
    }
  };

  const handleEdit = (key) => {
    setEditingKey(key);
    setNewSource(key);
    setNewTarget(state.glossary[key]);
  };

  const handleUpdate = () => {
    if (!newSource.trim() || !newTarget.trim()) {
      alert('请输入源术语和目标术语');
      return;
    }

    const newGlossary = { ...state.glossary };
    
    // 如果修改了 key，删除旧的
    if (editingKey !== newSource && newGlossary[editingKey]) {
      delete newGlossary[editingKey];
    }
    
    newGlossary[newSource] = newTarget;
    
    dispatch({
      type: ActionTypes.UPDATE_GLOSSARY,
      payload: newGlossary
    });

    setEditingKey(null);
    setNewSource('');
    setNewTarget('');
  };

  const handleCancel = () => {
    setEditingKey(null);
    setNewSource('');
    setNewTarget('');
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        const imported = {};

        lines.forEach(line => {
          const [source, target] = line.split('\t').map(s => s.trim());
          if (source && target) {
            imported[source] = target;
          }
        });

        if (Object.keys(imported).length === 0) {
          alert('未能解析术语表，请检查格式（每行一个术语对，用 Tab 分隔）');
          return;
        }

        dispatch({
          type: ActionTypes.UPDATE_GLOSSARY,
          payload: { ...state.glossary, ...imported }
        });

        alert(`成功导入 ${Object.keys(imported).length} 个术语`);
      } catch (error) {
        alert('导入失败: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const content = Object.entries(state.glossary)
      .map(([source, target]) => `${source}\t${target}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'glossary.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📚 术语表管理</h2>
        <div className="flex gap-2">
          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm transition">
            导入
            <input
              type="file"
              accept=".txt"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          {Object.keys(state.glossary).length > 0 && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm transition"
            >
              导出
            </button>
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-3 text-gray-700">
          {editingKey ? '编辑术语' : '添加新术语'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              源术语
            </label>
            <input
              type="text"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="例: artificial intelligence"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              目标译文
            </label>
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="例: 人工智能"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {editingKey ? (
            <>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition"
              >
                更新
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm transition"
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition"
            >
              添加术语
            </button>
          )}
        </div>
      </div>

      {/* Glossary List */}
      {Object.keys(state.glossary).length > 0 ? (
        <div>
          <h3 className="font-semibold mb-3 text-gray-700">
            当前术语表 ({Object.keys(state.glossary).length} 条)
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {Object.entries(state.glossary).map(([source, target]) => (
              <div
                key={source}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-500">源术语</span>
                    <p className="font-medium text-gray-800">{source}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">目标译文</span>
                    <p className="font-medium text-gray-800">{target}</p>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(source)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm transition"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(source)}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm transition"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">暂无术语</p>
          <p className="text-sm">添加术语后，翻译时将自动应用</p>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-gray-600">
        <p className="font-semibold mb-2">💡 使用说明</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>术语表用于确保专业术语的翻译一致性</li>
          <li>导入格式：每行一个术语对，用 Tab 键分隔（源术语 [Tab] 目标译文）</li>
          <li>术语表会在翻译时作为约束条件传递给 AI 模型</li>
        </ul>
      </div>
    </div>
  );
}
