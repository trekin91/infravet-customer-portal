var DocumentsPage = (function () {
    'use strict';

    var _container;
    var _currentFilter = null;

    var TYPE_CONFIG = {
        lab: { label: 'Analyse', icon: '\uD83E\uDDEA', iconClass: 'doc-card__icon--lab' },
        prescription: { label: 'Ordonnance', icon: '\uD83D\uDCCB', iconClass: 'doc-card__icon--prescription' },
        certificate: { label: 'Certificat', icon: '\uD83D\uDCC4', iconClass: 'doc-card__icon--certificate' },
        report: { label: 'Compte-rendu', icon: '\uD83D\uDCC3', iconClass: 'doc-card__icon--report' }
    };

    function _renderFilters() {
        var bar = Utils.createElement('div', { className: 'doc-filters' });
        bar.appendChild(Utils.createElement('button', {
            className: 'doc-filter-btn' + (_currentFilter === null ? ' active' : ''),
            onClick: function () { _switchFilter(null); }
        }, ['Tous']));
        Object.keys(TYPE_CONFIG).forEach(function (type) {
            bar.appendChild(Utils.createElement('button', {
                className: 'doc-filter-btn' + (_currentFilter === type ? ' active' : ''),
                dataset: { type: type },
                onClick: function () { _switchFilter(type); }
            }, [TYPE_CONFIG[type].label]));
        });
        return bar;
    }

    function _switchFilter(type) {
        _currentFilter = type;
        Utils.$$('.doc-filter-btn', _container).forEach(function (btn) {
            var btnType = btn.dataset.type || null;
            btn.classList.toggle('active', btnType === type);
        });
        _loadDocuments();
    }

    function _renderDocumentCard(doc) {
        var config = TYPE_CONFIG[doc.type] || { label: doc.type, icon: '\uD83D\uDCC4', iconClass: 'doc-card__icon--report' };
        var card = Utils.createElement('article', { className: 'doc-card card' });

        card.appendChild(Utils.createElement('div', { className: 'doc-card__icon ' + config.iconClass }, [config.icon]));

        var info = Utils.createElement('div', { className: 'doc-card__info' });
        info.appendChild(Utils.createElement('div', { className: 'doc-card__title' }, [Utils.escapeHtml(doc.title)]));
        info.appendChild(Utils.createElement('div', { className: 'doc-card__meta' }, [
            Utils.escapeHtml(doc.animalName) + ' \u2022 ' + Utils.formatDate(doc.date) + ' \u2022 ' + Utils.formatFileSize(doc.fileSize)
        ]));
        card.appendChild(info);

        var dlBtn = Utils.createElement('button', {
            className: 'doc-card__download',
            'aria-label': 'Telecharger ' + doc.title,
            onClick: function () { _downloadDocument(doc.id); }
        });
        dlBtn.appendChild(Utils.createSvg(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', {tag: 'polyline', points: '7 10 12 15 17 10'}, {tag: 'line', x1: '12', y1: '15', x2: '12', y2: '3'}]));
        card.appendChild(dlBtn);

        return card;
    }

    function _downloadDocument(docId) {
        API.documents.getDownloadUrl(docId)
            .then(function (data) {
                if (data.downloadUrl && data.downloadUrl !== '#mock-download-' + docId) {
                    window.open(data.downloadUrl, '_blank');
                } else {
                    Utils.showToast('Telechargement simule (mode mock)', 'info');
                }
            })
            .catch(function () {
                Utils.showToast('Impossible de telecharger le document', 'error');
            });
    }

    function _loadDocuments() {
        var listEl = Utils.$('.doc-list', _container);
        if (!listEl) return;
        Utils.clearElement(listEl);
        for (var i = 0; i < 4; i++) {
            listEl.appendChild(Utils.createElement('div', {
                className: 'card',
                style: 'display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3)'
            }, [
                Utils.createElement('div', { className: 'skeleton', style: 'width:44px;height:44px;border-radius:var(--radius-sm);flex-shrink:0' }),
                Utils.createElement('div', { style: 'flex:1' }, [
                    Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:70%' }),
                    Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:50%' })
                ]),
                Utils.createElement('div', { className: 'skeleton skeleton-circle', style: 'width:36px;height:36px;flex-shrink:0' })
            ]));
        }

        var params = {};
        if (_currentFilter) params.type = _currentFilter;

        return API.documents.list(params)
            .then(function (data) {
                if (!data) data = {};
                Utils.clearElement(listEl);
                if (!data.documents || data.documents.length === 0) {
                    listEl.appendChild(Utils.createEmptyState('\uD83D\uDCC4', 'Aucun document', 'Vos documents apparaitront ici apres vos consultations'));
                    return;
                }
                data.documents.forEach(function (doc) {
                    listEl.appendChild(_renderDocumentCard(doc));
                });
            })
            .catch(function () {
                Utils.clearElement(listEl);
                listEl.appendChild(Utils.createErrorState('Impossible de charger les documents', _loadDocuments));
            });
    }

    function _load() {
        Utils.clearElement(_container);
        _currentFilter = null;
        _container.appendChild(_renderFilters());
        _container.appendChild(Utils.createElement('div', { className: 'doc-list' }));
        _loadDocuments();
    }

    function init() {
        _container = Utils.$('#page-documents .page-content');
        Router.onPageInit('documents', function () { _load(); });
        Router.onPageRefresh('documents', _loadDocuments);
    }

    return { init: init };
})();
