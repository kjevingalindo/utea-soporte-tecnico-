(function exposeViewNavigation(global) {
    function activateView(document, viewId) {
        const targetId = `view-${viewId}`;
        document.querySelectorAll('.view-section').forEach(section => {
            const isTarget = section.id === targetId;
            section.classList.toggle('active', isTarget);
            section.hidden = !isTarget;
        });

        const target = document.getElementById(targetId);
        if (target) {
            target.hidden = false;
            target.classList.add('active');
        } else {
            const placeholder = document.getElementById('view-placeholder');
            if (placeholder) {
                placeholder.hidden = false;
                placeholder.classList.add('active');
            }
        }

        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`.nav-item[data-view="${viewId}"]`)?.classList.add('active');
    }

    const api = Object.freeze({ activateView });
    global.UTEAViewNavigation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
