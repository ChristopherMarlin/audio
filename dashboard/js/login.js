document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('login-alert');
  alertBox.innerHTML = '';
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    await api.post('/api/auth/login', {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    });
    location.href = '/dashboard/';
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    btn.disabled = false;
  }
});

// Already logged in? skip straight to the dashboard.
api.get('/api/auth/me').then((r) => { if (r.authenticated) location.href = '/dashboard/'; });
