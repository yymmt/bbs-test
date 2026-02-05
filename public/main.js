const APP_VERSION = 'v15';
const API_URL = 'api.php';
let csrfToken = '';
let vapidPublicKey = '';
const LIMIT = 10;
let currentThreadId = null;
let currentThreadTitle = '';
let threads = [];
let oldestPostId = null;
let isLoading = false;
let hasMorePosts = true;

document.addEventListener('DOMContentLoaded', () => {
  init();
});

// --- IndexedDB Helper Functions ---
const DB_NAME = 'bbs-db';
const DB_VERSION = 1;
let dbInstance = null;

async function openDB() {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('posts')) {
        const store = db.createObjectStore('posts', { keyPath: 'id' });
        store.createIndex('thread_id', 'thread_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'user_uuid' });
      }
    };
    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    if (Array.isArray(data)) {
      data.forEach(item => store.put(item));
    } else {
      store.put(data);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function dbGetPosts(threadId, limit = 20, beforeId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('posts', 'readonly');
    const index = transaction.objectStore('posts').index('thread_id');
    // ID降順で取得
    const request = index.openCursor(IDBKeyRange.only(Number(threadId)), 'prev');
    const posts = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(posts);
        return;
      }

      const post = cursor.value;

      if (beforeId !== null && post.id >= beforeId) {
        cursor.continue();
      } else if (posts.length < limit) {
        posts.push(cursor.value);
        cursor.continue();
      } else {
        resolve(posts);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function dbGetUsers(uuids) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const users = {};
    let count = 0;
    if (uuids.length === 0) return resolve({});
    
    uuids.forEach(uuid => {
      const request = store.get(uuid);
      request.onsuccess = () => {
        if (request.result) {
          users[uuid] = request.result.name;
        }
        count++;
        if (count === uuids.length) resolve(users);
      };
      request.onerror = () => {
        count++;
        if (count === uuids.length) resolve(users);
      }
    });
  });
}

async function dbGetMaxPostId(threadId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('posts', 'readonly');
    const index = transaction.objectStore('posts').index('thread_id');
    const request = index.openCursor(IDBKeyRange.only(Number(threadId)), 'prev');
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value.id : 0);
    };
    request.onerror = () => reject(request.error);
  });
}
// --- End IndexedDB Helper Functions ---

async function init() {
  registerServiceWorker();
  const hasUuid = checkUuid();
  
  if (hasUuid) {
    await fetchCsrfToken();
    subscribeUser(); // 通知購読を試みる
    loadUser(); // ユーザー情報は非同期でロード

    await loadThreads(); // スレッド一覧取得を待つ

    // ルーティング設定
    window.addEventListener('popstate', handleRouting);
    await handleRouting(); // 初期表示時のURLチェック
  } else {
    // UUIDがない場合はWelcome画面へ（CSRFトークンは必要）
    await fetchCsrfToken();
    showView('welcome-view');
  }

  document.getElementById('register-form').addEventListener('submit', handleRegister);
  // document.getElementById('transfer-form').addEventListener('submit', handleTransfer); // 引き継ぎコードについて、将来対応につきコメントアウト
  document.getElementById('thread-form').addEventListener('submit', handleCreateThread);
  document.getElementById('post-form').addEventListener('submit', handlePostSubmit);
  document.getElementById('user-form').addEventListener('submit', handleUserUpdate);
  document.getElementById('thread-rename-form').addEventListener('submit', handleUpdateThreadTitle);

  // スクロールイベント監視（無限スクロール）
  window.addEventListener('scroll', handleScroll);

  document.getElementById('back-btn').addEventListener('click', () => {
    const url = new URL(window.location);
    url.searchParams.delete('thread_id');
    url.searchParams.delete('invite_token');
    history.pushState({}, '', url);
    handleRouting();
  });

  document.getElementById('menu-btn').addEventListener('click', toggleMenu);
  document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', handleNavClick);
  });

  // メニュー外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-menu-btn') && !e.target.closest('.post-menu')) {
      closeAllMenus();
    }
  });
}

