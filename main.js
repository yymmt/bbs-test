const API_URL = 'api.php';
let csrfToken = '';
let currentOffset = 0;
const LIMIT = 10;

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  await fetchCsrfToken();
  loadPosts();

  document.getElementById('post-form').addEventListener('submit', handlePostSubmit);
  document.getElementById('prev-btn').addEventListener('click', () => changePage(-1));
  document.getElementById('next-btn').addEventListener('click', () => changePage(1));
}

async function fetchCsrfToken() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init_csrf' })
    });
    const data = await response.json();
    csrfToken = data.token;
  } catch (error) {
    console.error('Failed to init CSRF', error);
  }
}

async function loadPosts() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken
      },
      body: JSON.stringify({
        action: 'get_posts',
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

  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post-item';
    
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.textContent = `${post.id}. ${post.name} - ${post.created_at}`;

    const body = document.createElement('div');
    body.className = 'post-body';
    body.textContent = post.body;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => handleDelete(post.id);

    div.appendChild(meta);
    div.appendChild(body);
    div.appendChild(deleteBtn);
    container.appendChild(div);
  });
}

async function handlePostSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.action = 'create_post';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken
      },
      body: JSON.stringify(payload)
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

async function handleDelete(id) {
  if (!confirm('Are you sure you want to delete this post?')) return;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken
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