var Router = (function () {
    'use strict';

    var _currentPage = 'dashboard';
    var _pageStack = [];
    var _pageInitCallbacks = {};
    var _pageDestroyCallbacks = {};
    var _pageRefreshCallbacks = {};

    var MAIN_TABS = ['dashboard', 'animals', 'hospitalization', 'appointments', 'documents', 'profile'];
    var TAB_MAP = { 'animal-detail': 'animals' };

    function navigate(pageName, params) {
        if (pageName === _currentPage && !params) return;

        var currentSection = Utils.$('#page-' + _currentPage);
        var targetSection = Utils.$('#page-' + pageName);

        if (!targetSection) {
            if (InfravetConfig.FEATURES.DEBUG_LOG) console.warn('[Router] Page not found:', pageName);
            return;
        }

        if (_pageDestroyCallbacks[_currentPage]) {
            _pageDestroyCallbacks[_currentPage]();
        }

        if (currentSection) currentSection.classList.remove('active');
        targetSection.classList.add('active');

        var navTab = TAB_MAP[pageName] || pageName;
        if (MAIN_TABS.indexOf(navTab) !== -1) {
            Utils.$$('.nav-tab').forEach(function (tab) {
                var isActive = tab.dataset.tab === navTab;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-current', isActive ? 'page' : 'false');
            });
        }

        var previousPage = _currentPage;
        _currentPage = pageName;

        var contentArea = Utils.$('#app-content');
        if (contentArea) contentArea.scrollTop = 0;

        if (_pageInitCallbacks[pageName]) {
            _pageInitCallbacks[pageName](params || {}, previousPage);
        }
    }

    function pushPage(pageName, params) {
        _pageStack.push({ page: _currentPage, scrollTop: Utils.$('#app-content').scrollTop });
        navigate(pageName, params);
    }

    function goBack() {
        if (_pageStack.length === 0) {
            navigate('dashboard');
            return;
        }
        var prev = _pageStack.pop();
        navigate(prev.page);
        var contentArea = Utils.$('#app-content');
        if (contentArea) contentArea.scrollTop = prev.scrollTop;
    }

    function onPageInit(pageName, callback) {
        _pageInitCallbacks[pageName] = callback;
    }

    function onPageDestroy(pageName, callback) {
        _pageDestroyCallbacks[pageName] = callback;
    }

    function onPageRefresh(pageName, callback) {
        _pageRefreshCallbacks[pageName] = callback;
    }

    function refreshCurrentPage() {
        if (_pageRefreshCallbacks[_currentPage]) {
            return Promise.resolve(_pageRefreshCallbacks[_currentPage]());
        }
        return Promise.resolve();
    }

    function reset() {
        Utils.$$('.page.active').forEach(function (page) {
            page.classList.remove('active');
        });
        _currentPage = '';
        _pageStack = [];
    }

    function getCurrentPage() {
        return _currentPage;
    }

    function init() {
        Utils.$$('.nav-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                var targetPage = this.dataset.tab;
                _pageStack = [];
                navigate(targetPage);
            });
        });
    }

    return {
        init: init,
        navigate: navigate,
        pushPage: pushPage,
        goBack: goBack,
        reset: reset,
        onPageInit: onPageInit,
        onPageDestroy: onPageDestroy,
        onPageRefresh: onPageRefresh,
        refreshCurrentPage: refreshCurrentPage,
        getCurrentPage: getCurrentPage
    };
})();
