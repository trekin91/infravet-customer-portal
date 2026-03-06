var AnimalsPage = (function () {
    'use strict';

    var _container;

    function _getSpeciesEmoji(species) {
        var map = { 'Chat': '\uD83D\uDC31', 'Chien': '\uD83D\uDC36', 'Lapin': '\uD83D\uDC30', 'Oiseau': '\uD83D\uDC26', 'Hamster': '\uD83D\uDC39' };
        return map[species] || '\uD83D\uDC3E';
    }

    function _renderAnimalCard(animal) {
        var card = Utils.createElement('article', {
            className: 'animal-card card card--clickable',
            role: 'button',
            tabindex: '0',
            'aria-label': animal.name + ', ' + animal.species,
            onClick: function () { Router.pushPage('animal-detail', { animalId: animal.id }); }
        });

        var photo = Utils.createElement('div', { className: 'animal-card__photo' }, [_getSpeciesEmoji(animal.species)]);
        card.appendChild(photo);

        var info = Utils.createElement('div', { className: 'animal-card__info' });
        info.appendChild(Utils.createElement('h3', { className: 'animal-card__name' }, [Utils.escapeHtml(animal.name)]));
        info.appendChild(Utils.createElement('p', { className: 'animal-card__breed' }, [
            Utils.escapeHtml(animal.species) + ' \u2014 ' + Utils.escapeHtml(animal.breed)
        ]));
        info.appendChild(Utils.createElement('p', { className: 'animal-card__age' }, [Utils.calculateAge(animal.birth_date)]));
        card.appendChild(info);

        card.appendChild(Utils.createElement('span', { className: 'animal-card__chevron', 'aria-hidden': 'true' }, ['\u203A']));

        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                Router.pushPage('animal-detail', { animalId: animal.id });
            }
        });

        return card;
    }

    function _createSkeletonCard() {
        var textBlock = Utils.createElement('div', { style: 'flex:1' }, [
            Utils.createElement('div', { className: 'skeleton skeleton-text', style: 'width:50%' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:70%' }),
            Utils.createElement('div', { className: 'skeleton skeleton-text skeleton-text--sm', style: 'width:30%' })
        ]);
        return Utils.createElement('div', {
            className: 'card',
            style: 'display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-3)'
        }, [
            Utils.createElement('div', { className: 'skeleton skeleton-circle', style: 'width:60px;height:60px;flex-shrink:0' }),
            textBlock
        ]);
    }

    function _showSkeleton() {
        Utils.clearElement(_container);
        _container.appendChild(_createSkeletonCard());
        _container.appendChild(_createSkeletonCard());
        _container.appendChild(_createSkeletonCard());
    }

    function _load(silent) {
        if (!silent) _showSkeleton();
        return API.animals.list()
            .then(function (data) {
                if (!data) data = [];
                Utils.clearElement(_container);
                if (!Array.isArray(data) || data.length === 0) {
                    _container.appendChild(Utils.createEmptyState('\uD83D\uDC3E', 'Aucun animal enregistre', 'Contactez votre clinique pour ajouter vos animaux'));
                    return;
                }
                var list = Utils.createElement('div', { className: 'animal-card-list' });
                data.forEach(function (animal) {
                    list.appendChild(_renderAnimalCard(animal));
                });
                _container.appendChild(list);
            })
            .catch(function () {
                Utils.clearElement(_container);
                _container.appendChild(Utils.createErrorState('Impossible de charger vos animaux', _load));
            });
    }

    function init() {
        _container = Utils.$('#page-animals .page-content');
        Router.onPageInit('animals', function () { _load(); });
        Router.onPageRefresh('animals', function () { return _load(true); });
    }

    return { init: init };
})();
