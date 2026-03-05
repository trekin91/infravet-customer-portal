var Utils = (function () {
    'use strict';

    function $(selector, context) {
        return (context || document).querySelector(selector);
    }

    function $$(selector, context) {
        return Array.from((context || document).querySelectorAll(selector));
    }

    function createElement(tag, attrs, children) {
        var el = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (key) {
                if (key === 'className') el.className = attrs[key];
                else if (key === 'textContent') el.textContent = attrs[key];

                else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
                else if (key === 'dataset') {
                    Object.keys(attrs[key]).forEach(function (dk) { el.dataset[dk] = attrs[key][dk]; });
                }
                else el.setAttribute(key, attrs[key]);
            });
        }
        if (children) {
            (Array.isArray(children) ? children : [children]).forEach(function (child) {
                if (typeof child === 'string') el.appendChild(document.createTextNode(child));
                else if (child instanceof Node) el.appendChild(child);
            });
        }
        return el;
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        return new Date(isoString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function formatDateTime(isoString) {
        if (!isoString) return '';
        var d = new Date(isoString);
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
            + ' \u00e0 ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatTime(isoString) {
        if (!isoString) return '';
        return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatRelativeDate(isoString) {
        var d = new Date(isoString);
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var target = new Date(d);
        target.setHours(0, 0, 0, 0);
        var diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Aujourd'hui";
        if (diffDays === 1) return 'Demain';
        if (diffDays === -1) return 'Hier';
        if (diffDays > 1 && diffDays <= 7) return 'Dans ' + diffDays + ' jours';
        if (diffDays < -1 && diffDays >= -7) return 'Il y a ' + Math.abs(diffDays) + ' jours';
        return formatDate(isoString);
    }

    function calculateAge(birthDate) {
        var birth = new Date(birthDate);
        var now = new Date();
        var years = now.getFullYear() - birth.getFullYear();
        var months = now.getMonth() - birth.getMonth();
        if (months < 0) { years--; months += 12; }
        if (now.getDate() < birth.getDate() && months > 0) months--;
        if (years === 0) return months + ' mois';
        if (months === 0) return years + ' an' + (years > 1 ? 's' : '');
        return years + ' an' + (years > 1 ? 's' : '') + ' et ' + months + ' mois';
    }

    function isValidFrenchPhone(phone) {
        var cleaned = phone.replace(/[\s.\-]/g, '');
        return /^(?:(?:\+33|0033|0)[1-9])(?:[0-9]{8})$/.test(cleaned);
    }

    function formatPhoneDisplay(phone) {
        var cleaned = phone.replace(/[\s.\-]/g, '');
        if (cleaned.startsWith('+33')) cleaned = '0' + cleaned.slice(3);
        else if (cleaned.startsWith('0033')) cleaned = '0' + cleaned.slice(4);
        return cleaned.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    }

    function debounce(fn, delay) {
        var timer;
        return function () {
            var args = arguments;
            var ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, delay || InfravetConfig.DEBOUNCE_MS);
        };
    }

    function showToast(message, type) {
        type = type || 'info';
        var container = document.getElementById('toast-container');
        var toast = createElement('div', { className: 'toast toast--' + type, role: 'alert' }, [message]);
        container.appendChild(toast);
        requestAnimationFrame(function () { toast.classList.add('toast--visible'); });
        setTimeout(function () {
            toast.classList.remove('toast--visible');
            toast.addEventListener('transitionend', function () { toast.remove(); });
        }, InfravetConfig.TOAST_DURATION_MS);
    }

    function showLoading() { document.getElementById('loading-overlay').hidden = false; }
    function hideLoading() { document.getElementById('loading-overlay').hidden = true; }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' o';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
        return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    }

    function clearElement(el) {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    function createSvg(paths, viewBox) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', viewBox || '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        paths.forEach(function (p) {
            if (typeof p === 'string') {
                var path = document.createElementNS(NS, 'path');
                path.setAttribute('d', p);
                svg.appendChild(path);
            } else {
                var el = document.createElementNS(NS, p.tag);
                Object.keys(p).forEach(function (k) {
                    if (k !== 'tag') el.setAttribute(k, p[k]);
                });
                svg.appendChild(el);
            }
        });
        return svg;
    }

    function createEmptyState(icon, message, cta) {
        var div = createElement('div', { className: 'empty-state' });
        div.appendChild(createElement('div', { className: 'empty-state__icon' }, [icon]));
        div.appendChild(createElement('p', {}, [message]));
        if (cta) div.appendChild(createElement('p', { className: 'empty-state__cta' }, [cta]));
        return div;
    }

    function createErrorState(message, onRetry) {
        var div = createElement('div', { className: 'error-state' });
        div.appendChild(createElement('p', {}, [message]));
        if (onRetry) {
            div.appendChild(createElement('button', { className: 'btn btn--outline btn--sm', onClick: onRetry }, ['Reessayer']));
        }
        return div;
    }

    function createLoadingInline() {
        var div = createElement('div', { className: 'loading-inline' });
        div.appendChild(createElement('div', { className: 'spinner-small' }));
        return div;
    }

    return {
        $: $,
        $$: $$,
        createElement: createElement,
        clearElement: clearElement,
        createSvg: createSvg,
        createEmptyState: createEmptyState,
        createErrorState: createErrorState,
        createLoadingInline: createLoadingInline,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        formatTime: formatTime,
        formatRelativeDate: formatRelativeDate,
        calculateAge: calculateAge,
        isValidFrenchPhone: isValidFrenchPhone,
        formatPhoneDisplay: formatPhoneDisplay,
        debounce: debounce,
        showToast: showToast,
        showLoading: showLoading,
        hideLoading: hideLoading,
        escapeHtml: escapeHtml,
        formatFileSize: formatFileSize
    };
})();
