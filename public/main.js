const APP_VERSION = 'v6';
const API_URL = 'api.php';
let csrfToken = '';
let vapidPublicKey = '';
let currentOffset = 0;
const LIMIT = 10;
let currentThreadId = null;
let currentThreadTitle = '';
let threads = [];

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
  document.getElementById('prev-btn').addEventListener('click', () => changePage(-1));
  document.getElementById('next-btn').addEventListener('click', () => changePage(1));
  document.getElementById('back-btn').addEventListener('click', () => {
    // 一覧に戻る（URLパラメータを削除）
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-USER-ID': localStorage.getItem('user_uuid') },
      body: JSON.stringify({ action: 'init_csrf' }) // UUIDがなくてもCSRFトークンは取得可能にする
    });
    const data = await response.json();
    csrfToken = data.token;
    vapidPublicKey = data.vapidPublicKey;
  } catch (error) {
    console.error('Failed to init CSRF', error);
  }
}

async function loadUser() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'get_user' })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': uuid
      },
      body: JSON.stringify({ action: 'register_user', name: name })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
      body: JSON.stringify({ action: 'check_transfer_code', code: code })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'get_threads' })
    });
    const data = await response.json();
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
  currentOffset = 0;
  showView('thread-detail-view');
  loadPosts();
}

async function loadPosts() {
  if (!currentThreadId) return;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({
        action: 'get_posts',
        thread_id: currentThreadId,
        limit: LIMIT,
        offset: currentOffset
      })
    });
    const data = await response.json();
    renderPosts(data.posts || []);
    updatePagination(data.posts ? data.posts.length : 0);
  } catch (error) {
    console.error('Failed to load posts', error);
  }
}

function renderPosts(posts) {
  const container = document.getElementById('posts-container');
  container.innerHTML = '';

  const myUuid = localStorage.getItem('user_uuid');
  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post-item';
    
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.textContent = `${post.id}. ${post.name || 'Unknown'} - ${post.created_at}`;

    const body = document.createElement('div');
    body.className = 'post-body';
    body.textContent = post.body;

    div.appendChild(meta);
    div.appendChild(body);

    if (post.user_uuid === myUuid) {
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => handleDelete(post.id);
      div.appendChild(deleteBtn);
    }

    container.appendChild(div);
  });
}

async function handleCreateThread(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const title = formData.get('title');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'create_thread', title: title })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      }, 
      body: JSON.stringify({
        action: 'create_post',
        thread_id: currentThreadId,
        body: body
      })
    });
    const data = await response.json();
    if (data.success) {
      form.reset();
      currentOffset = 0;
      loadPosts();
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
  const payload = Object.fromEntries(formData.entries());
  payload.action = 'update_user';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.success) {
      alert('Name updated!');
      if (currentThreadId) loadPosts();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'delete_post', id })
    });
    const data = await response.json();
    if (data.success) {
      loadPosts();
    } else {
      alert('Error: ' + (data.error || 'Delete failed'));
    }
  } catch (error) {
    console.error('Delete failed', error);
  }
}

function changePage(direction) {
  currentOffset += direction * LIMIT;
  if (currentOffset < 0) currentOffset = 0;
  loadPosts();
}

function updatePagination(count) {
  document.getElementById('prev-btn').disabled = currentOffset === 0;
  document.getElementById('next-btn').disabled = count < LIMIT;
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
  const views = ['welcome-view', 'thread-list-view', 'thread-detail-view', 'settings-view'];
  views.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
  
  const header = document.getElementById('site-header');
  const pageTitle = document.getElementById('page-title');
  const backBtn = document.getElementById('back-btn');
  const navThreadSettings = document.getElementById('nav-thread-settings');

  // Header visibility
  if (viewId === 'welcome-view') {
    header.classList.add('hidden');
  } else {
    header.classList.remove('hidden');
  }

  // Back button visibility
  if (viewId === 'thread-detail-view' || viewId === 'thread-settings-view') {
    backBtn.classList.remove('hidden');
  } else {
    backBtn.classList.add('hidden');
  }

  // Thread Settings Menu visibility
  if (viewId === 'thread-detail-view' || viewId === 'thread-settings-view') {
    navThreadSettings.classList.remove('hidden');
  } else {
    navThreadSettings.classList.add('hidden');
  }

  // Page title content
  switch (viewId) {
    case 'thread-list-view':
      pageTitle.textContent = 'Simple BBS';
      break;
    case 'settings-view':
      pageTitle.textContent = 'User Settings';
      document.getElementById('app-version').textContent = `App Version: ${APP_VERSION}`;
      break;
    case 'thread-detail-view':
      pageTitle.textContent = currentThreadTitle;
      break;
    case 'thread-settings-view':
      pageTitle.textContent = 'Thread Settings';
      loadThreadSettings();
      break;
  }
}

async function loadThreadSettings() {
  if (!currentThreadId) return;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'get_thread_settings', thread_id: currentThreadId })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'update_thread_title', thread_id: currentThreadId, title: title })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'add_thread_member', thread_id: currentThreadId, target_user_uuid: targetUuid })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'remove_thread_member', thread_id: currentThreadId, target_user_uuid: targetUuid })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'generate_invite_token', thread_id: currentThreadId })
    });
    const data = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({ action: 'join_with_invite', thread_id: threadId, token: token })
    });
    const data = await response.json();
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
    await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-USER-ID': localStorage.getItem('user_uuid')
      },
      body: JSON.stringify({
        action: 'register_subscription',
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys
      })
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