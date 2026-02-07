const APP_VERSION = 'v27';
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
let deferredPrompt = null;
let currentLang = localStorage.getItem('lang') || 'ja';

const TRANSLATIONS = {
  // UI
  'app-title': { ja: 'Simple BBS', en: 'Simple BBS' },
  'welcome-title': { ja: 'Simple BBSへようこそ', en: 'Welcome to Simple BBS' },
  'welcome-text': { ja: '初めて利用する方はユーザ名を設定してください。', en: 'Please set your username to start.' },
  'label-language': { ja: '言語選択', en: 'Language' },
  'label-user-name': { ja: 'ユーザー名', en: 'User Name' },
  'placeholder-enter-name': { ja: '名前を入力', en: 'Enter your name' },
  'btn-ok': { ja: 'OK', en: 'OK' },
  'text-transfer-hint': { ja: '別の端末でも利用している方は、その端末で <i class="bi bi-list"></i> → ユーザ設定 → 引き継ぎコード発行 で表示される6桁の数字を、以下に入力することで、設定を引き継ぐことができます。', en: 'If you are using the app on another device, you can transfer your settings by entering the 6-digit code displayed in <i class="bi bi-list"></i> -> User Settings -> Issue Transfer Code on that device.' },
  'label-transfer-code': { ja: '引き継ぎコード', en: 'Transfer Code' },
  'placeholder-enter-code': { ja: 'コードを入力', en: 'Enter transfer code' },
  'text-install-prompt': { ja: 'ホーム画面にアイコンを追加することができます。', en: 'You can add this app to your home screen.' },
  'btn-install': { ja: 'アプリのインストール', en: 'Install App' },
  'text-ios-guide': { ja: '画面下部の <i class="bi bi-box-arrow-up"></i> から、「ホーム画面に追加」をタップしてください。', en: 'Tap <i class="bi bi-box-arrow-up"></i> at the bottom and select "Add to Home Screen".' },
  
  'menu-threads': { ja: 'スレッド一覧', en: 'Threads' },
  'menu-user-settings': { ja: 'ユーザー設定', en: 'User Settings' },
  'menu-thread-settings': { ja: 'スレッド設定', en: 'Thread Settings' },
  
  'label-your-name': { ja: 'あなたの名前', en: 'Your Name' },
  'btn-save-name': { ja: '名前を保存', en: 'Save Name' },
  'header-data-transfer': { ja: 'データ引き継ぎ', en: 'Data Transfer' },
  'text-issue-transfer-code': { ja: '機種変更などのために引き継ぎコードを発行します。', en: 'Issue a transfer code to move your data to another device.' },
  'btn-issue-transfer-code': { ja: '引き継ぎコード発行', en: 'Issue Transfer Code' },
  'label-code': { ja: 'コード:', en: 'Code:' },
  'label-expires-at': { ja: '有効期限:', en: 'Expires at:' },
  
  'placeholder-create-thread': { ja: '新しいスレッドを作成', en: 'Create New Thread' },
  
  'header-thread-settings': { ja: 'スレッド設定', en: 'Thread Settings' },
  'label-thread-name': { ja: 'スレッド名', en: 'Thread Name' },
  'btn-rename': { ja: '変更', en: 'Rename' },
  'header-members': { ja: '参加メンバー', en: 'Members' },
  'header-add-members': { ja: 'メンバー追加', en: 'Add Members' },
  'header-invite-qr': { ja: 'QRコード招待', en: 'Invite via QR Code' },
  'btn-generate-qr': { ja: '招待用QRコードを表示', en: 'Show Invite QR Code' },
  'header-ai-features': { ja: 'AI機能', en: 'AI Features' },
  'btn-summarize': { ja: '要約して投稿', en: 'Summarize & Post' },
  
  'placeholder-type-message': { ja: 'メッセージを入力...', en: 'Type a message...' },
  
  'btn-delete': { ja: '削除', en: 'Delete' },
  'msg-no-threads': { ja: 'スレッドが見つかりません。新規作成するか、招待を受けてください。', en: 'No threads found. Create a new one or ask for an invitation.' },
  'msg-no-candidates': { ja: '候補がいません。', en: 'No candidates found.' },

  // JS Messages
  'msg-confirm-delete': { ja: '本当に削除しますか？', en: 'Are you sure you want to delete this post?' },
  'msg-name-updated': { ja: '名前を更新しました！', en: 'Name updated!' },
  'msg-title-updated': { ja: 'スレッド名を更新しました。', en: 'Thread title updated.' },
  'msg-joined': { ja: 'スレッドに参加しました！', en: 'Joined thread successfully!' },
  'msg-remove-member': { ja: 'このメンバーを削除しますか？', en: 'Remove this member?' },
  'msg-summarize-sent': { ja: 'AIに要約を依頼しました。完了までしばらくお待ちください。', en: 'Request sent to AI. Please wait a moment.' },

  // Errors (API codes)
  'error_invalid_csrf_token': { ja: '不正なCSRFトークンです。', en: 'Invalid CSRF token' },
  'error_thread_id_required': { ja: 'スレッドIDが必要です。', en: 'Thread ID is required' },
  'error_access_denied': { ja: 'このスレッドへのアクセス権がありません。', en: 'Access denied to this thread' },
  'error_missing_fields': { ja: '必須項目が不足しています。', en: 'Missing required fields' },
  'error_invalid_id_or_permission': { ja: '無効なIDか、権限がありません。', en: 'Invalid id or permission denied' },
  'error_user_uuid_required': { ja: 'ユーザーUUIDが必要です。', en: 'User UUID required' },
  'error_code_required': { ja: 'コードが必要です。', en: 'Code is required' },
  'error_invalid_code': { ja: 'コードが無効か期限切れです。', en: 'Invalid or expired code' },
  'error_thread_not_found': { ja: 'スレッドが見つかりません。', en: 'Thread not found' },
  'error_invalid_input': { ja: '入力が無効です。', en: 'Invalid input' },
  'error_permission_denied': { ja: '権限がありません。', en: 'Permission denied' },
  'error_invalid_token': { ja: 'トークンが無効か期限切れです。', en: 'Invalid or expired token' },
  'error_invalid_action': { ja: '無効な操作です。', en: 'Invalid action' },
  'error_internal_server_error': { ja: 'サーバーエラーが発生しました。', en: 'Internal Server Error' },
  'unknown_error': { ja: '不明なエラーが発生しました。', en: 'Unknown error' }
};

