const API_URL = 'api.php';
let csrfToken = '';
let currentOffset = 0;
const LIMIT = 10;
let currentThreadId = null;
let currentThreadTitle = '';

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  const hasUuid = checkUuid();
  
  if (hasUuid) {
    await fetchCsrfToken();
    showView('thread-list-view');
    loadUser();
    loadThreads();
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
  document.getElementById('prev-btn').addEventListener('click', () => changePage(-1));
  document.getElementById('next-btn').addEventListener('click', () => changePage(1));
  document.getElementById('back-to-threads-btn').addEventListener('click', () => showView('thread-list-view'));

  document.getElementById('menu-btn').addEventListener('click', toggleMenu);
  document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', handleNavClick);
  });
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
      showView('thread-list-view');
      loadUser();
      loadThreads();
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
      showView('thread-list-view');
      loadUser();
      loadThreads();
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
    renderThreads(data.threads || []);
  } catch (error) {
    console.error('Failed to load threads', error);
  }
}

function renderThreads(threads) {
  const container = document.getElementById('threads-container');
  container.innerHTML = '';

  threads.forEach(thread => {
    const div = document.createElement('div');
    div.className = 'thread-item';
    div.textContent = thread.title;
    div.onclick = () => openThread(thread.id, thread.title);
    container.appendChild(div);
  });
}

function openThread(id, title) {
  currentThreadId = id;
  currentThreadTitle = title;
  document.getElementById('current-thread-title').textContent = title;
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
  showView(targetId);
  toggleMenu(); // Close menu
}

function showView(viewId) {
  const views = ['welcome-view', 'thread-list-view', 'thread-detail-view', 'settings-view'];
  views.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');

  // ヘッダーの表示制御（Welcome画面では非表示）
  if (viewId === 'welcome-view') {
    document.getElementById('site-header').classList.add('hidden');
  } else {
    document.getElementById('site-header').classList.remove('hidden');
  }
}