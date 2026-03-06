var MockServer = (function () {
    'use strict';

    var _originalFetch = window.fetch;
    var _mockData = {};
    var _accounts = {};
    var _currentPhone = null;
    var _mockToken = null;
    var _sessionTimer = null;
    var _routes = [];

    var _clinicInfo = {
        name: 'Clinique Vétérinaire des Lilas',
        phone: '01 43 00 00 00',
        address: '12 rue des Vétérinaires, 75015 Paris',
        opening_hours: 'Lun-Ven 8h-19h, Sam 9h-13h',
        logo_url: 'assets/logo/demo-clinic-logo.svg',
        icon_url: 'assets/logo/demo-clinic-icon.svg'
    };

    function _addRoute(method, pattern, handler) {
        var regexStr = '^' + pattern.replace(/:([a-zA-Z]+)/g, '([^/]+)') + '$';
        _routes.push({ method: method, regex: new RegExp(regexStr), handler: handler });
    }

    function _findRoute(method, pathname) {
        for (var i = 0; i < _routes.length; i++) {
            if (_routes[i].method === method) {
                var match = pathname.match(_routes[i].regex);
                if (match) return { handler: _routes[i].handler, params: match.slice(1) };
            }
        }
        return null;
    }

    function _respond(data, status, delay) {
        status = status || 200;
        delay = delay || 200 + Math.random() * 300;
        var body = status >= 400
            ? { success: false, message: (data && data.message) || 'Erreur', data: null }
            : { success: true, message: '', data: data };
        return new Promise(function (resolve) {
            setTimeout(function () {
                resolve(new Response(JSON.stringify(body), {
                    status: status,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }, delay);
        });
    }

    function _isAuthenticated() {
        return !!_mockToken;
    }

    function _respondAuth(data) {
        _mockToken = 'mock_token_' + Date.now();
        data.token = _mockToken;
        return _respond(data);
    }

    function _cleanPhone(phone) {
        return phone.replace(/[\s.\-+]/g, '').replace(/^0033/, '0');
    }

    function _interceptFetch(input, init) {
        var url, method;
        if (typeof input === 'string') {
            url = new URL(input, window.location.origin);
            method = (init && init.method) || 'GET';
        } else if (input instanceof Request) {
            url = new URL(input.url);
            method = input.method || 'GET';
        } else {
            return _originalFetch(input, init);
        }

        var apiBase = new URL(InfravetConfig.API_BASE_URL, window.location.origin);

        if (url.origin !== apiBase.origin || !url.pathname.startsWith(apiBase.pathname)) {
            return _originalFetch(input, init);
        }

        var apiPath = url.pathname.replace(apiBase.pathname, '');
        if (apiPath === '') apiPath = '/';
        var route = _findRoute(method.toUpperCase(), apiPath);

        if (route) {
            var body = null;
            if (init && init.body) {
                try { body = JSON.parse(init.body); } catch (e) { body = null; }
            }
            var logBody = apiPath.startsWith('/auth-') ? '[filtered]' : (body || '');
            console.log('%c[Mock]', 'color: #5BC0BE; font-weight: bold', method, apiPath, logBody);
            return route.handler(route.params, body, url.searchParams);
        }

        console.warn('[Mock] No route:', method, apiPath);
        return _originalFetch(input, init);
    }

    function _setupRoutes() {
        _addRoute('GET', '/clinic/info', function () {
            return _respond({
                name: _clinicInfo.name,
                phone: _clinicInfo.phone,
                address: _clinicInfo.address,
                opening_hours: _clinicInfo.opening_hours,
                logo_url: _clinicInfo.logo_url || null,
                icon_url: _clinicInfo.icon_url || null
            });
        });

        _addRoute('POST', '/auth-request-code', function (params, body) {
            var phone = (body && body.phone) || '';
            var cleaned = _cleanPhone(phone);
            if (_accounts[cleaned]) {
                _currentPhone = cleaned;
                return _respond({ message: 'OTP envoyé', expires_in: 300 });
            }
            return _respond({ message: 'Aucun compte client trouvé pour ce numéro' }, 404);
        });

        _addRoute('POST', '/auth-verify-code', function (params, body) {
            if (body && body.code === '123456' && _currentPhone && _accounts[_currentPhone]) {
                _mockData = _accounts[_currentPhone];
                if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
                if (_mockData._sessionExpiry) {
                    var delay = _mockData._sessionExpiry * 1000;
                    console.log('%c[Mock] Session expirera dans ' + _mockData._sessionExpiry + 's', 'color: #E74C3C; font-weight: bold');
                    _sessionTimer = setTimeout(function () {
                        _mockToken = null;
                        console.log('%c[Mock] Session expirée !', 'color: #E74C3C; font-weight: bold');
                        window.dispatchEvent(new CustomEvent('session-expired'));
                    }, delay);
                }
                var clientData = JSON.parse(JSON.stringify(_mockData.client));
                return _respondAuth({ client: clientData });
            }
            return _respond({ message: 'Code invalide' }, 400);
        });

        _addRoute('GET', '/profile', function () {
            if (_isAuthenticated()) {
                return _respond(JSON.parse(JSON.stringify(_mockData.client)));
            }
            return _respond({ message: 'Non authentifié' }, 401);
        });

        _addRoute('POST', '/auth-logout', function () {
            _mockToken = null;
            _currentPhone = null;
            if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
            return _respond({ message: 'Déconnexion réussie' });
        });

        _addRoute('GET', '/dashboard/summary', function () {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var upcoming = _mockData.appointments
                .filter(function (a) { return new Date(a.date_time) >= new Date(); })
                .sort(function (a, b) { return new Date(a.date_time) - new Date(b.date_time); });
            var activeHosp = (_mockData.hospitalizations || []).filter(function (h) { return h.status !== 'sorti'; });
            return _respond({
                client_name: _mockData.client.first_name,
                clinic_name: _clinicInfo.name,
                next_appointment: upcoming[0] || null,
                animals: _mockData.animals,
                notifications: _mockData.notifications.slice(0, 5),
                upcoming_appointments: upcoming.slice(0, 3),
                active_hospitalizations: activeHosp
            });
        });

        _addRoute('GET', '/animals', function () {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            return _respond(_mockData.animals);
        });

        _addRoute('GET', '/animals/:id', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var animal = _mockData.animals.find(function (a) { return a.id === params[0]; });
            if (animal) return _respond(animal);
            return _respond({ message: 'Animal non trouvé' }, 404);
        });

        _addRoute('GET', '/animals/:id/consultations', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var list = _mockData.consultations
                .filter(function (c) { return c.animal_id === params[0]; })
                .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
            return _respond(list);
        });

        _addRoute('GET', '/animals/:id/vaccinations', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var list = _mockData.vaccinations.filter(function (v) { return v.animal_id === params[0]; });
            return _respond(list);
        });

        _addRoute('GET', '/animals/:id/treatments', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var list = _mockData.treatments
                .filter(function (t) { return t.animal_id === params[0]; })
                .sort(function (a, b) { return new Date(b.prescribed_date) - new Date(a.prescribed_date); });
            return _respond(list);
        });

        _addRoute('GET', '/animals/:id/weights', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var animal = _mockData.animals.find(function (a) { return a.id === params[0]; });
            if (!animal) return _respond({ message: 'Animal non trouvé' }, 404);
            var consultWeights = (_mockData.consultations || [])
                .filter(function (c) { return c.animal_id === params[0] && c.weight; })
                .map(function (c) { return { date: c.date, weight: c.weight, source: 'consultation' }; })
                .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
            return _respond(consultWeights);
        });

        _addRoute('GET', '/appointments', function (params, body, searchParams) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var status = searchParams.get('status') || 'upcoming';
            var now = new Date();
            var filtered = _mockData.appointments.filter(function (a) {
                return status === 'upcoming'
                    ? new Date(a.date_time) >= now
                    : new Date(a.date_time) < now;
            }).sort(function (a, b) {
                return status === 'upcoming'
                    ? new Date(a.date_time) - new Date(b.date_time)
                    : new Date(b.date_time) - new Date(a.date_time);
            });
            return _respond(filtered);
        });

        _addRoute('GET', '/appointments/:id', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var appt = _mockData.appointments.find(function (a) { return a.id === params[0]; });
            if (appt) return _respond(appt);
            return _respond({ message: 'RDV non trouvé' }, 404);
        });

        _addRoute('POST', '/appointments/:id/cancel', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var appt = _mockData.appointments.find(function (a) { return a.id === params[0]; });
            if (appt) {
                appt.status = 'cancelled';
                return _respond({ message: 'RDV annulé' });
            }
            return _respond({ message: 'RDV non trouvé' }, 404);
        });

        _addRoute('GET', '/documents', function (params, body, searchParams) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var type = searchParams.get('type');
            var list = _mockData.documents.slice();
            if (type) {
                list = list.filter(function (d) { return d.type === type; });
            }
            list = list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
            return _respond(list);
        });

        _addRoute('GET', '/documents/:id/download', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            return _respond({ download_url: '#mock-download-' + params[0] });
        });

        _addRoute('POST', '/push/subscribe', function () {
            return _respond({ message: 'Subscription enregistrée' });
        });

        _addRoute('POST', '/push/unsubscribe', function () {
            return _respond({ message: 'Subscription supprimée' });
        });

        _addRoute('GET', '/notifications/settings', function () {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            return _respond(_mockData.notification_settings || { push: false, email: true, sms: true });
        });

        _addRoute('PUT', '/notifications/settings', function (params, body) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            _mockData.notification_settings = Object.assign(_mockData.notification_settings || {}, body);
            return _respond(_mockData.notification_settings);
        });

        _addRoute('GET', '/hospitalizations', function (params, body, searchParams) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var status = searchParams.get('status') || 'active';
            var list = (_mockData.hospitalizations || []).filter(function (h) {
                return status === 'active' ? h.status !== 'sorti' : h.status === 'sorti';
            });
            return _respond(list);
        });

        _addRoute('GET', '/hospitalizations/:id', function (params) {
            if (!_isAuthenticated()) return _respond({ message: 'Non authentifié' }, 401);
            var hosp = (_mockData.hospitalizations || []).find(function (h) { return h.id === params[0]; });
            if (hosp) return _respond(hosp);
            return _respond({ message: 'Hospitalisation non trouvée' }, 404);
        });
    }

    function _loadAccounts() {
        _accounts = {
            '0600000000': {
                client: {
                    id: 'client-001',
                    first_name: 'Marie',
                    last_name: 'Laurent',
                    phone: '+33600000000',
                    email: 'marie.laurent@email.com',
                    address: '25 rue de la Paix', postal_code: '75002', city: 'Paris', country: 'France'
                },
                animals: [
                    { id: 'animal-001', name: 'Luna', species: 'Chat', breed: 'Européen', sex: 'F', birth_date: '2020-04-15', current_weight_kg: 4.2, identification_number: '250269812345678', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-002', name: 'Rex', species: 'Chien', breed: 'Berger Allemand', sex: 'M', birth_date: '2019-08-20', current_weight_kg: 34.5, identification_number: '250269887654321', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-003', name: 'Noisette', species: 'Lapin', breed: 'Bélier nain', sex: 'F', birth_date: '2023-01-10', current_weight_kg: 1.8, identification_number: null, neutered_status: 'Non stérilisé(e)' }
                ],
                consultations: [
                    { id: 'consult-001', animal_id: 'animal-001', date: '2025-12-05', type: 'Urgence', veterinarian: 'Dr. Martin', reason: 'Vomissements répétés depuis 24h', diagnosis: 'Gastrite aiguë - probable ingestion corps étranger', notes: 'Radiographie abdominale réalisée. Pas de corps étranger visible. Traitement symptomatique prescrit.', weight: 4.0, temperature: 39.2 },
                    { id: 'consult-002', animal_id: 'animal-001', date: '2024-03-15', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel vaccins annuels', diagnosis: 'Bonne santé générale', notes: 'Vaccins Typhus et Coryza administrés. Prochain rappel dans 1 an.', weight: 4.2, temperature: 38.5 },
                    { id: 'consult-010', animal_id: 'animal-001', date: '2020-06-20', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Première visite chaton', diagnosis: 'Chaton en bonne santé', notes: 'Primo-vaccination Typhus/Coryza. Vermifugation. Croissance normale.', weight: 1.0, temperature: 38.8 },
                    { id: 'consult-011', animal_id: 'animal-001', date: '2020-07-18', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel primo-vaccination', diagnosis: 'Bonne croissance', notes: 'Rappel TC administré. Chaton vif et en pleine forme.', weight: 1.4, temperature: 38.6 },
                    { id: 'consult-012', animal_id: 'animal-001', date: '2020-10-05', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Contrôle croissance + vaccination leucose', diagnosis: 'Croissance harmonieuse', notes: 'Primo-vaccination FeLV. Poids conforme pour l\'âge.', weight: 2.4, temperature: 38.7 },
                    { id: 'consult-013', animal_id: 'animal-001', date: '2021-01-15', type: 'Chirurgie', veterinarian: 'Dr. Martin', reason: 'Stérilisation (ovariectomie)', diagnosis: 'Intervention sans complication', notes: 'Stérilisation réalisée. Bonne récupération. Retrait fils dans 10 jours.', weight: 3.1, temperature: 38.5 },
                    { id: 'consult-014', animal_id: 'animal-001', date: '2021-06-20', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne santé', notes: 'Vaccins TC + FeLV. Chat adulte en pleine forme.', weight: 3.8, temperature: 38.4 },
                    { id: 'consult-015', animal_id: 'animal-001', date: '2022-03-22', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel vaccins annuels', diagnosis: 'RAS', notes: 'TC administré. Poids stable, bonne condition corporelle.', weight: 4.1, temperature: 38.5 },
                    { id: 'consult-016', animal_id: 'animal-001', date: '2022-11-10', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Examen dentaire + détartrage', diagnosis: 'Léger tartre — détartrage réalisé', notes: 'Détartrage sous anesthésie flash. Dents saines. Pas d\'extraction nécessaire.', weight: 4.3, temperature: 38.6 },
                    { id: 'consult-017', animal_id: 'animal-001', date: '2023-03-20', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel TC + FeLV', diagnosis: 'Bonne santé', notes: 'Vaccins administrés. Chat en excellente forme.', weight: 4.2, temperature: 38.5 },
                    { id: 'consult-018', animal_id: 'animal-001', date: '2023-09-15', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Léger embonpoint signalé par propriétaire', diagnosis: 'Surpoids modéré (NEC 6/9)', notes: 'Régime alimentaire ajusté. Passage à croquettes light recommandé. Contrôle dans 3 mois.', weight: 4.5, temperature: 38.4 },
                    { id: 'consult-019', animal_id: 'animal-001', date: '2024-01-10', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Contrôle poids suite régime', diagnosis: 'Perte de poids satisfaisante (NEC 5/9)', notes: 'Poids réduit de 300g. Bonne évolution. Maintenir alimentation light.', weight: 4.2, temperature: 38.5 },
                    { id: 'consult-020', animal_id: 'animal-001', date: '2025-06-18', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne santé générale', notes: 'TC + FeLV administrés. Bon état général. Poids stable.', weight: 4.1, temperature: 38.6 },
                    { id: 'consult-003', animal_id: 'animal-002', date: '2024-06-01', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel vaccin rage + contrôle', diagnosis: 'RAS - bonne santé', notes: 'Vaccin rage administré. Léger tartre dentaire observé, surveillance recommandée.', weight: 34.5, temperature: 38.8 },
                    { id: 'consult-004', animal_id: 'animal-002', date: '2025-09-10', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Boiterie patte arrière gauche', diagnosis: 'Entorse légère ligamentaire', notes: 'Anti-inflammatoires prescrits. Repos 10 jours. Contrôle si persistance.', weight: 35.0, temperature: 38.6 },
                    { id: 'consult-005', animal_id: 'animal-003', date: '2025-06-20', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Contrôle annuel', diagnosis: 'Bonne santé. Dents à surveiller.', notes: 'Pesée, auscultation. Pas de problème dentaire majeur pour l\'instant.', weight: 1.8, temperature: 38.9 }
                ],
                vaccinations: [
                    { id: 'vacc-001', animal_id: 'animal-001', name: 'Typhus (Panleucopénie)', date: '2024-03-15', next_due_date: '2025-03-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-A12345', status: 'overdue' },
                    { id: 'vacc-002', animal_id: 'animal-001', name: 'Coryza', date: '2024-03-15', next_due_date: '2025-03-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-B67890', status: 'overdue' },
                    { id: 'vacc-003', animal_id: 'animal-001', name: 'Leucose féline (FeLV)', date: '2023-03-20', next_due_date: '2025-03-20', veterinarian: 'Dr. Martin', batch_number: 'LOT-C11111', status: 'overdue' },
                    { id: 'vacc-004', animal_id: 'animal-002', name: 'Rage', date: '2024-06-01', next_due_date: '2025-06-01', veterinarian: 'Dr. Dupont', batch_number: 'LOT-R11111', status: 'overdue' },
                    { id: 'vacc-005', animal_id: 'animal-002', name: 'CHPPiL (Polyvalent)', date: '2024-06-01', next_due_date: '2026-06-01', veterinarian: 'Dr. Dupont', batch_number: 'LOT-C22222', status: 'valid' },
                    { id: 'vacc-006', animal_id: 'animal-002', name: 'Leptospirose', date: '2024-06-01', next_due_date: '2025-06-01', veterinarian: 'Dr. Dupont', batch_number: 'LOT-L33333', status: 'overdue' },
                    { id: 'vacc-007', animal_id: 'animal-003', name: 'VHD (Maladie hémorragique)', date: '2025-01-15', next_due_date: '2026-01-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-V44444', status: 'valid' },
                    { id: 'vacc-008', animal_id: 'animal-003', name: 'Myxomatose', date: '2025-01-15', next_due_date: '2025-07-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-M55555', status: 'valid' }
                ],
                treatments: [
                    { id: 'treat-001', animal_id: 'animal-001', name: 'Cerenia 16mg', type: 'Antiémétique', prescribed_date: '2025-12-05', duration: '3 jours', dosage: '1 comprimé/jour', instructions: 'À donner le matin à jeun', veterinarian: 'Dr. Martin', status: 'completed' },
                    { id: 'treat-002', animal_id: 'animal-001', name: 'Smecta vétérinaire', type: 'Pansement gastrique', prescribed_date: '2025-12-05', duration: '5 jours', dosage: '1/2 sachet 2x/jour', instructions: 'Mélanger dans un peu d\'eau, administrer à la seringue', veterinarian: 'Dr. Martin', status: 'completed' },
                    { id: 'treat-003', animal_id: 'animal-002', name: 'Metacam 2.5mg/ml', type: 'Anti-inflammatoire', prescribed_date: '2025-09-10', duration: '10 jours', dosage: '0.1 mg/kg/jour - 1.4ml/jour', instructions: 'À donner avec la nourriture. Surveiller appétit et selles.', veterinarian: 'Dr. Dupont', status: 'completed' },
                    { id: 'treat-004', animal_id: 'animal-002', name: 'Milbemax chien', type: 'Vermifuge', prescribed_date: '2025-10-01', duration: '1 jour', dosage: '2 comprimés en une prise', instructions: 'À renouveler dans 3 mois', veterinarian: 'Dr. Dupont', status: 'completed' }
                ],
                appointments: [
                    { id: 'appt-001', animal_id: 'animal-002', animal_name: 'Rex', date_time: '2026-03-10T14:30:00', duration: 30, type: 'Consultation', reason: 'Rappel vaccin CHPPiL', veterinarian: 'Dr. Dupont', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-002', animal_id: 'animal-001', animal_name: 'Luna', date_time: '2026-03-18T10:00:00', duration: 20, type: 'Contrôle', reason: 'Contrôle annuel + rappel vaccins', veterinarian: 'Dr. Martin', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-003', animal_id: 'animal-003', animal_name: 'Noisette', date_time: '2026-04-05T11:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel myxomatose', veterinarian: 'Dr. Martin', status: 'pending', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-004', animal_id: 'animal-001', animal_name: 'Luna', date_time: '2025-12-05T09:00:00', duration: 30, type: 'Urgence', reason: 'Vomissements répétés', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-005', animal_id: 'animal-002', animal_name: 'Rex', date_time: '2025-09-10T16:00:00', duration: 30, type: 'Consultation', reason: 'Boiterie patte arrière', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-001', animal_id: 'animal-001', animal_name: 'Luna', title: 'Résultats analyse sanguine', type: 'lab', date: '2025-12-05', file_type: 'pdf', file_size: 245000 },
                    { id: 'doc-002', animal_id: 'animal-001', animal_name: 'Luna', title: 'Ordonnance - Traitement gastrite', type: 'prescription', date: '2025-12-05', file_type: 'pdf', file_size: 120000 },
                    { id: 'doc-003', animal_id: 'animal-002', animal_name: 'Rex', title: 'Certificat de vaccination - Rage', type: 'certificate', date: '2024-06-01', file_type: 'pdf', file_size: 98000 },
                    { id: 'doc-004', animal_id: 'animal-001', animal_name: 'Luna', title: 'Radiographie abdominale', type: 'lab', date: '2025-12-05', file_type: 'pdf', file_size: 1520000 },
                    { id: 'doc-005', animal_id: 'animal-002', animal_name: 'Rex', title: 'Ordonnance - Anti-inflammatoire', type: 'prescription', date: '2025-09-10', file_type: 'pdf', file_size: 95000 },
                    { id: 'doc-006', animal_id: 'animal-002', animal_name: 'Rex', title: 'Compte-rendu consultation boiterie', type: 'report', date: '2025-09-10', file_type: 'pdf', file_size: 180000 }
                ],
                notifications: [
                    { id: 'notif-001', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Rex demain à 14h30 - Rappel vaccin CHPPiL', date: '2026-03-09T10:00:00', read: false, animal_id: 'animal-002', appointment_id: 'appt-001' },
                    { id: 'notif-002', type: 'document_available', title: 'Nouveau document', message: 'Les résultats d\'analyse sanguine de Luna sont disponibles', date: '2025-12-06T08:30:00', read: true, animal_id: 'animal-001', document_id: 'doc-001' },
                    { id: 'notif-003', type: 'vaccine_reminder', title: 'Rappel vaccination', message: 'Les vaccins de Luna (Typhus, Coryza) sont expirés. Prenez rendez-vous.', date: '2025-03-20T09:00:00', read: true, animal_id: 'animal-001' }
                ],
                hospitalizations: [
                    {
                        id: 'hosp-001', animal_id: 'animal-001', animal_name: 'Luna', animal_species: 'Chat',
                        type: 'chirurgie', status: 'reveil', reason: 'Stérilisation',
                        veterinarian: 'Dr. Martin', admission_date: '2026-03-02T08:00:00', discharge_date: null,
                        last_update: '2026-03-02T11:00:00', notes: 'Intervention sans complication',
                        steps: ['admis', 'en_preparation', 'en_intervention', 'reveil', 'observation', 'sorti'],
                        current_step: 3,
                        timeline: [
                            { date: '2026-03-02T08:00:00', status: 'admis', description: 'Luna a été admise pour stérilisation', photo: null },
                            { date: '2026-03-02T09:30:00', status: 'en_preparation', description: 'Préparation pré-opératoire en cours. Bilan sanguin conforme.', photo: null },
                            { date: '2026-03-02T10:15:00', status: 'en_intervention', description: 'Intervention en cours — stérilisation par ovariectomie', photo: null },
                            { date: '2026-03-02T11:00:00', status: 'reveil', description: 'Luna se réveille doucement. Tout s\'est bien passé !', photo: { url: 'https://picsum.photos/seed/luna-reveil/400/300', caption: 'Luna au réveil' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/luna-reveil/400/300', caption: 'Luna au réveil', timestamp: '2026-03-02T11:00:00' },
                            { url: 'https://picsum.photos/seed/luna-repos/400/300', caption: 'Luna se repose tranquillement', timestamp: '2026-03-02T14:30:00' },
                            { url: 'https://picsum.photos/seed/luna-calin/400/300', caption: 'Luna réclame des câlins', timestamp: '2026-03-02T16:00:00' }
                        ]
                    },
                    {
                        id: 'hosp-002', animal_id: 'animal-002', animal_name: 'Rex', animal_species: 'Chien',
                        type: 'medical', status: 'sorti', reason: 'Gastro-entérite sévère',
                        veterinarian: 'Dr. Dupont', admission_date: '2026-02-15T09:00:00', discharge_date: '2026-02-17T16:00:00',
                        last_update: '2026-02-17T16:00:00', notes: 'Bonne récupération après réhydratation IV',
                        steps: ['admis', 'en_soins', 'observation', 'sorti'],
                        current_step: 3,
                        timeline: [
                            { date: '2026-02-15T09:00:00', status: 'admis', description: 'Rex admis pour déshydratation suite à vomissements et diarrhées depuis 48h', photo: null },
                            { date: '2026-02-15T11:00:00', status: 'en_soins', description: 'Perfusion IV en cours. Antiémétiques administrés.', photo: { url: 'https://picsum.photos/seed/rex-perf/400/300', caption: 'Rex sous perfusion' } },
                            { date: '2026-02-16T09:00:00', status: 'observation', description: 'Nette amélioration. Rex a mangé un peu ce matin.', photo: { url: 'https://picsum.photos/seed/rex-mieux/400/300', caption: 'Rex va mieux' } },
                            { date: '2026-02-17T16:00:00', status: 'sorti', description: 'Rex est sorti. Alimentation digestive prescrite pour 5 jours.', photo: null }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/rex-perf/400/300', caption: 'Rex sous perfusion', timestamp: '2026-02-15T11:00:00' },
                            { url: 'https://picsum.photos/seed/rex-mieux/400/300', caption: 'Rex va mieux', timestamp: '2026-02-16T09:00:00' }
                        ]
                    }
                ]
            },

            '0600000001': {
                client: {
                    id: 'client-002',
                    first_name: 'Pierre',
                    last_name: 'Dumont',
                    phone: '+33600000001',
                    email: 'pierre.dumont@email.com',
                    address: '8 avenue Victor Hugo', postal_code: '75016', city: 'Paris', country: 'France'
                },
                animals: [],
                consultations: [],
                vaccinations: [],
                treatments: [],
                appointments: [],
                documents: [],
                notifications: [],
                hospitalizations: []
            },

            '0600000002': {
                client: {
                    id: 'client-003',
                    first_name: 'Sophie',
                    last_name: 'Bernard',
                    phone: '+33600000002',
                    email: 'sophie.bernard@email.com',
                    address: '42 boulevard Haussmann', postal_code: '75009', city: 'Paris', country: 'France'
                },
                animals: [
                    { id: 'animal-101', name: 'Milo', species: 'Chat', breed: 'Siamois', sex: 'M', birth_date: '2022-07-20', current_weight_kg: 3.8, identification_number: '250269800000001', neutered_status: 'Stérilisé(e)' }
                ],
                consultations: [],
                vaccinations: [],
                treatments: [],
                appointments: [],
                documents: [],
                notifications: [],
                hospitalizations: [
                    {
                        id: 'hosp-100', animal_id: 'animal-101', animal_name: 'Milo', animal_species: 'Chat',
                        type: 'medical', status: 'en_soins', reason: 'Obstruction urinaire',
                        veterinarian: 'Dr. Martin', admission_date: '2026-03-02T14:00:00', discharge_date: null,
                        last_update: '2026-03-02T18:00:00', notes: 'Sondage urinaire réalisé. Surveillance débit urinaire.',
                        steps: ['admis', 'en_soins', 'observation', 'sorti'],
                        current_step: 1,
                        timeline: [
                            { date: '2026-03-02T14:00:00', status: 'admis', description: 'Milo admis en urgence pour difficultés à uriner', photo: null },
                            { date: '2026-03-02T15:30:00', status: 'en_soins', description: 'Sondage urinaire effectué. Perfusion en cours.', photo: { url: 'https://picsum.photos/seed/milo-soins/400/300', caption: 'Milo au repos après les soins' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/milo-soins/400/300', caption: 'Milo au repos après les soins', timestamp: '2026-03-02T15:30:00' }
                        ]
                    }
                ]
            },

            '0600000003': {
                client: {
                    id: 'client-004',
                    first_name: 'Jean-Marc',
                    last_name: 'Lefèvre',
                    phone: '+33600000003',
                    email: 'jm.lefevre@email.com',
                    address: '15 rue du Faubourg Saint-Antoine', postal_code: '75011', city: 'Paris', country: 'France'
                },
                animals: [
                    { id: 'animal-200', name: 'Oscar', species: 'Chat', breed: 'Maine Coon', sex: 'M', birth_date: '2018-02-10', current_weight_kg: 7.8, identification_number: '250269800000010', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-201', name: 'Bella', species: 'Chien', breed: 'Golden Retriever', sex: 'F', birth_date: '2019-05-22', current_weight_kg: 28.5, identification_number: '250269800000011', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-202', name: 'Pixel', species: 'Chat', breed: 'Persan', sex: 'M', birth_date: '2021-11-03', current_weight_kg: 4.5, identification_number: '250269800000012', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-203', name: 'Maya', species: 'Chien', breed: 'Cavalier King Charles', sex: 'F', birth_date: '2020-08-15', current_weight_kg: 6.2, identification_number: '250269800000013', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-204', name: 'Caramel', species: 'Hamster', breed: 'Syrien', sex: 'M', birth_date: '2025-03-01', current_weight_kg: 0.14, identification_number: null, neutered_status: 'Non stérilisé(e)' },
                    { id: 'animal-205', name: 'Kiwi', species: 'Oiseau', breed: 'Perruche ondulée', sex: 'F', birth_date: '2023-06-10', current_weight_kg: 0.035, identification_number: null, neutered_status: 'Non stérilisé(e)' },
                    { id: 'animal-206', name: 'Filou', species: 'Chat', breed: 'Chartreux', sex: 'M', birth_date: '2017-01-20', current_weight_kg: 6.0, identification_number: '250269800000014', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-207', name: 'Tornade', species: 'Chien', breed: 'Jack Russell', sex: 'F', birth_date: '2022-04-08', current_weight_kg: 5.8, identification_number: '250269800000015', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-208', name: 'Neige', species: 'Lapin', breed: 'Angora nain', sex: 'F', birth_date: '2024-02-14', current_weight_kg: 1.5, identification_number: null, neutered_status: 'Non stérilisé(e)' },
                    { id: 'animal-209', name: 'Simba', species: 'Chat', breed: 'Bengal', sex: 'M', birth_date: '2023-09-05', current_weight_kg: 5.2, identification_number: '250269800000016', neutered_status: 'Non stérilisé(e)' },
                    { id: 'animal-210', name: 'Lola', species: 'Chien', breed: 'Bouledogue français', sex: 'F', birth_date: '2021-12-25', current_weight_kg: 11.0, identification_number: '250269800000017', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-211', name: 'Plume', species: 'Oiseau', breed: 'Canari', sex: 'M', birth_date: '2024-07-01', current_weight_kg: 0.025, identification_number: null, neutered_status: 'Non stérilisé(e)' }
                ],
                consultations: [
                    { id: 'consult-200', animal_id: 'animal-200', date: '2025-11-15', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Perte de poids progressive', diagnosis: 'Hyperthyroïdie débutante', notes: 'Bilan sanguin T4 élevée. Mise sous traitement Felimazole.', weight: 7.2, temperature: 38.8 },
                    { id: 'consult-201', animal_id: 'animal-200', date: '2025-06-10', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'RAS', notes: 'Vaccin TC administré.', weight: 7.8, temperature: 38.5 },
                    { id: 'consult-202', animal_id: 'animal-201', date: '2025-10-20', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Otite récidivante', diagnosis: 'Otite externe cérumineuse', notes: 'Nettoyage auriculaire + traitement topique Aurizon.', weight: 29.0, temperature: 38.7 },
                    { id: 'consult-203', animal_id: 'animal-201', date: '2025-04-15', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel vaccins', diagnosis: 'Bonne santé', notes: 'CHPPiL + Rage administrés.', weight: 28.5, temperature: 38.6 },
                    { id: 'consult-204', animal_id: 'animal-202', date: '2025-09-01', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Yeux qui coulent', diagnosis: 'Conjonctivite bilatérale', notes: 'Collyre antibiotique prescrit. Revoir si persistance.', weight: 4.5, temperature: 38.4 },
                    { id: 'consult-205', animal_id: 'animal-203', date: '2025-08-05', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Souffle cardiaque détecté', diagnosis: 'MVD stade B1', notes: 'Échographie cardiaque réalisée. Pas de traitement pour l\'instant, surveillance semestrielle.', weight: 6.3, temperature: 38.5 },
                    { id: 'consult-206', animal_id: 'animal-203', date: '2025-02-20', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel annuel', diagnosis: 'RAS', notes: 'CHPPiL administré.', weight: 6.1, temperature: 38.6 },
                    { id: 'consult-207', animal_id: 'animal-205', date: '2025-07-15', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Plumes abîmées', diagnosis: 'Picage lié au stress', notes: 'Conseils environnementaux donnés. Complément vitamines prescrit.', weight: 0.034, temperature: null },
                    { id: 'consult-208', animal_id: 'animal-206', date: '2025-12-01', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Problèmes rénaux', diagnosis: 'IRC stade 2 IRIS', notes: 'Bilan rénal: créatinine élevée. Alimentation rénale prescrite. Contrôle dans 3 mois.', weight: 5.8, temperature: 38.6 },
                    { id: 'consult-209', animal_id: 'animal-206', date: '2025-05-10', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne santé générale pour son âge', notes: 'TC administré. Léger souffle cardiaque noté.', weight: 6.0, temperature: 38.7 },
                    { id: 'consult-210', animal_id: 'animal-207', date: '2025-11-08', type: 'Urgence', veterinarian: 'Dr. Dupont', reason: 'Ingestion de chocolat', diagnosis: 'Intoxication chocolat modérée', notes: 'Vomissement provoqué + charbon activé. Surveillance 24h. Pas de complication.', weight: 5.9, temperature: 39.1 },
                    { id: 'consult-211', animal_id: 'animal-208', date: '2025-09-20', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Contrôle annuel', diagnosis: 'Bonne santé', notes: 'Dents à surveiller. Foin de qualité recommandé.', weight: 1.5, temperature: 38.8 },
                    { id: 'consult-212', animal_id: 'animal-209', date: '2025-10-05', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Discussion stérilisation', diagnosis: 'En bonne santé, apte à la stérilisation', notes: 'RDV stérilisation à planifier.', weight: 5.2, temperature: 38.5 },
                    { id: 'consult-213', animal_id: 'animal-210', date: '2025-11-25', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Problèmes respiratoires', diagnosis: 'Syndrome brachycéphale modéré', notes: 'Sténose des narines. Chirurgie envisageable si aggravation.', weight: 11.2, temperature: 38.9 },
                    { id: 'consult-214', animal_id: 'animal-210', date: '2025-03-10', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel annuel', diagnosis: 'RAS', notes: 'CHPPiL + Rage.', weight: 10.8, temperature: 38.7 }
                ],
                vaccinations: [
                    { id: 'vacc-200', animal_id: 'animal-200', name: 'Typhus + Coryza', date: '2025-06-10', next_due_date: '2026-06-10', veterinarian: 'Dr. Martin', batch_number: 'LOT-H001', status: 'valid' },
                    { id: 'vacc-201', animal_id: 'animal-200', name: 'Leucose féline', date: '2024-06-15', next_due_date: '2025-06-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-H002', status: 'overdue' },
                    { id: 'vacc-202', animal_id: 'animal-201', name: 'CHPPiL', date: '2025-04-15', next_due_date: '2026-04-15', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H003', status: 'valid' },
                    { id: 'vacc-203', animal_id: 'animal-201', name: 'Rage', date: '2025-04-15', next_due_date: '2026-04-15', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H004', status: 'valid' },
                    { id: 'vacc-204', animal_id: 'animal-201', name: 'Leptospirose', date: '2025-04-15', next_due_date: '2026-04-15', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H005', status: 'valid' },
                    { id: 'vacc-205', animal_id: 'animal-202', name: 'Typhus + Coryza', date: '2024-11-10', next_due_date: '2025-11-10', veterinarian: 'Dr. Martin', batch_number: 'LOT-H006', status: 'overdue' },
                    { id: 'vacc-206', animal_id: 'animal-203', name: 'CHPPiL', date: '2025-02-20', next_due_date: '2026-02-20', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H007', status: 'valid' },
                    { id: 'vacc-207', animal_id: 'animal-206', name: 'Typhus + Coryza', date: '2025-05-10', next_due_date: '2026-05-10', veterinarian: 'Dr. Martin', batch_number: 'LOT-H008', status: 'valid' },
                    { id: 'vacc-208', animal_id: 'animal-207', name: 'CHPPiL', date: '2024-04-20', next_due_date: '2025-04-20', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H009', status: 'overdue' },
                    { id: 'vacc-209', animal_id: 'animal-207', name: 'Rage', date: '2024-04-20', next_due_date: '2025-04-20', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H010', status: 'overdue' },
                    { id: 'vacc-210', animal_id: 'animal-208', name: 'VHD', date: '2024-08-15', next_due_date: '2025-08-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-H011', status: 'overdue' },
                    { id: 'vacc-211', animal_id: 'animal-208', name: 'Myxomatose', date: '2024-08-15', next_due_date: '2025-02-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-H012', status: 'overdue' },
                    { id: 'vacc-212', animal_id: 'animal-209', name: 'Typhus + Coryza', date: '2024-09-10', next_due_date: '2025-09-10', veterinarian: 'Dr. Martin', batch_number: 'LOT-H013', status: 'overdue' },
                    { id: 'vacc-213', animal_id: 'animal-210', name: 'CHPPiL + Rage', date: '2025-03-10', next_due_date: '2026-03-10', veterinarian: 'Dr. Dupont', batch_number: 'LOT-H014', status: 'valid' }
                ],
                treatments: [
                    { id: 'treat-200', animal_id: 'animal-200', name: 'Felimazole 2.5mg', type: 'Antithyroïdien', prescribed_date: '2025-11-15', duration: 'À vie', dosage: '1 comprimé 2x/jour', instructions: 'À donner avec la nourriture. Contrôle T4 dans 3 semaines.', veterinarian: 'Dr. Martin', status: 'active' },
                    { id: 'treat-201', animal_id: 'animal-201', name: 'Aurizon', type: 'Traitement auriculaire', prescribed_date: '2025-10-20', duration: '14 jours', dosage: '10 gouttes/oreille 1x/jour', instructions: 'Nettoyer avant application. Masser la base de l\'oreille.', veterinarian: 'Dr. Dupont', status: 'completed' },
                    { id: 'treat-202', animal_id: 'animal-202', name: 'Tobrex collyre', type: 'Antibiotique ophtalmique', prescribed_date: '2025-09-01', duration: '10 jours', dosage: '1 goutte/oeil 3x/jour', instructions: 'Nettoyer les yeux avant application.', veterinarian: 'Dr. Martin', status: 'completed' },
                    { id: 'treat-203', animal_id: 'animal-206', name: 'Renal Special', type: 'Alimentation thérapeutique', prescribed_date: '2025-12-01', duration: 'À vie', dosage: 'Alimentation exclusive', instructions: 'Ne plus donner d\'autre nourriture. Eau fraîche à volonté.', veterinarian: 'Dr. Martin', status: 'active' },
                    { id: 'treat-204', animal_id: 'animal-206', name: 'Semintra 4mg/ml', type: 'Protecteur rénal', prescribed_date: '2025-12-01', duration: 'À vie', dosage: '0.5ml 1x/jour', instructions: 'À donner le matin. Contrôle tension et créatinine dans 1 mois.', veterinarian: 'Dr. Martin', status: 'active' },
                    { id: 'treat-205', animal_id: 'animal-207', name: 'Charbon activé', type: 'Adsorbant', prescribed_date: '2025-11-08', duration: '2 jours', dosage: '1 comprimé 3x/jour', instructions: 'Surveillance des selles et de l\'appétit.', veterinarian: 'Dr. Dupont', status: 'completed' },
                    { id: 'treat-206', animal_id: 'animal-205', name: 'Vitamines aviaires', type: 'Complément', prescribed_date: '2025-07-15', duration: '30 jours', dosage: '2 gouttes/jour dans l\'eau', instructions: 'Changer l\'eau quotidiennement.', veterinarian: 'Dr. Martin', status: 'completed' }
                ],
                appointments: [
                    { id: 'appt-200', animal_id: 'animal-200', animal_name: 'Oscar', date_time: '2026-03-05T09:00:00', duration: 30, type: 'Contrôle', reason: 'Contrôle T4 + poids', veterinarian: 'Dr. Martin', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-201', animal_id: 'animal-201', animal_name: 'Bella', date_time: '2026-03-08T14:00:00', duration: 20, type: 'Contrôle', reason: 'Contrôle otite', veterinarian: 'Dr. Dupont', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-202', animal_id: 'animal-203', animal_name: 'Maya', date_time: '2026-03-12T10:30:00', duration: 45, type: 'Contrôle', reason: 'Echo cardiaque semestrielle', veterinarian: 'Dr. Dupont', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-203', animal_id: 'animal-206', animal_name: 'Filou', date_time: '2026-03-15T11:00:00', duration: 30, type: 'Contrôle', reason: 'Bilan rénal de contrôle', veterinarian: 'Dr. Martin', status: 'pending', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-204', animal_id: 'animal-209', animal_name: 'Simba', date_time: '2026-03-20T08:30:00', duration: 60, type: 'Chirurgie', reason: 'Stérilisation', veterinarian: 'Dr. Martin', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-205', animal_id: 'animal-207', animal_name: 'Tornade', date_time: '2026-03-25T15:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel CHPPiL + Rage', veterinarian: 'Dr. Dupont', status: 'pending', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-206', animal_id: 'animal-208', animal_name: 'Neige', date_time: '2026-04-02T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel VHD + Myxomatose', veterinarian: 'Dr. Martin', status: 'pending', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-207', animal_id: 'animal-210', animal_name: 'Lola', date_time: '2026-04-10T14:30:00', duration: 30, type: 'Contrôle', reason: 'Suivi respiratoire', veterinarian: 'Dr. Dupont', status: 'pending', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-208', animal_id: 'animal-200', animal_name: 'Oscar', date_time: '2025-11-15T09:00:00', duration: 30, type: 'Consultation', reason: 'Perte de poids', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-209', animal_id: 'animal-201', animal_name: 'Bella', date_time: '2025-10-20T14:00:00', duration: 20, type: 'Consultation', reason: 'Otite', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-210', animal_id: 'animal-202', animal_name: 'Pixel', date_time: '2025-09-01T11:00:00', duration: 20, type: 'Consultation', reason: 'Yeux qui coulent', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-211', animal_id: 'animal-203', animal_name: 'Maya', date_time: '2025-08-05T10:00:00', duration: 45, type: 'Consultation', reason: 'Souffle cardiaque', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-212', animal_id: 'animal-206', animal_name: 'Filou', date_time: '2025-12-01T11:00:00', duration: 30, type: 'Consultation', reason: 'Problèmes rénaux', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-213', animal_id: 'animal-207', animal_name: 'Tornade', date_time: '2025-11-08T08:00:00', duration: 60, type: 'Urgence', reason: 'Ingestion de chocolat', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-214', animal_id: 'animal-210', animal_name: 'Lola', date_time: '2025-11-25T14:30:00', duration: 30, type: 'Consultation', reason: 'Problèmes respiratoires', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-215', animal_id: 'animal-201', animal_name: 'Bella', date_time: '2025-04-15T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel vaccins', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-216', animal_id: 'animal-200', animal_name: 'Oscar', date_time: '2025-06-10T09:30:00', duration: 20, type: 'Vaccination', reason: 'Rappel TC', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-217', animal_id: 'animal-209', animal_name: 'Simba', date_time: '2025-10-05T16:00:00', duration: 20, type: 'Consultation', reason: 'Discussion stérilisation', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-200', animal_id: 'animal-200', animal_name: 'Oscar', title: 'Bilan sanguin complet - T4', type: 'lab', date: '2025-11-15', file_type: 'pdf', file_size: 310000 },
                    { id: 'doc-201', animal_id: 'animal-200', animal_name: 'Oscar', title: 'Ordonnance Felimazole', type: 'prescription', date: '2025-11-15', file_type: 'pdf', file_size: 95000 },
                    { id: 'doc-202', animal_id: 'animal-201', animal_name: 'Bella', title: 'Ordonnance Aurizon', type: 'prescription', date: '2025-10-20', file_type: 'pdf', file_size: 88000 },
                    { id: 'doc-203', animal_id: 'animal-201', animal_name: 'Bella', title: 'Certificat vaccination CHPPiL + Rage', type: 'certificate', date: '2025-04-15', file_type: 'pdf', file_size: 102000 },
                    { id: 'doc-204', animal_id: 'animal-203', animal_name: 'Maya', title: 'Échographie cardiaque', type: 'lab', date: '2025-08-05', file_type: 'pdf', file_size: 2100000 },
                    { id: 'doc-205', animal_id: 'animal-203', animal_name: 'Maya', title: 'Compte-rendu cardiologie', type: 'report', date: '2025-08-05', file_type: 'pdf', file_size: 185000 },
                    { id: 'doc-206', animal_id: 'animal-206', animal_name: 'Filou', title: 'Bilan rénal complet', type: 'lab', date: '2025-12-01', file_type: 'pdf', file_size: 280000 },
                    { id: 'doc-207', animal_id: 'animal-206', animal_name: 'Filou', title: 'Ordonnance Semintra + Renal Special', type: 'prescription', date: '2025-12-01', file_type: 'pdf', file_size: 110000 },
                    { id: 'doc-208', animal_id: 'animal-207', animal_name: 'Tornade', title: 'Compte-rendu urgence chocolat', type: 'report', date: '2025-11-08', file_type: 'pdf', file_size: 145000 },
                    { id: 'doc-209', animal_id: 'animal-210', animal_name: 'Lola', title: 'Compte-rendu brachycéphale', type: 'report', date: '2025-11-25', file_type: 'pdf', file_size: 165000 },
                    { id: 'doc-210', animal_id: 'animal-202', animal_name: 'Pixel', title: 'Ordonnance Tobrex', type: 'prescription', date: '2025-09-01', file_type: 'pdf', file_size: 82000 },
                    { id: 'doc-211', animal_id: 'animal-200', animal_name: 'Oscar', title: 'Certificat vaccination TC', type: 'certificate', date: '2025-06-10', file_type: 'pdf', file_size: 96000 },
                    { id: 'doc-212', animal_id: 'animal-210', animal_name: 'Lola', title: 'Certificat vaccination CHPPiL + Rage', type: 'certificate', date: '2025-03-10', file_type: 'pdf', file_size: 99000 },
                    { id: 'doc-213', animal_id: 'animal-209', animal_name: 'Simba', title: 'Devis stérilisation', type: 'report', date: '2025-10-05', file_type: 'pdf', file_size: 72000 }
                ],
                notifications: [
                    { id: 'notif-200', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Oscar demain à 9h - Contrôle T4', date: '2026-03-04T10:00:00', read: false, animal_id: 'animal-200', appointment_id: 'appt-200' },
                    { id: 'notif-201', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Bella le 8 mars à 14h - Contrôle otite', date: '2026-03-06T10:00:00', read: false, animal_id: 'animal-201', appointment_id: 'appt-201' },
                    { id: 'notif-202', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Les vaccins de Tornade (CHPPiL, Rage) sont expirés depuis avril 2025', date: '2025-05-01T09:00:00', read: true, animal_id: 'animal-207' },
                    { id: 'notif-203', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Le vaccin Leucose féline d\'Oscar est expiré', date: '2025-06-20T09:00:00', read: true, animal_id: 'animal-200' },
                    { id: 'notif-204', type: 'document_available', title: 'Nouveau document', message: 'Le bilan rénal de Filou est disponible', date: '2025-12-02T08:30:00', read: false, animal_id: 'animal-206', document_id: 'doc-206' },
                    { id: 'notif-205', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Les vaccins de Neige (VHD, Myxomatose) sont expirés', date: '2025-09-01T09:00:00', read: true, animal_id: 'animal-208' },
                    { id: 'notif-206', type: 'document_available', title: 'Nouveau document', message: 'L\'échographie cardiaque de Maya est disponible', date: '2025-08-06T08:30:00', read: true, animal_id: 'animal-203', document_id: 'doc-204' },
                    { id: 'notif-207', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV stérilisation pour Simba le 20 mars à 8h30', date: '2026-03-18T10:00:00', read: false, animal_id: 'animal-209', appointment_id: 'appt-204' }
                ],
                hospitalizations: [
                    {
                        id: 'hosp-200', animal_id: 'animal-204', animal_name: 'Caramel', animal_species: 'Hamster',
                        type: 'chirurgie', status: 'en_intervention', reason: 'Exérèse tumeur cutanée',
                        veterinarian: 'Dr. Martin', admission_date: '2026-03-03T08:00:00', discharge_date: null,
                        last_update: '2026-03-03T10:00:00', notes: 'Petite masse détectée flanc droit. Chirurgie programmée.',
                        steps: ['admis', 'en_preparation', 'en_intervention', 'reveil', 'observation', 'sorti'],
                        current_step: 2,
                        timeline: [
                            { date: '2026-03-03T08:00:00', status: 'admis', description: 'Caramel admis pour chirurgie d\'exérèse', photo: null },
                            { date: '2026-03-03T09:00:00', status: 'en_preparation', description: 'Préparation anesthésique en cours', photo: null },
                            { date: '2026-03-03T10:00:00', status: 'en_intervention', description: 'Intervention en cours. Dr. Martin procède à l\'exérèse.', photo: { url: 'https://picsum.photos/seed/caramel-preop/400/300', caption: 'Caramel avant l\'intervention' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/caramel-preop/400/300', caption: 'Caramel avant l\'intervention', timestamp: '2026-03-03T09:00:00' }
                        ]
                    },
                    {
                        id: 'hosp-201', animal_id: 'animal-211', animal_name: 'Plume', animal_species: 'Oiseau',
                        type: 'medical', status: 'observation', reason: 'Détresse respiratoire',
                        veterinarian: 'Dr. Martin', admission_date: '2026-03-01T11:00:00', discharge_date: null,
                        last_update: '2026-03-02T16:00:00', notes: 'Traitement antibiotique et nébulisation. Évolution favorable.',
                        steps: ['admis', 'en_soins', 'observation', 'sorti'],
                        current_step: 2,
                        timeline: [
                            { date: '2026-03-01T11:00:00', status: 'admis', description: 'Plume admis pour difficultés respiratoires et gonflements', photo: null },
                            { date: '2026-03-01T14:00:00', status: 'en_soins', description: 'Nébulisation et antibiotiques administrés. Plume est placé en couveuse.', photo: { url: 'https://picsum.photos/seed/plume-couveuse/400/300', caption: 'Plume en couveuse' } },
                            { date: '2026-03-02T10:00:00', status: 'observation', description: 'Amélioration notable. Plume mange à nouveau.', photo: { url: 'https://picsum.photos/seed/plume-mieux/400/300', caption: 'Plume mange à nouveau' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/plume-couveuse/400/300', caption: 'Plume en couveuse', timestamp: '2026-03-01T14:00:00' },
                            { url: 'https://picsum.photos/seed/plume-mieux/400/300', caption: 'Plume mange à nouveau', timestamp: '2026-03-02T10:00:00' }
                        ]
                    }
                ]
            },

            '0600000004': {
                client: {
                    id: 'client-005',
                    first_name: 'Camille',
                    last_name: 'Moreau',
                    phone: '+33600000004',
                    email: 'camille.moreau@email.com',
                    address: '3 place de la République', postal_code: '75003', city: 'Paris', country: 'France'
                },
                animals: [
                    { id: 'animal-300', name: 'Chouquette', species: 'Chat', breed: 'Sacré de Birmanie', sex: 'F', birth_date: '2021-03-12', current_weight_kg: 3.5, identification_number: '250269800000020', neutered_status: 'Stérilisé(e)' },
                    { id: 'animal-301', name: 'Patou', species: 'Chien', breed: 'Cocker anglais', sex: 'M', birth_date: '2020-06-30', current_weight_kg: 13.5, identification_number: '250269800000021', neutered_status: 'Stérilisé(e)' }
                ],
                consultations: [
                    { id: 'consult-300', animal_id: 'animal-300', date: '2025-10-15', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne santé', notes: 'TC administré.', weight: 3.5, temperature: 38.4 },
                    { id: 'consult-301', animal_id: 'animal-301', date: '2025-09-20', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Allergie cutanée', diagnosis: 'Dermatite atopique', notes: 'Traitement Apoquel prescrit. Alimentation hypoallergénique recommandée.', weight: 13.8, temperature: 38.7 }
                ],
                vaccinations: [
                    { id: 'vacc-300', animal_id: 'animal-300', name: 'Typhus + Coryza', date: '2025-10-15', next_due_date: '2026-10-15', veterinarian: 'Dr. Martin', batch_number: 'LOT-C001', status: 'valid' },
                    { id: 'vacc-301', animal_id: 'animal-301', name: 'CHPPiL', date: '2025-01-10', next_due_date: '2026-01-10', veterinarian: 'Dr. Dupont', batch_number: 'LOT-C002', status: 'overdue' },
                    { id: 'vacc-302', animal_id: 'animal-301', name: 'Rage', date: '2025-01-10', next_due_date: '2026-01-10', veterinarian: 'Dr. Dupont', batch_number: 'LOT-C003', status: 'overdue' }
                ],
                treatments: [
                    { id: 'treat-300', animal_id: 'animal-301', name: 'Apoquel 5.4mg', type: 'Anti-prurigineux', prescribed_date: '2025-09-20', duration: '30 jours renouvelables', dosage: '1 comprimé/jour', instructions: 'À donner avec ou sans nourriture.', veterinarian: 'Dr. Dupont', status: 'active' }
                ],
                appointments: [
                    { id: 'appt-300', animal_id: 'animal-301', animal_name: 'Patou', date_time: '2026-03-15T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel CHPPiL + Rage (en retard)', veterinarian: 'Dr. Dupont', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-301', animal_id: 'animal-300', animal_name: 'Chouquette', date_time: '2026-03-22T09:30:00', duration: 20, type: 'Contrôle', reason: 'Contrôle annuel', veterinarian: 'Dr. Martin', status: 'pending', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-302', animal_id: 'animal-301', animal_name: 'Patou', date_time: '2026-02-10T11:00:00', duration: 20, type: 'Contrôle', reason: 'Suivi allergie', veterinarian: 'Dr. Dupont', status: 'cancelled', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-303', animal_id: 'animal-300', animal_name: 'Chouquette', date_time: '2026-01-20T14:00:00', duration: 30, type: 'Consultation', reason: 'Vomissements ponctuels', veterinarian: 'Dr. Martin', status: 'cancelled', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-304', animal_id: 'animal-300', animal_name: 'Chouquette', date_time: '2025-10-15T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel TC', veterinarian: 'Dr. Martin', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-305', animal_id: 'animal-301', animal_name: 'Patou', date_time: '2025-09-20T15:00:00', duration: 30, type: 'Consultation', reason: 'Allergie cutanée', veterinarian: 'Dr. Dupont', status: 'completed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' },
                    { id: 'appt-306', animal_id: 'animal-301', animal_name: 'Patou', date_time: '2025-12-05T10:00:00', duration: 20, type: 'Contrôle', reason: 'Suivi dermatite', veterinarian: 'Dr. Dupont', status: 'cancelled', clinic_address: '12 rue des Vétérinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-300', animal_id: 'animal-300', animal_name: 'Chouquette', title: 'Certificat vaccination TC', type: 'certificate', date: '2025-10-15', file_type: 'pdf', file_size: 97000 },
                    { id: 'doc-301', animal_id: 'animal-301', animal_name: 'Patou', title: 'Ordonnance Apoquel', type: 'prescription', date: '2025-09-20', file_type: 'pdf', file_size: 105000 },
                    { id: 'doc-302', animal_id: 'animal-301', animal_name: 'Patou', title: 'Compte-rendu dermatologie', type: 'report', date: '2025-09-20', file_type: 'pdf', file_size: 175000 }
                ],
                notifications: [
                    { id: 'notif-300', type: 'appointment_cancelled', title: 'RDV annulé', message: 'Le RDV du 10 février pour Patou a été annulé', date: '2026-02-08T14:00:00', read: false, animal_id: 'animal-301', appointment_id: 'appt-302' },
                    { id: 'notif-301', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Les vaccins de Patou (CHPPiL, Rage) sont expirés. Un RDV est planifié le 15 mars.', date: '2026-01-15T09:00:00', read: true, animal_id: 'animal-301' },
                    { id: 'notif-302', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Patou le 15 mars à 10h - Rappel vaccins', date: '2026-03-13T10:00:00', read: false, animal_id: 'animal-301', appointment_id: 'appt-300' }
                ],
                hospitalizations: []
            },

            '0600000005': {
                _sessionExpiry: 15,
                client: {
                    id: 'client-006',
                    first_name: 'Thomas',
                    last_name: 'Petit',
                    phone: '+33600000005',
                    email: 'thomas.petit@email.com',
                    address: '7 rue de Rivoli', postal_code: '75004', city: 'Paris', country: 'France'
                },
                animals: [
                    { id: 'animal-400', name: 'Gizmo', species: 'Chat', breed: 'Européen', sex: 'M', birth_date: '2021-09-15', current_weight_kg: 4.0, identification_number: '250269800000030', neutered_status: 'Stérilisé(e)' }
                ],
                consultations: [
                    { id: 'consult-400', animal_id: 'animal-400', date: '2025-11-10', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne santé', notes: 'TC administré.', weight: 4.0, temperature: 38.5 }
                ],
                vaccinations: [
                    { id: 'vacc-400', animal_id: 'animal-400', name: 'Typhus + Coryza', date: '2025-11-10', next_due_date: '2026-11-10', veterinarian: 'Dr. Martin', batch_number: 'LOT-T001', status: 'valid' }
                ],
                treatments: [],
                appointments: [
                    { id: 'appt-400', animal_id: 'animal-400', animal_name: 'Gizmo', date_time: '2026-04-15T10:00:00', duration: 20, type: 'Contrôle', reason: 'Contrôle annuel', veterinarian: 'Dr. Martin', status: 'confirmed', clinic_address: '12 rue des Vétérinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-400', animal_id: 'animal-400', animal_name: 'Gizmo', title: 'Certificat vaccination TC', type: 'certificate', date: '2025-11-10', file_type: 'pdf', file_size: 94000 }
                ],
                notifications: [
                    { id: 'notif-400', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Gizmo le 15 avril à 10h', date: '2026-04-13T10:00:00', read: false, animal_id: 'animal-400', appointment_id: 'appt-400' }
                ],
                hospitalizations: [
                    {
                        id: 'hosp-400', animal_id: 'animal-400', animal_name: 'Gizmo', animal_species: 'Chat',
                        type: 'chirurgie', status: 'sorti', reason: 'Fracture patte avant droite',
                        veterinarian: 'Dr. Dupont', admission_date: '2026-01-20T09:00:00', discharge_date: '2026-01-22T14:00:00',
                        last_update: '2026-01-22T14:00:00', notes: 'Ostéosynthèse réussie. Repos strict 6 semaines.',
                        steps: ['admis', 'en_preparation', 'en_intervention', 'reveil', 'observation', 'sorti'],
                        current_step: 5,
                        timeline: [
                            { date: '2026-01-20T09:00:00', status: 'admis', description: 'Gizmo admis pour fracture suite à une chute', photo: null },
                            { date: '2026-01-20T10:30:00', status: 'en_preparation', description: 'Bilan pré-opératoire et radiographies', photo: null },
                            { date: '2026-01-20T13:00:00', status: 'en_intervention', description: 'Ostéosynthèse en cours — pose de broches', photo: null },
                            { date: '2026-01-20T15:00:00', status: 'reveil', description: 'Gizmo se réveille. Opération réussie.', photo: { url: 'https://picsum.photos/seed/gizmo-reveil/400/300', caption: 'Gizmo après l\'opération' } },
                            { date: '2026-01-21T09:00:00', status: 'observation', description: 'Gizmo mange et se déplace prudemment. Tout va bien.', photo: { url: 'https://picsum.photos/seed/gizmo-repos/400/300', caption: 'Gizmo se repose' } },
                            { date: '2026-01-22T14:00:00', status: 'sorti', description: 'Gizmo peut rentrer. Contrôle radiographique dans 3 semaines.', photo: null }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/gizmo-reveil/400/300', caption: 'Gizmo après l\'opération', timestamp: '2026-01-20T15:00:00' },
                            { url: 'https://picsum.photos/seed/gizmo-repos/400/300', caption: 'Gizmo se repose', timestamp: '2026-01-21T09:00:00' }
                        ]
                    }
                ]
            }
        };
    }

    function init() {
        var host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.github.io')) {
            console.warn('[Mock] Blocked: mock server cannot run outside localhost.');
            return;
        }
        _loadAccounts();
        _setupRoutes();
        window.fetch = _interceptFetch;
        console.log('%c[Mock] Serveur mock actif — ' + Object.keys(_accounts).length + ' comptes disponibles', 'color: #5BC0BE; font-weight: bold');
    }

    return { init: init };
})();