async function handleRouting() {
  const urlParams = new URLSearchParams(window.location.search);
  const threadId = urlParams.get('thread_id');
  const inviteToken = urlParams.get('invite_token');

  if (inviteToken && threadId) {
    await joinWithInvite(threadId, inviteToken);
    // 招待トークン処理後はURLからトークンを削除（リロード時の再実行防止）
    const url = new URL(window.location);
    url.searchParams.delete('invite_token');
    history.replaceState({}, '', url);
  }

  if (threadId) {
    // スレッド一覧が未ロードの場合はロードする（通常はinitでロード済み）
    if (threads.length === 0) await loadThreads();

    const targetThread = threads.find(t => t.id == threadId);
    if (targetThread) {
      openThread(targetThread.id, targetThread.title);
      return;
    }
  }

  // thread_idがない、または見つからない場合は一覧表示
  showView('thread-list-view');
  currentThreadId = null;
}

function navigateToThread(id) {
  const url = new URL(window.location);
  url.searchParams.set('thread_id', id);
  // invite_tokenが残っていたら消す
  url.searchParams.delete('invite_token');
  history.pushState({}, '', url);
  handleRouting();
}

/**
 * APIを呼び出す共通関数
 * @param {string} action - APIアクション名
 * @param {object} body - リクエストボディに追加するデータ
 * @returns {Promise<any>} - APIからのレスポンス(JSON)
 */
async function apiCall(action, body = {}) {
  const payload = { action, ...body };
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken,
      'X-USER-ID': localStorage.getItem('user_uuid')
    },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker Registered', reg))
      .catch(err => console.error('Service Worker Registration Failed', err));
  }
}

function checkUuid() {
  return !!localStorage.getItem('user_uuid');
}

function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function fetchCsrfToken() {
  try {
    // apiCallを使わず直接fetch（CSRFトークン取得前なので）
    const data = await (await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'init_csrf' }) })).json();
    csrfToken = data.token;
    vapidPublicKey = data.vapidPublicKey;
  } catch (error) {
    console.error('Failed to init CSRF', error);
  }
}

