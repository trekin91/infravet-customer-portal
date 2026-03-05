var PullToRefresh = (function () {
    'use strict';

    var _indicatorEl;
    var _startY = 0;
    var _pulling = false;
    var _refreshing = false;
    var THRESHOLD = 48;

    function _getScrollTop() {
        return document.scrollingElement ? document.scrollingElement.scrollTop :
            (document.documentElement.scrollTop || document.body.scrollTop);
    }

    function _onTouchStart(e) {
        if (_refreshing) return;
        if (_getScrollTop() > 0) return;
        _startY = e.touches[0].clientY;
        _pulling = true;
        _indicatorEl.style.transition = 'none';
    }

    function _onTouchMove(e) {
        if (!_pulling || _refreshing) return;
        if (_getScrollTop() > 0) {
            _pulling = false;
            _indicatorEl.style.height = '0';
            return;
        }

        var deltaY = e.touches[0].clientY - _startY;
        if (deltaY <= 0) {
            _indicatorEl.style.height = '0';
            return;
        }

        var height = Math.min(deltaY * 0.5, 80);
        _indicatorEl.style.height = height + 'px';

        if (deltaY > 10 && e.cancelable) e.preventDefault();
    }

    function _onTouchEnd() {
        if (!_pulling || _refreshing) return;
        _pulling = false;
        _indicatorEl.style.transition = '';

        var height = parseFloat(_indicatorEl.style.height) || 0;
        if (height >= THRESHOLD) {
            _doRefresh();
        } else {
            _indicatorEl.style.height = '0';
        }
    }

    function _doRefresh() {
        _refreshing = true;
        _indicatorEl.style.height = '48px';
        _indicatorEl.classList.add('active');

        var btn = document.getElementById('refresh-btn');
        if (btn) btn.classList.add('refreshing');

        Router.refreshCurrentPage()
            .then(_complete)
            .catch(_complete);
    }

    function _complete() {
        _refreshing = false;
        _indicatorEl.classList.remove('active');
        _indicatorEl.style.height = '0';

        var btn = document.getElementById('refresh-btn');
        if (btn) btn.classList.remove('refreshing');
    }

    function init() {
        _indicatorEl = document.getElementById('ptr-indicator');
        if (!_indicatorEl) return;

        var contentEl = document.getElementById('app-content');
        if (!contentEl) return;

        contentEl.addEventListener('touchstart', _onTouchStart, { passive: true });
        contentEl.addEventListener('touchmove', _onTouchMove, { passive: false });
        contentEl.addEventListener('touchend', _onTouchEnd, { passive: true });

        var refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                if (_refreshing) return;
                _doRefresh();
            });
        }
    }

    return { init: init };
})();
