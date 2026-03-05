var ProfilePage = (function () {
    'use strict';

    var _container;

    function _renderProfileInfo(client) {
        var section = Utils.createElement('div', { className: 'profile-section' });
        section.appendChild(Utils.createElement('h2', { className: 'profile-section-title' }, ['Mes informations']));

        var card = Utils.createElement('div', { className: 'profile-card card' });
        var rows = [
            { label: 'Nom', value: client.lastName },
            { label: 'Prenom', value: client.firstName },
            { label: 'Telephone', value: Utils.formatPhoneDisplay(client.phone) },
            { label: 'Email', value: client.email || 'Non renseigne' },
            { label: 'Adresse', value: client.address ? (client.address.street + ', ' + client.address.zipCode + ' ' + client.address.city) : 'Non renseignee' }
        ];

        rows.forEach(function (r) {
            var row = Utils.createElement('div', { className: 'profile-row' });
            row.appendChild(Utils.createElement('span', { className: 'profile-row__label' }, [r.label]));
            row.appendChild(Utils.createElement('span', { className: 'profile-row__value' }, [Utils.escapeHtml(r.value)]));
            card.appendChild(row);
        });

        section.appendChild(card);
        return section;
    }

    function _renderClinicInfo(clinic) {
        var section = Utils.createElement('div', { className: 'profile-section' });
        section.appendChild(Utils.createElement('h2', { className: 'profile-section-title' }, ['Ma clinique']));

        var card = Utils.createElement('div', { className: 'profile-card card' });
        card.appendChild(Utils.createElement('div', { className: 'clinic-name' }, [Utils.escapeHtml(clinic.name)]));

        var phone = Utils.createElement('div', { className: 'clinic-detail' });
        phone.appendChild(Utils.createSvg(['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z']));
        phone.appendChild(document.createTextNode(Utils.escapeHtml(clinic.phone)));
        card.appendChild(phone);

        var address = Utils.createElement('div', { className: 'clinic-detail' });
        address.appendChild(Utils.createSvg(['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', {tag: 'circle', cx: '12', cy: '10', r: '3'}]));
        address.appendChild(document.createTextNode(Utils.escapeHtml(clinic.address)));
        card.appendChild(address);

        var hours = Utils.createElement('div', { className: 'clinic-detail' });
        hours.appendChild(Utils.createSvg([{tag: 'circle', cx: '12', cy: '12', r: '10'}, {tag: 'polyline', points: '12 6 12 12 16 14'}]));
        hours.appendChild(document.createTextNode(Utils.escapeHtml(clinic.openingHours)));
        card.appendChild(hours);

        section.appendChild(card);
        return section;
    }

    function _renderNotificationSettings() {
        var section = Utils.createElement('div', { className: 'profile-section' });
        section.appendChild(Utils.createElement('h2', { className: 'profile-section-title' }, ['Notifications']));
        var card = Utils.createElement('div', { className: 'profile-card card' });

        var permState = Notifications.getPermissionState();
        if (permState === 'unsupported') {
            card.appendChild(Utils.createElement('p', { className: 'profile-notif-info' }, [
                'Les notifications push ne sont pas supportees sur cet appareil.'
            ]));
            section.appendChild(card);
            return section;
        }

        var row = Utils.createElement('div', { className: 'profile-row profile-toggle-row' });
        row.appendChild(Utils.createElement('span', { className: 'profile-row__label' }, ['Notifications push']));

        var toggle = Utils.createElement('label', { className: 'toggle-switch' });
        var checkbox = Utils.createElement('input', { type: 'checkbox', className: 'toggle-switch__input' });
        if (permState === 'granted') checkbox.checked = true;
        checkbox.addEventListener('change', function () {
            if (checkbox.checked) {
                Notifications.requestPermission().then(function (ok) {
                    if (!ok) {
                        checkbox.checked = false;
                        Utils.showToast('Impossible d\'activer les notifications', 'warning');
                    } else {
                        Utils.showToast('Notifications activees', 'success');
                    }
                });
            } else {
                Notifications.unsubscribe().then(function () {
                    Utils.showToast('Notifications desactivees', 'info');
                });
            }
        });
        toggle.appendChild(checkbox);
        toggle.appendChild(Utils.createElement('span', { className: 'toggle-switch__slider' }));
        row.appendChild(toggle);
        card.appendChild(row);

        if (permState === 'denied') {
            card.appendChild(Utils.createElement('p', { className: 'profile-notif-info' }, [
                'Les notifications sont bloquees. Modifiez les parametres de votre navigateur pour les autoriser.'
            ]));
        }

        section.appendChild(card);
        return section;
    }

    function _render(client) {
        Utils.clearElement(_container);

        _container.appendChild(_renderProfileInfo(client));

        if (client.clinic) {
            _container.appendChild(_renderClinicInfo(client.clinic));
        }

        _container.appendChild(_renderNotificationSettings());

        var footer = Utils.createElement('div', { className: 'profile-footer' });
        footer.appendChild(Utils.createElement('button', {
            id: 'logout-btn',
            className: 'btn btn--outline btn--full',
            onClick: function () { Auth.logout(); }
        }, ['Se deconnecter']));
        var poweredBy = Utils.createElement('div', { className: 'profile-powered-by' });
        poweredBy.appendChild(document.createTextNode('Propulse par '));
        var logo = Utils.createElement('img', {
            src: 'assets/logo/infravet V1 transparent long.png',
            alt: 'Infravet',
            className: 'powered-by-logo'
        });
        poweredBy.appendChild(logo);
        footer.appendChild(poweredBy);

        footer.appendChild(Utils.createElement('div', { className: 'profile-version' }, [
            'v' + InfravetConfig.APP_VERSION
        ]));
        _container.appendChild(footer);
    }

    function _showSkeleton() {
        Utils.clearElement(_container);

        var i;
        var infoSection = Utils.createElement('div', { style: 'margin-bottom:var(--space-6)' });
        infoSection.appendChild(Utils.createElement('div', {
            className: 'skeleton skeleton-text skeleton-text--sm',
            style: 'width:40%;margin-bottom:var(--space-3)'
        }));
        var card = Utils.createElement('div', { className: 'card' });
        for (i = 0; i < 5; i++) {
            var row = Utils.createElement('div', {
                style: 'display:flex;justify-content:space-between;padding:var(--space-3) 0;border-bottom:1px solid var(--color-divider)'
            });
            row.appendChild(Utils.createElement('div', {
                className: 'skeleton skeleton-text',
                style: 'width:30%;margin:0'
            }));
            row.appendChild(Utils.createElement('div', {
                className: 'skeleton skeleton-text',
                style: 'width:40%;margin:0'
            }));
            card.appendChild(row);
        }
        infoSection.appendChild(card);
        _container.appendChild(infoSection);

        var clinicSection = Utils.createElement('div', { style: 'margin-bottom:var(--space-6)' });
        clinicSection.appendChild(Utils.createElement('div', {
            className: 'skeleton skeleton-text skeleton-text--sm',
            style: 'width:30%;margin-bottom:var(--space-3)'
        }));
        clinicSection.appendChild(Utils.createElement('div', {
            className: 'card',
            style: 'height:120px'
        }));
        _container.appendChild(clinicSection);
    }

    function _load(silent) {
        if (!silent) _showSkeleton();
        return API.client.getProfile()
            .then(function (data) { if (!data) throw new Error('Donnees invalides'); _render(data); })
            .catch(function () {
                Utils.clearElement(_container);
                _container.appendChild(Utils.createErrorState('Impossible de charger le profil', _load));
            });
    }

    function init() {
        _container = Utils.$('#page-profile .page-content');
        Router.onPageInit('profile', function () { _load(); });
        Router.onPageRefresh('profile', function () { return _load(true); });
    }

    return { init: init };
})();
