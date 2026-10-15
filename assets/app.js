const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
const isAuthenticated = document.body.dataset.authenticated === 'true';
const apiUrl = 'api.php';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function toast(message, kind = 'success') {
  const region = document.querySelector('#toast-region');
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 4000);
}

async function api(action, { method = 'GET', body, headers = {} } = {}) {
  const options = { method, credentials: 'same-origin', headers: { ...headers } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-CSRF-Token'] = csrfToken;
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}?action=${encodeURIComponent(action)}`, options);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return response;
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function displayError(error) {
  toast(error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'error');
}

function formatDate(value) {
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat().format(date);
}

function activateView(viewName) {
  const target = document.querySelector(`#view-${CSS.escape(viewName)}`);
  if (!target) return;
  document.querySelectorAll('.app-view').forEach((view) => view.classList.toggle('is-visible', view === target));
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === viewName));
  if (viewName === 'admin') loadAdmin();
}

function setProfileLink(slug, published) {
  const url = new URL(`profile.php?u=${encodeURIComponent(slug)}`, location.href).href;
  document.querySelector('#profile-url-prefix').textContent = url.slice(0, url.lastIndexOf(encodeURIComponent(slug)));
  document.querySelector('#profile-link-preview').textContent = url;
  const preview = document.querySelector('#preview-profile');
  preview.href = url;
  preview.classList.toggle('is-hidden', !published);
  document.querySelector('#copy-profile-link').disabled = !published;
}

function setProfilePhoto(photoUrl) {
  const preview = document.querySelector('#profile-photo-preview');
  preview.replaceChildren();
  if (photoUrl) {
    const image = document.createElement('img');
    image.src = photoUrl;
    image.alt = 'Profile picture preview';
    preview.append(image);
    document.querySelector('#remove-profile-photo').classList.remove('is-hidden');
  } else {
    const placeholder = document.createElement('span');
    placeholder.textContent = '⌁';
    preview.append(placeholder);
    document.querySelector('#remove-profile-photo').classList.add('is-hidden');
  }
}

async function loadProfileSettings() {
  try {
    const { profile } = await api('profile_settings');
    document.querySelector('#profile-name').value = profile.name;
    document.querySelector('#profile-slug').value = profile.slug;
    document.querySelector('#profile-type').value = profile.profile_type;
    document.querySelector('#profile-headline').value = profile.headline;
    document.querySelector('#profile-company').value = profile.company;
    document.querySelector('#profile-bio').value = profile.bio;
    document.querySelector('#profile-phone').value = profile.phone;
    document.querySelector('#profile-email').value = profile.public_email;
    document.querySelector('#profile-website').value = profile.website;
    document.querySelector('#profile-location').value = profile.location;
    document.querySelector('#profile-published').checked = profile.is_published;
    document.querySelectorAll('.social-input').forEach((input) => {
      input.value = profile.social_links[input.dataset.network] ?? '';
    });
    setProfilePhoto(profile.photo_url);
    setProfileLink(profile.slug, profile.is_published);
  } catch (error) {
    displayError(error);
  }
}