async function loadUser() {
  try {
    const data = await apiCall('get_user');
    if (data.name) {
      document.getElementById('username').value = data.name;
    }
  } catch (error) {
    console.error('Failed to load user', error);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const name = formData.get('name');
  const uuid = generateUuid();

  try {
    const data = await apiCall('register_user', { name });
    if (data.success) {
      localStorage.setItem('user_uuid', uuid);
      subscribeUser(); // 登録後に通知購読
      loadUser();
      await loadThreads();
      handleRouting(); // URLパラメータがあればそれに従う
    } else {
      alert('Registration failed: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Registration failed', error);
  }
}

async function handleTransfer(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const code = formData.get('code');

  try {
    const data = await apiCall('check_transfer_code', { code });
    if (data.success && data.user_uuid) {
      localStorage.setItem('user_uuid', data.user_uuid);
      subscribeUser(); // 引き継ぎ後に通知購読
      loadUser();
      await loadThreads();
      handleRouting();
    } else {
      alert('Transfer failed: ' + (data.error || 'Invalid code'));
    }
  } catch (error) {
    console.error('Transfer failed', error);
  }
}

async function loadThreads() {
  try {
    const data = await apiCall('get_threads');
    threads = data.threads || []; // グローバル変数を更新
    renderThreads(threads);
    return threads;
  } catch (error) {
    console.error('Failed to load threads', error);
    return [];
  }
}

function renderThreads(threads) {
  const container = document.getElementById('threads-container');
  container.innerHTML = '';

  if (threads.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No threads found. Create a new one or ask for an invitation.';
    p.style.color = '#666';
    p.style.textAlign = 'center';
    container.appendChild(p);
  } else {
    threads.forEach(thread => {
      const div = document.createElement('div');
      div.className = 'thread-item';
      div.textContent = thread.title;
      div.onclick = () => navigateToThread(thread.id);
      container.appendChild(div);
    });
  }
}

function openThread(id, title) {
  currentThreadId = id;
  currentThreadTitle = title;
  
  // リセット
  oldestPostId = null;
  hasMorePosts = true;
  document.getElementById('posts-container').innerHTML = '';
  
  showView('thread-detail-view');
  loadPosts();
}

async function loadPosts(isPastLog = false) {
  if (!currentThreadId || isLoading) return;
  if (isPastLog && !hasMorePosts) return;

  isLoading = true;
  try {
    // 過去ログ読み込みの場合
    if (isPastLog && oldestPostId) {
      // まずキャッシュを確認
      const cachedPosts = await dbGetPosts(currentThreadId, LIMIT, oldestPostId);
      if (cachedPosts.length > 0) {
        oldestPostId = cachedPosts[cachedPosts.length - 1].id;
        const userUuids = [...new Set(cachedPosts.map(p => p.user_uuid))];
        const userMap = await dbGetUsers(userUuids);
        renderPosts(cachedPosts, isPastLog, userMap);
        isLoading = false;
        return;
      }

      // キャッシュになければAPIコール
      const data = await apiCall('get_posts', {
        thread_id: currentThreadId,
        limit: LIMIT,
        before_id: oldestPostId
      });
      
      const posts = data.posts || [];
      const users = data.users || [];

      if (posts.length < LIMIT) hasMorePosts = false;
      if (posts.length > 0) {
        // 数値型を保証（IndexedDBの検索キー用）
        posts.forEach(p => {
          p.id = Number(p.id);
          p.thread_id = Number(p.thread_id);
        });
        // DB保存
        await dbPut('posts', posts);
        await dbPut('users', users);
        
        oldestPostId = posts[posts.length - 1].id;
        
        // ユーザー名解決用マップ作成
        const userUuids = [...new Set(posts.map(p => p.user_uuid))];
        const userMap = await dbGetUsers(userUuids);
        
        renderPosts(posts, isPastLog, userMap);
      }
      isLoading = false;
      return;
    }

    // 通常ロード（初期表示・更新）
    // 1. Cache First: DBから表示
    const cachedPosts = await dbGetPosts(currentThreadId, LIMIT);
    if (cachedPosts.length > 0) {
      oldestPostId = cachedPosts[cachedPosts.length - 1].id;
      const userUuids = [...new Set(cachedPosts.map(p => p.user_uuid))];
      const userMap = await dbGetUsers(userUuids);
      renderPosts(cachedPosts, false, userMap);
    }

    // 2. Network Update: 差分取得
    const maxId = await dbGetMaxPostId(currentThreadId);
    const apiParams = { thread_id: currentThreadId, limit: 50 }; // 差分は少し多めに取る
    if (maxId > 0) {
      apiParams.after_id = maxId;
    }

    const data = await apiCall('get_posts', apiParams);
    const newPosts = data.posts || [];
    const newUsers = data.users || [];

    if (newPosts.length > 0 || newUsers.length > 0) {
      newPosts.forEach(p => {
        p.id = Number(p.id);
        p.thread_id = Number(p.thread_id);
      });
      await dbPut('posts', newPosts);
      await dbPut('users', newUsers);

      // 差分があった場合、最新状態を再描画
      // (シンプルにするため、DBから最新LIMIT件を取り直して描画)
      const updatedPosts = await dbGetPosts(currentThreadId, LIMIT);
      oldestPostId = updatedPosts[updatedPosts.length - 1].id;
      const userUuids = [...new Set(updatedPosts.map(p => p.user_uuid))];
      const userMap = await dbGetUsers(userUuids);
      renderPosts(updatedPosts, false, userMap);
    }
  } catch (error) {
    console.error('Failed to load posts', error);
  } finally {
    isLoading = false;
  }
}

function renderPosts(posts, isPastLog, userMap = {}) {
  const container = document.getElementById('posts-container');
  const myUuid = localStorage.getItem('user_uuid');
  
  // APIは新しい順(DESC)で返すので、表示用に古い順に並べ替える
  const sortedPosts = [...posts].reverse();

  const fragment = document.createDocumentFragment();

  let lastUserUuid = null;

  sortedPosts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post-item';
    if (post.user_uuid === myUuid) {
      div.classList.add('my-post');
    }
    
    if (lastUserUuid === post.user_uuid) {
      div.classList.add('same-user');
    }
    lastUserUuid = post.user_uuid;

    const icon = document.createElement('div');
    icon.className = 'post-icon';

    const name = document.createElement('div');
    name.className = 'post-name';
    name.textContent = userMap[post.user_uuid] || 'Unknown';

    const time = document.createElement('div');
    time.className = 'post-time';
    const timeStr = post.created_at.substring(11, 16);
    time.textContent = timeStr;

    const body = document.createElement('div');
    body.className = 'post-body';
    body.textContent = post.body;

    div.appendChild(icon);
    div.appendChild(name);
    div.appendChild(time);
    div.appendChild(body);

    if (post.user_uuid === myUuid) {
      // メニューボタン (PC用)
      const menuBtn = document.createElement('button');
      menuBtn.className = 'post-menu-btn';
      menuBtn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        togglePostMenu(post.id);
      };
      div.appendChild(menuBtn);

      // メニュー本体
      const menuDiv = document.createElement('div');
      menuDiv.className = 'post-menu';
      menuDiv.id = `post-menu-${post.id}`;
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Delete';
      deleteBtn.onclick = () => handleDelete(post.id);
      
      menuDiv.appendChild(deleteBtn);
      div.appendChild(menuDiv);

      // スマホ長押し対応
      setupLongPress(div, post.id);
    }

    fragment.appendChild(div);
  });

  if (isPastLog) {
    // 過去ログ読み込み時は上に追加し、スクロール位置を維持する
    const previousHeight = document.documentElement.scrollHeight;
    const previousScrollTop = document.documentElement.scrollTop;

    container.insertBefore(fragment, container.firstChild);

    // 追加されたコンテンツの高さ分だけスクロール位置を調整
    const currentHeight = document.documentElement.scrollHeight;
    document.documentElement.scrollTop = previousScrollTop + (currentHeight - previousHeight);
  } else {
    // 初回ロード時は中身をクリアして追加し、最下部へスクロール
    container.innerHTML = '';
    container.appendChild(fragment);
    window.scrollTo(0, document.body.scrollHeight);
  }
}