document.addEventListener('DOMContentLoaded', () => {
  init();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  checkInstallPromotion();
});

// --- IndexedDB Helper Functions ---
const DB_NAME = (() => {
  const parts = window.location.pathname.split('/');
  // 最後の1つ前の要素を取得(最後の要素は、空文字列や"index.html"などを想定)
  let segment = parts[parts.length - 2];
  
  // "public"であればもう1つ前の要素を取得
  if (segment === 'public') {
    segment = parts[parts.length - 3];
  }
  
  // 空文字やundefinedの場合はデフォルト値、使えない文字は置換
  if (!segment) segment = 'default';
  return `bbs-db-${segment.replace(/[^a-zA-Z0-9-_]/g, '-')}`;
})();
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

async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.delete(id);
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
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      const message = event.data;
      if (message.action === 'check_thread') {
        const data = message.payload;
        // スレッドIDが一致し、かつ画面が表示されているか判定
        const isOpen = (currentThreadId && data.thread_id == currentThreadId && !document.hidden);
        
        // SWに応答を返す
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ isOpen: isOpen });
        }

        // 開いている場合は画面更新
        if (isOpen) {
          if (data.type === 'create') {
            loadPosts(false);
          } else if (data.type === 'delete') {
            dbDelete('posts', Number(data.post_id)).then(() => {
               loadPosts(false);
            });
          }
        }
      }
    });
  }

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
  document.getElementById('transfer-form').addEventListener('submit', handleTransfer);
  document.getElementById('thread-form').addEventListener('submit', handleCreateThread);
  document.getElementById('post-form').addEventListener('submit', handlePostSubmit);
  document.getElementById('user-form').addEventListener('submit', handleUserUpdate);
  document.getElementById('issue-transfer-code-btn').addEventListener('click', handleIssueTransferCode);
  document.getElementById('install-btn').addEventListener('click', handleInstallClick);
  document.getElementById('thread-rename-form').addEventListener('submit', handleUpdateThreadTitle);
  document.getElementById('summarize-btn').addEventListener('click', handleSummarizeThread);
  document.getElementById('generate-qr-btn').addEventListener('click', generateQrCode);

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

  checkInstallPromotion();
  
  // 言語切り替え
  document.querySelectorAll('input[name="lang"]').forEach(radio => {
    if (radio.value === currentLang) radio.checked = true;
    radio.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  });
  updateTranslations();
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
      alert(t(data.error) || data.error);
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
      alert(t(data.error) || data.error);
    }
  } catch (error) {
    console.error('Transfer failed', error);
  }
}

async function handleIssueTransferCode() {
  try {
    const data = await apiCall('generate_transfer_code');
    if (data.success) {
      const display = document.getElementById('transfer-code-display');
      document.getElementById('transfer-code-value').textContent = data.code;
      document.getElementById('transfer-code-expiry').textContent = data.expire_at;
      display.classList.remove('hidden');
    } else {
      alert(t(data.error) || data.error);
    }
  } catch (error) {
    console.error('Issue transfer code failed', error);
  }
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function isStandalone() {
  return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone) || document.referrer.includes('android-app://');
}

