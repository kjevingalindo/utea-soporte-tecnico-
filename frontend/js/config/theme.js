const THEME_STORAGE_KEY = 'theme';

function applyTheme(theme) {
    const isDark = theme === 'dark';
    const root = document.documentElement;

    root.classList.toggle('dark', isDark);
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');

    const toggle = document.getElementById('darkModeToggle');
    if (toggle) {
        toggle.innerHTML = isDark
            ? '<i class="ph-fill ph-sun"></i>'
            : '<i class="ph ph-moon"></i>';
        toggle.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
    }

    const themeSelect = document.getElementById('configTheme');
    if (themeSelect) themeSelect.value = isDark ? 'dark' : 'light';
}

export function initializeTheme() {
    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light');

    document.getElementById('darkModeToggle')?.addEventListener('click', () => {
        applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    });

    document.getElementById('configTheme')?.addEventListener('change', event => {
        applyTheme(event.currentTarget.value);
    });
}

export { applyTheme };
