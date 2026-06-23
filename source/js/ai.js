/**
 * AI Hub - 前端交互逻辑
 * 支持三种工具模式: iframe（嵌入）、api-gateway（API 网关）、backend（后端服务）
 */
(function () {
  'use strict';

  // ==================== 配置 ====================
  // API 网关基础地址 - 根据实际部署修改
  const GATEWAY_BASE_URL = window.AI_GATEWAY_URL || '/api/gateway';
  // API 网关认证 Token - 通过页面注入或 localStorage 获取
  const GATEWAY_AUTH_TOKEN =
    window.AI_GATEWAY_TOKEN || localStorage.getItem('ai_gateway_token') || '';

  // ==================== DOM 引用缓存 ====================
  const panel = document.getElementById('ai-tool-panel');
  const panelOverlay = panel?.querySelector('.ai-tool-panel-overlay');
  const panelDrawer = panel?.querySelector('.ai-tool-panel-drawer');
  const panelIcon = document.getElementById('ai-panel-icon');
  const panelName = document.getElementById('ai-panel-name');
  const btnClose = panel?.querySelector('.ai-panel-btn-close');
  const iframeContainer = document.getElementById('ai-iframe-container');
  const iframeEl = document.getElementById('ai-tool-iframe');
  const iframeLoading = iframeContainer?.querySelector('.ai-iframe-loading');
  const apiContainer = document.getElementById('ai-api-container');
  const chatMessages = document.getElementById('ai-chat-messages');
  const chatInput = document.getElementById('ai-chat-input');
  const chatSend = document.getElementById('ai-chat-send');
  const chatStatus = document.getElementById('ai-chat-status-text');
  const tokenUsage = document.getElementById('ai-token-usage');

  // ==================== 状态 ====================
  let currentTool = null;
  let isStreaming = false;
  let currentAbortController = null;
  let messageHistory = [];

  // ==================== 初始化 ====================
  function init() {
    bindToolCards();
    bindPanelClose();
    bindChatSend();
    bindOverlayClick();
    bindKeydown();
  }

  // ==================== 工具卡片点击 ====================
  function bindToolCards() {
    const cards = document.querySelectorAll('.ai-tool-card:not(.disabled)');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        const toolData = extractToolData(card);
        openToolPanel(toolData);
      });
    });
  }

  function extractToolData(card) {
    return {
      id: card.dataset.toolId,
      name: card.querySelector('.ai-tool-name')?.textContent || card.dataset.toolId,
      icon: card.querySelector('.ai-tool-icon i')?.className || 'anzhiyu-icon-cube',
      mode: card.dataset.toolMode,
      endpoint: card.dataset.toolEndpoint,
      method: card.dataset.toolMethod || 'POST',
      url: card.dataset.toolUrl,
      placeholder: card.dataset.toolPlaceholder,
      streamEnabled: card.dataset.toolStream === 'true',
      showUsage: card.dataset.toolShowUsage === 'true',
    };
  }

  // ==================== 面板开关 ====================
  function openToolPanel(tool) {
    if (!panel) return;
    currentTool = tool;

    // 设置面板标题
    if (panelIcon) panelIcon.className = 'anzhiyufont ' + tool.icon;
    if (panelName) panelName.textContent = tool.name;

    // 清理上一次的状态
    resetPanel();

    // 根据 mode 显示对应的容器
    switch (tool.mode) {
      case 'iframe':
        showIframeMode(tool);
        break;
      case 'api-gateway':
      case 'backend':
        showApiMode(tool);
        break;
      default:
        showApiMode(tool); // 默认走 API 模式
    }

    // 激活面板
    panel.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove('active');
    document.body.style.overflow = '';

    // 停止流式请求
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    isStreaming = false;

    // 清理 iframe
    if (iframeEl) {
      iframeEl.src = '';
      iframeEl.style.display = 'none';
    }
    if (iframeLoading) iframeLoading.style.display = '';

    currentTool = null;
    messageHistory = [];
  }

  function resetPanel() {
    if (iframeContainer) iframeContainer.style.display = 'none';
    if (apiContainer) apiContainer.style.display = 'none';
    if (chatStatus) chatStatus.textContent = '';
    if (tokenUsage) tokenUsage.style.display = 'none';
    if (iframeEl) {
      iframeEl.src = '';
      iframeEl.style.display = 'none';
    }
    if (iframeLoading) iframeLoading.style.display = '';

    // 清理聊天消息（保留系统欢迎消息）
    if (chatMessages) {
      chatMessages.innerHTML = '';
      appendSystemMessage('你好！输入你的请求，我会为你处理。');
    }
    if (chatInput) chatInput.value = '';
    if (chatSend) chatSend.disabled = false;
    messageHistory = [];

    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    isStreaming = false;
  }

  // ==================== iframe 模式 ====================
  function showIframeMode(tool) {
    if (!iframeContainer || !iframeEl) return;
    iframeContainer.style.display = 'flex';
    apiContainer.style.display = 'none';

    if (tool.url) {
      iframeLoading.style.display = '';
      iframeEl.style.display = 'none';

      iframeEl.onload = function () {
        iframeLoading.style.display = 'none';
        iframeEl.style.display = 'block';
      };

      iframeEl.onerror = function () {
        iframeLoading.innerHTML =
          '<i class="anzhiyufont anzhiyu-icon-exclamation-triangle"></i><span>加载失败，请检查工具链接配置</span>';
      };

      // 延迟加载（让动画先执行）
      setTimeout(function () {
        iframeEl.src = tool.url;
      }, 400);
    } else {
      iframeLoading.innerHTML =
        '<i class="anzhiyufont anzhiyu-icon-inbox"></i><span>该工具尚未配置嵌入链接<br><small>请在 ai_tools.json 中设置 url 字段</small></span>';
    }
  }

  // ==================== API 模式（网关 / 后端） ====================
  function showApiMode(tool) {
    if (!apiContainer) return;
    apiContainer.style.display = 'flex';
    iframeContainer.style.display = 'none';

    if (chatInput && tool.placeholder) {
      chatInput.placeholder = tool.placeholder;
    }
    if (chatInput) chatInput.focus();
  }

  // ==================== 发送消息 ====================
  function bindChatSend() {
    if (!chatSend) return;
    chatSend.addEventListener('click', function () {
      sendMessage();
    });
  }

  function bindKeydown() {
    if (!chatInput) return;
    chatInput.addEventListener('keydown', function (e) {
      // Ctrl+Enter 发送
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function sendMessage() {
    if (!currentTool || !chatInput || isStreaming) return;

    var content = chatInput.value.trim();
    if (!content) return;

    // 显示用户消息
    appendUserMessage(content);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // 调用对应的方法
    if (currentTool.mode === 'api-gateway') {
      callApiGateway(currentTool, content);
    } else if (currentTool.mode === 'backend') {
      callBackend(currentTool, content);
    }
  }

  // ==================== API 网关调用 ====================
  function callApiGateway(tool, content) {
    if (!tool.endpoint) {
      appendErrorMessage('未配置 API 网关端点地址，请在 ai_tools.json 中设置 endpoint 字段');
      return;
    }

    isStreaming = true;
    if (chatSend) chatSend.disabled = true;
    if (chatStatus) chatStatus.textContent = '正在请求 API 网关...';
    updateTokenUsage(null);

    // 构建消息历史
    messageHistory.push({ role: 'user', content: content });
    var payload = {
      messages: messageHistory.slice(-20), // 保留最近20条
      stream: tool.streamEnabled,
      tool_id: tool.id,
    };

    currentAbortController = new AbortController();

    var endpoint = tool.endpoint;
    // 如果不是完整 URL，加上网关前缀
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = GATEWAY_BASE_URL.replace(/\/$/, '') + '/' + endpoint.replace(/^\//, '');
    }

    fetch(endpoint, {
      method: tool.method || 'POST',
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + GATEWAY_AUTH_TOKEN,
        },
        tool.headers || {}
      ),
      body: JSON.stringify(payload),
      signal: currentAbortController.signal,
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            throw new Error(err.message || 'API 网关请求失败 (HTTP ' + response.status + ')');
          });
        }

        if (tool.streamEnabled && response.body) {
          return handleStreamResponse(response, tool);
        } else {
          return response.json().then(function (data) {
            handleJsonResponse(data, tool);
          });
        }
      })
      .catch(function (error) {
        if (error.name === 'AbortError') {
          if (chatStatus) chatStatus.textContent = '请求已取消';
        } else {
          appendErrorMessage(error.message || '请求失败，请稍后重试');
        }
      })
      .finally(function () {
        isStreaming = false;
        if (chatSend) chatSend.disabled = false;
        if (chatInput) chatInput.focus();
      });
  }

  // ==================== 后端服务调用 ====================
  function callBackend(tool, content) {
    if (!tool.endpoint) {
      appendErrorMessage('未配置后端服务地址，请在 ai_tools.json 中设置 endpoint 字段');
      return;
    }

    isStreaming = true;
    if (chatSend) chatSend.disabled = true;
    if (chatStatus) chatStatus.textContent = '正在请求后端服务...';

    currentAbortController = new AbortController();

    var endpoint = tool.endpoint;

    fetch(endpoint, {
      method: tool.method || 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, tool.headers || {}),
      body: JSON.stringify({ query: content }),
      signal: currentAbortController.signal,
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            throw new Error(err.message || '后端服务请求失败 (HTTP ' + response.status + ')');
          });
        }
        return response.json();
      })
      .then(function (data) {
        appendAssistantMessage(data.result || data.content || data.message || JSON.stringify(data));
        if (chatStatus) chatStatus.textContent = '请求完成';
      })
      .catch(function (error) {
        if (error.name === 'AbortError') {
          if (chatStatus) chatStatus.textContent = '请求已取消';
        } else {
          appendErrorMessage(error.message || '请求失败，请稍后重试');
        }
      })
      .finally(function () {
        isStreaming = false;
        if (chatSend) chatSend.disabled = false;
        if (chatInput) chatInput.focus();
      });
  }

  // ==================== 流式响应处理（SSE） ====================
  function handleStreamResponse(response, tool) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var fullContent = '';

    // 创建一条 assistant 消息占位
    var assistantMsg = appendAssistantMessage('');
    var contentEl = assistantMsg.querySelector('.ai-message-content');

    function processStream() {
      reader
        .read()
        .then(function (result) {
          if (result.done) {
            // 流结束
            if (chatStatus) chatStatus.textContent = '生成完成';
            messageHistory.push({ role: 'assistant', content: fullContent });
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          // 处理 SSE 格式: data: {...}\n\n
          var lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留不完整的最后一行

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || !line.startsWith('data: ')) continue;

            var jsonStr = line.substring(6);
            if (jsonStr === '[DONE]') continue;

            try {
              var data = JSON.parse(jsonStr);
              // 兼容多种返回格式
              var chunk =
                data.choices?.[0]?.delta?.content ||
                data.choices?.[0]?.text ||
                data.content ||
                data.delta ||
                data.text ||
                '';

              if (chunk) {
                fullContent += chunk;
                if (contentEl) {
                  contentEl.textContent = fullContent;
                  // 滚动到底部
                  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              }

              // Token 用量信息
              if (tool.showUsage && data.usage) {
                updateTokenUsage(data.usage);
              }
            } catch (e) {
              // 非 JSON 行忽略
            }
          }

          // 继续读取
          processStream();
        })
        .catch(function (error) {
          if (error.name !== 'AbortError') {
            appendErrorMessage('流式读取失败: ' + error.message);
          }
        });
    }

    if (chatStatus) chatStatus.textContent = 'AI 正在生成...';
    processStream();
  }

  // ==================== JSON 响应处理 ====================
  function handleJsonResponse(data, tool) {
    // 兼容多种返回格式
    var content =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.text ||
      data.result ||
      data.content ||
      data.message ||
      data.text ||
      JSON.stringify(data);

    appendAssistantMessage(content);
    messageHistory.push({ role: 'assistant', content: content });

    if (tool.showUsage && data.usage) {
      updateTokenUsage(data.usage);
    }

    if (chatStatus) chatStatus.textContent = '请求完成';
  }

  // ==================== 消息 UI ====================
  function appendSystemMessage(text) {
    return appendMessage('system', text);
  }

  function appendUserMessage(text) {
    return appendMessage('user', text);
  }

  function appendAssistantMessage(text) {
    return appendMessage('assistant', text);
  }

  function appendErrorMessage(text) {
    return appendMessage('error', text);
  }

  function appendMessage(role, text) {
    if (!chatMessages) return null;

    var msgEl = document.createElement('div');
    msgEl.className = 'ai-message ai-message-' + role;

    var avatarIcon = '';
    switch (role) {
      case 'user':
        avatarIcon = 'anzhiyu-icon-user';
        break;
      case 'error':
        avatarIcon = 'anzhiyu-icon-exclamation-circle';
        break;
      default:
        avatarIcon = 'anzhiyu-icon-robot';
    }

    msgEl.innerHTML =
      '<div class="ai-message-avatar"><i class="anzhiyufont ' +
      avatarIcon +
      '"></i></div>' +
      '<div class="ai-message-content"><p>' +
      escapeHtml(text) +
      '</p></div>';

    chatMessages.appendChild(msgEl);

    // 滚动到底部
    setTimeout(function () {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);

    return msgEl;
  }

  // ==================== Token 用量更新 ====================
  function updateTokenUsage(usage) {
    if (!tokenUsage) return;

    if (usage) {
      tokenUsage.style.display = 'inline-block';
      var parts = [];
      if (usage.prompt_tokens !== undefined) parts.push('输入: ' + usage.prompt_tokens);
      if (usage.completion_tokens !== undefined) parts.push('输出: ' + usage.completion_tokens);
      if (usage.total_tokens !== undefined) parts.push('总计: ' + usage.total_tokens + ' tokens');
      tokenUsage.textContent = parts.join(' | ');
    } else {
      tokenUsage.style.display = 'none';
      tokenUsage.textContent = '';
    }
  }

  // ==================== 面板关闭 ====================
  function bindPanelClose() {
    if (btnClose) {
      btnClose.addEventListener('click', closePanel);
    }
  }

  function bindOverlayClick() {
    if (panelOverlay) {
      panelOverlay.addEventListener('click', closePanel);
    }
  }

  // ==================== 工具函数 ====================
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 自适应 textarea 高度 ====================
  if (chatInput) {
    chatInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }

  // ==================== 启动 ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