function checkInstallPromotion() {
  if (isStandalone()) return;

  const promotionContainer = document.getElementById('install-promotion');
  const promptContainer = document.getElementById('install-prompt-container');
  const iosContainer = document.getElementById('ios-install-guide');
  
  if (!promotionContainer || !promptContainer || !iosContainer) return;

  if (isIOS()) {
    promotionContainer.classList.remove('hidden');
    iosContainer.classList.remove('hidden');
    promptContainer.classList.add('hidden');
  } else if (deferredPrompt) {
    promotionContainer.classList.remove('hidden');
    promptContainer.classList.remove('hidden');
    iosContainer.classList.add('hidden');
  }
}

async function handleInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === 'accepted') {
    document.getElementById('install-promotion').classList.add('hidden');
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
    p.textContent = t('msg-no-threads');
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
      deleteBtn.innerHTML = `<i class="bi bi-trash"></i> ${t('btn-delete')}`;
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
      alert(t(data.error) || data.error);
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
      alert(t(data.error) || data.error);
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
      alert(t('msg-name-updated'));
      if (currentThreadId) loadPosts(false);
    } else {
      alert(t(data.error) || data.error);
    }
  } catch (error) {
    console.error('Update user failed', error);
  }
}

async function handleDelete(id) {
  if (!confirm(t('msg-confirm-delete'))) return;

  try {
    const data = await apiCall('delete_post', { id });
    if (data.success) {
      // IndexedDBからも削除
      await dbDelete('posts', id);
      loadPosts(false); // 削除後もリロード
    } else {
      alert(t(data.error) || data.error);
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
    'welcome-view':         { showHeader: false, showBackBtn: false, showThreadSettings: false, titleKey: '' },
    'thread-list-view':     { showHeader: true,  showBackBtn: false, showThreadSettings: false, titleKey: 'app-title' },
    'thread-detail-view':   { showHeader: true,  showBackBtn: true,  showThreadSettings: true,  titleKey: null }, // dynamic
    'settings-view':        { showHeader: true,  showBackBtn: false, showThreadSettings: false, titleKey: 'menu-user-settings' },
    'thread-settings-view': { showHeader: true,  showBackBtn: true,  showThreadSettings: true,  titleKey: 'menu-thread-settings' },
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
  if (config.titleKey) {
    pageTitle.setAttribute('data-i18n', config.titleKey);
    pageTitle.textContent = t(config.titleKey);
  } else {
    pageTitle.removeAttribute('data-i18n');
    pageTitle.textContent = currentThreadTitle;
  }

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
    candidateList.textContent = t('msg-no-candidates');
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

  // QR Code Container Clear
  document.getElementById('qr-code-container').innerHTML = '';
}

async function handleUpdateThreadTitle(e) {
  e.preventDefault();
  const title = document.getElementById('setting-thread-title').value;

  try {
    const data = await apiCall('update_thread_title', { thread_id: currentThreadId, title });
    if (data.success) {
      currentThreadTitle = title;
      alert(t('msg-title-updated'));
    } else {
      alert(t(data.error) || data.error);
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
      alert(t(data.error) || data.error);
    }
  } catch (error) {
    console.error('Add member failed', error);
  }
}

async function handleRemoveMember(targetUuid) {
  if (!confirm(t('msg-remove-member'))) return;
  try {
    const data = await apiCall('remove_thread_member', { thread_id: currentThreadId, target_user_uuid: targetUuid });
    if (data.success) {
      loadThreadSettings();
    } else {
      alert(t(data.error) || data.error);
    }
  } catch (error) {
    console.error('Remove member failed', error);
  }
}

async function handleSummarizeThread() {
  if (!currentThreadId) return;
  const btn = document.getElementById('summarize-btn');
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';

  try {
    const data = await apiCall('summarize_thread', { thread_id: currentThreadId });
    if (data.success) {
      alert(t('msg-summarize-sent'));
    } else {
      alert(t(data.error) || data.error);
    }
  } catch (error) {
    console.error('Summarize failed', error);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
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
      alert(t('msg-joined'));
      await loadThreads(); // 一覧を更新（画面遷移はhandleRoutingに任せる）
    } else {
      alert(t(data.error) || data.error);
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

// --- i18n Helper Functions ---
function t(key) {
  if (TRANSLATIONS[key] && TRANSLATIONS[key][currentLang]) {
    return TRANSLATIONS[key][currentLang];
  }
  return key; // Fallback to key if not found
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  updateTranslations();
  
  // ラジオボタンの同期
  document.querySelectorAll('input[name="lang"]').forEach(radio => {
    if (radio.value === lang) radio.checked = true;
  });
}

function updateTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.innerHTML = t(key); // innerHTML to support icons/html in translation
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key);
  });
}