var App = (function () {
    'use strict';

    var SPLASH_MIN_DURATION = 4000;

    function _initServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(function (registration) {
                    if (InfravetConfig.FEATURES.DEBUG_LOG) {
                        console.log('[App] Service worker registered, scope:', registration.scope);
                    }
                    registration.addEventListener('updatefound', function () {
                        var newWorker = registration.installing;
                        newWorker.addEventListener('statechange', function () {
                            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                                Utils.showToast('Mise a jour disponible. Rafraichissez la page.', 'info');
                            }
                        });
                    });
                })
                .catch(function (err) {
                    if (InfravetConfig.FEATURES.DEBUG_LOG) console.error('[App] SW registration failed:', err);
                });

            navigator.serviceWorker.addEventListener('message', function (event) {
                if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
                    _handleNotificationNavigation(event.data.url);
                }
            });
        }
    }

    function _handleNotificationNavigation(url) {
        if (!url || url === '/' || url === './') return;
        if (url.includes('hospitalization')) Router.navigate('hospitalization');
        else if (url.includes('appointments')) Router.navigate('appointments');
        else if (url.includes('documents')) Router.navigate('documents');
        else if (url.includes('animals')) Router.navigate('animals');
    }

    function _initOnlineStatus() {
        window.addEventListener('online', function () {
            Utils.showToast('Connexion retablie', 'success');
        });
        window.addEventListener('offline', function () {
            Utils.showToast('Connexion perdue', 'warning');
        });
    }

    function _initAllPages() {
        if (typeof DashboardPage !== 'undefined') DashboardPage.init();
        if (typeof AnimalsPage !== 'undefined') AnimalsPage.init();
        if (typeof AnimalDetailPage !== 'undefined') AnimalDetailPage.init();
        if (typeof AppointmentsPage !== 'undefined') AppointmentsPage.init();
        if (typeof DocumentsPage !== 'undefined') DocumentsPage.init();
        if (typeof ProfilePage !== 'undefined') ProfilePage.init();
        if (typeof HospitalizationPage !== 'undefined') HospitalizationPage.init();
    }

    function _initHeaderActions() {
        var logoutBtn = Utils.$('#logout-header-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', function () { Auth.logout(); });
    }

    function onLogin() {
        _loadClinicInfo();
        _initAllPages();
        _initHeaderActions();
        Router.reset();

        var savedPage = null;
        try { savedPage = sessionStorage.getItem('infravet_session_page'); sessionStorage.removeItem('infravet_session_page'); } catch (e) {}
        var targetPage = savedPage && savedPage !== 'animal-detail' ? savedPage : 'dashboard';
        Router.navigate(targetPage);

        if (typeof PullToRefresh !== 'undefined') PullToRefresh.init();
        if (InfravetConfig.FEATURES.PUSH_NOTIFICATIONS) {
            setTimeout(function () {
                Notifications.requestPermission();
            }, 2000);
        }
        if (typeof InstallPrompt !== 'undefined') InstallPrompt.show();
    }

    function onLogout() {
        Router.reset();
    }

    function _loadClinicInfo() {
        return API.clinic.getInfo()
            .then(function (data) {
                var headerEl = Utils.$('#header-clinic-name');
                var authEl = Utils.$('#auth-clinic-name');
                var splashEl = Utils.$('#splash-clinic-name');
                var name = data.name || 'Espace client';
                if (headerEl) headerEl.textContent = name;
                if (authEl) authEl.textContent = name;
                if (splashEl) splashEl.textContent = name;

                document.title = name;

                if (data.logo_url) {
                    var splashLogo = Utils.$('#splash-clinic-logo');
                    var authLogo = Utils.$('#auth-clinic-logo');
                    if (splashLogo) {
                        splashLogo.src = data.logo_url;
                        splashLogo.alt = name;
                        splashLogo.hidden = false;
                    }
                    if (authLogo) {
                        authLogo.src = data.logo_url;
                        authLogo.alt = name;
                        authLogo.hidden = false;
                    }
                }

                var headerLogo = Utils.$('#header-clinic-logo');
                var headerIconSrc = data.icon_url || data.logo_url;
                if (headerLogo && headerIconSrc) {
                    headerLogo.src = headerIconSrc;
                    headerLogo.alt = name;
                    headerLogo.hidden = false;
                }
            })
            .catch(function () {});
    }

    function _hideSplash() {
        var splash = document.getElementById('splash-screen');
        if (splash) splash.hidden = true;
    }

    function init() {
        if (InfravetConfig.FEATURES.MOCK_API && typeof MockServer !== 'undefined') {
            MockServer.init();
        }

        Auth.init();
        Router.init();
        _initServiceWorker();
        _initOnlineStatus();
        if (typeof InstallPrompt !== 'undefined') InstallPrompt.init();

        var splashStart = Date.now();

        _loadClinicInfo().then(function () {
            return Auth.checkSession();
        })
            .then(function (result) {
                var elapsed = Date.now() - splashStart;
                var remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);

                setTimeout(function () {
                    _hideSplash();
                    if (result === true) {
                        Auth.showApp();
                        onLogin();
                    } else {
                        Auth.showLoginScreen();
                    }
                }, remaining);
            })
            .catch(function () {
                var elapsed = Date.now() - splashStart;
                var remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);

                setTimeout(function () {
                    _hideSplash();
                    Auth.showLoginScreen();
                }, remaining);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init: init,
        onLogin: onLogin,
        onLogout: onLogout
    };
})();
