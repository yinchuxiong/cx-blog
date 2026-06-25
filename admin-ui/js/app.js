/**
 * Custom Admin Panel — Application
 * Communicates with hexo-admin backend API at /admin/api/
 */
(function () {
  'use strict';

  const API = '/admin/api/';

  // ==================== State ====================
  const state = {
    posts: [],
    pages: [],
    currentPost: null,
    currentView: 'posts',
    currentFilter: 'all',   // 'all' | 'published' | 'draft'
    editor: null,
    tagsCategories: { tags: {}, categories: {}, metadata: [] },
    settings: {},
    previewVisible: false,
    previewMode: 'desktop', // 'desktop' | 'mobile'
    previewDebounce: null,
  };

  // ==================== DOM Refs ====================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebar-toggle'),
    main: $('#main'),
    topbarTitle: $('#topbar-title'),
    searchInput: $('#search-input'),
    btnNew: $('#btn-new'),
    content: $('#content'),
    postList: $('#post-list'),
    emptyState: $('#empty-state'),
    listInfoText: $('#list-info-text'),
    postCount: $('#post-count'),
    draftCount: $('#draft-count'),
    pagesInfoText: $('#pages-info-text'),
    pagesList: $('#pages-list'),

    // Editor
    viewEditor: $('#view-editor'),
    editorTitle: $('#editor-title'),
    editorTags: $('#editor-tags'),
    editorCategories: $('#editor-categories'),
    editorTextarea: $('#editor-textarea'),
    editorStatus: $('#editor-status'),
    btnBack: $('#btn-back'),
    btnSave: $('#btn-save'),
    btnDelete: $('#btn-delete'),
    btnDraftToggle: $('#btn-draft-toggle'),

    // Settings
    viewSettings: $('#view-settings'),
    settingImagePath: $('#setting-image-path'),
    settingImagePrefix: $('#setting-image-prefix'),
    btnDeploy: $('#btn-deploy'),
    deployHint: $('#deploy-hint'),
    btnSaveSettings: $('#btn-save-settings'),

    // Modals
    modalNew: $('#modal-new'),
    newPostTitle: $('#new-post-title'),
    modalNewClose: $('#modal-new-close'),
    modalNewCancel: $('#modal-new-cancel'),
    modalNewConfirm: $('#modal-new-confirm'),

    modalDelete: $('#modal-delete'),
    deletePostTitle: $('#delete-post-title'),
    modalDeleteCancel: $('#modal-delete-cancel'),
    modalDeleteConfirm: $('#modal-delete-confirm'),

    // Toast
    toastContainer: $('#toast-container'),

    // Views
    viewList: $('#view-list'),
    viewPages: $('#view-pages'),

    // Theme Preview
    themePreview: $('#theme-preview'),
    themePreviewIframe: $('#theme-preview-iframe'),
    btnThemePreview: $('#btn-theme-preview'),
    btnThemePreviewClose: $('#btn-theme-preview-close'),
    editorBody: $('#editor-body'),
  };

  // ==================== API ====================
  const api = {
    async get(url) {
      const res = await fetch(API + url, { credentials: 'same-origin' });
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    async post(url, body) {
      const res = await fetch(API + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      });
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
  };

  // ==================== Toast ====================
  function toast(msg, type) {
    if (type === void 0) { type = 'info'; }
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    dom.toastContainer.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(function () { el.remove(); }, 300);
    }, 2500);
  }

  // ==================== Navigation ====================
  function navigate(view) {
    state.currentView = view;
    // Update nav
    $$('.nav-item').forEach(function (item) { item.classList.remove('active'); });
    var navItem = document.querySelector('[data-nav="' + view + '"]');
    if (navItem) navItem.classList.add('active');

    // Update views
    dom.searchInput.value = '';
    state.currentFilter = 'all';

    if (view === 'posts') {
      dom.topbarTitle.textContent = '文章管理';
      dom.viewList.style.display = 'block';
      dom.viewEditor.style.display = 'none';
      dom.viewSettings.style.display = 'none';
      dom.viewPages.style.display = 'none';
      dom.btnNew.style.display = 'inline-flex';
      dom.searchInput.style.display = '';
      loadPosts();
    } else if (view === 'drafts') {
      dom.topbarTitle.textContent = '草稿箱';
      dom.viewList.style.display = 'block';
      dom.viewEditor.style.display = 'none';
      dom.viewSettings.style.display = 'none';
      dom.viewPages.style.display = 'none';
      dom.btnNew.style.display = 'inline-flex';
      dom.searchInput.style.display = '';
      state.currentFilter = 'draft';
      loadPosts();
    } else if (view === 'pages') {
      dom.topbarTitle.textContent = '页面管理';
      dom.viewList.style.display = 'none';
      dom.viewEditor.style.display = 'none';
      dom.viewSettings.style.display = 'none';
      dom.viewPages.style.display = 'block';
      dom.btnNew.style.display = 'none';
      dom.searchInput.style.display = 'none';
      loadPages();
    } else if (view === 'settings') {
      dom.topbarTitle.textContent = '设置';
      dom.viewList.style.display = 'none';
      dom.viewEditor.style.display = 'none';
      dom.viewSettings.style.display = 'block';
      dom.viewPages.style.display = 'none';
      dom.btnNew.style.display = 'none';
      dom.searchInput.style.display = 'none';
      loadSettings();
    }
  }

  // ==================== Load Data ====================
  async function loadPosts() {
    try {
      var data = await api.get('posts/list');
      state.posts = data || [];
      renderPostList();
    } catch (err) {
      console.error('Failed to load posts:', err);
      toast('加载文章失败', 'error');
    }
  }

  async function loadPages() {
    try {
      var data = await api.get('pages/list');
      state.pages = data || [];
      renderPagesList();
    } catch (err) {
      console.error('Failed to load pages:', err);
      toast('加载页面失败', 'error');
    }
  }

  async function loadSettings() {
    try {
      var data = await api.get('settings/list');
      state.settings = data || {};
      var opts = (state.settings && state.settings.options) || {};
      dom.settingImagePath.value = opts.imagePath || '/images';
      dom.settingImagePrefix.value = opts.imagePrefix || 'pasted-';
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  async function loadTagsCategories() {
    try {
      state.tagsCategories = await api.get('tags-categories-and-metadata') || {};
    } catch (err) {
      console.error('Failed to load tags/cats:', err);
    }
  }

  // ==================== Render ====================
  function renderPostList() {
    var posts = state.posts;
    var filter = state.currentFilter;
    var search = dom.searchInput.value.toLowerCase().trim();

    // Filter
    var filtered = posts.filter(function (p) {
      if (filter === 'published' && p.isDraft) return false;
      if (filter === 'draft' && !p.isDraft) return false;
      if (search) {
        var title = (p.title || '').toLowerCase();
        var tags = (p.tags && p.tags.data ? p.tags.data.join(' ') : '').toLowerCase();
        var cats = (p.categories && p.categories.data ? p.categories.data.join(' ') : '').toLowerCase();
        if (title.indexOf(search) === -1 && tags.indexOf(search) === -1 && cats.indexOf(search) === -1) return false;
      }
      return true;
    });

    // Counts
    var publishedCount = posts.filter(function (p) { return !p.isDraft; }).length;
    var draftCount = posts.filter(function (p) { return p.isDraft; }).length;
    dom.postCount.textContent = publishedCount;
    dom.draftCount.textContent = draftCount;
    dom.listInfoText.textContent = filtered.length + ' 篇文章';

    // Render filter chips
    var listHeader = document.querySelector('#view-list .list-header');
    var filterDiv = listHeader.querySelector('.list-filter');
    filterDiv.innerHTML = '';
    var filters = [
      { key: 'all', label: '全部' },
      { key: 'published', label: '已发布 (' + publishedCount + ')' },
      { key: 'draft', label: '草稿 (' + draftCount + ')' },
    ];
    filters.forEach(function (f) {
      var chip = document.createElement('button');
      chip.className = 'filter-chip' + (state.currentFilter === f.key ? ' active' : '');
      chip.textContent = f.label;
      chip.dataset.filter = f.key;
      chip.addEventListener('click', function () {
        state.currentFilter = f.key;
        renderPostList();
      });
      filterDiv.appendChild(chip);
    });

    // Render posts
    if (filtered.length === 0) {
      dom.postList.innerHTML = '';
      dom.emptyState.style.display = 'flex';
    } else {
      dom.emptyState.style.display = 'none';
      dom.postList.innerHTML = filtered.map(function (p) {
        var date = p.date ? new Date(p.date).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
        var tags = (p.tags && p.tags.data ? p.tags.data : []).map(function (t) {
          return '<span class="post-card-tag">' + escapeHtml(t) + '</span>';
        }).join('');
        var cats = (p.categories && p.categories.data ? p.categories.data : []).map(function (c) {
          return '<span class="post-card-cat">' + escapeHtml(c) + '</span>';
        }).join('');
        var statusClass = p.isDraft ? 'draft' : 'published';
        var statusText = p.isDraft ? '草稿' : '已发布';

        return '<div class="post-card" data-id="' + p._id + '" data-draft="' + p.isDraft + '">' +
          '<div class="post-card-main">' +
            '<div class="post-card-title">' + escapeHtml(p.title || '无标题') + '</div>' +
            '<div class="post-card-meta">' +
              '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + date + '</span>' +
              cats +
              tags +
            '</div>' +
          '</div>' +
          '<div class="post-card-status">' +
            '<span class="status-badge ' + statusClass + '">' + statusText + '</span>' +
          '</div>' +
        '</div>';
      }).join('');

      // Bind click events
      dom.postList.querySelectorAll('.post-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var id = card.dataset.id;
          openEditor(id);
        });
      });
    }
  }

  function renderPagesList() {
    var pages = state.pages;
    dom.pagesInfoText.textContent = pages.length + ' 个页面';

    if (pages.length === 0) {
      dom.pagesList.innerHTML = '<div class="empty-state"><p class="empty-text">暂无页面</p></div>';
    } else {
      dom.pagesList.innerHTML = pages.map(function (p) {
        var date = p.date ? new Date(p.date).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
        return '<div class="post-card" data-id="' + p._id + '">' +
          '<div class="post-card-main">' +
            '<div class="post-card-title">' + escapeHtml(p.title || '无标题') + '</div>' +
            '<div class="post-card-meta"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + date + '</span></div>' +
          '</div>' +
        '</div>';
      }).join('');

      dom.pagesList.querySelectorAll('.post-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var id = card.dataset.id;
          editPage(id);
        });
      });
    }
  }

  // ==================== Editor ====================
  async function openEditor(postId) {
    try {
      var post = await api.get('posts/' + postId);
      if (!post) {
        toast('文章未找到', 'error');
        return;
      }
      state.currentPost = post;
      showEditor(post);
    } catch (err) {
      console.error('Failed to load post:', err);
      toast('加载文章失败', 'error');
    }
  }

  async function editPage(pageId) {
    try {
      var page = await api.get('pages/' + pageId);
      if (!page) {
        toast('页面未找到', 'error');
        return;
      }
      state.currentPost = page;
      state.currentPost._isPage = true;
      showEditor(page);
    } catch (err) {
      console.error('Failed to load page:', err);
      toast('加载页面失败', 'error');
    }
  }

  function showEditor(post) {
    dom.viewList.style.display = 'none';
    dom.viewEditor.style.display = 'block';
    dom.viewSettings.style.display = 'none';
    dom.viewPages.style.display = 'none';
    dom.btnNew.style.display = 'none';
    dom.searchInput.style.display = 'none';

    // Reset preview state
    state.previewVisible = false;
    dom.themePreview.style.display = 'none';
    dom.viewEditor.classList.remove('preview-active');
    dom.btnThemePreview.classList.remove('active');
    dom.btnThemePreview.style.display = 'inline-flex';
    if (state.previewDebounce) {
      clearTimeout(state.previewDebounce);
      state.previewDebounce = null;
    }

    dom.editorTitle.value = post.title || '';
    dom.editorTags.value = (post.tags && post.tags.data ? post.tags.data : []).join(', ');
    dom.editorCategories.value = (post.categories && post.categories.data ? post.categories.data : []).join(', ');

    var isDraft = post.isDraft;
    var isPage = post._isPage;
    dom.topbarTitle.textContent = (isPage ? '编辑页面' : (isDraft ? '编辑草稿' : '编辑文章'));
    dom.editorStatus.textContent = isPage ? '页面' : (isDraft ? '草稿' : '已发布');

    // Initialize EasyMDE
    initEditor(post);

    // Delete button
    dom.btnDelete.onclick = function () { showDeleteModal(post); };

    // Draft toggle
    if (!isPage) {
      dom.btnDraftToggle.style.display = 'inline-flex';
      dom.btnDraftToggle.onclick = function () { toggleDraft(post); };
    } else {
      dom.btnDraftToggle.style.display = 'none';
    }

    // Save
    dom.btnSave.onclick = function () { savePost(post); };
  }

  function initEditor(post) {
    // Destroy previous instance
    if (state.editor) {
      var prevEl = document.querySelector('.EasyMDEContainer');
      if (prevEl) prevEl.remove();
      state.editor = null;
    }

    var textarea = dom.editorTextarea;
    textarea.value = post._content || post.content || post.raw || '';

    state.editor = new EasyMDE({
      element: textarea,
      spellChecker: false,
      placeholder: '开始写作...',
      autosave: { enabled: false },
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', '|',
        'preview', 'side-by-side', 'fullscreen', '|',
        'guide',
      ],
      uploadImage: true,
      imageUploadFunction: uploadImage,
      status: ['words', 'lines', 'cursor'],
      renderingConfig: {
        codeSyntaxHighlighting: true,
      },
    });

    // Focus at end
    setTimeout(function () {
      if (state.editor && state.editor.codemirror) {
        var cm = state.editor.codemirror;
        cm.setCursor(cm.lineCount(), 0);
        cm.focus();
      }
    }, 200);

    // Set up auto-refresh for theme preview
    if (state.editor && state.editor.codemirror) {
      state.editor.codemirror.on('change', function () {
        schedulePreviewUpdate();
      });
    }

    // Set up title/tags/categories auto-refresh for preview
    var refreshPreview = function () { schedulePreviewUpdate(); };
    dom.editorTitle.addEventListener('input', refreshPreview);
    dom.editorTags.addEventListener('input', refreshPreview);
    dom.editorCategories.addEventListener('input', refreshPreview);
  }

  // ==================== Theme Preview ====================
  function schedulePreviewUpdate() {
    if (!state.previewVisible) return;
    if (state.previewDebounce) clearTimeout(state.previewDebounce);
    state.previewDebounce = setTimeout(function () {
      updateThemePreview();
    }, 400);
  }

  function updateThemePreview() {
    var iframe = dom.themePreviewIframe;
    if (!iframe) return;

    var content = state.editor ? state.editor.value() : '';
    var title = dom.editorTitle.value.trim() || '文章预览';
    var tags = dom.editorTags.value || '';
    var categories = dom.editorCategories.value || '';

    // Render markdown to HTML using EasyMDE's built-in renderer
    var htmlContent = content;
    if (state.editor && state.editor.markdown) {
      htmlContent = state.editor.markdown(content);
    }

    // Build category and tag HTML
    var catHtml = '';
    if (categories.trim()) {
      var cats = categories.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
      catHtml = cats.map(function (c) {
        return '<a class="post-meta-categories">' + escapeHtml(c) + '</a>';
      }).join('');
    }

    var tagHtml = '';
    if (tags.trim()) {
      var tgs = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      tagHtml = tgs.map(function (t) {
        return '<a>' + escapeHtml(t) + '</a>';
      }).join('');
    }

    var dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

    // Build the full preview HTML with Anzhiyu theme structure
    var previewHtml = '<!DOCTYPE html>' +
      '<html lang="zh-CN">' +
      '<head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<link rel="stylesheet" href="/css/index.css">' +
      '<link rel="stylesheet" href="https://cdn.cbd.int/node-snackbar@0.1.16/dist/snackbar.min.css">' +
      '<link rel="stylesheet" href="https://cdn.cbd.int/@fancyapps/ui@5.0.28/dist/fancybox/fancybox.css">' +
      '<link rel="stylesheet" href="https://cdn.cbd.int/anzhiyu-theme-static@1.1.10/progress_bar/progress_bar.css">' +
      '<style>' +
      '  * { box-sizing: border-box; margin: 0; padding: 0; }' +
      '  body {' +
      '    background: #fff;' +
      '    padding: 0;' +
      '    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;' +
      '    color: #1F2D3D;' +
      '    line-height: 1.8;' +
      '  }' +
      '  #body-wrap { max-width: 900px; margin: 0 auto; padding: 24px; }' +
      '  #post { background: #fff; }' +
      '  #article-container {' +
      '    padding: 20px 0;' +
      '    word-wrap: break-word;' +
      '  }' +
      '  #article-container h1 { font-size: 2em; margin: 0.67em 0; }' +
      '  #article-container h2 { font-size: 1.65em; margin: 1em 0 0.6em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }' +
      '  #article-container h3 { font-size: 1.35em; margin: 0.8em 0 0.5em; }' +
      '  #article-container p { margin: 0.8em 0; }' +
      '  #article-container code { background: rgba(27,31,35,0.05); padding: 2px 6px; border-radius: 3px; font-family: "SF Mono", Consolas, monospace; font-size: 0.9em; }' +
      '  #article-container pre { background: #1e1e1e; color: #d4d4d4; padding: 16px 20px; border-radius: 8px; overflow-x: auto; margin: 1em 0; }' +
      '  #article-container pre code { background: transparent; padding: 0; color: inherit; }' +
      '  #article-container blockquote { border-left: 4px solid #425AEF; padding: 8px 16px; margin: 1em 0; background: rgba(66,90,239,0.05); color: #6a737d; }' +
      '  #article-container img { max-width: 100%; border-radius: 6px; }' +
      '  #article-container ul, #article-container ol { padding-left: 2em; margin: 0.6em 0; }' +
      '  #article-container li { margin: 0.3em 0; }' +
      '  #article-container a { color: #425AEF; text-decoration: none; }' +
      '  #article-container table { border-collapse: collapse; width: 100%; margin: 1em 0; }' +
      '  #article-container table th, #article-container table td { border: 1px solid #e4e7ed; padding: 8px 12px; text-align: left; }' +
      '  #article-container table th { background: #f5f7fa; font-weight: 600; }' +
      '  .post-meta-categories { display: inline-block; padding: 4px 12px; background: rgba(66,90,239,0.08); color: #425AEF; border-radius: 20px; font-size: 13px; margin-right: 8px; text-decoration: none; }' +
      '  .post-meta-tags a { display: inline-block; padding: 2px 8px; color: #99a9bf; font-size: 13px; margin-right: 6px; text-decoration: none; }' +
      '  #CrawlerTitle { font-size: 2em; font-weight: 700; margin: 0.4em 0 0.2em; line-height: 1.4; }' +
      '  .post-meta-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; font-size: 13px; color: #858585; }' +
      '  .post-meta-header time { color: #858585; }' +
      '  .post-meta-header span { color: #858585; }' +
      '  @media (max-width: 768px) {' +
      '    #body-wrap { padding: 16px; }' +
      '    #CrawlerTitle { font-size: 1.5em; }' +
      '  }' +
      '</style>' +
      '</head>' +
      '<body>' +
      '<div id="body-wrap">' +
      '  <div id="post">' +
      '    <article id="article-container" class="post-content">' +
      '      <header>' +
              catHtml +
              tagHtml +
      '        <h1 id="CrawlerTitle">' + escapeHtml(title) + '</h1>' +
      '        <div class="post-meta-header">' +
      '          <span>Soar</span>' +
      '          <time>' + dateStr + '</time>' +
      '        </div>' +
      '      </header>' +
              htmlContent +
      '    </article>' +
      '  </div>' +
      '</div>' +
      '</body>' +
      '</html>';

    iframe.srcdoc = previewHtml;
  }

  function toggleThemePreview() {
    state.previewVisible = !state.previewVisible;
    if (state.previewVisible) {
      dom.themePreview.style.display = 'flex';
      dom.viewEditor.classList.add('preview-active');
      dom.btnThemePreview.classList.add('active');
      updateThemePreview();
    } else {
      dom.themePreview.style.display = 'none';
      dom.viewEditor.classList.remove('preview-active');
      dom.btnThemePreview.classList.remove('active');
    }
  }

  function setPreviewMode(mode) {
    state.previewMode = mode;
    var tabs = document.querySelectorAll('.theme-preview-tab');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    var activeTab = document.querySelector('[data-preview-mode="' + mode + '"]');
    if (activeTab) activeTab.classList.add('active');

    if (mode === 'mobile') {
      dom.themePreview.classList.add('mobile-mode');
    } else {
      dom.themePreview.classList.remove('mobile-mode');
    }
  }

  async function uploadImage(file, onSuccess, onError) {
    try {
      var reader = new FileReader();
      reader.onload = async function () {
        var base64 = reader.result;
        var body = {
          data: base64,
          filename: file.name,
        };
        var result = await api.post('images/upload', body);
        if (result && result.src) {
          onSuccess(result.src);
          toast('图片上传成功', 'success');
        } else {
          onError('上传失败');
        }
      };
      reader.onerror = function () { onError('读取文件失败'); };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Upload failed:', err);
      onError('上传失败: ' + err.message);
    }
  }

  async function savePost(post) {
    var title = dom.editorTitle.value.trim();
    if (!title) {
      toast('标题不能为空', 'error');
      return;
    }

    var content = state.editor ? state.editor.value() : '';
    var tags = dom.editorTags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var categories = dom.editorCategories.value.split(',').map(function (c) { return c.trim(); }).filter(Boolean);

    var body = {
      title: title,
      raw: content,
      _content: content,
      tags: tags,
      categories: categories,
    };

    try {
      var isPage = post._isPage;
      var endpoint = isPage ? ('pages/' + post._id) : ('posts/' + post._id);
      await api.post(endpoint, body);
      toast('保存成功', 'success');
      // Refresh tags/categories
      loadTagsCategories();
    } catch (err) {
      console.error('Save failed:', err);
      toast('保存失败: ' + err.message, 'error');
    }
  }

  async function toggleDraft(post) {
    try {
      if (post.isDraft) {
        await api.post('posts/' + post._id + '/publish');
        post.isDraft = false;
        dom.editorStatus.textContent = '已发布';
        dom.topbarTitle.textContent = '编辑文章';
        toast('已发布', 'success');
      } else {
        await api.post('posts/' + post._id + '/unpublish');
        post.isDraft = true;
        dom.editorStatus.textContent = '草稿';
        dom.topbarTitle.textContent = '编辑草稿';
        toast('已转为草稿', 'success');
      }
    } catch (err) {
      console.error('Toggle draft failed:', err);
      toast('操作失败', 'error');
    }
  }

  function showDeleteModal(post) {
    dom.deletePostTitle.textContent = post.title || '无标题';
    dom.modalDelete.style.display = 'flex';
    dom.modalDeleteConfirm.onclick = async function () {
      try {
        var isPage = post._isPage;
        var endpoint = isPage ? ('pages/' + post._id + '/remove') : ('posts/' + post._id + '/remove');
        await api.post(endpoint);
        dom.modalDelete.style.display = 'none';
        toast('已删除', 'success');
        exitEditor();
      } catch (err) {
        console.error('Delete failed:', err);
        toast('删除失败', 'error');
        dom.modalDelete.style.display = 'none';
      }
    };
  }

  function exitEditor() {
    state.currentPost = null;
    // Close preview
    if (state.previewVisible) {
      state.previewVisible = false;
      dom.themePreview.style.display = 'none';
      dom.viewEditor.classList.remove('preview-active');
      dom.btnThemePreview.classList.remove('active');
    }
    if (state.previewDebounce) {
      clearTimeout(state.previewDebounce);
      state.previewDebounce = null;
    }
    if (state.editor) {
      state.editor.toTextArea();
      state.editor = null;
    }
    dom.viewEditor.style.display = 'none';
    dom.btnNew.style.display = 'inline-flex';
    dom.searchInput.style.display = '';
    if (state.currentView === 'pages') {
      navigate('pages');
    } else if (state.currentView === 'drafts') {
      navigate('drafts');
    } else {
      navigate('posts');
    }
  }

  // ==================== New Post ====================
  function newPost() {
    dom.newPostTitle.value = '';
    dom.newPostTitle.focus();
    dom.modalNew.style.display = 'flex';
    // Reset radio to draft
    var draftRadio = document.querySelector('input[name="post-type"][value="draft"]');
    if (draftRadio) draftRadio.checked = true;
  }

  async function createPost() {
    var title = dom.newPostTitle.value.trim();
    if (!title) {
      toast('请输入标题', 'error');
      return;
    }

    try {
      var result = await api.post('posts/new', { title: title });
      dom.modalNew.style.display = 'none';

      if (result && result._id) {
        var postType = document.querySelector('input[name="post-type"]:checked');
        var isDraft = postType ? postType.value === 'draft' : true;

        if (!isDraft) {
          // Publish immediately
          await api.post('posts/' + result._id + '/publish');
        }

        toast(isDraft ? '草稿已创建' : '文章已发布', 'success');
        loadPosts();
        // Open editor
        setTimeout(function () { openEditor(result._id); }, 300);
      }
    } catch (err) {
      console.error('Create failed:', err);
      toast('创建失败: ' + err.message, 'error');
    }
  }

  // ==================== Settings ====================
  async function saveSettings() {
    try {
      var imagePath = dom.settingImagePath.value.trim() || '/images';
      var imagePrefix = dom.settingImagePrefix.value.trim() || 'pasted-';

      await api.post('settings/set', {
        name: 'imagePath',
        value: imagePath,
      });
      await api.post('settings/set', {
        name: 'imagePrefix',
        value: imagePrefix,
      });

      toast('设置已保存', 'success');
    } catch (err) {
      console.error('Save settings failed:', err);
      toast('保存设置失败', 'error');
    }
  }

  async function deploy() {
    try {
      var result = await api.post('deploy', { message: 'Deploy from admin panel' });
      if (result && result.error) {
        toast(result.error, 'error');
      } else {
        toast('部署成功', 'success');
      }
    } catch (err) {
      console.error('Deploy failed:', err);
      toast('部署失败，请检查 deployCommand 配置', 'error');
    }
  }

  // ==================== Event Binding ====================
  function bindEvents() {
    // Navigation
    $$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var view = item.dataset.nav;
        navigate(view);
      });
    });

    // New post
    dom.btnNew.addEventListener('click', newPost);

    // Modal: new post
    dom.modalNewClose.addEventListener('click', function () { dom.modalNew.style.display = 'none'; });
    dom.modalNewCancel.addEventListener('click', function () { dom.modalNew.style.display = 'none'; });
    dom.modalNewConfirm.addEventListener('click', createPost);
    dom.modalNew.addEventListener('click', function (e) {
      if (e.target === dom.modalNew) dom.modalNew.style.display = 'none';
    });

    // Modal: delete
    dom.modalDeleteCancel.addEventListener('click', function () { dom.modalDelete.style.display = 'none'; });
    dom.modalDelete.addEventListener('click', function (e) {
      if (e.target === dom.modalDelete) dom.modalDelete.style.display = 'none';
    });

    // Back button
    dom.btnBack.addEventListener('click', exitEditor);

    // Search
    dom.searchInput.addEventListener('input', function () {
      renderPostList();
    });

    // Settings
    dom.btnSaveSettings.addEventListener('click', saveSettings);
    dom.btnDeploy.addEventListener('click', deploy);

    // Theme Preview
    dom.btnThemePreview.addEventListener('click', toggleThemePreview);
    dom.btnThemePreviewClose.addEventListener('click', function () {
      state.previewVisible = false;
      dom.themePreview.style.display = 'none';
      dom.viewEditor.classList.remove('preview-active');
      dom.btnThemePreview.classList.remove('active');
    });

    // Preview mode tabs (desktop/mobile)
    document.querySelectorAll('.theme-preview-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setPreviewMode(tab.dataset.previewMode);
      });
    });

    // Mobile sidebar toggle
    dom.sidebarToggle.addEventListener('click', function () {
      dom.sidebar.classList.toggle('open');
    });

    // Close sidebar on mobile when clicking main
    dom.main.addEventListener('click', function () {
      if (window.innerWidth <= 768) {
        dom.sidebar.classList.remove('open');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (state.currentPost) {
          savePost(state.currentPost);
        }
      }
      // Escape to close modal
      if (e.key === 'Escape') {
        dom.modalNew.style.display = 'none';
        dom.modalDelete.style.display = 'none';
      }
    });

    // New post input: Enter to create
    dom.newPostTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        createPost();
      }
    });
  }

  // ==================== Utils ====================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==================== Init ====================
  async function init() {
    bindEvents();
    await Promise.all([
      loadPosts(),
      loadTagsCategories(),
    ]);
    navigate('posts');
  }

  // Expose for inline onclick
  window.app = {
    newPost: newPost,
    navigate: navigate,
  };

  // Start
  init();
})();
