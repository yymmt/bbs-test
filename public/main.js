const APP_VERSION = 'v8';
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
  document.getElementById('transfer-form').addEventListener('submit', handleTransfer);
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
    const params = {
      thread_id: currentThreadId,
      limit: LIMIT
    };
    if (isPastLog && oldestPostId) {
      params.before_id = oldestPostId;
    }

    const data = await apiCall('get_posts', {
      ...params
    });

    const posts = data.posts || [];
    if (posts.length < LIMIT) {
      hasMorePosts = false;
    }

    if (posts.length > 0) {
      // ID降順で来るので、最後の要素が一番古い
      oldestPostId = posts[posts.length - 1].id;
      renderPosts(posts, isPastLog);
    }
  } catch (error) {
    console.error('Failed to load posts', error);
  } finally {
    isLoading = false;
  }
}

function renderPosts(posts, isPastLog) {
  const container = document.getElementById('posts-container');
  const myUuid = localStorage.getItem('user_uuid');
  
  // APIは新しい順(DESC)で返すので、表示用に古い順に並べ替える
  const sortedPosts = [...posts].reverse();

  const fragment = document.createDocumentFragment();

  sortedPosts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post-item';
    
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    const timeStr = post.created_at.substring(11, 16);
    meta.textContent = `${post.name} - ${timeStr}`;

    const body = document.createElement('div');
    body.className = 'post-body';
    body.textContent = post.body;
    if (post.user_uuid === myUuid) {
        body.classList.add('my-post');
    }

    div.appendChild(meta);
    div.appendChild(body);

    if (post.user_uuid === myUuid) {
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => handleDelete(post.id);
      div.appendChild(deleteBtn);
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