function setupProfileEditor() {
  document.querySelector('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const name = document.querySelector('#profile-name').value.trim();
      const slug = document.querySelector('#profile-slug').value.trim().toLowerCase();
      const result = await api('profile_save', { method: 'POST', body: {
        name,
        slug,
        profile_type: document.querySelector('#profile-type').value,
        headline: document.querySelector('#profile-headline').value,
        company: document.querySelector('#profile-company').value,
        bio: document.querySelector('#profile-bio').value,
        phone: document.querySelector('#profile-phone').value,
        public_email: document.querySelector('#profile-email').value,
        website: document.querySelector('#profile-website').value,
        location: document.querySelector('#profile-location').value,
        social_links: Object.fromEntries(Array.from(document.querySelectorAll('.social-input')).map((input) => [input.dataset.network, input.value])),
        is_published: document.querySelector('#profile-published').checked,
      } });
      document.querySelector('.header-user .user-name').textContent = result.name;
      document.querySelector('.header-user .avatar').textContent = result.name.charAt(0).toUpperCase();
      setProfileLink(result.slug, document.querySelector('#profile-published').checked);
      toast('Link page saved.');
    } catch (error) {
      displayError(error);
    }
  });

  document.querySelector('#profile-photo-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.querySelector('#profile-photo-status');
    const uploadButton = document.querySelector('label[for="profile-photo-file"]');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = '';
      toast('Choose a JPG, PNG, or WebP photo smaller than 5 MB.', 'error');
      return;
    }
    const form = new FormData();
    form.append('photo', file);
    uploadButton.setAttribute('aria-disabled', 'true');
    status.textContent = 'Uploading…';
    try {
      const response = await fetch(`${apiUrl}?action=profile_photo_upload`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Upload failed (${response.status}).`);
      setProfilePhoto(result.photo_url);
      status.textContent = 'Photo uploaded.';
      toast('Profile photo uploaded.');
    } catch (error) {
      status.textContent = '';
      displayError(error);
    } finally {
      uploadButton.removeAttribute('aria-disabled');
      event.target.value = '';
    }
  });

  document.querySelector('#remove-profile-photo').addEventListener('click', async () => {
    try {
      await api('profile_photo_delete', { method: 'POST', body: {} });
      setProfilePhoto(null);
      document.querySelector('#profile-photo-status').textContent = 'Photo removed.';
      toast('Profile photo removed.');
    } catch (error) {
      displayError(error);
    }
  });

  document.querySelector('#copy-profile-link').addEventListener('click', async () => {
    if (!document.querySelector('#profile-published').checked) return toast('Save and publish your profile before sharing it.', 'error');
    const url = document.querySelector('#profile-link-preview').textContent;
    try {
      await navigator.clipboard.writeText(url);
      toast('Your profile link has been copied.');
    } catch {
      window.prompt('Copy your profile link:', url);
    }
  });

  loadProfileSettings();
}

async function loadAdmin() {
  try {
    const result = await api('admin');
    document.querySelector('[data-admin-stat="users"]').textContent = result.stats.users;
    document.querySelector('#app-name').value = result.appName;
    document.querySelector('#admin-user-rows').innerHTML = result.users.map((user) => `
      <tr><td><b>${escapeHtml(user.name)}</b></td><td>${escapeHtml(user.email)}</td><td>
        <select class="field admin-role" data-id="${Number(user.id)}" aria-label="Role for ${escapeHtml(user.name)}"><option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
        <td>${escapeHtml(formatDate(user.created_at))}</td><td><span class="status-badge ${Number(user.is_active) ? 'status-active' : 'status-disabled'}">${Number(user.is_active) ? 'Active' : 'Disabled'}</span></td>
        <td><button class="button button-small ${Number(user.is_active) ? 'button-secondary' : 'button-primary'} toggle-user" data-id="${Number(user.id)}" data-active="${Number(user.is_active) ? 'true' : 'false'}">${Number(user.is_active) ? 'Disable' : 'Enable'}</button></td></tr>`).join('');
  } catch (error) {
    displayError(error);
  }
}

function setupAuth() {
  const dialog = document.querySelector('#auth-dialog');
  let authMode = 'register';
  const setMode = (mode) => {
    authMode = mode;
    const registering = mode === 'register';
    document.querySelector('#auth-title').textContent = registering ? 'Create your account' : 'Welcome back';
    document.querySelector('#auth-submit').textContent = registering ? 'Create account' : 'Log in';
    document.querySelector('#register-name-row').classList.toggle('is-hidden', !registering);
    document.querySelector('#auth-name').required = registering;
    document.querySelector('#auth-password').autocomplete = registering ? 'new-password' : 'current-password';
    document.querySelector('#password-hint').classList.toggle('is-hidden', !registering);
    document.querySelector('#auth-switch-copy').textContent = registering ? 'Already have an account?' : 'New to TapLink?';
    document.querySelector('#auth-switch-button').textContent = registering ? 'Log in' : 'Create an account';
  };
  document.querySelectorAll('[data-open-auth]').forEach((button) => button.addEventListener('click', () => {
    setMode(button.dataset.openAuth);
    dialog.showModal();
  }));
  document.querySelector('#auth-switch-button').addEventListener('click', () => setMode(authMode === 'register' ? 'login' : 'register'));
  document.querySelector('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {
      email: document.querySelector('#auth-email').value,
      password: document.querySelector('#auth-password').value,
    };
    if (authMode === 'register') body.name = document.querySelector('#auth-name').value;
    const button = document.querySelector('#auth-submit');
    button.disabled = true;
    try {
      await api(authMode, { method: 'POST', body });
      location.reload();
    } catch (error) {
      displayError(error);
    } finally {
      button.disabled = false;
    }
  });
}

document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('.modal').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));

if (isAuthenticated) {
  document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', () => activateView(link.dataset.view)));
  document.querySelector('#logout-button').addEventListener('click', async () => {
    try {
      await api('logout', { method: 'POST', body: {} });
      location.reload();
    } catch (error) {
      displayError(error);
    }
  });
  document.querySelector('#admin-user-rows')?.addEventListener('change', async (event) => {
    if (!event.target.matches('.admin-role')) return;
    const row = event.target.closest('tr');
    const toggle = row.querySelector('.toggle-user');
    try {
      await api('admin_user_update', { method: 'POST', body: { id: Number(event.target.dataset.id), role: event.target.value, active: toggle.dataset.active === 'true' } });
      toast('User role updated.');
      await loadAdmin();
    } catch (error) {
      displayError(error);
      await loadAdmin();
    }
  });
  document.querySelector('#admin-user-rows')?.addEventListener('click', async (event) => {
    const button = event.target.closest('.toggle-user');
    if (!button) return;
    const role = button.closest('tr').querySelector('.admin-role').value;
    try {
      await api('admin_user_update', { method: 'POST', body: { id: Number(button.dataset.id), role, active: button.dataset.active !== 'true' } });
      toast('Account status updated.');
      await loadAdmin();
    } catch (error) {
      displayError(error);
    }
  });
  document.querySelector('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('admin_settings', { method: 'POST', body: { app_name: document.querySelector('#app-name').value } });
      toast('Application name saved.');
    } catch (error) {
      displayError(error);
    }
  });
  setupProfileEditor();
  const initialView = location.hash.slice(1);
  activateView(document.querySelector(`#view-${CSS.escape(initialView)}`) ? initialView : 'profile');
  window.addEventListener('hashchange', () => activateView(location.hash.slice(1) || 'profile'));
} else {
  setupAuth();
  document.querySelector('#year').textContent = new Date().getFullYear();
}
