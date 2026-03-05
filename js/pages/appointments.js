var AppointmentsPage = (function () {
    'use strict';

    var _container;
    var _currentFilter = 'upcoming';

    function _statusBadge(status) {
        var map = {
            confirmed: { cls: 'badge--success', text: 'Confirme' },
            pending: { cls: 'badge--warning', text: 'En attente' },
            completed: { cls: 'badge--info', text: 'Termine' },
            cancelled: { cls: 'badge--error', text: 'Annule' }
        };
        var s = map[status] || { cls: 'badge--info', text: status };
        return Utils.createElement('span', { className: 'badge ' + s.cls + ' appt-status' }, [s.text]);
    }

    function _renderAppointmentCard(appt) {
        var d = new Date(appt.dateTime);
        var card = Utils.createElement('article', { className: 'appt-card card' });

        var dateCol = Utils.createElement('div', { className: 'appt-card__date-col' });
        dateCol.appendChild(Utils.createElement('div', { className: 'appt-card__day' }, [String(d.getDate())]));
        dateCol.appendChild(Utils.createElement('div', { className: 'appt-card__month' }, [
            d.toLocaleDateString('fr-FR', { month: 'short' })
        ]));
        card.appendChild(dateCol);

        var info = Utils.createElement('div', { className: 'appt-card__info' });
        info.appendChild(Utils.createElement('div', { className: 'appt-card__animal' }, [
            Utils.escapeHtml(appt.animalName) + ' \u2014 ' + Utils.escapeHtml(appt.type)
        ]));
        info.appendChild(Utils.createElement('div', { className: 'appt-card__reason' }, [Utils.escapeHtml(appt.reason)]));

        var meta = Utils.createElement('div', { className: 'appt-card__meta' });
        meta.appendChild(Utils.createElement('span', {}, [Utils.formatTime(appt.dateTime) + ' (' + appt.duration + ' min)']));
        meta.appendChild(Utils.createElement('span', {}, [Utils.escapeHtml(appt.veterinarian)]));
        info.appendChild(meta);

        card.appendChild(info);
        card.appendChild(_statusBadge(appt.status));

        if (_currentFilter === 'upcoming' && (appt.status === 'confirmed' || appt.status === 'pending')) {
            var cancelBtn = Utils.createElement('button', {
                className: 'btn btn--outline btn--sm appt-cancel-btn',
                onClick: function (e) {
                    e.stopPropagation();
                    _confirmCancel(appt);
                }
            }, ['Annuler']);
            card.appendChild(cancelBtn);
        }

        return card;
    }

    function _confirmCancel(appt) {
        var overlay = Utils.createElement('div', { className: 'confirm-overlay', onClick: function (e) { if (e.target === overlay) overlay.remove(); } });
        var dialog = Utils.createElement('div', { className: 'confirm-dialog card' });
        dialog.appendChild(Utils.createElement('h3', { className: 'confirm-title' }, ['Annuler ce rendez-vous ?']));
        dialog.appendChild(Utils.createElement('p', { className: 'confirm-text' }, [
            Utils.escapeHtml(appt.animalName) + ' \u2014 ' + Utils.escapeHtml(appt.type) + '\n' + Utils.formatRelativeDate(appt.dateTime) + ' \u00e0 ' + Utils.formatTime(appt.dateTime)
        ]));
        var actions = Utils.createElement('div', { className: 'confirm-actions' });
        actions.appendChild(Utils.createElement('button', {
            className: 'btn btn--outline',
            onClick: function () { overlay.remove(); }
        }, ['Non, garder']));
        actions.appendChild(Utils.createElement('button', {
            className: 'btn btn--danger',
            onClick: function () {
                overlay.remove();
                _cancelAppointment(appt.id);
            }
        }, ['Oui, annuler']));
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    function _cancelAppointment(id) {
        API.appointments.cancel(id)
            .then(function () {
                Utils.showToast('Rendez-vous annule', 'success');
                _loadAppointments();
            })
            .catch(function () {
                Utils.showToast('Erreur lors de l\'annulation', 'error');
            });
    }

    function _renderSegmentControl() {
        var control = Utils.createElement('div', { className: 'segment-control' });
        var upcoming = Utils.createElement('button', {
            className: 'segment-btn' + (_currentFilter === 'upcoming' ? ' active' : ''),
            onClick: function () { _switchFilter('upcoming'); }
        }, ['A venir']);
        var past = Utils.createElement('button', {
            className: 'segment-btn' + (_currentFilter === 'past' ? ' active' : ''),
            onClick: function () { _switchFilter('past'); }
        }, ['Passes']);
        control.appendChild(upcoming);
        control.appendChild(past);
        return control;
    }

    function _switchFilter(filter) {
        _currentFilter = filter;
        Utils.$$('.segment-btn', _container).forEach(function (btn) {
            btn.classList.toggle('active', btn.textContent.toLowerCase().includes(filter === 'upcoming' ? 'venir' : 'pass'));
        });
        _loadAppointments();
    }

    function _loadAppointments() {
        var listEl = Utils.$('.appt-list', _container);
        if (!listEl) return;
        Utils.clearElement(listEl);
        for (var _si = 0; _si < 3; _si++) {
            var skelCard = Utils.createElement('div', { className: 'card', style: 'display:flex;gap:var(--space-4);margin-bottom:var(--space-3)' }, [
                Utils.createElement('div', { style: 'min-width:50px;text-align:center' }, [
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--lg', style: 'width:32px;margin:0 auto' }),
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:28px;margin:4px auto 0' })
                ]),
                Utils.createElement('div', { style: 'flex:1' }, [
                    Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:60%' }),
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:80%' }),
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:40%' })
                ])
            ]);
            listEl.appendChild(skelCard);
        }

        return API.appointments.list({ status: _currentFilter })
            .then(function (data) {
                if (!data) data = {};
                Utils.clearElement(listEl);
                if (!data.appointments || data.appointments.length === 0) {
                    var msg = _currentFilter === 'upcoming' ? 'Aucun rendez-vous a venir' : 'Aucun rendez-vous passe';
                    Utils.clearElement(listEl);
                    listEl.appendChild(Utils.createEmptyState('\uD83D\uDCC5', msg, _currentFilter === 'upcoming' ? 'Contactez votre clinique pour prendre rendez-vous' : null));
                    return;
                }
                data.appointments.forEach(function (appt) {
                    listEl.appendChild(_renderAppointmentCard(appt));
                });
            })
            .catch(function () {
                Utils.clearElement(listEl);
                listEl.appendChild(Utils.createErrorState('Impossible de charger les rendez-vous', _loadAppointments));
            });
    }

    function _load() {
        Utils.clearElement(_container);
        _currentFilter = 'upcoming';
        _container.appendChild(_renderSegmentControl());
        _container.appendChild(Utils.createElement('div', { className: 'appt-list' }));
        _loadAppointments();
    }

    function init() {
        _container = Utils.$('#page-appointments .page-content');
        Router.onPageInit('appointments', function () { _load(); });
        Router.onPageRefresh('appointments', _loadAppointments);
    }

    return { init: init };
})();
