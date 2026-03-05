var MockServer = (function () {
    'use strict';

    var _originalFetch = window.fetch;
    var _mockData = {};
    var _accounts = {};
    var _currentPhone = null;
    var _isAuthenticated = false;
    var _sessionTimer = null;
    var _routes = [];

    var _clinicInfo = {
        name: 'Clinique Veterinaire des Lilas',
        phone: '01 43 00 00 00',
        address: '12 rue des Veterinaires, 75015 Paris',
        openingHours: 'Lun-Ven 8h-19h, Sam 9h-13h',
        logoUrl: 'assets/logo/demo-clinic-logo.svg',
        iconUrl: 'assets/logo/demo-clinic-icon.svg'
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
        return new Promise(function (resolve) {
            setTimeout(function () {
                resolve(new Response(JSON.stringify(data), {
                    status: status,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }, delay);
        });
    }

    function _respondAuth(data) {
        _isAuthenticated = true;
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
                openingHours: _clinicInfo.openingHours,
                logoUrl: _clinicInfo.logoUrl || null,
                iconUrl: _clinicInfo.iconUrl || null
            });
        });

        _addRoute('POST', '/auth-request-code', function (params, body) {
            var phone = (body && body.phone) || '';
            var cleaned = _cleanPhone(phone);
            if (_accounts[cleaned]) {
                _currentPhone = cleaned;
                return _respond({ message: 'OTP envoye', expires_in: 300 });
            }
            return _respond({ message: 'Aucun compte client trouve pour ce numero' }, 404);
        });

        _addRoute('POST', '/auth-verify-code', function (params, body) {
            if (body && body.code === '123456' && _currentPhone && _accounts[_currentPhone]) {
                _mockData = _accounts[_currentPhone];
                if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
                if (_mockData._sessionExpiry) {
                    var delay = _mockData._sessionExpiry * 1000;
                    console.log('%c[Mock] Session expirera dans ' + _mockData._sessionExpiry + 's', 'color: #E74C3C; font-weight: bold');
                    _sessionTimer = setTimeout(function () {
                        _isAuthenticated = false;
                        console.log('%c[Mock] Session expiree !', 'color: #E74C3C; font-weight: bold');
                        window.dispatchEvent(new CustomEvent('session-expired'));
                    }, delay);
                }
                var clientData = JSON.parse(JSON.stringify(_mockData.client));
                return _respondAuth({ client: clientData });
            }
            return _respond({ message: 'Code invalide' }, 400);
        });

        _addRoute('GET', '/profile', function () {
            if (_isAuthenticated) {
                return _respond(JSON.parse(JSON.stringify(_mockData.client)));
            }
            return _respond({ message: 'Non authentifie' }, 401);
        });

        _addRoute('POST', '/auth-logout', function () {
            _isAuthenticated = false;
            _currentPhone = null;
            if (_sessionTimer) { clearTimeout(_sessionTimer); _sessionTimer = null; }
            return _respond({ message: 'Deconnexion reussie' });
        });

        _addRoute('GET', '/dashboard/summary', function () {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var upcoming = _mockData.appointments
                .filter(function (a) { return new Date(a.dateTime) >= new Date(); })
                .sort(function (a, b) { return new Date(a.dateTime) - new Date(b.dateTime); });
            var activeHosp = (_mockData.hospitalizations || []).filter(function (h) { return h.status !== 'sorti'; });
            return _respond({
                clientName: _mockData.client.firstName,
                clinicName: _clinicInfo.name,
                nextAppointment: upcoming[0] || null,
                animals: _mockData.animals,
                notifications: _mockData.notifications.slice(0, 5),
                upcomingAppointments: upcoming.slice(0, 3),
                activeHospitalizations: activeHosp
            });
        });

        _addRoute('GET', '/animals', function () {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            return _respond({ animals: _mockData.animals });
        });

        _addRoute('GET', '/animals/:id', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var animal = _mockData.animals.find(function (a) { return a.id === params[0]; });
            if (animal) return _respond({ animal: animal });
            return _respond({ message: 'Animal non trouve' }, 404);
        });

        _addRoute('GET', '/animals/:id/consultations', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var list = _mockData.consultations
                .filter(function (c) { return c.animalId === params[0]; })
                .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
            return _respond({ consultations: list });
        });

        _addRoute('GET', '/animals/:id/vaccinations', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var list = _mockData.vaccinations.filter(function (v) { return v.animalId === params[0]; });
            return _respond({ vaccinations: list });
        });

        _addRoute('GET', '/animals/:id/treatments', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var list = _mockData.treatments
                .filter(function (t) { return t.animalId === params[0]; })
                .sort(function (a, b) { return new Date(b.prescribedDate) - new Date(a.prescribedDate); });
            return _respond({ treatments: list });
        });

        _addRoute('GET', '/animals/:id/weights', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var animal = _mockData.animals.find(function (a) { return a.id === params[0]; });
            if (!animal) return _respond({ message: 'Animal non trouve' }, 404);
            var consultWeights = (_mockData.consultations || [])
                .filter(function (c) { return c.animalId === params[0] && c.weight; })
                .map(function (c) { return { date: c.date, weight: c.weight, source: 'consultation' }; })
                .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
            return _respond({ weights: consultWeights });
        });

        _addRoute('GET', '/appointments', function (params, body, searchParams) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var status = searchParams.get('status') || 'upcoming';
            var now = new Date();
            var filtered = _mockData.appointments.filter(function (a) {
                return status === 'upcoming'
                    ? new Date(a.dateTime) >= now
                    : new Date(a.dateTime) < now;
            }).sort(function (a, b) {
                return status === 'upcoming'
                    ? new Date(a.dateTime) - new Date(b.dateTime)
                    : new Date(b.dateTime) - new Date(a.dateTime);
            });
            return _respond({ appointments: filtered });
        });

        _addRoute('GET', '/appointments/:id', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var appt = _mockData.appointments.find(function (a) { return a.id === params[0]; });
            if (appt) return _respond({ appointment: appt });
            return _respond({ message: 'RDV non trouve' }, 404);
        });

        _addRoute('POST', '/appointments/:id/cancel', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var appt = _mockData.appointments.find(function (a) { return a.id === params[0]; });
            if (appt) {
                appt.status = 'cancelled';
                return _respond({ message: 'RDV annule' });
            }
            return _respond({ message: 'RDV non trouve' }, 404);
        });

        _addRoute('GET', '/documents', function (params, body, searchParams) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var type = searchParams.get('type');
            var list = _mockData.documents.slice();
            if (type) {
                list = list.filter(function (d) { return d.type === type; });
            }
            list = list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
            return _respond({ documents: list });
        });

        _addRoute('GET', '/documents/:id/download', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            return _respond({ downloadUrl: '#mock-download-' + params[0] });
        });

        _addRoute('POST', '/push/subscribe', function () {
            return _respond({ message: 'Subscription enregistree' });
        });

        _addRoute('POST', '/push/unsubscribe', function () {
            return _respond({ message: 'Subscription supprimee' });
        });

        _addRoute('GET', '/notifications/settings', function () {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            return _respond(_mockData.notificationSettings || { push: false, email: true, sms: true });
        });

        _addRoute('PUT', '/notifications/settings', function (params, body) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            _mockData.notificationSettings = Object.assign(_mockData.notificationSettings || {}, body);
            return _respond(_mockData.notificationSettings);
        });

        _addRoute('GET', '/hospitalizations', function (params, body, searchParams) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var status = searchParams.get('status') || 'active';
            var list = (_mockData.hospitalizations || []).filter(function (h) {
                return status === 'active' ? h.status !== 'sorti' : h.status === 'sorti';
            });
            return _respond({ hospitalizations: list });
        });

        _addRoute('GET', '/hospitalizations/:id', function (params) {
            if (!_isAuthenticated) return _respond({ message: 'Non authentifie' }, 401);
            var hosp = (_mockData.hospitalizations || []).find(function (h) { return h.id === params[0]; });
            if (hosp) return _respond({ hospitalization: hosp });
            return _respond({ message: 'Hospitalisation non trouvee' }, 404);
        });
    }

    function _loadAccounts() {
        _accounts = {
            '0600000000': {
                client: {
                    id: 'client-001',
                    firstName: 'Marie',
                    lastName: 'Laurent',
                    phone: '+33600000000',
                    email: 'marie.laurent@email.com',
                    address: { street: '25 rue de la Paix', zipCode: '75002', city: 'Paris' },
                    clinic: { name: _clinicInfo.name, phone: _clinicInfo.phone, address: _clinicInfo.address, openingHours: _clinicInfo.openingHours }
                },
                animals: [
                    { id: 'animal-001', name: 'Luna', species: 'Chat', breed: 'Europeen', sex: 'F', birthDate: '2020-04-15', weight: 4.2, color: 'Tigree grise', microchipNumber: '250269812345678', sterilized: true, photoUrl: null },
                    { id: 'animal-002', name: 'Rex', species: 'Chien', breed: 'Berger Allemand', sex: 'M', birthDate: '2019-08-20', weight: 34.5, color: 'Noir et feu', microchipNumber: '250269887654321', sterilized: true, photoUrl: null },
                    { id: 'animal-003', name: 'Noisette', species: 'Lapin', breed: 'Belier nain', sex: 'F', birthDate: '2023-01-10', weight: 1.8, color: 'Brun', microchipNumber: null, sterilized: false, photoUrl: null }
                ],
                consultations: [
                    { id: 'consult-001', animalId: 'animal-001', date: '2025-12-05', type: 'Urgence', veterinarian: 'Dr. Martin', reason: 'Vomissements repetes depuis 24h', diagnosis: 'Gastrite aigue - probable ingestion corps etranger', notes: 'Radiographie abdominale realisee. Pas de corps etranger visible. Traitement symptomatique prescrit.', weight: 4.0, temperature: 39.2 },
                    { id: 'consult-002', animalId: 'animal-001', date: '2024-03-15', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel vaccins annuels', diagnosis: 'Bonne sante generale', notes: 'Vaccins Typhus et Coryza administres. Prochain rappel dans 1 an.', weight: 4.2, temperature: 38.5 },
                    { id: 'consult-010', animalId: 'animal-001', date: '2020-06-20', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Premiere visite chaton', diagnosis: 'Chaton en bonne sante', notes: 'Primo-vaccination Typhus/Coryza. Vermifugation. Croissance normale.', weight: 1.0, temperature: 38.8 },
                    { id: 'consult-011', animalId: 'animal-001', date: '2020-07-18', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel primo-vaccination', diagnosis: 'Bonne croissance', notes: 'Rappel TC administre. Chaton vif et en pleine forme.', weight: 1.4, temperature: 38.6 },
                    { id: 'consult-012', animalId: 'animal-001', date: '2020-10-05', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Controle croissance + vaccination leucose', diagnosis: 'Croissance harmonieuse', notes: 'Primo-vaccination FeLV. Poids conforme pour l\'age.', weight: 2.4, temperature: 38.7 },
                    { id: 'consult-013', animalId: 'animal-001', date: '2021-01-15', type: 'Chirurgie', veterinarian: 'Dr. Martin', reason: 'Sterilisation (ovariectomie)', diagnosis: 'Intervention sans complication', notes: 'Sterilisation realisee. Bonne recuperation. Retrait fils dans 10 jours.', weight: 3.1, temperature: 38.5 },
                    { id: 'consult-014', animalId: 'animal-001', date: '2021-06-20', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne sante', notes: 'Vaccins TC + FeLV. Chat adulte en pleine forme.', weight: 3.8, temperature: 38.4 },
                    { id: 'consult-015', animalId: 'animal-001', date: '2022-03-22', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel vaccins annuels', diagnosis: 'RAS', notes: 'TC administre. Poids stable, bonne condition corporelle.', weight: 4.1, temperature: 38.5 },
                    { id: 'consult-016', animalId: 'animal-001', date: '2022-11-10', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Examen dentaire + detartrage', diagnosis: 'Leger tartre — detartrage realise', notes: 'Detartrage sous anesthesie flash. Dents saines. Pas d\'extraction necessaire.', weight: 4.3, temperature: 38.6 },
                    { id: 'consult-017', animalId: 'animal-001', date: '2023-03-20', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel TC + FeLV', diagnosis: 'Bonne sante', notes: 'Vaccins administres. Chat en excellente forme.', weight: 4.2, temperature: 38.5 },
                    { id: 'consult-018', animalId: 'animal-001', date: '2023-09-15', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Leger embonpoint signale par proprietaire', diagnosis: 'Surpoids modere (NEC 6/9)', notes: 'Regime alimentaire ajuste. Passage a croquettes light recommande. Controle dans 3 mois.', weight: 4.5, temperature: 38.4 },
                    { id: 'consult-019', animalId: 'animal-001', date: '2024-01-10', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Controle poids suite regime', diagnosis: 'Perte de poids satisfaisante (NEC 5/9)', notes: 'Poids reduit de 300g. Bonne evolution. Maintenir alimentation light.', weight: 4.2, temperature: 38.5 },
                    { id: 'consult-020', animalId: 'animal-001', date: '2025-06-18', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne sante generale', notes: 'TC + FeLV administres. Bon etat general. Poids stable.', weight: 4.1, temperature: 38.6 },
                    { id: 'consult-003', animalId: 'animal-002', date: '2024-06-01', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel vaccin rage + controle', diagnosis: 'RAS - bonne sante', notes: 'Vaccin rage administre. Leger tartre dentaire observe, surveillance recommandee.', weight: 34.5, temperature: 38.8 },
                    { id: 'consult-004', animalId: 'animal-002', date: '2025-09-10', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Boiterie patte arriere gauche', diagnosis: 'Entorse legere ligamentaire', notes: 'Anti-inflammatoires prescrits. Repos 10 jours. Controle si persistance.', weight: 35.0, temperature: 38.6 },
                    { id: 'consult-005', animalId: 'animal-003', date: '2025-06-20', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Controle annuel', diagnosis: 'Bonne sante. Dents a surveiller.', notes: 'Pesee, auscultation. Pas de probleme dentaire majeur pour l\'instant.', weight: 1.8, temperature: 38.9 }
                ],
                vaccinations: [
                    { id: 'vacc-001', animalId: 'animal-001', name: 'Typhus (Panleucopenie)', date: '2024-03-15', nextDueDate: '2025-03-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-A12345', status: 'overdue' },
                    { id: 'vacc-002', animalId: 'animal-001', name: 'Coryza', date: '2024-03-15', nextDueDate: '2025-03-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-B67890', status: 'overdue' },
                    { id: 'vacc-003', animalId: 'animal-001', name: 'Leucose feline (FeLV)', date: '2023-03-20', nextDueDate: '2025-03-20', veterinarian: 'Dr. Martin', batchNumber: 'LOT-C11111', status: 'overdue' },
                    { id: 'vacc-004', animalId: 'animal-002', name: 'Rage', date: '2024-06-01', nextDueDate: '2025-06-01', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-R11111', status: 'overdue' },
                    { id: 'vacc-005', animalId: 'animal-002', name: 'CHPPiL (Polyvalent)', date: '2024-06-01', nextDueDate: '2026-06-01', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-C22222', status: 'valid' },
                    { id: 'vacc-006', animalId: 'animal-002', name: 'Leptospirose', date: '2024-06-01', nextDueDate: '2025-06-01', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-L33333', status: 'overdue' },
                    { id: 'vacc-007', animalId: 'animal-003', name: 'VHD (Maladie hemorragique)', date: '2025-01-15', nextDueDate: '2026-01-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-V44444', status: 'valid' },
                    { id: 'vacc-008', animalId: 'animal-003', name: 'Myxomatose', date: '2025-01-15', nextDueDate: '2025-07-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-M55555', status: 'valid' }
                ],
                treatments: [
                    { id: 'treat-001', animalId: 'animal-001', name: 'Cerenia 16mg', type: 'Antiemetique', prescribedDate: '2025-12-05', duration: '3 jours', dosage: '1 comprime/jour', instructions: 'A donner le matin a jeun', veterinarian: 'Dr. Martin', status: 'completed' },
                    { id: 'treat-002', animalId: 'animal-001', name: 'Smecta veterinaire', type: 'Pansement gastrique', prescribedDate: '2025-12-05', duration: '5 jours', dosage: '1/2 sachet 2x/jour', instructions: 'Melanger dans un peu d\'eau, administrer a la seringue', veterinarian: 'Dr. Martin', status: 'completed' },
                    { id: 'treat-003', animalId: 'animal-002', name: 'Metacam 2.5mg/ml', type: 'Anti-inflammatoire', prescribedDate: '2025-09-10', duration: '10 jours', dosage: '0.1 mg/kg/jour - 1.4ml/jour', instructions: 'A donner avec la nourriture. Surveiller appetit et selles.', veterinarian: 'Dr. Dupont', status: 'completed' },
                    { id: 'treat-004', animalId: 'animal-002', name: 'Milbemax chien', type: 'Vermifuge', prescribedDate: '2025-10-01', duration: '1 jour', dosage: '2 comprimes en une prise', instructions: 'A renouveler dans 3 mois', veterinarian: 'Dr. Dupont', status: 'completed' }
                ],
                appointments: [
                    { id: 'appt-001', animalId: 'animal-002', animalName: 'Rex', dateTime: '2026-03-10T14:30:00', duration: 30, type: 'Consultation', reason: 'Rappel vaccin CHPPiL', veterinarian: 'Dr. Dupont', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-002', animalId: 'animal-001', animalName: 'Luna', dateTime: '2026-03-18T10:00:00', duration: 20, type: 'Controle', reason: 'Controle annuel + rappel vaccins', veterinarian: 'Dr. Martin', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-003', animalId: 'animal-003', animalName: 'Noisette', dateTime: '2026-04-05T11:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel myxomatose', veterinarian: 'Dr. Martin', status: 'pending', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-004', animalId: 'animal-001', animalName: 'Luna', dateTime: '2025-12-05T09:00:00', duration: 30, type: 'Urgence', reason: 'Vomissements repetes', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-005', animalId: 'animal-002', animalName: 'Rex', dateTime: '2025-09-10T16:00:00', duration: 30, type: 'Consultation', reason: 'Boiterie patte arriere', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-001', animalId: 'animal-001', animalName: 'Luna', title: 'Resultats analyse sanguine', type: 'lab', date: '2025-12-05', fileType: 'pdf', fileSize: 245000 },
                    { id: 'doc-002', animalId: 'animal-001', animalName: 'Luna', title: 'Ordonnance - Traitement gastrite', type: 'prescription', date: '2025-12-05', fileType: 'pdf', fileSize: 120000 },
                    { id: 'doc-003', animalId: 'animal-002', animalName: 'Rex', title: 'Certificat de vaccination - Rage', type: 'certificate', date: '2024-06-01', fileType: 'pdf', fileSize: 98000 },
                    { id: 'doc-004', animalId: 'animal-001', animalName: 'Luna', title: 'Radiographie abdominale', type: 'lab', date: '2025-12-05', fileType: 'pdf', fileSize: 1520000 },
                    { id: 'doc-005', animalId: 'animal-002', animalName: 'Rex', title: 'Ordonnance - Anti-inflammatoire', type: 'prescription', date: '2025-09-10', fileType: 'pdf', fileSize: 95000 },
                    { id: 'doc-006', animalId: 'animal-002', animalName: 'Rex', title: 'Compte-rendu consultation boiterie', type: 'report', date: '2025-09-10', fileType: 'pdf', fileSize: 180000 }
                ],
                notifications: [
                    { id: 'notif-001', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Rex demain a 14h30 - Rappel vaccin CHPPiL', date: '2026-03-09T10:00:00', read: false, animalId: 'animal-002', appointmentId: 'appt-001' },
                    { id: 'notif-002', type: 'document_available', title: 'Nouveau document', message: 'Les resultats d\'analyse sanguine de Luna sont disponibles', date: '2025-12-06T08:30:00', read: true, animalId: 'animal-001', documentId: 'doc-001' },
                    { id: 'notif-003', type: 'vaccine_reminder', title: 'Rappel vaccination', message: 'Les vaccins de Luna (Typhus, Coryza) sont expires. Prenez rendez-vous.', date: '2025-03-20T09:00:00', read: true, animalId: 'animal-001' }
                ],
                hospitalizations: [
                    {
                        id: 'hosp-001', animalId: 'animal-001', animalName: 'Luna', animalSpecies: 'Chat',
                        type: 'chirurgie', status: 'reveil', reason: 'Sterilisation',
                        veterinarian: 'Dr. Martin', admissionDate: '2026-03-02T08:00:00', dischargeDate: null,
                        lastUpdate: '2026-03-02T11:00:00', notes: 'Intervention sans complication',
                        steps: ['admis', 'en_preparation', 'en_intervention', 'reveil', 'observation', 'sorti'],
                        currentStep: 3,
                        timeline: [
                            { date: '2026-03-02T08:00:00', status: 'admis', description: 'Luna a ete admise pour sterilisation', photo: null },
                            { date: '2026-03-02T09:30:00', status: 'en_preparation', description: 'Preparation pre-operatoire en cours. Bilan sanguin conforme.', photo: null },
                            { date: '2026-03-02T10:15:00', status: 'en_intervention', description: 'Intervention en cours — sterilisation par ovariectomie', photo: null },
                            { date: '2026-03-02T11:00:00', status: 'reveil', description: 'Luna se reveille doucement. Tout s\'est bien passe !', photo: { url: 'https://picsum.photos/seed/luna-reveil/400/300', caption: 'Luna au reveil' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/luna-reveil/400/300', caption: 'Luna au reveil', timestamp: '2026-03-02T11:00:00' },
                            { url: 'https://picsum.photos/seed/luna-repos/400/300', caption: 'Luna se repose tranquillement', timestamp: '2026-03-02T14:30:00' },
                            { url: 'https://picsum.photos/seed/luna-calin/400/300', caption: 'Luna reclame des calins', timestamp: '2026-03-02T16:00:00' }
                        ]
                    },
                    {
                        id: 'hosp-002', animalId: 'animal-002', animalName: 'Rex', animalSpecies: 'Chien',
                        type: 'medical', status: 'sorti', reason: 'Gastro-enterite severe',
                        veterinarian: 'Dr. Dupont', admissionDate: '2026-02-15T09:00:00', dischargeDate: '2026-02-17T16:00:00',
                        lastUpdate: '2026-02-17T16:00:00', notes: 'Bonne recuperation apres rehydratation IV',
                        steps: ['admis', 'en_soins', 'observation', 'sorti'],
                        currentStep: 3,
                        timeline: [
                            { date: '2026-02-15T09:00:00', status: 'admis', description: 'Rex admis pour deshydratation suite a vomissements et diarrhees depuis 48h', photo: null },
                            { date: '2026-02-15T11:00:00', status: 'en_soins', description: 'Perfusion IV en cours. Antiemetiques administres.', photo: { url: 'https://picsum.photos/seed/rex-perf/400/300', caption: 'Rex sous perfusion' } },
                            { date: '2026-02-16T09:00:00', status: 'observation', description: 'Nette amelioration. Rex a mange un peu ce matin.', photo: { url: 'https://picsum.photos/seed/rex-mieux/400/300', caption: 'Rex va mieux' } },
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
                    firstName: 'Pierre',
                    lastName: 'Dumont',
                    phone: '+33600000001',
                    email: 'pierre.dumont@email.com',
                    address: { street: '8 avenue Victor Hugo', zipCode: '75016', city: 'Paris' },
                    clinic: { name: _clinicInfo.name, phone: _clinicInfo.phone, address: _clinicInfo.address, openingHours: _clinicInfo.openingHours }
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
                    firstName: 'Sophie',
                    lastName: 'Bernard',
                    phone: '+33600000002',
                    email: 'sophie.bernard@email.com',
                    address: { street: '42 boulevard Haussmann', zipCode: '75009', city: 'Paris' },
                    clinic: { name: _clinicInfo.name, phone: _clinicInfo.phone, address: _clinicInfo.address, openingHours: _clinicInfo.openingHours }
                },
                animals: [
                    { id: 'animal-101', name: 'Milo', species: 'Chat', breed: 'Siamois', sex: 'M', birthDate: '2022-07-20', weight: 3.8, color: 'Seal point', microchipNumber: '250269800000001', sterilized: true, photoUrl: null }
                ],
                consultations: [],
                vaccinations: [],
                treatments: [],
                appointments: [],
                documents: [],
                notifications: [],
                hospitalizations: [
                    {
                        id: 'hosp-100', animalId: 'animal-101', animalName: 'Milo', animalSpecies: 'Chat',
                        type: 'medical', status: 'en_soins', reason: 'Obstruction urinaire',
                        veterinarian: 'Dr. Martin', admissionDate: '2026-03-02T14:00:00', dischargeDate: null,
                        lastUpdate: '2026-03-02T18:00:00', notes: 'Sondage urinaire realise. Surveillance debit urinaire.',
                        steps: ['admis', 'en_soins', 'observation', 'sorti'],
                        currentStep: 1,
                        timeline: [
                            { date: '2026-03-02T14:00:00', status: 'admis', description: 'Milo admis en urgence pour difficultes a uriner', photo: null },
                            { date: '2026-03-02T15:30:00', status: 'en_soins', description: 'Sondage urinaire effectue. Perfusion en cours.', photo: { url: 'https://picsum.photos/seed/milo-soins/400/300', caption: 'Milo au repos apres les soins' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/milo-soins/400/300', caption: 'Milo au repos apres les soins', timestamp: '2026-03-02T15:30:00' }
                        ]
                    }
                ]
            },

            '0600000003': {
                client: {
                    id: 'client-004',
                    firstName: 'Jean-Marc',
                    lastName: 'Lefevre',
                    phone: '+33600000003',
                    email: 'jm.lefevre@email.com',
                    address: { street: '15 rue du Faubourg Saint-Antoine', zipCode: '75011', city: 'Paris' },
                    clinic: { name: _clinicInfo.name, phone: _clinicInfo.phone, address: _clinicInfo.address, openingHours: _clinicInfo.openingHours }
                },
                animals: [
                    { id: 'animal-200', name: 'Oscar', species: 'Chat', breed: 'Maine Coon', sex: 'M', birthDate: '2018-02-10', weight: 7.8, color: 'Roux tabby', microchipNumber: '250269800000010', sterilized: true, photoUrl: null },
                    { id: 'animal-201', name: 'Bella', species: 'Chien', breed: 'Golden Retriever', sex: 'F', birthDate: '2019-05-22', weight: 28.5, color: 'Dore', microchipNumber: '250269800000011', sterilized: true, photoUrl: null },
                    { id: 'animal-202', name: 'Pixel', species: 'Chat', breed: 'Persan', sex: 'M', birthDate: '2021-11-03', weight: 4.5, color: 'Blanc', microchipNumber: '250269800000012', sterilized: true, photoUrl: null },
                    { id: 'animal-203', name: 'Maya', species: 'Chien', breed: 'Cavalier King Charles', sex: 'F', birthDate: '2020-08-15', weight: 6.2, color: 'Blenheim', microchipNumber: '250269800000013', sterilized: true, photoUrl: null },
                    { id: 'animal-204', name: 'Caramel', species: 'Hamster', breed: 'Syrien', sex: 'M', birthDate: '2025-03-01', weight: 0.14, color: 'Dore', microchipNumber: null, sterilized: false, photoUrl: null },
                    { id: 'animal-205', name: 'Kiwi', species: 'Oiseau', breed: 'Perruche ondulee', sex: 'F', birthDate: '2023-06-10', weight: 0.035, color: 'Vert et jaune', microchipNumber: null, sterilized: false, photoUrl: null },
                    { id: 'animal-206', name: 'Filou', species: 'Chat', breed: 'Chartreux', sex: 'M', birthDate: '2017-01-20', weight: 6.0, color: 'Gris bleu', microchipNumber: '250269800000014', sterilized: true, photoUrl: null },
                    { id: 'animal-207', name: 'Tornade', species: 'Chien', breed: 'Jack Russell', sex: 'F', birthDate: '2022-04-08', weight: 5.8, color: 'Blanc et feu', microchipNumber: '250269800000015', sterilized: true, photoUrl: null },
                    { id: 'animal-208', name: 'Neige', species: 'Lapin', breed: 'Angora nain', sex: 'F', birthDate: '2024-02-14', weight: 1.5, color: 'Blanc', microchipNumber: null, sterilized: false, photoUrl: null },
                    { id: 'animal-209', name: 'Simba', species: 'Chat', breed: 'Bengal', sex: 'M', birthDate: '2023-09-05', weight: 5.2, color: 'Brown spotted', microchipNumber: '250269800000016', sterilized: false, photoUrl: null },
                    { id: 'animal-210', name: 'Lola', species: 'Chien', breed: 'Bouledogue francais', sex: 'F', birthDate: '2021-12-25', weight: 11.0, color: 'Fauve', microchipNumber: '250269800000017', sterilized: true, photoUrl: null },
                    { id: 'animal-211', name: 'Plume', species: 'Oiseau', breed: 'Canari', sex: 'M', birthDate: '2024-07-01', weight: 0.025, color: 'Jaune', microchipNumber: null, sterilized: false, photoUrl: null }
                ],
                consultations: [
                    { id: 'consult-200', animalId: 'animal-200', date: '2025-11-15', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Perte de poids progressive', diagnosis: 'Hyperthyroidie debutante', notes: 'Bilan sanguin T4 elevee. Mise sous traitement Felimazole.', weight: 7.2, temperature: 38.8 },
                    { id: 'consult-201', animalId: 'animal-200', date: '2025-06-10', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'RAS', notes: 'Vaccin TC administre.', weight: 7.8, temperature: 38.5 },
                    { id: 'consult-202', animalId: 'animal-201', date: '2025-10-20', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Otite recidivante', diagnosis: 'Otite externe cerumineuse', notes: 'Nettoyage auriculaire + traitement topique Aurizon.', weight: 29.0, temperature: 38.7 },
                    { id: 'consult-203', animalId: 'animal-201', date: '2025-04-15', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel vaccins', diagnosis: 'Bonne sante', notes: 'CHPPiL + Rage administres.', weight: 28.5, temperature: 38.6 },
                    { id: 'consult-204', animalId: 'animal-202', date: '2025-09-01', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Yeux qui coulent', diagnosis: 'Conjonctivite bilaterale', notes: 'Collyre antibiotique prescrit. Revoir si persistance.', weight: 4.5, temperature: 38.4 },
                    { id: 'consult-205', animalId: 'animal-203', date: '2025-08-05', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Souffle cardiaque detecte', diagnosis: 'MVD stade B1', notes: 'Echographie cardiaque realisee. Pas de traitement pour l\'instant, surveillance semestrielle.', weight: 6.3, temperature: 38.5 },
                    { id: 'consult-206', animalId: 'animal-203', date: '2025-02-20', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel annuel', diagnosis: 'RAS', notes: 'CHPPiL administre.', weight: 6.1, temperature: 38.6 },
                    { id: 'consult-207', animalId: 'animal-205', date: '2025-07-15', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Plumes abimees', diagnosis: 'Picage lie au stress', notes: 'Conseils environnementaux donnes. Complement vitamines prescrit.', weight: 0.034, temperature: null },
                    { id: 'consult-208', animalId: 'animal-206', date: '2025-12-01', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Problemes renaux', diagnosis: 'IRC stade 2 IRIS', notes: 'Bilan renal: creatinine elevee. Alimentation renale prescrite. Controle dans 3 mois.', weight: 5.8, temperature: 38.6 },
                    { id: 'consult-209', animalId: 'animal-206', date: '2025-05-10', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne sante generale pour son age', notes: 'TC administre. Leger souffle cardiaque note.', weight: 6.0, temperature: 38.7 },
                    { id: 'consult-210', animalId: 'animal-207', date: '2025-11-08', type: 'Urgence', veterinarian: 'Dr. Dupont', reason: 'Ingestion de chocolat', diagnosis: 'Intoxication chocolat moderee', notes: 'Vomissement provoque + charbon active. Surveillance 24h. Pas de complication.', weight: 5.9, temperature: 39.1 },
                    { id: 'consult-211', animalId: 'animal-208', date: '2025-09-20', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Controle annuel', diagnosis: 'Bonne sante', notes: 'Dents a surveiller. Foin de qualite recommande.', weight: 1.5, temperature: 38.8 },
                    { id: 'consult-212', animalId: 'animal-209', date: '2025-10-05', type: 'Consultation', veterinarian: 'Dr. Martin', reason: 'Discussion sterilisation', diagnosis: 'En bonne sante, apte a la sterilisation', notes: 'RDV sterilisation a planifier.', weight: 5.2, temperature: 38.5 },
                    { id: 'consult-213', animalId: 'animal-210', date: '2025-11-25', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Problemes respiratoires', diagnosis: 'Syndrome brachycephale modere', notes: 'Stenose des narines. Chirurgie envisageable si aggravation.', weight: 11.2, temperature: 38.9 },
                    { id: 'consult-214', animalId: 'animal-210', date: '2025-03-10', type: 'Vaccination', veterinarian: 'Dr. Dupont', reason: 'Rappel annuel', diagnosis: 'RAS', notes: 'CHPPiL + Rage.', weight: 10.8, temperature: 38.7 }
                ],
                vaccinations: [
                    { id: 'vacc-200', animalId: 'animal-200', name: 'Typhus + Coryza', date: '2025-06-10', nextDueDate: '2026-06-10', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H001', status: 'valid' },
                    { id: 'vacc-201', animalId: 'animal-200', name: 'Leucose feline', date: '2024-06-15', nextDueDate: '2025-06-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H002', status: 'overdue' },
                    { id: 'vacc-202', animalId: 'animal-201', name: 'CHPPiL', date: '2025-04-15', nextDueDate: '2026-04-15', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H003', status: 'valid' },
                    { id: 'vacc-203', animalId: 'animal-201', name: 'Rage', date: '2025-04-15', nextDueDate: '2026-04-15', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H004', status: 'valid' },
                    { id: 'vacc-204', animalId: 'animal-201', name: 'Leptospirose', date: '2025-04-15', nextDueDate: '2026-04-15', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H005', status: 'valid' },
                    { id: 'vacc-205', animalId: 'animal-202', name: 'Typhus + Coryza', date: '2024-11-10', nextDueDate: '2025-11-10', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H006', status: 'overdue' },
                    { id: 'vacc-206', animalId: 'animal-203', name: 'CHPPiL', date: '2025-02-20', nextDueDate: '2026-02-20', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H007', status: 'valid' },
                    { id: 'vacc-207', animalId: 'animal-206', name: 'Typhus + Coryza', date: '2025-05-10', nextDueDate: '2026-05-10', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H008', status: 'valid' },
                    { id: 'vacc-208', animalId: 'animal-207', name: 'CHPPiL', date: '2024-04-20', nextDueDate: '2025-04-20', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H009', status: 'overdue' },
                    { id: 'vacc-209', animalId: 'animal-207', name: 'Rage', date: '2024-04-20', nextDueDate: '2025-04-20', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H010', status: 'overdue' },
                    { id: 'vacc-210', animalId: 'animal-208', name: 'VHD', date: '2024-08-15', nextDueDate: '2025-08-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H011', status: 'overdue' },
                    { id: 'vacc-211', animalId: 'animal-208', name: 'Myxomatose', date: '2024-08-15', nextDueDate: '2025-02-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H012', status: 'overdue' },
                    { id: 'vacc-212', animalId: 'animal-209', name: 'Typhus + Coryza', date: '2024-09-10', nextDueDate: '2025-09-10', veterinarian: 'Dr. Martin', batchNumber: 'LOT-H013', status: 'overdue' },
                    { id: 'vacc-213', animalId: 'animal-210', name: 'CHPPiL + Rage', date: '2025-03-10', nextDueDate: '2026-03-10', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-H014', status: 'valid' }
                ],
                treatments: [
                    { id: 'treat-200', animalId: 'animal-200', name: 'Felimazole 2.5mg', type: 'Antithyroidien', prescribedDate: '2025-11-15', duration: 'A vie', dosage: '1 comprime 2x/jour', instructions: 'A donner avec la nourriture. Controle T4 dans 3 semaines.', veterinarian: 'Dr. Martin', status: 'active' },
                    { id: 'treat-201', animalId: 'animal-201', name: 'Aurizon', type: 'Traitement auriculaire', prescribedDate: '2025-10-20', duration: '14 jours', dosage: '10 gouttes/oreille 1x/jour', instructions: 'Nettoyer avant application. Masser la base de l\'oreille.', veterinarian: 'Dr. Dupont', status: 'completed' },
                    { id: 'treat-202', animalId: 'animal-202', name: 'Tobrex collyre', type: 'Antibiotique ophtalmique', prescribedDate: '2025-09-01', duration: '10 jours', dosage: '1 goutte/oeil 3x/jour', instructions: 'Nettoyer les yeux avant application.', veterinarian: 'Dr. Martin', status: 'completed' },
                    { id: 'treat-203', animalId: 'animal-206', name: 'Renal Special', type: 'Alimentation therapeutique', prescribedDate: '2025-12-01', duration: 'A vie', dosage: 'Alimentation exclusive', instructions: 'Ne plus donner d\'autre nourriture. Eau fraiche a volonte.', veterinarian: 'Dr. Martin', status: 'active' },
                    { id: 'treat-204', animalId: 'animal-206', name: 'Semintra 4mg/ml', type: 'Protecteur renal', prescribedDate: '2025-12-01', duration: 'A vie', dosage: '0.5ml 1x/jour', instructions: 'A donner le matin. Controle tension et creatinine dans 1 mois.', veterinarian: 'Dr. Martin', status: 'active' },
                    { id: 'treat-205', animalId: 'animal-207', name: 'Charbon active', type: 'Adsorbant', prescribedDate: '2025-11-08', duration: '2 jours', dosage: '1 comprime 3x/jour', instructions: 'Surveillance des selles et de l\'appetit.', veterinarian: 'Dr. Dupont', status: 'completed' },
                    { id: 'treat-206', animalId: 'animal-205', name: 'Vitamines aviaires', type: 'Complement', prescribedDate: '2025-07-15', duration: '30 jours', dosage: '2 gouttes/jour dans l\'eau', instructions: 'Changer l\'eau quotidiennement.', veterinarian: 'Dr. Martin', status: 'completed' }
                ],
                appointments: [
                    { id: 'appt-200', animalId: 'animal-200', animalName: 'Oscar', dateTime: '2026-03-05T09:00:00', duration: 30, type: 'Controle', reason: 'Controle T4 + poids', veterinarian: 'Dr. Martin', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-201', animalId: 'animal-201', animalName: 'Bella', dateTime: '2026-03-08T14:00:00', duration: 20, type: 'Controle', reason: 'Controle otite', veterinarian: 'Dr. Dupont', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-202', animalId: 'animal-203', animalName: 'Maya', dateTime: '2026-03-12T10:30:00', duration: 45, type: 'Controle', reason: 'Echo cardiaque semestrielle', veterinarian: 'Dr. Dupont', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-203', animalId: 'animal-206', animalName: 'Filou', dateTime: '2026-03-15T11:00:00', duration: 30, type: 'Controle', reason: 'Bilan renal de controle', veterinarian: 'Dr. Martin', status: 'pending', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-204', animalId: 'animal-209', animalName: 'Simba', dateTime: '2026-03-20T08:30:00', duration: 60, type: 'Chirurgie', reason: 'Sterilisation', veterinarian: 'Dr. Martin', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-205', animalId: 'animal-207', animalName: 'Tornade', dateTime: '2026-03-25T15:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel CHPPiL + Rage', veterinarian: 'Dr. Dupont', status: 'pending', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-206', animalId: 'animal-208', animalName: 'Neige', dateTime: '2026-04-02T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel VHD + Myxomatose', veterinarian: 'Dr. Martin', status: 'pending', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-207', animalId: 'animal-210', animalName: 'Lola', dateTime: '2026-04-10T14:30:00', duration: 30, type: 'Controle', reason: 'Suivi respiratoire', veterinarian: 'Dr. Dupont', status: 'pending', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-208', animalId: 'animal-200', animalName: 'Oscar', dateTime: '2025-11-15T09:00:00', duration: 30, type: 'Consultation', reason: 'Perte de poids', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-209', animalId: 'animal-201', animalName: 'Bella', dateTime: '2025-10-20T14:00:00', duration: 20, type: 'Consultation', reason: 'Otite', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-210', animalId: 'animal-202', animalName: 'Pixel', dateTime: '2025-09-01T11:00:00', duration: 20, type: 'Consultation', reason: 'Yeux qui coulent', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-211', animalId: 'animal-203', animalName: 'Maya', dateTime: '2025-08-05T10:00:00', duration: 45, type: 'Consultation', reason: 'Souffle cardiaque', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-212', animalId: 'animal-206', animalName: 'Filou', dateTime: '2025-12-01T11:00:00', duration: 30, type: 'Consultation', reason: 'Problemes renaux', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-213', animalId: 'animal-207', animalName: 'Tornade', dateTime: '2025-11-08T08:00:00', duration: 60, type: 'Urgence', reason: 'Ingestion de chocolat', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-214', animalId: 'animal-210', animalName: 'Lola', dateTime: '2025-11-25T14:30:00', duration: 30, type: 'Consultation', reason: 'Problemes respiratoires', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-215', animalId: 'animal-201', animalName: 'Bella', dateTime: '2025-04-15T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel vaccins', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-216', animalId: 'animal-200', animalName: 'Oscar', dateTime: '2025-06-10T09:30:00', duration: 20, type: 'Vaccination', reason: 'Rappel TC', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-217', animalId: 'animal-209', animalName: 'Simba', dateTime: '2025-10-05T16:00:00', duration: 20, type: 'Consultation', reason: 'Discussion sterilisation', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-200', animalId: 'animal-200', animalName: 'Oscar', title: 'Bilan sanguin complet - T4', type: 'lab', date: '2025-11-15', fileType: 'pdf', fileSize: 310000 },
                    { id: 'doc-201', animalId: 'animal-200', animalName: 'Oscar', title: 'Ordonnance Felimazole', type: 'prescription', date: '2025-11-15', fileType: 'pdf', fileSize: 95000 },
                    { id: 'doc-202', animalId: 'animal-201', animalName: 'Bella', title: 'Ordonnance Aurizon', type: 'prescription', date: '2025-10-20', fileType: 'pdf', fileSize: 88000 },
                    { id: 'doc-203', animalId: 'animal-201', animalName: 'Bella', title: 'Certificat vaccination CHPPiL + Rage', type: 'certificate', date: '2025-04-15', fileType: 'pdf', fileSize: 102000 },
                    { id: 'doc-204', animalId: 'animal-203', animalName: 'Maya', title: 'Echographie cardiaque', type: 'lab', date: '2025-08-05', fileType: 'pdf', fileSize: 2100000 },
                    { id: 'doc-205', animalId: 'animal-203', animalName: 'Maya', title: 'Compte-rendu cardiologie', type: 'report', date: '2025-08-05', fileType: 'pdf', fileSize: 185000 },
                    { id: 'doc-206', animalId: 'animal-206', animalName: 'Filou', title: 'Bilan renal complet', type: 'lab', date: '2025-12-01', fileType: 'pdf', fileSize: 280000 },
                    { id: 'doc-207', animalId: 'animal-206', animalName: 'Filou', title: 'Ordonnance Semintra + Renal Special', type: 'prescription', date: '2025-12-01', fileType: 'pdf', fileSize: 110000 },
                    { id: 'doc-208', animalId: 'animal-207', animalName: 'Tornade', title: 'Compte-rendu urgence chocolat', type: 'report', date: '2025-11-08', fileType: 'pdf', fileSize: 145000 },
                    { id: 'doc-209', animalId: 'animal-210', animalName: 'Lola', title: 'Compte-rendu brachycephale', type: 'report', date: '2025-11-25', fileType: 'pdf', fileSize: 165000 },
                    { id: 'doc-210', animalId: 'animal-202', animalName: 'Pixel', title: 'Ordonnance Tobrex', type: 'prescription', date: '2025-09-01', fileType: 'pdf', fileSize: 82000 },
                    { id: 'doc-211', animalId: 'animal-200', animalName: 'Oscar', title: 'Certificat vaccination TC', type: 'certificate', date: '2025-06-10', fileType: 'pdf', fileSize: 96000 },
                    { id: 'doc-212', animalId: 'animal-210', animalName: 'Lola', title: 'Certificat vaccination CHPPiL + Rage', type: 'certificate', date: '2025-03-10', fileType: 'pdf', fileSize: 99000 },
                    { id: 'doc-213', animalId: 'animal-209', animalName: 'Simba', title: 'Devis sterilisation', type: 'report', date: '2025-10-05', fileType: 'pdf', fileSize: 72000 }
                ],
                notifications: [
                    { id: 'notif-200', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Oscar demain a 9h - Controle T4', date: '2026-03-04T10:00:00', read: false, animalId: 'animal-200', appointmentId: 'appt-200' },
                    { id: 'notif-201', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Bella le 8 mars a 14h - Controle otite', date: '2026-03-06T10:00:00', read: false, animalId: 'animal-201', appointmentId: 'appt-201' },
                    { id: 'notif-202', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Les vaccins de Tornade (CHPPiL, Rage) sont expires depuis avril 2025', date: '2025-05-01T09:00:00', read: true, animalId: 'animal-207' },
                    { id: 'notif-203', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Le vaccin Leucose feline d\'Oscar est expire', date: '2025-06-20T09:00:00', read: true, animalId: 'animal-200' },
                    { id: 'notif-204', type: 'document_available', title: 'Nouveau document', message: 'Le bilan renal de Filou est disponible', date: '2025-12-02T08:30:00', read: false, animalId: 'animal-206', documentId: 'doc-206' },
                    { id: 'notif-205', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Les vaccins de Neige (VHD, Myxomatose) sont expires', date: '2025-09-01T09:00:00', read: true, animalId: 'animal-208' },
                    { id: 'notif-206', type: 'document_available', title: 'Nouveau document', message: 'L\'echographie cardiaque de Maya est disponible', date: '2025-08-06T08:30:00', read: true, animalId: 'animal-203', documentId: 'doc-204' },
                    { id: 'notif-207', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV sterilisation pour Simba le 20 mars a 8h30', date: '2026-03-18T10:00:00', read: false, animalId: 'animal-209', appointmentId: 'appt-204' }
                ],
                hospitalizations: [
                    {
                        id: 'hosp-200', animalId: 'animal-204', animalName: 'Caramel', animalSpecies: 'Hamster',
                        type: 'chirurgie', status: 'en_intervention', reason: 'Exerese tumeur cutanee',
                        veterinarian: 'Dr. Martin', admissionDate: '2026-03-03T08:00:00', dischargeDate: null,
                        lastUpdate: '2026-03-03T10:00:00', notes: 'Petite masse detectee flanc droit. Chirurgie programmee.',
                        steps: ['admis', 'en_preparation', 'en_intervention', 'reveil', 'observation', 'sorti'],
                        currentStep: 2,
                        timeline: [
                            { date: '2026-03-03T08:00:00', status: 'admis', description: 'Caramel admis pour chirurgie d\'exerese', photo: null },
                            { date: '2026-03-03T09:00:00', status: 'en_preparation', description: 'Preparation anesthesique en cours', photo: null },
                            { date: '2026-03-03T10:00:00', status: 'en_intervention', description: 'Intervention en cours. Dr. Martin procede a l\'exerese.', photo: { url: 'https://picsum.photos/seed/caramel-preop/400/300', caption: 'Caramel avant l\'intervention' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/caramel-preop/400/300', caption: 'Caramel avant l\'intervention', timestamp: '2026-03-03T09:00:00' }
                        ]
                    },
                    {
                        id: 'hosp-201', animalId: 'animal-211', animalName: 'Plume', animalSpecies: 'Oiseau',
                        type: 'medical', status: 'observation', reason: 'Detresse respiratoire',
                        veterinarian: 'Dr. Martin', admissionDate: '2026-03-01T11:00:00', dischargeDate: null,
                        lastUpdate: '2026-03-02T16:00:00', notes: 'Traitement antibiotique et nebulisation. Evolution favorable.',
                        steps: ['admis', 'en_soins', 'observation', 'sorti'],
                        currentStep: 2,
                        timeline: [
                            { date: '2026-03-01T11:00:00', status: 'admis', description: 'Plume admis pour difficultes respiratoires et gonflements', photo: null },
                            { date: '2026-03-01T14:00:00', status: 'en_soins', description: 'Nebulisation et antibiotiques administres. Plume est place en couveuse.', photo: { url: 'https://picsum.photos/seed/plume-couveuse/400/300', caption: 'Plume en couveuse' } },
                            { date: '2026-03-02T10:00:00', status: 'observation', description: 'Amelioration notable. Plume mange a nouveau.', photo: { url: 'https://picsum.photos/seed/plume-mieux/400/300', caption: 'Plume mange a nouveau' } }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/plume-couveuse/400/300', caption: 'Plume en couveuse', timestamp: '2026-03-01T14:00:00' },
                            { url: 'https://picsum.photos/seed/plume-mieux/400/300', caption: 'Plume mange a nouveau', timestamp: '2026-03-02T10:00:00' }
                        ]
                    }
                ]
            },

            '0600000004': {
                client: {
                    id: 'client-005',
                    firstName: 'Camille',
                    lastName: 'Moreau',
                    phone: '+33600000004',
                    email: 'camille.moreau@email.com',
                    address: { street: '3 place de la Republique', zipCode: '75003', city: 'Paris' },
                    clinic: { name: _clinicInfo.name, phone: _clinicInfo.phone, address: _clinicInfo.address, openingHours: _clinicInfo.openingHours }
                },
                animals: [
                    { id: 'animal-300', name: 'Chouquette', species: 'Chat', breed: 'Sacre de Birmanie', sex: 'F', birthDate: '2021-03-12', weight: 3.5, color: 'Seal point', microchipNumber: '250269800000020', sterilized: true, photoUrl: null },
                    { id: 'animal-301', name: 'Patou', species: 'Chien', breed: 'Cocker anglais', sex: 'M', birthDate: '2020-06-30', weight: 13.5, color: 'Roux', microchipNumber: '250269800000021', sterilized: true, photoUrl: null }
                ],
                consultations: [
                    { id: 'consult-300', animalId: 'animal-300', date: '2025-10-15', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne sante', notes: 'TC administre.', weight: 3.5, temperature: 38.4 },
                    { id: 'consult-301', animalId: 'animal-301', date: '2025-09-20', type: 'Consultation', veterinarian: 'Dr. Dupont', reason: 'Allergie cutanee', diagnosis: 'Dermatite atopique', notes: 'Traitement Apoquel prescrit. Alimentation hypoallergenique recommandee.', weight: 13.8, temperature: 38.7 }
                ],
                vaccinations: [
                    { id: 'vacc-300', animalId: 'animal-300', name: 'Typhus + Coryza', date: '2025-10-15', nextDueDate: '2026-10-15', veterinarian: 'Dr. Martin', batchNumber: 'LOT-C001', status: 'valid' },
                    { id: 'vacc-301', animalId: 'animal-301', name: 'CHPPiL', date: '2025-01-10', nextDueDate: '2026-01-10', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-C002', status: 'overdue' },
                    { id: 'vacc-302', animalId: 'animal-301', name: 'Rage', date: '2025-01-10', nextDueDate: '2026-01-10', veterinarian: 'Dr. Dupont', batchNumber: 'LOT-C003', status: 'overdue' }
                ],
                treatments: [
                    { id: 'treat-300', animalId: 'animal-301', name: 'Apoquel 5.4mg', type: 'Anti-prurigineux', prescribedDate: '2025-09-20', duration: '30 jours renouvelables', dosage: '1 comprime/jour', instructions: 'A donner avec ou sans nourriture.', veterinarian: 'Dr. Dupont', status: 'active' }
                ],
                appointments: [
                    { id: 'appt-300', animalId: 'animal-301', animalName: 'Patou', dateTime: '2026-03-15T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel CHPPiL + Rage (en retard)', veterinarian: 'Dr. Dupont', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-301', animalId: 'animal-300', animalName: 'Chouquette', dateTime: '2026-03-22T09:30:00', duration: 20, type: 'Controle', reason: 'Controle annuel', veterinarian: 'Dr. Martin', status: 'pending', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-302', animalId: 'animal-301', animalName: 'Patou', dateTime: '2026-02-10T11:00:00', duration: 20, type: 'Controle', reason: 'Suivi allergie', veterinarian: 'Dr. Dupont', status: 'cancelled', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-303', animalId: 'animal-300', animalName: 'Chouquette', dateTime: '2026-01-20T14:00:00', duration: 30, type: 'Consultation', reason: 'Vomissements ponctuels', veterinarian: 'Dr. Martin', status: 'cancelled', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-304', animalId: 'animal-300', animalName: 'Chouquette', dateTime: '2025-10-15T10:00:00', duration: 20, type: 'Vaccination', reason: 'Rappel TC', veterinarian: 'Dr. Martin', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-305', animalId: 'animal-301', animalName: 'Patou', dateTime: '2025-09-20T15:00:00', duration: 30, type: 'Consultation', reason: 'Allergie cutanee', veterinarian: 'Dr. Dupont', status: 'completed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' },
                    { id: 'appt-306', animalId: 'animal-301', animalName: 'Patou', dateTime: '2025-12-05T10:00:00', duration: 20, type: 'Controle', reason: 'Suivi dermatite', veterinarian: 'Dr. Dupont', status: 'cancelled', clinicAddress: '12 rue des Veterinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-300', animalId: 'animal-300', animalName: 'Chouquette', title: 'Certificat vaccination TC', type: 'certificate', date: '2025-10-15', fileType: 'pdf', fileSize: 97000 },
                    { id: 'doc-301', animalId: 'animal-301', animalName: 'Patou', title: 'Ordonnance Apoquel', type: 'prescription', date: '2025-09-20', fileType: 'pdf', fileSize: 105000 },
                    { id: 'doc-302', animalId: 'animal-301', animalName: 'Patou', title: 'Compte-rendu dermatologie', type: 'report', date: '2025-09-20', fileType: 'pdf', fileSize: 175000 }
                ],
                notifications: [
                    { id: 'notif-300', type: 'appointment_cancelled', title: 'RDV annule', message: 'Le RDV du 10 fevrier pour Patou a ete annule', date: '2026-02-08T14:00:00', read: false, animalId: 'animal-301', appointmentId: 'appt-302' },
                    { id: 'notif-301', type: 'vaccine_reminder', title: 'Vaccins en retard', message: 'Les vaccins de Patou (CHPPiL, Rage) sont expires. Un RDV est planifie le 15 mars.', date: '2026-01-15T09:00:00', read: true, animalId: 'animal-301' },
                    { id: 'notif-302', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Patou le 15 mars a 10h - Rappel vaccins', date: '2026-03-13T10:00:00', read: false, animalId: 'animal-301', appointmentId: 'appt-300' }
                ],
                hospitalizations: []
            },

            '0600000005': {
                _sessionExpiry: 15,
                client: {
                    id: 'client-006',
                    firstName: 'Thomas',
                    lastName: 'Petit',
                    phone: '+33600000005',
                    email: 'thomas.petit@email.com',
                    address: { street: '7 rue de Rivoli', zipCode: '75004', city: 'Paris' },
                    clinic: { name: _clinicInfo.name, phone: _clinicInfo.phone, address: _clinicInfo.address, openingHours: _clinicInfo.openingHours }
                },
                animals: [
                    { id: 'animal-400', name: 'Gizmo', species: 'Chat', breed: 'Europeen', sex: 'M', birthDate: '2021-09-15', weight: 4.0, color: 'Noir', microchipNumber: '250269800000030', sterilized: true, photoUrl: null }
                ],
                consultations: [
                    { id: 'consult-400', animalId: 'animal-400', date: '2025-11-10', type: 'Vaccination', veterinarian: 'Dr. Martin', reason: 'Rappel annuel', diagnosis: 'Bonne sante', notes: 'TC administre.', weight: 4.0, temperature: 38.5 }
                ],
                vaccinations: [
                    { id: 'vacc-400', animalId: 'animal-400', name: 'Typhus + Coryza', date: '2025-11-10', nextDueDate: '2026-11-10', veterinarian: 'Dr. Martin', batchNumber: 'LOT-T001', status: 'valid' }
                ],
                treatments: [],
                appointments: [
                    { id: 'appt-400', animalId: 'animal-400', animalName: 'Gizmo', dateTime: '2026-04-15T10:00:00', duration: 20, type: 'Controle', reason: 'Controle annuel', veterinarian: 'Dr. Martin', status: 'confirmed', clinicAddress: '12 rue des Veterinaires, 75015 Paris' }
                ],
                documents: [
                    { id: 'doc-400', animalId: 'animal-400', animalName: 'Gizmo', title: 'Certificat vaccination TC', type: 'certificate', date: '2025-11-10', fileType: 'pdf', fileSize: 94000 }
                ],
                notifications: [
                    { id: 'notif-400', type: 'appointment_reminder', title: 'Rappel RDV', message: 'RDV pour Gizmo le 15 avril a 10h', date: '2026-04-13T10:00:00', read: false, animalId: 'animal-400', appointmentId: 'appt-400' }
                ],
                hospitalizations: [
                    {
                        id: 'hosp-400', animalId: 'animal-400', animalName: 'Gizmo', animalSpecies: 'Chat',
                        type: 'chirurgie', status: 'sorti', reason: 'Fracture patte avant droite',
                        veterinarian: 'Dr. Dupont', admissionDate: '2026-01-20T09:00:00', dischargeDate: '2026-01-22T14:00:00',
                        lastUpdate: '2026-01-22T14:00:00', notes: 'Osteosynthese reussie. Repos strict 6 semaines.',
                        steps: ['admis', 'en_preparation', 'en_intervention', 'reveil', 'observation', 'sorti'],
                        currentStep: 5,
                        timeline: [
                            { date: '2026-01-20T09:00:00', status: 'admis', description: 'Gizmo admis pour fracture suite a une chute', photo: null },
                            { date: '2026-01-20T10:30:00', status: 'en_preparation', description: 'Bilan pre-operatoire et radiographies', photo: null },
                            { date: '2026-01-20T13:00:00', status: 'en_intervention', description: 'Osteosynthese en cours — pose de broches', photo: null },
                            { date: '2026-01-20T15:00:00', status: 'reveil', description: 'Gizmo se reveille. Operation reussie.', photo: { url: 'https://picsum.photos/seed/gizmo-reveil/400/300', caption: 'Gizmo apres l\'operation' } },
                            { date: '2026-01-21T09:00:00', status: 'observation', description: 'Gizmo mange et se deplace prudemment. Tout va bien.', photo: { url: 'https://picsum.photos/seed/gizmo-repos/400/300', caption: 'Gizmo se repose' } },
                            { date: '2026-01-22T14:00:00', status: 'sorti', description: 'Gizmo peut rentrer. Controle radiographique dans 3 semaines.', photo: null }
                        ],
                        photos: [
                            { url: 'https://picsum.photos/seed/gizmo-reveil/400/300', caption: 'Gizmo apres l\'operation', timestamp: '2026-01-20T15:00:00' },
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
