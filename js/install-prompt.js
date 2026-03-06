var InstallPrompt = (function () {
    'use strict';

    var _deferredPrompt = null;
    var _banner = null;
    var _fab = null;
    var DISMISS_KEY = 'infravet_install_dismissed';

    function _isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    function _wasDismissed() {
        return sessionStorage.getItem(DISMISS_KEY) === '1';
    }

    function _dismiss() {
        sessionStorage.setItem(DISMISS_KEY, '1');
        if (_banner) {
            _banner.classList.remove('install-banner--visible');
            _banner.classList.add('install-banner--hiding');
            setTimeout(function () {
                if (_banner && _banner.parentNode) {
                    _banner.parentNode.removeChild(_banner);
                }
                _banner = null;
                _showFab();
            }, 500);
        }
    }

    function _getPlatform() {
        var ua = navigator.userAgent || '';
        if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
        if (/android/i.test(ua)) return 'android';
        return 'desktop';
    }

    function _createBanner() {
        var platform = _getPlatform();

        var banner = document.createElement('div');
        banner.className = 'install-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Installer l\'application');

        var content = document.createElement('div');
        content.className = 'install-banner__content';

        var icon = document.createElement('img');
        icon.className = 'install-banner__icon';
        icon.src = 'assets/logo/web-app-manifest-192x192.png';
        icon.alt = 'Infravet';
        content.appendChild(icon);

        var textWrap = document.createElement('div');
        textWrap.className = 'install-banner__text';

        var title = document.createElement('div');
        title.className = 'install-banner__title';
        title.textContent = 'Installer l\'application';
        textWrap.appendChild(title);

        var instructions = document.createElement('div');
        instructions.className = 'install-banner__instructions';

        if (platform === 'ios') {
            instructions.appendChild(document.createTextNode('Appuyez sur '));
            var shareSvg = Utils.createSvg(['M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8', {tag: 'polyline', points: '16 6 12 2 8 6'}, {tag: 'line', x1: '12', y1: '2', x2: '12', y2: '15'}]);
            shareSvg.setAttribute('class', 'install-banner__share-icon');
            instructions.appendChild(shareSvg);
            instructions.appendChild(document.createTextNode(' puis '));
            var strong = document.createElement('strong');
            strong.textContent = 'Sur l\'écran d\'accueil';
            instructions.appendChild(strong);
        } else {
            instructions.textContent = 'Accédez à votre espace vétérinaire directement depuis votre écran d\'accueil';
        }
        textWrap.appendChild(instructions);
        content.appendChild(textWrap);

        var actions = document.createElement('div');
        actions.className = 'install-banner__actions';

        if (platform !== 'ios' && _deferredPrompt) {
            var installBtn = document.createElement('button');
            installBtn.className = 'install-banner__install-btn';
            installBtn.appendChild(Utils.createSvg(['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', {tag: 'polyline', points: '7 10 12 15 17 10'}, {tag: 'line', x1: '12', y1: '15', x2: '12', y2: '3'}]));
            installBtn.appendChild(document.createTextNode('Installer'));
            installBtn.addEventListener('click', function () {
                if (_deferredPrompt) {
                    _deferredPrompt.prompt();
                    _deferredPrompt.userChoice.then(function (choice) {
                        if (choice.outcome === 'accepted') {
                            _removeFab();
                            _dismiss();
                        }
                        _deferredPrompt = null;
                    }).catch(function () { _deferredPrompt = null; });
                }
            });
            actions.appendChild(installBtn);
        }

        var dismissBtn = document.createElement('button');
        dismissBtn.className = 'install-banner__dismiss';
        dismissBtn.textContent = 'Plus tard';
        dismissBtn.addEventListener('click', _dismiss);
        actions.appendChild(dismissBtn);

        content.appendChild(actions);
        banner.appendChild(content);

        return banner;
    }

    function _showFab() {
        if (_isStandalone()) return;
        if (_fab) return;

        var platform = _getPlatform();
        if (platform === 'desktop' && !_deferredPrompt) return;

        _fab = document.createElement('button');
        _fab.className = 'install-fab';
        _fab.setAttribute('aria-label', 'Installer l\'application');
        _fab.appendChild(Utils.createSvg(['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', {tag: 'polyline', points: '7 10 12 15 17 10'}, {tag: 'line', x1: '12', y1: '15', x2: '12', y2: '3'}]));
        _fab.addEventListener('click', function () {
            _removeFab();
            sessionStorage.removeItem(DISMISS_KEY);
            _showBanner();
        });
        document.body.appendChild(_fab);

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (_fab) _fab.classList.add('install-fab--visible');
            });
        });
    }

    function _removeFab() {
        if (_fab) {
            _fab.classList.remove('install-fab--visible');
            var ref = _fab;
            setTimeout(function () {
                if (ref && ref.parentNode) ref.parentNode.removeChild(ref);
            }, 300);
            _fab = null;
        }
    }

    function _showBanner() {
        if (_isStandalone()) return;
        if (_banner) return;

        var platform = _getPlatform();
        if (platform === 'desktop' && !_deferredPrompt) return;

        _banner = _createBanner();
        document.body.appendChild(_banner);

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (_banner) _banner.classList.add('install-banner--visible');
            });
        });
    }

    function show() {
        if (_wasDismissed()) {
            setTimeout(_showFab, 3000);
        } else {
            setTimeout(_showBanner, 3000);
        }
    }

    function init() {
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            _deferredPrompt = e;
        });

        window.addEventListener('appinstalled', function () {
            _removeFab();
            if (_banner) {
                _banner.classList.remove('install-banner--visible');
                _banner.classList.add('install-banner--hiding');
                setTimeout(function () {
                    if (_banner && _banner.parentNode) _banner.parentNode.removeChild(_banner);
                    _banner = null;
                }, 500);
            }
            _deferredPrompt = null;
        });
    }

    return {
        init: init,
        show: show
    };
})();
