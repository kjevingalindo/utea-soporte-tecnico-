const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const errorDiv = document.getElementById('error');
const showLoginBtn = document.getElementById('showLogin');
const showRegisterBtn = document.getElementById('showRegister');

function setAuthMode(mode) {
    const isLogin = mode === 'login';
    loginForm.style.display = isLogin ? 'block' : 'none';
    registerForm.style.display = isLogin ? 'none' : 'block';

    if (errorDiv) {
        errorDiv.textContent = '';
    }

    if (showLoginBtn) {
        showLoginBtn.style.opacity = isLogin ? '1' : '0.75';
        showLoginBtn.classList.toggle('active', isLogin);
        showLoginBtn.setAttribute('aria-pressed', String(isLogin));
    }

    if (showRegisterBtn) {
        showRegisterBtn.style.opacity = isLogin ? '0.75' : '1';
        showRegisterBtn.classList.toggle('active', !isLogin);
        showRegisterBtn.setAttribute('aria-pressed', String(!isLogin));
    }
}

showLoginBtn?.addEventListener('click', () => setAuthMode('login'));
showRegisterBtn?.addEventListener('click', () => setAuthMode('register'));

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (errorDiv) errorDiv.textContent = '';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Error al iniciar sesión');
        }

        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('rol', data.rol);
        window.location.href = 'index.html';
    } catch (err) {
        if (errorDiv) {
            errorDiv.textContent = err.message;
        } else {
            alert(err.message);
        }
    }
});

registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;

    if (errorDiv) errorDiv.textContent = '';

    if (password !== confirmPassword) {
        if (errorDiv) {
            errorDiv.textContent = 'Las contraseñas no coinciden';
        }
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Error al crear el usuario');
        }

        if (errorDiv) {
            errorDiv.textContent = 'Usuario creado correctamente. Ahora puedes iniciar sesión.';
            errorDiv.style.color = '#10b981';
        }

        document.getElementById('username').value = username;
        document.getElementById('password').value = password;
        setAuthMode('login');
    } catch (err) {
        if (errorDiv) {
            errorDiv.style.color = '#ef4444';
            errorDiv.textContent = err.message;
        } else {
            alert(err.message);
        }
    }
});

setAuthMode('login');
