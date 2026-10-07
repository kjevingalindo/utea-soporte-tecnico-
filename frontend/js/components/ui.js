const FORM_CONTROL_CLASSES = [
    'w-full',
    'px-3',
    'py-2',
    'bg-white',
    'text-slate-900',
    'border',
    'border-slate-300',
    'dark:bg-slate-800',
    'dark:text-white',
    'dark:border-slate-700',
    'dark:placeholder-slate-400',
    'focus:ring-2',
    'focus:ring-blue-500',
    'rounded-lg',
    'transition-colors'
];

const SELECT_OPTION_CLASSES = [
    'bg-white',
    'text-slate-900',
    'dark:bg-slate-800',
    'dark:text-white'
];

function applyElementStyles(root) {
    const elements = [];
    if (root.matches?.('input, select, textarea, option, button, .main-content, .dashboard-main')) {
        elements.push(root);
    }
    elements.push(...root.querySelectorAll('input, select, textarea, option, button, .main-content, .dashboard-main'));

    elements.forEach(element => {
        if (element.matches('#ticketModal select, #quickTicketModal select')) {
            element.querySelectorAll('option').forEach(option => {
                option.classList.add(...SELECT_OPTION_CLASSES);
            });
            element.classList.add(...FORM_CONTROL_CLASSES);
        } else if (element.matches('option') && element.closest('#ticketModal, #quickTicketModal')) {
            element.classList.add(...SELECT_OPTION_CLASSES);
        } else if (element.matches('input, select, textarea')) {
            element.classList.add(...FORM_CONTROL_CLASSES);
        } else if (element.matches('button, .main-content, .dashboard-main')) {
            element.classList.add('transition-all', 'duration-200');
        }
    });
}

export function initializeUI() {
    applyElementStyles(document);
    const observer = new MutationObserver(records => {
        records.forEach(record => {
            record.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) applyElementStyles(node);
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
