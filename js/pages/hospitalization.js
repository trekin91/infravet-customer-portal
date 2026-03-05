var HospitalizationPage = (function () {
    'use strict';

    var _container;
    var _currentFilter = 'active';
    var _currentHospitId = null;
    var _view = 'list';

    var STATUS_MAP = {
        admis: { cls: 'badge--info', text: 'Admis', color: '#9BA8B2' },
        en_preparation: { cls: 'badge--info', text: 'En preparation', color: '#3498DB' },
        en_intervention: { cls: 'badge--warning', text: 'En intervention', color: '#F39C12' },
        reveil: { cls: 'badge--warning', text: 'Reveil', color: '#F39C12' },
        en_soins: { cls: 'badge--info', text: 'En soins', color: '#3498DB' },
        observation: { cls: 'badge--info', text: 'Observation', color: '#3498DB' },
        sorti: { cls: 'badge--success', text: 'Sorti', color: '#2ECC71' }
    };

    var STEP_LABELS = {
        admis: 'Admis',
        en_preparation: 'Preparation',
        en_intervention: 'Intervention',
        reveil: 'Reveil',
        en_soins: 'En soins',
        observation: 'Observation',
        sorti: 'Sorti'
    };

    function _speciesEmoji(species) {
        var map = { Chat: '\uD83D\uDC31', Chien: '\uD83D\uDC36', Lapin: '\uD83D\uDC30', Hamster: '\uD83D\uDC39', Oiseau: '\uD83D\uDC26' };
        return map[species] || '\uD83D\uDC3E';
    }

    function _statusBadge(status) {
        var s = STATUS_MAP[status] || { cls: 'badge--info', text: status };
        return Utils.createElement('span', { className: 'badge ' + s.cls + ' hospit-status' }, [s.text]);
    }

    function _renderProgressBar(steps, currentStep) {
        var bar = Utils.createElement('div', { className: 'hospit-progress' });
        var track = Utils.createElement('div', { className: 'hospit-progress__track' });
        var pct = steps.length > 1 ? Math.round((currentStep / (steps.length - 1)) * 100) : 100;
        var fill = Utils.createElement('div', { className: 'hospit-progress__fill', style: 'width:' + pct + '%' });
        track.appendChild(fill);
        bar.appendChild(track);
        var labels = Utils.createElement('div', { className: 'hospit-progress__labels' });
        steps.forEach(function (step, i) {
            var cls = 'hospit-progress__step';
            if (i < currentStep) cls += ' hospit-progress__step--done';
            else if (i === currentStep) cls += ' hospit-progress__step--current';
            labels.appendChild(Utils.createElement('span', { className: cls }, [STEP_LABELS[step] || step]));
        });
        bar.appendChild(labels);
        return bar;
    }

    function _renderMiniProgress(steps, currentStep) {
        var bar = Utils.createElement('div', { className: 'hospit-mini-progress' });
        steps.forEach(function (step, i) {
            var cls = 'hospit-mini-progress__dot';
            if (i < currentStep) cls += ' hospit-mini-progress__dot--done';
            else if (i === currentStep) cls += ' hospit-mini-progress__dot--current';
            bar.appendChild(Utils.createElement('span', { className: cls, title: STEP_LABELS[step] || step }));
        });
        return bar;
    }

    function _renderHospitCard(h, isHistory) {
        var card = Utils.createElement('article', { className: 'hospit-card card', onClick: function () { _showDetail(h.id); } });

        var left = Utils.createElement('div', { className: 'hospit-card__emoji' }, [_speciesEmoji(h.animalSpecies)]);
        card.appendChild(left);

        var center = Utils.createElement('div', { className: 'hospit-card__info' });
        center.appendChild(Utils.createElement('div', { className: 'hospit-card__animal' }, [
            Utils.escapeHtml(h.animalName) + ' \u2014 ' + Utils.escapeHtml(h.animalSpecies)
        ]));
        if (h.reason) {
            center.appendChild(Utils.createElement('div', { className: 'hospit-card__reason' }, [Utils.escapeHtml(h.reason)]));
        }
        center.appendChild(Utils.createElement('div', { className: 'hospit-card__vet' }, [Utils.escapeHtml(h.veterinarian)]));
        if (isHistory && h.dischargeDate) {
            center.appendChild(Utils.createElement('div', { className: 'hospit-card__date' }, ['Sorti le ' + Utils.formatDate(h.dischargeDate)]));
        } else if (h.lastUpdate) {
            center.appendChild(Utils.createElement('div', { className: 'hospit-card__date' }, ['Mis a jour ' + Utils.formatDateTime(h.lastUpdate)]));
        }
        card.appendChild(center);

        card.appendChild(_statusBadge(h.status));

        if (!isHistory && h.steps && h.steps.length > 0) {
            card.appendChild(_renderMiniProgress(h.steps, h.currentStep));
        }

        return card;
    }

    function _renderSegmentControl() {
        var control = Utils.createElement('div', { className: 'segment-control' });
        var active = Utils.createElement('button', {
            className: 'segment-btn' + (_currentFilter === 'active' ? ' active' : ''),
            onClick: function () { _switchFilter('active'); }
        }, ['En cours']);
        var history = Utils.createElement('button', {
            className: 'segment-btn' + (_currentFilter === 'history' ? ' active' : ''),
            onClick: function () { _switchFilter('history'); }
        }, ['Historique']);
        control.appendChild(active);
        control.appendChild(history);
        return control;
    }

    function _switchFilter(filter) {
        _currentFilter = filter;
        Utils.$$('.segment-btn', _container).forEach(function (btn) {
            btn.classList.toggle('active', btn.textContent.toLowerCase().includes(filter === 'active' ? 'cours' : 'historique'));
        });
        _loadList();
    }

    function _renderListSkeleton(listEl) {
        for (var i = 0; i < 3; i++) {
            var skelCard = Utils.createElement('div', { className: 'card', style: 'display:flex;gap:var(--space-4);margin-bottom:var(--space-3)' }, [
                Utils.createElement('div', { style: 'min-width:48px;text-align:center' }, [
                    Utils.createElement('div', { className: 'skeleton', style: 'width:40px;height:40px;border-radius:var(--radius-full);margin:0 auto' })
                ]),
                Utils.createElement('div', { style: 'flex:1' }, [
                    Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:60%' }),
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:80%' }),
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:40%' })
                ]),
                Utils.createElement('div', { style: 'min-width:60px' }, [
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:56px' })
                ])
            ]);
            listEl.appendChild(skelCard);
        }
    }

    function _loadList() {
        var listEl = Utils.$('.hospit-list', _container);
        if (!listEl) return;
        Utils.clearElement(listEl);
        _renderListSkeleton(listEl);

        return API.hospitalizations.list({ status: _currentFilter })
            .then(function (data) {
                if (!data) data = {};
                Utils.clearElement(listEl);
                if (!data.hospitalizations || data.hospitalizations.length === 0) {
                    if (_currentFilter === 'active') {
                        listEl.appendChild(Utils.createEmptyState('\uD83C\uDFE5', 'Aucune hospitalisation en cours.', 'Cette page s\'activera automatiquement si l\'un de vos animaux est pris en charge par la clinique.'));
                    } else {
                        listEl.appendChild(Utils.createEmptyState('\uD83C\uDFE5', 'Aucun historique d\'hospitalisation.'));
                    }
                    return;
                }
                var isHistory = _currentFilter === 'history';
                data.hospitalizations.forEach(function (h) {
                    listEl.appendChild(_renderHospitCard(h, isHistory));
                });
            })
            .catch(function () {
                Utils.clearElement(listEl);
                listEl.appendChild(Utils.createErrorState('Impossible de charger les hospitalisations', _loadList));
            });
    }

    function _showDetail(id) {
        _currentHospitId = id;
        _view = 'detail';
        Utils.clearElement(_container);
        _container.appendChild(Utils.createLoadingInline());

        API.hospitalizations.get(id)
            .then(function (data) {
                if (!data || !data.hospitalization) throw new Error('Donnees invalides');
                _renderDetail(data.hospitalization);
            })
            .catch(function () {
                Utils.clearElement(_container);
                _container.appendChild(Utils.createErrorState('Impossible de charger le detail', function () { _showDetail(id); }));
            });
    }

    function _renderDetail(h) {
        Utils.clearElement(_container);

        var header = Utils.createElement('div', { className: 'detail-header' });
        header.appendChild(Utils.createElement('button', {
            className: 'btn-back',
            'aria-label': 'Retour',
            onClick: function () { _showListView(); }
        }, ['\u2190']));
        header.appendChild(Utils.createElement('h1', { className: 'detail-title' }, [Utils.escapeHtml(h.animalName)]));
        _container.appendChild(header);

        var statusInfo = STATUS_MAP[h.status] || { cls: 'badge--info', text: h.status, color: '#9BA8B2' };
        var banner = Utils.createElement('div', { className: 'hospit-detail-banner', style: 'background-color:' + statusInfo.color });
        banner.appendChild(Utils.createElement('span', { className: 'hospit-detail-banner__emoji' }, [_speciesEmoji(h.animalSpecies)]));
        var bannerInfo = Utils.createElement('div', { className: 'hospit-detail-banner__info' });
        bannerInfo.appendChild(Utils.createElement('div', { className: 'hospit-detail-banner__name' }, [
            Utils.escapeHtml(h.animalName) + ' \u2014 ' + Utils.escapeHtml(h.animalSpecies)
        ]));
        bannerInfo.appendChild(Utils.createElement('div', { className: 'hospit-detail-banner__status' }, [statusInfo.text]));
        if (h.reason) {
            bannerInfo.appendChild(Utils.createElement('div', { className: 'hospit-detail-banner__reason' }, [Utils.escapeHtml(h.reason)]));
        }
        banner.appendChild(bannerInfo);
        _container.appendChild(banner);

        var infoCard = Utils.createElement('div', { className: 'card hospit-detail-info' });
        var dl = Utils.createElement('dl', { className: 'info-list' });
        dl.appendChild(Utils.createElement('dt', {}, ['Veterinaire']));
        dl.appendChild(Utils.createElement('dd', {}, [Utils.escapeHtml(h.veterinarian)]));
        dl.appendChild(Utils.createElement('dt', {}, ['Date d\'admission']));
        dl.appendChild(Utils.createElement('dd', {}, [Utils.formatDateTime(h.admissionDate)]));
        if (h.dischargeDate) {
            dl.appendChild(Utils.createElement('dt', {}, ['Date de sortie']));
            dl.appendChild(Utils.createElement('dd', {}, [Utils.formatDateTime(h.dischargeDate)]));
        }
        if (h.notes) {
            dl.appendChild(Utils.createElement('dt', {}, ['Notes']));
            dl.appendChild(Utils.createElement('dd', {}, [Utils.escapeHtml(h.notes)]));
        }
        infoCard.appendChild(dl);
        _container.appendChild(infoCard);

        if (h.steps && h.steps.length > 0) {
            var progressCard = Utils.createElement('div', { className: 'card hospit-detail-progress' });
            progressCard.appendChild(Utils.createElement('h2', { className: 'hospit-section-title' }, ['Progression']));
            progressCard.appendChild(_renderProgressBar(h.steps, h.currentStep));
            _container.appendChild(progressCard);
        }

        if (h.photos && h.photos.length > 0) {
            var photosCard = Utils.createElement('div', { className: 'card hospit-detail-photos' });
            photosCard.appendChild(Utils.createElement('h2', { className: 'hospit-section-title' }, ['Photos']));
            var grid = Utils.createElement('div', { className: 'hospit-photo-grid' });
            h.photos.forEach(function (photo) {
                var thumb = Utils.createElement('div', { className: 'hospit-photo-thumb', onClick: function () { _openPhotoModal(photo.url, photo.caption); } });
                var img = Utils.createElement('img', { src: photo.url, alt: Utils.escapeHtml(photo.caption || ''), loading: 'lazy' });
                thumb.appendChild(img);
                if (photo.caption) {
                    thumb.appendChild(Utils.createElement('span', { className: 'hospit-photo-caption' }, [Utils.escapeHtml(photo.caption)]));
                }
                grid.appendChild(thumb);
            });
            photosCard.appendChild(grid);
            _container.appendChild(photosCard);
        }

        if (h.timeline && h.timeline.length > 0) {
            var timelineCard = Utils.createElement('div', { className: 'card hospit-detail-timeline' });
            timelineCard.appendChild(Utils.createElement('h2', { className: 'hospit-section-title' }, ['Suivi']));
            var timeline = Utils.createElement('div', { className: 'hospit-timeline' });
            h.timeline.forEach(function (entry) {
                var item = Utils.createElement('div', { className: 'hospit-timeline__item' });
                var dateRow = Utils.createElement('div', { className: 'hospit-timeline__date' }, [Utils.formatDateTime(entry.date)]);
                item.appendChild(dateRow);
                item.appendChild(_statusBadge(entry.status));
                if (entry.description) {
                    item.appendChild(Utils.createElement('div', { className: 'hospit-timeline__desc' }, [Utils.escapeHtml(entry.description)]));
                }
                if (entry.photo && entry.photo.url) {
                    var photoEl = Utils.createElement('img', {
                        className: 'hospit-timeline__photo',
                        src: entry.photo.url,
                        alt: Utils.escapeHtml(entry.photo.caption || ''),
                        loading: 'lazy',
                        onClick: function () { _openPhotoModal(entry.photo.url, entry.photo.caption); }
                    });
                    item.appendChild(photoEl);
                }
                timeline.appendChild(item);
            });
            timelineCard.appendChild(timeline);
            _container.appendChild(timelineCard);
        }
    }

    function _openPhotoModal(url, caption) {
        var existing = Utils.$('.hospit-photo-modal');
        if (existing) existing.remove();

        var overlay = Utils.createElement('div', { className: 'hospit-photo-modal', onClick: function (e) { if (e.target === overlay) _closePhotoModal(); } });
        var closeBtn = Utils.createElement('button', {
            className: 'hospit-photo-modal__close',
            'aria-label': 'Fermer',
            onClick: function () { _closePhotoModal(); }
        }, ['\u00D7']);
        overlay.appendChild(closeBtn);
        var img = Utils.createElement('img', { className: 'hospit-photo-modal__img', src: url, alt: Utils.escapeHtml(caption || '') });
        overlay.appendChild(img);
        if (caption) {
            overlay.appendChild(Utils.createElement('div', { className: 'hospit-photo-modal__caption' }, [Utils.escapeHtml(caption)]));
        }
        document.body.appendChild(overlay);
    }

    function _closePhotoModal() {
        var modal = Utils.$('.hospit-photo-modal');
        if (modal) modal.remove();
    }

    function _showListView() {
        _view = 'list';
        _currentHospitId = null;
        _load();
    }

    function _load() {
        Utils.clearElement(_container);
        _currentFilter = 'active';
        _view = 'list';
        _container.appendChild(_renderSegmentControl());
        _container.appendChild(Utils.createElement('div', { className: 'hospit-list' }));
        _loadList();
    }

    function init() {
        _container = Utils.$('#page-hospitalization .page-content');
        Router.onPageInit('hospitalization', function () { _load(); });
        Router.onPageRefresh('hospitalization', function () {
            if (_view === 'detail' && _currentHospitId) {
                return _showDetail(_currentHospitId);
            }
            return _loadList();
        });
    }

    return { init: init };
})();
