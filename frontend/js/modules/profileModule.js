import { showError, showSuccess } from '../components/notifications.js';
import { setButtonLoading } from '../components/buttons.js';

export function createProfileModule() {
    return {
        name: 'profile',
        init() {
            const nav = document.getElementById('profileNav');
            const profileForm = document.getElementById('profileForm');
            const passwordForm = document.getElementById('profilePasswordForm');

            const loadProfile = async () => {
                const response = await window.fetchAPI('/api/auth/me/profile');
                const profile = await response.json();
                if (!response.ok) throw new Error(profile.error || 'No se pudo cargar el perfil.');
                document.getElementById('profileUsername').value = profile.username || '';
                document.getElementById('profileRole').value =
                    document.getElementById('rolBadge')?.textContent || 'Solicitante';
                document.getElementById('profileOffice').value = profile.oficina_nombre || 'No asignada';
                document.getElementById('profileFullName').value = profile.nombre_completo || '';
                document.getElementById('profileEmail').value = profile.correo_institucional || '';
            };

            nav?.addEventListener('click', async () => {
                try {
                    await loadProfile();
                } catch (error) {
                    showError(error.message);
                }
            });

            profileForm?.addEventListener('submit', async event => {
                event.preventDefault();
                const button = profileForm.querySelector('[type="submit"]');
                setButtonLoading(button, true, 'Guardando...');
                try {
                    const response = await window.fetchAPI('/api/auth/me/profile', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            nombre_completo: document.getElementById('profileFullName').value,
                            correo_institucional: document.getElementById('profileEmail').value
                        }),
                        allowHttpErrors: true
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el perfil.');
                    showSuccess(result.mensaje || 'Perfil actualizado correctamente.');
                    await loadProfile();
                } catch (error) {
                    showError(error.message);
                } finally {
                    setButtonLoading(button, false);
                }
            });

            passwordForm?.addEventListener('submit', async event => {
                event.preventDefault();
                const button = passwordForm.querySelector('[type="submit"]');
                setButtonLoading(button, true, 'Actualizando...');
                try {
                    const response = await window.fetchAPI('/api/auth/me/password', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            current_password: document.getElementById('profileCurrentPassword').value,
                            new_password: document.getElementById('profileNewPassword').value
                        }),
                        allowHttpErrors: true
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la contraseña.');
                    passwordForm.reset();
                    showSuccess(result.mensaje || 'Contraseña actualizada correctamente.');
                } catch (error) {
                    showError(error.message);
                } finally {
                    setButtonLoading(button, false);
                }
            });
        }
    };
}