function setupLongPress(element, postId) {
  let timer;
  const DURATION = 500; // 長押し判定時間 (ms)

  element.addEventListener('touchstart', (e) => {
    // 複数指タップは無視
    if (e.touches.length > 1) return;
    
    timer = setTimeout(() => {
      togglePostMenu(postId, true); // true = 強制表示
      if (navigator.vibrate) navigator.vibrate(50); // バイブレーション
    }, DURATION);
  }, { passive: true });

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  element.addEventListener('touchend', clearTimer);
  element.addEventListener('touchmove', clearTimer);
  
  // 長押し時のブラウザ標準メニューを抑止
  element.addEventListener('contextmenu', (e) => {
    // 自身の投稿に対する長押しメニューを優先
    e.preventDefault();
  });
}

function togglePostMenu(postId, forceShow = false) {
  const menu = document.getElementById(`post-menu-${postId}`);
  if (!menu) return;

  const isHidden = !menu.classList.contains('show');
  closeAllMenus(); // 他のメニューを閉じる

  if (isHidden || forceShow) {
    menu.classList.add('show');
  }
}

function closeAllMenus() {
  document.querySelectorAll('.post-menu.show').forEach(el => el.classList.remove('show'));
}

async function handleCreateThread(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const title = formData.get('title');

  try {
    const data = await apiCall('create_thread', { title });
    if (data.success) {
      form.reset();
      loadThreads();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Create thread failed', error);
  }
}

async function handlePostSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const body = form.querySelector('textarea[name="body"]').value;

  try {
    const data = await apiCall('create_post', { thread_id: currentThreadId, body });
    if (data.success) {
      form.reset();
      // 投稿後は最新の状態を再ロード
      oldestPostId = null;
      hasMorePosts = true;
      loadPosts(false);
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Post failed', error);
  }
}

async function handleUserUpdate(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const name = formData.get('name');
  try {
    const data = await apiCall('update_user', { name });
    if (data.success) {
      alert('Name updated!');
      if (currentThreadId) loadPosts(false);
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Update user failed', error);
  }
}

async function handleDelete(id) {
  if (!confirm('Are you sure you want to delete this post?')) return;

  try {
    const data = await apiCall('delete_post', { id });
    if (data.success) {
      loadPosts(false); // 削除後もリロード
    } else {
      alert('Error: ' + (data.error || 'Delete failed'));
    }
  } catch (error) {
    console.error('Delete failed', error);
  }
}

function handleScroll() {
  // スレッド詳細画面以外では何もしない
  if (document.getElementById('thread-detail-view').classList.contains('hidden')) return;

  // 画面上部に近づいたら過去ログをロード (閾値50px)
  if (window.scrollY < 50 && hasMorePosts && !isLoading) {
    loadPosts(true);
  }
}

function toggleMenu() {
  document.getElementById('nav-menu').classList.toggle('hidden');
}

function handleNavClick(e) {
  e.preventDefault();
  const targetId = e.target.dataset.target;
  
  if (targetId === 'thread-list-view') {
    // 一覧に戻る場合はURLパラメータをクリア
    const url = new URL(window.location);
    url.searchParams.delete('thread_id');
    history.pushState({}, '', url);
    handleRouting();
  } else {
    showView(targetId);
  }
  toggleMenu(); // Close menu
}

function showView(viewId) {
  const views = ['welcome-view', 'thread-list-view', 'thread-detail-view', 'settings-view', 'thread-settings-view'];
  views.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');

  // --- UI要素の表示/非表示とタイトルをデータ駆動で管理 ---
  const viewConfig = {
    'welcome-view':         { showHeader: false, showBackBtn: false, showThreadSettings: false, title: '' },
    'thread-list-view':     { showHeader: true,  showBackBtn: false, showThreadSettings: false, title: 'Simple BBS' },
    'thread-detail-view':   { showHeader: true,  showBackBtn: true,  showThreadSettings: true,  title: currentThreadTitle },
    'settings-view':        { showHeader: true,  showBackBtn: false, showThreadSettings: false, title: 'User Settings' },
    'thread-settings-view': { showHeader: true,  showBackBtn: true,  showThreadSettings: true,  title: 'Thread Settings' },
  };

  const config = viewConfig[viewId];
  if (!config) return;

  // ヘッダー
  document.getElementById('site-header').classList.toggle('hidden', !config.showHeader);
  // 戻るボタン
  document.getElementById('back-btn').classList.toggle('hidden', !config.showBackBtn);
  // スレッド設定メニュー
  document.getElementById('nav-thread-settings').classList.toggle('hidden', !config.showThreadSettings);

  // ページタイトル
  const pageTitle = document.getElementById('page-title');
  pageTitle.textContent = config.title;

  // --- 各ビューに固有の処理 ---
  if (viewId === 'settings-view') {
      document.getElementById('app-version').textContent = `App Version: ${APP_VERSION}`;
  }
  if (viewId === 'thread-settings-view') {
      loadThreadSettings();
  }
}

async function loadThreadSettings() {
  if (!currentThreadId) return;
  try {
    const data = await apiCall('get_thread_settings', { thread_id: currentThreadId });
    if (data.success) {
      renderThreadSettings(data);
    }
  } catch (error) {
    console.error('Failed to load thread settings', error);
  }
}

function renderThreadSettings(data) {
  document.getElementById('setting-thread-title').value = data.title;

  // Members
  const memberList = document.getElementById('member-list');
  memberList.innerHTML = '';
  data.members.forEach(member => {
    const div = document.createElement('div');
    div.className = 'member-item';
    div.innerHTML = `<span>${member.name}</span>`;
    
    // 自分自身は削除できないようにする
    if (member.user_uuid !== localStorage.getItem('user_uuid')) {
      const btn = document.createElement('button');
      btn.className = 'secondary-btn';
      btn.innerHTML = '<i class="bi bi-dash-circle"></i>';
      btn.onclick = () => handleRemoveMember(member.user_uuid);
      div.appendChild(btn);
    }
    memberList.appendChild(div);
  });

  // Candidates
  const candidateList = document.getElementById('candidate-list');
  candidateList.innerHTML = '';
  if (data.candidates.length === 0) {
    candidateList.textContent = 'No candidates found.';
  } else {
    data.candidates.forEach(user => {
      const div = document.createElement('div');
      div.className = 'member-item';
      div.innerHTML = `<span>${user.name}</span>`;
      
      const btn = document.createElement('button');
      btn.innerHTML = '<i class="bi bi-plus-circle"></i>';
      btn.onclick = () => handleAddMember(user.user_uuid);
      div.appendChild(btn);
      candidateList.appendChild(div);
    });
  }

  // QR Code
  generateQrCode();
}

async function handleUpdateThreadTitle(e) {
  e.preventDefault();
  const title = document.getElementById('setting-thread-title').value;

  try {
    const data = await apiCall('update_thread_title', { thread_id: currentThreadId, title });
    if (data.success) {
      currentThreadTitle = title;
      alert('Thread title updated.');
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Update title failed', error);
  }
}

async function handleAddMember(targetUuid) {
  try {
    const data = await apiCall('add_thread_member', { thread_id: currentThreadId, target_user_uuid: targetUuid });
    if (data.success) {
      loadThreadSettings();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Add member failed', error);
  }
}

async function handleRemoveMember(targetUuid) {
  if (!confirm('Remove this member?')) return;
  try {
    const data = await apiCall('remove_thread_member', { thread_id: currentThreadId, target_user_uuid: targetUuid });
    if (data.success) {
      loadThreadSettings();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Remove member failed', error);
  }
}

async function generateQrCode() {
  const container = document.getElementById('qr-code-container');
  container.innerHTML = '';

  try {
    const data = await apiCall('generate_invite_token', { thread_id: currentThreadId });
    if (data.success && data.token) {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?thread_id=${currentThreadId}&invite_token=${data.token}`;
      new QRCode(container, {
        text: inviteUrl,
        width: 128,
        height: 128
      });
    }
  } catch (error) {
    console.error('QR generation failed', error);
  }
}

async function joinWithInvite(threadId, token) {
  try {
    const data = await apiCall('join_with_invite', { thread_id: threadId, token });
    if (data.success) {
      alert('Joined thread successfully!');
      await loadThreads(); // 一覧を更新（画面遷移はhandleRoutingに任せる）
    } else {
      alert('Failed to join: ' + (data.error || 'Invalid or expired token'));
    }
  } catch (error) {
    console.error('Join failed', error);
  }
}

// Web Push Logic
async function subscribeUser() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    await sendSubscriptionToBackEnd(subscription);
  } catch (error) {
    console.error('Failed to subscribe user', error);
  }
}

async function sendSubscriptionToBackEnd(subscription) {
  try {
    await apiCall('register_subscription', {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys
    });
  } catch (error) {
    console.error('Failed to send subscription', error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}