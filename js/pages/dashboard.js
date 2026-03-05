var DashboardPage = (function () {
    'use strict';

    var _container;

    function _getSpeciesEmoji(species) {
        var map = { 'Chat': '\uD83D\uDC31', 'Chien': '\uD83D\uDC36', 'Lapin': '\uD83D\uDC30', 'Oiseau': '\uD83D\uDC26', 'Hamster': '\uD83D\uDC39' };
        return map[species] || '\uD83D\uDC3E';
    }

    function _renderNextAppointment(appt) {
        var card = Utils.createElement('div', { className: 'next-appt-card' });
        card.appendChild(Utils.createElement('div', { className: 'appt-label' }, ['Prochain rendez-vous']));
        card.appendChild(Utils.createElement('div', { className: 'appt-animal' }, [Utils.escapeHtml(appt.animalName) + ' \u2014 ' + Utils.escapeHtml(appt.type)]));
        card.appendChild(Utils.createElement('div', { className: 'appt-reason' }, [Utils.escapeHtml(appt.reason)]));

        var dateRow = Utils.createElement('div', { className: 'appt-date' });
        dateRow.appendChild(Utils.createSvg([
            { tag: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' },
            { tag: 'line', x1: '16', y1: '2', x2: '16', y2: '6' },
            { tag: 'line', x1: '8', y1: '2', x2: '8', y2: '6' },
            { tag: 'line', x1: '3', y1: '10', x2: '21', y2: '10' }
        ], '0 0 24 24'));
        dateRow.appendChild(document.createTextNode(Utils.formatRelativeDate(appt.dateTime) + ' \u00e0 ' + Utils.formatTime(appt.dateTime)));
        card.appendChild(dateRow);

        var vetRow = Utils.createElement('div', { className: 'appt-date', style: 'margin-top: var(--space-1)' });
        vetRow.appendChild(Utils.createSvg([
            'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
            { tag: 'circle', cx: '12', cy: '7', r: '4' }
        ], '0 0 24 24'));
        vetRow.appendChild(document.createTextNode(Utils.escapeHtml(appt.veterinarian)));
        card.appendChild(vetRow);

        return card;
    }

    function _renderAnimalQuickCard(animal) {
        var card = Utils.createElement('button', {
            className: 'animal-quick-card card card--clickable',
            'aria-label': animal.name + ', ' + animal.species,
            onClick: function () { Router.pushPage('animal-detail', { animalId: animal.id }); }
        });

        var avatar = Utils.createElement('div', { className: 'animal-avatar' }, [_getSpeciesEmoji(animal.species)]);
        card.appendChild(avatar);
        card.appendChild(Utils.createElement('div', { className: 'animal-name' }, [Utils.escapeHtml(animal.name)]));
        card.appendChild(Utils.createElement('div', { className: 'animal-species' }, [Utils.escapeHtml(animal.species) + ' \u2022 ' + Utils.calculateAge(animal.birthDate)]));

        return card;
    }

    function _renderHospitBanner(hospitalizations) {
        var count = hospitalizations.length;
        var banner = Utils.createElement('div', {
            className: 'hospit-banner card card--clickable',
            onClick: function () { Router.navigate('hospitalization'); }
        });
        var icon = Utils.createElement('div', { className: 'hospit-banner__icon' }, ['\uD83C\uDFE5']);
        banner.appendChild(icon);
        var content = Utils.createElement('div', { className: 'hospit-banner__content' });
        var title = count === 1
            ? '1 animal hospitalise'
            : count + ' animaux hospitalises';
        content.appendChild(Utils.createElement('div', { className: 'hospit-banner__title' }, [title]));
        if (count === 1) {
            var h = hospitalizations[0];
            var STATUS_TEXT = {
                admis: 'vient d\'etre admis', en_preparation: 'est en preparation',
                en_intervention: 'est en intervention', reveil: 'est en phase de reveil',
                en_soins: 'est en soins', observation: 'est en observation'
            };
            var statusDesc = STATUS_TEXT[h.status] || '';
            if (statusDesc) {
                content.appendChild(Utils.createElement('div', { className: 'hospit-banner__desc' }, [
                    Utils.escapeHtml(h.animalName) + ' ' + statusDesc + '.'
                ]));
            }
        }
        content.appendChild(Utils.createElement('div', { className: 'hospit-banner__link' }, ['Voir le suivi \u2192']));
        banner.appendChild(content);
        return banner;
    }

    function _renderNotificationItem(notif) {
        var item = Utils.createElement('div', { className: 'notif-item' });
        item.appendChild(Utils.createElement('div', { className: 'notif-dot' + (notif.read ? ' read' : '') }));

        var content = Utils.createElement('div', { className: 'notif-content' });
        content.appendChild(Utils.createElement('div', { className: 'notif-title' }, [Utils.escapeHtml(notif.title)]));
        content.appendChild(Utils.createElement('div', { className: 'notif-message' }, [Utils.escapeHtml(notif.message)]));
        content.appendChild(Utils.createElement('div', { className: 'notif-date' }, [Utils.formatRelativeDate(notif.date)]));
        item.appendChild(content);

        return item;
    }

    function _render(data) {
        if (!data) data = {};
        Utils.clearElement(_container);

        var greeting = Utils.createElement('div', { className: 'dashboard-greeting' });
        greeting.appendChild(Utils.createElement('h1', { className: 'greeting-text' }, ['Bonjour, ' + Utils.escapeHtml(data.clientName || '')]));
        greeting.appendChild(Utils.createElement('p', { className: 'greeting-sub' }, ['Bienvenue sur l\'espace ' + Utils.escapeHtml(data.clinicName || 'de votre clinique')]));
        _container.appendChild(greeting);

        var hasContent = data.nextAppointment || (data.animals && data.animals.length > 0) || (data.notifications && data.notifications.length > 0) || (data.activeHospitalizations && data.activeHospitalizations.length > 0);
        if (!hasContent) {
            var welcome = Utils.createElement('div', { className: 'dashboard-welcome card' });
            welcome.appendChild(Utils.createElement('div', { className: 'dashboard-welcome__icon' }, ['\uD83D\uDC4B']));
            welcome.appendChild(Utils.createElement('h2', { className: 'dashboard-welcome__title' }, ['Bienvenue dans votre espace !']));
            welcome.appendChild(Utils.createElement('p', { className: 'dashboard-welcome__text' }, [
                'Votre espace client est pret. Des que votre clinique enregistrera vos animaux et rendez-vous, vous les retrouverez ici.'
            ]));
            welcome.appendChild(Utils.createElement('p', { className: 'dashboard-welcome__hint' }, [
                'En attendant, n\'hesitez pas a contacter votre clinique pour toute question.'
            ]));
            _container.appendChild(welcome);
            return;
        }

        if (data.activeHospitalizations && data.activeHospitalizations.length > 0) {
            _container.appendChild(_renderHospitBanner(data.activeHospitalizations));
        }

        if (data.nextAppointment) {
            _container.appendChild(_renderNextAppointment(data.nextAppointment));
        }

        if (data.animals && data.animals.length > 0) {
            var animalsSection = Utils.createElement('div', { className: 'dashboard-section' });
            animalsSection.appendChild(Utils.createElement('h2', { className: 'section-title' }, ['Mes animaux']));
            var scroll = Utils.createElement('div', { className: 'animal-cards-scroll' });
            data.animals.forEach(function (animal) {
                scroll.appendChild(_renderAnimalQuickCard(animal));
            });
            animalsSection.appendChild(scroll);
            _container.appendChild(animalsSection);
        }

        if (data.notifications && data.notifications.length > 0) {
            var notifSection = Utils.createElement('div', { className: 'dashboard-section' });
            notifSection.appendChild(Utils.createElement('h2', { className: 'section-title' }, ['Notifications']));
            var notifList = Utils.createElement('div', { className: 'card' });
            data.notifications.forEach(function (notif) {
                notifList.appendChild(_renderNotificationItem(notif));
            });
            notifSection.appendChild(notifList);
            _container.appendChild(notifSection);
        }
    }

    function _showSkeleton() {
        Utils.clearElement(_container);

        var greetingSkeleton = Utils.createElement('div', { style: 'margin-bottom:var(--space-6)' }, [
            Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--lg', style: 'width:60%' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:40%' })
        ]);
        _container.appendChild(greetingSkeleton);

        _container.appendChild(Utils.createElement('div', { className: 'skeleton skeleton-card', style: 'height:120px;margin-bottom:var(--space-6)' }));

        var animalsSkeletonRow = Utils.createElement('div', { style: 'display:flex;gap:var(--space-3);overflow:hidden' }, [
            Utils.createElement('div', { className: 'skeleton skeleton-card', style: 'width:140px;height:130px;flex-shrink:0' }),
            Utils.createElement('div', { className: 'skeleton skeleton-card', style: 'width:140px;height:130px;flex-shrink:0' }),
            Utils.createElement('div', { className: 'skeleton skeleton-card', style: 'width:140px;height:130px;flex-shrink:0' })
        ]);
        var animalsSkeleton = Utils.createElement('div', {}, [
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:30%;margin-bottom:var(--space-3)' }),
            animalsSkeletonRow
        ]);
        _container.appendChild(animalsSkeleton);
    }

    function _load(silent) {
        if (!silent) _showSkeleton();
        return API.dashboard.getSummary()
            .then(function (data) { _render(data); })
            .catch(function () {
                Utils.clearElement(_container);
                _container.appendChild(Utils.createErrorState('Impossible de charger le tableau de bord', _load));
            });
    }

    function init() {
        _container = Utils.$('#page-dashboard .page-content');
        Router.onPageInit('dashboard', function () { _load(); });
        Router.onPageRefresh('dashboard', function () { return _load(true); });
    }

    return { init: init };
})();
