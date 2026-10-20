(function exposeSafeText(global) {
    function append(parent, tagName, value, className = '') {
        const ownerDocument = parent.ownerDocument || global.document;
        const element = ownerDocument.createElement(tagName);
        if (className) element.className = className;
        element.textContent = String(value ?? '');
        parent.appendChild(element);
        return element;
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function renderComments(container, comments) {
        container.replaceChildren();
        if (!Array.isArray(comments) || comments.length === 0) {
            const empty = append(container, 'p', 'No hay comentarios aún', 'text-muted');
            empty.style.cssText = 'font-size:0.85rem; text-align:center; padding:16px 0;';
            return;
        }

        comments.forEach(comment => {
            const item = append(container, 'div', '', 'comment-item');
            item.style.cssText = 'padding:10px 12px; background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px;';
            const header = append(item, 'div', '', 'comment-header');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';
            const username = append(header, 'span', comment.username || 'Usuario');
            username.style.cssText = 'font-weight:600; font-size:0.85rem; color:var(--text-primary);';
            const date = append(header, 'small', comment.fecha ? new Date(comment.fecha).toLocaleString() : '');
            date.style.cssText = 'color:var(--text-secondary); font-size:0.75rem;';
            const text = append(item, 'p', comment.comentario);
            text.style.cssText = 'margin:0; font-size:0.9rem; color:var(--text-primary); line-height:1.4; white-space:pre-wrap;';
        });
    }

    function renderHistory(container, entries) {
        container.replaceChildren();
        if (!Array.isArray(entries) || entries.length === 0) {
            append(container, 'p', 'Aún no hay cambios registrados en este ticket.', 'text-muted');
            return;
        }
        entries.forEach(entry => {
            const item = append(container, 'div', '');
            item.style.cssText = 'padding:10px 12px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-main);';
            const header = append(item, 'div', '');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px;';
            const action = append(header, 'strong', entry.accion || 'Actualización');
            action.style.fontSize = '0.85rem';
            const timestamp = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';
            const date = append(header, 'small', timestamp);
            date.style.color = 'var(--text-secondary)';
            const author = append(item, 'div', entry.username ? `Por: ${entry.username}` : 'Sistema');
            author.style.cssText = 'font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;';
            const description = append(item, 'div', entry.descripcion || 'Sin detalle');
            description.style.cssText = 'font-size:0.9rem; color:var(--text-primary); white-space:pre-wrap; overflow-wrap:anywhere;';
        });
    }

    function appendNotification(container, message, dateLabel) {
        const messageElement = append(container, 'p', message);
        messageElement.style.cssText = 'margin:0; font-size:0.83rem; line-height:1.3; white-space:pre-wrap; overflow-wrap:anywhere;';
        const dateElement = append(container, 'small', dateLabel);
        dateElement.style.color = 'var(--text-secondary)';
        return { messageElement, dateElement };
    }

    const api = Object.freeze({ append, escapeHTML, renderComments, renderHistory, appendNotification });
    global.UTEASafeText = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
