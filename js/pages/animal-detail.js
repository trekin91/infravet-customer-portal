var AnimalDetailPage = (function () {
    'use strict';

    var _container;
    var _currentAnimalId = null;
    var _currentSubTab = 'fiche';
    var _animalData = null;
    var _loadVersion = 0;

    var SUB_TABS = [
        { id: 'fiche', label: 'Fiche' },
        { id: 'poids', label: 'Poids' },
        { id: 'consultations', label: 'Consultations' },
        { id: 'vaccinations', label: 'Vaccins' },
        { id: 'treatments', label: 'Traitements' }
    ];

    function _getSpeciesEmoji(species) {
        var map = { 'Chat': '\uD83D\uDC31', 'Chien': '\uD83D\uDC36', 'Lapin': '\uD83D\uDC30', 'Oiseau': '\uD83D\uDC26', 'Hamster': '\uD83D\uDC39' };
        return map[species] || '\uD83D\uDC3E';
    }

    function _renderHeader(animal) {
        var header = Utils.createElement('div', { className: 'detail-header' });
        header.appendChild(Utils.createElement('button', {
            className: 'btn-back',
            'aria-label': 'Retour',
            onClick: function () { Router.goBack(); }
        }, ['\u2190']));
        header.appendChild(Utils.createElement('h1', { className: 'detail-title' }, [Utils.escapeHtml(animal.name)]));
        return header;
    }

    function _renderHero(animal) {
        var hero = Utils.createElement('div', { className: 'animal-detail-hero' });
        hero.appendChild(Utils.createElement('div', { className: 'animal-detail-avatar' }, [_getSpeciesEmoji(animal.species)]));
        var info = Utils.createElement('div', { className: 'animal-detail-info' });
        info.appendChild(Utils.createElement('h2', {}, [Utils.escapeHtml(animal.name)]));
        info.appendChild(Utils.createElement('p', {}, [
            Utils.escapeHtml(animal.species) + ' \u2014 ' + Utils.escapeHtml(animal.breed)
        ]));
        info.appendChild(Utils.createElement('p', {}, [Utils.calculateAge(animal.birth_date)]));
        hero.appendChild(info);
        return hero;
    }

    function _renderSubTabs() {
        var tabBar = Utils.createElement('div', { className: 'sub-tabs', role: 'tablist' });
        SUB_TABS.forEach(function (tab) {
            tabBar.appendChild(Utils.createElement('button', {
                className: 'sub-tab' + (tab.id === _currentSubTab ? ' active' : ''),
                role: 'tab',
                'aria-selected': tab.id === _currentSubTab ? 'true' : 'false',
                dataset: { subtab: tab.id },
                onClick: function () { _switchSubTab(tab.id); }
            }, [tab.label]));
        });
        return tabBar;
    }

    function _switchSubTab(tabId) {
        _currentSubTab = tabId;
        Utils.$$('.sub-tab', _container).forEach(function (t) {
            var isActive = t.dataset.subtab === tabId;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        _loadSubTabContent(tabId);
    }

    function _loadSubTabContent(tabId) {
        var area = Utils.$('.sub-tab-content', _container);
        Utils.clearElement(area); area.appendChild(Utils.createLoadingInline());
        var version = ++_loadVersion;

        function _stale() { return version !== _loadVersion; }

        switch (tabId) {
            case 'fiche':
                _renderFiche(area);
                break;
            case 'poids':
                API.animals.getWeights(_currentAnimalId)
                    .then(function (data) { if (!_stale()) _renderWeights(area, Array.isArray(data) ? data : []); })
                    .catch(function () { if (!_stale()) { Utils.clearElement(area); area.appendChild(Utils.createErrorState('Erreur de chargement')); } });
                break;
            case 'consultations':
                API.animals.getConsultations(_currentAnimalId)
                    .then(function (data) { if (!_stale()) _renderConsultations(area, Array.isArray(data) ? data : []); })
                    .catch(function () { if (!_stale()) { Utils.clearElement(area); area.appendChild(Utils.createErrorState('Erreur de chargement')); } });
                break;
            case 'vaccinations':
                API.animals.getVaccinations(_currentAnimalId)
                    .then(function (data) { if (!_stale()) _renderVaccinations(area, Array.isArray(data) ? data : []); })
                    .catch(function () { if (!_stale()) { Utils.clearElement(area); area.appendChild(Utils.createErrorState('Erreur de chargement')); } });
                break;
            case 'treatments':
                API.animals.getTreatments(_currentAnimalId)
                    .then(function (data) { if (!_stale()) _renderTreatments(area, Array.isArray(data) ? data : []); })
                    .catch(function () { if (!_stale()) { Utils.clearElement(area); area.appendChild(Utils.createErrorState('Erreur de chargement')); } });
                break;
        }
    }

    function _renderFiche(container) {
        Utils.clearElement(container);
        var a = _animalData;
        var fields = [
            { label: 'Espece', value: a.species },
            { label: 'Race', value: a.breed },
            { label: 'Sexe', value: a.sex === 'M' ? 'Male' : 'Femelle' },
            { label: 'Date de naissance', value: Utils.formatDate(a.birth_date) },
            { label: 'Age', value: a.age || Utils.calculateAge(a.birth_date) },
            { label: 'Poids', value: a.current_weight_kg ? a.current_weight_kg + ' kg' : 'Non renseigne' },
            { label: 'Puce electronique', value: a.identification_number || 'Non renseigne' },
            { label: 'Stérilisé(e)', value: a.neutered_status || 'Non renseigné' }
        ];
        var card = Utils.createElement('div', { className: 'card' });
        var dl = Utils.createElement('dl', { className: 'info-list' });
        fields.forEach(function (f) {
            dl.appendChild(Utils.createElement('dt', {}, [f.label]));
            dl.appendChild(Utils.createElement('dd', {}, [Utils.escapeHtml(f.value)]));
        });
        card.appendChild(dl);
        container.appendChild(card);
    }

    function _renderWeights(container, weights) {
        Utils.clearElement(container);
        if (!weights || weights.length === 0) {
            container.appendChild(Utils.createEmptyState('\u2696\uFE0F', 'Aucune pesee enregistree', 'L\'evolution du poids apparaitra ici'));
            return;
        }

        var sorted = weights.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
        var last = sorted[sorted.length - 1];
        var prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
        var diff = prev ? last.weight - prev.weight : 0;
        var diffSign = diff > 0 ? '+' : '';
        var diffClass = diff > 0 ? 'weight-trend--up' : diff < 0 ? 'weight-trend--down' : 'weight-trend--stable';

        var summary = Utils.createElement('div', { className: 'weight-summary card' });
        var current = Utils.createElement('div', { className: 'weight-current' });
        current.appendChild(Utils.createElement('span', { className: 'weight-current__value' }, [last.weight.toFixed(1)]));
        current.appendChild(Utils.createElement('span', { className: 'weight-current__unit' }, ['kg']));
        summary.appendChild(current);
        var meta = Utils.createElement('div', { className: 'weight-meta' });
        meta.appendChild(Utils.createElement('span', { className: 'weight-meta__date' }, ['Derniere pesee : ' + Utils.formatDate(last.date)]));
        if (prev) {
            meta.appendChild(Utils.createElement('span', { className: 'weight-trend ' + diffClass }, [
                diffSign + diff.toFixed(1) + ' kg'
            ]));
        }
        summary.appendChild(meta);
        container.appendChild(summary);

        if (sorted.length >= 2) {
            container.appendChild(_renderWeightChart(sorted));
        }

        var historyCard = Utils.createElement('div', { className: 'card weight-history' });
        historyCard.appendChild(Utils.createElement('div', { className: 'weight-history__title' }, ['Historique']));
        var reversed = sorted.slice().reverse();
        reversed.forEach(function (w) {
            var row = Utils.createElement('div', { className: 'weight-history__row' });
            row.appendChild(Utils.createElement('span', { className: 'weight-history__date' }, [Utils.formatDate(w.date)]));
            row.appendChild(Utils.createElement('span', { className: 'weight-history__value' }, [w.weight.toFixed(1) + ' kg']));
            historyCard.appendChild(row);
        });
        container.appendChild(historyCard);
    }

    function _renderWeightChart(points) {
        var CHART_W = 320, CHART_H = 160;
        var PAD_L = 40, PAD_R = 12, PAD_T = 16, PAD_B = 28;
        var plotW = CHART_W - PAD_L - PAD_R;
        var plotH = CHART_H - PAD_T - PAD_B;

        var vals = points.map(function (p) { return p.weight; });
        var minW = Math.min.apply(null, vals);
        var maxW = Math.max.apply(null, vals);
        var range = maxW - minW || 1;
        var margin = range * 0.15;
        var yMin = Math.max(0, minW - margin);
        var yMax = maxW + margin;
        var yRange = yMax - yMin;

        var first = new Date(points[0].date).getTime();
        var last = new Date(points[points.length - 1].date).getTime();
        var xRange = last - first || 1;

        function toX(date) { return PAD_L + ((new Date(date).getTime() - first) / xRange) * plotW; }
        function toY(w) { return PAD_T + plotH - ((w - yMin) / yRange) * plotH; }

        var pathParts = [];
        var areaParts = [];
        var dotsSvg = '';
        points.forEach(function (p, i) {
            var x = toX(p.date).toFixed(1);
            var y = toY(p.weight).toFixed(1);
            pathParts.push((i === 0 ? 'M' : 'L') + x + ',' + y);
            areaParts.push((i === 0 ? 'M' : 'L') + x + ',' + y);
            dotsSvg += '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="var(--color-accent)" stroke="var(--color-surface)" stroke-width="2"/>';
        });

        var lastX = toX(points[points.length - 1].date).toFixed(1);
        var firstX = toX(points[0].date).toFixed(1);
        var bottomY = (PAD_T + plotH).toFixed(1);
        areaParts.push('L' + lastX + ',' + bottomY);
        areaParts.push('L' + firstX + ',' + bottomY);
        areaParts.push('Z');

        var gridLines = '';
        var yLabels = '';
        var steps = 4;
        for (var i = 0; i <= steps; i++) {
            var val = yMin + (yRange / steps) * i;
            var y = toY(val).toFixed(1);
            gridLines += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (CHART_W - PAD_R) + '" y2="' + y + '" stroke="var(--color-border)" stroke-width="0.5"/>';
            yLabels += '<text x="' + (PAD_L - 6) + '" y="' + (parseFloat(y) + 3) + '" text-anchor="end" fill="var(--color-text-tertiary)" font-size="9">' + val.toFixed(1) + '</text>';
        }

        var xLabels = '';
        var labelCount = Math.min(points.length, 5);
        var step = Math.max(1, Math.floor((points.length - 1) / (labelCount - 1)));
        for (var j = 0; j < points.length; j += step) {
            var px = toX(points[j].date).toFixed(1);
            var d = new Date(points[j].date);
            var label = (d.getDate() < 10 ? '0' : '') + d.getDate() + '/' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
            xLabels += '<text x="' + px + '" y="' + (CHART_H - 4) + '" text-anchor="middle" fill="var(--color-text-tertiary)" font-size="9">' + label + '</text>';
        }
        if ((points.length - 1) % step !== 0) {
            var lx = toX(points[points.length - 1].date).toFixed(1);
            var ld = new Date(points[points.length - 1].date);
            var ll = (ld.getDate() < 10 ? '0' : '') + ld.getDate() + '/' + (ld.getMonth() < 9 ? '0' : '') + (ld.getMonth() + 1);
            xLabels += '<text x="' + lx + '" y="' + (CHART_H - 4) + '" text-anchor="middle" fill="var(--color-text-tertiary)" font-size="9">' + ll + '</text>';
        }

        var svgHtml = '<svg viewBox="0 0 ' + CHART_W + ' ' + CHART_H + '" class="weight-chart__svg">'
            + '<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0.02"/></linearGradient></defs>'
            + gridLines + yLabels + xLabels
            + '<path d="' + areaParts.join('') + '" fill="url(#wg)"/>'
            + '<path d="' + pathParts.join('') + '" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            + dotsSvg
            + '</svg>';

        var wrapper = Utils.createElement('div', { className: 'card weight-chart' });
        wrapper.appendChild(Utils.createElement('div', { className: 'weight-chart__title' }, ['Evolution du poids']));
        var chartArea = Utils.createElement('div', { className: 'weight-chart__area' });
        chartArea.innerHTML = svgHtml;
        wrapper.appendChild(chartArea);
        return wrapper;
    }

    function _renderConsultations(container, consultations) {
        Utils.clearElement(container);
        if (!consultations || consultations.length === 0) {
            container.appendChild(Utils.createEmptyState('\uD83D\uDCCB', 'Aucune consultation', 'L\'historique des consultations apparaitra ici'));
            return;
        }
        var timeline = Utils.createElement('div', { className: 'consult-timeline' });
        consultations.forEach(function (c) {
            var item = Utils.createElement('div', { className: 'consult-item card' });
            item.appendChild(Utils.createElement('div', { className: 'consult-date' }, [Utils.formatDate(c.date)]));
            item.appendChild(Utils.createElement('div', { className: 'consult-type' }, [Utils.escapeHtml(c.type) + ' \u2014 ' + Utils.escapeHtml(c.reason)]));
            item.appendChild(Utils.createElement('div', { className: 'consult-vet' }, [Utils.escapeHtml(c.veterinarian)]));
            if (c.diagnosis) {
                item.appendChild(Utils.createElement('div', { className: 'consult-diagnosis' }, [Utils.escapeHtml(c.diagnosis)]));
            }
            if (c.notes) {
                item.appendChild(Utils.createElement('div', { className: 'consult-reason' }, [Utils.escapeHtml(c.notes)]));
            }
            if (c.weight || c.temperature) {
                var vitals = Utils.createElement('div', { className: 'consult-vitals' });
                if (c.weight) vitals.appendChild(Utils.createElement('span', {}, ['Poids: ' + c.weight + ' kg']));
                if (c.temperature) vitals.appendChild(Utils.createElement('span', {}, ['Temp: ' + c.temperature + '\u00B0C']));
                item.appendChild(vitals);
            }
            timeline.appendChild(item);
        });
        container.appendChild(timeline);
    }

    function _renderVaccinations(container, vaccinations) {
        Utils.clearElement(container);
        if (!vaccinations || vaccinations.length === 0) {
            container.appendChild(Utils.createEmptyState('\uD83D\uDC89', 'Aucune vaccination enregistree', 'Les vaccinations seront affichees ici'));
            return;
        }
        vaccinations.forEach(function (v) {
            var isOverdue = v.status === 'overdue';
            var card = Utils.createElement('div', { className: 'vacc-card card' });
            var info = Utils.createElement('div', { className: 'vacc-card__info' });
            info.appendChild(Utils.createElement('div', { className: 'vacc-card__name' }, [Utils.escapeHtml(v.name)]));
            info.appendChild(Utils.createElement('div', { className: 'vacc-card__details' }, [
                Utils.formatDate(v.date) + ' \u2022 ' + Utils.escapeHtml(v.veterinarian)
            ]));
            var nextText = 'Prochain rappel : ' + Utils.formatDate(v.next_due_date);
            var nextClass = 'vacc-card__next' + (isOverdue ? ' text-error' : ' text-success');
            info.appendChild(Utils.createElement('div', { className: nextClass }, [nextText]));
            card.appendChild(info);

            var badgeClass = isOverdue ? 'badge badge--error' : 'badge badge--success';
            var badgeText = isOverdue ? 'En retard' : 'A jour';
            card.appendChild(Utils.createElement('span', { className: badgeClass }, [badgeText]));

            container.appendChild(card);
        });
    }

    function _renderTreatments(container, treatments) {
        Utils.clearElement(container);
        if (!treatments || treatments.length === 0) {
            container.appendChild(Utils.createEmptyState('\uD83D\uDC8A', 'Aucun traitement enregistre', 'Les traitements prescrits apparaitront ici'));
            return;
        }
        treatments.forEach(function (t) {
            var card = Utils.createElement('div', { className: 'treat-card card' });
            var header = Utils.createElement('div', { className: 'treat-card__header' });
            var left = Utils.createElement('div', {});
            left.appendChild(Utils.createElement('div', { className: 'treat-card__name' }, [Utils.escapeHtml(t.name)]));
            left.appendChild(Utils.createElement('div', { className: 'treat-card__type' }, [Utils.escapeHtml(t.type)]));
            header.appendChild(left);
            var statusClass = t.status === 'active' ? 'badge badge--info' : 'badge badge--success';
            var statusText = t.status === 'active' ? 'En cours' : 'Termine';
            header.appendChild(Utils.createElement('span', { className: statusClass }, [statusText]));
            card.appendChild(header);

            card.appendChild(Utils.createElement('div', { className: 'treat-card__detail' }, [
                'Prescrit le ' + Utils.formatDate(t.prescribed_date) + ' par ' + Utils.escapeHtml(t.veterinarian)
            ]));
            card.appendChild(Utils.createElement('div', { className: 'treat-card__detail' }, [
                'Duree : ' + Utils.escapeHtml(t.duration) + ' \u2022 ' + Utils.escapeHtml(t.dosage)
            ]));
            if (t.instructions) {
                card.appendChild(Utils.createElement('div', { className: 'treat-card__instructions' }, [Utils.escapeHtml(t.instructions)]));
            }
            container.appendChild(card);
        });
    }

    function _showSkeleton() {
        Utils.clearElement(_container);
        var header = Utils.createElement('div', { style: 'display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4)' }, [
            Utils.createElement('div', { className: 'skeleton', style: 'width:48px;height:48px;border-radius:var(--radius-full)' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--lg', style: 'width:40%;margin:0' })
        ]);
        var hero = Utils.createElement('div', { style: 'display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-4)' }, [
            Utils.createElement('div', { className: 'skeleton skeleton-circle', style: 'width:72px;height:72px;flex-shrink:0' }),
            Utils.createElement('div', { style: 'flex:1' }, [
                Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--lg', style: 'width:50%' }),
                Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:70%' }),
                Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:30%' })
            ])
        ]);
        var tabs = Utils.createElement('div', { style: 'display:flex;gap:var(--space-2);margin-bottom:var(--space-4)' }, [
            Utils.createElement('div', { className: 'skeleton', style: 'width:60px;height:32px;border-radius:var(--radius-full)' }),
            Utils.createElement('div', { className: 'skeleton', style: 'width:80px;height:32px;border-radius:var(--radius-full)' }),
            Utils.createElement('div', { className: 'skeleton', style: 'width:60px;height:32px;border-radius:var(--radius-full)' }),
            Utils.createElement('div', { className: 'skeleton', style: 'width:70px;height:32px;border-radius:var(--radius-full)' })
        ]);
        var grid = Utils.createElement('div', { style: 'display:grid;grid-template-columns:auto 1fr;gap:var(--space-2) var(--space-4)' }, [
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:80px' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:60%' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:80px' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:50%' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:80px' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:40%' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:80px' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:70%' })
        ]);
        var card = Utils.createElement('div', { className: 'card' }, [grid]);
        _container.appendChild(header);
        _container.appendChild(hero);
        _container.appendChild(tabs);
        _container.appendChild(card);
    }

    function _load(params, silent) {
        if (params && params.animalId) {
            _currentAnimalId = params.animalId;
            _currentSubTab = 'fiche';
        }
        if (!silent) _showSkeleton();

        return API.animals.get(_currentAnimalId)
            .then(function (data) {
                if (!data) throw new Error('Donnees invalides');
                _animalData = data;
                Utils.clearElement(_container);
                _container.appendChild(_renderHeader(_animalData));
                _container.appendChild(_renderHero(_animalData));
                _container.appendChild(_renderSubTabs());
                _container.appendChild(Utils.createElement('div', { className: 'sub-tab-content' }));
                _loadSubTabContent(_currentSubTab);
            })
            .catch(function () {
                Utils.clearElement(_container);
                _container.appendChild(Utils.createErrorState('Impossible de charger les informations', function () { _load({ animalId: _currentAnimalId }); }));
            });
    }

    function init() {
        _container = Utils.$('#page-animal-detail .page-content');
        Router.onPageInit('animal-detail', function (params) { _load(params); });
        Router.onPageRefresh('animal-detail', function () { return _load(null, true); });
    }

    return { init: init };
})();
