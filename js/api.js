var API = (function () {
    'use strict';

    var _pendingRequests = new Map();
    var _TOKEN_KEY = 'infravet_auth_token';

    function _getToken() {
        try { return localStorage.getItem(_TOKEN_KEY); } catch (e) { return null; }
    }

    function _setToken(token) {
        try { if (token) localStorage.setItem(_TOKEN_KEY, token); } catch (e) {}
    }

    function _removeToken() {
        try { localStorage.removeItem(_TOKEN_KEY); } catch (e) {}
    }

    function _request(method, endpoint, body, options) {
        options = options || {};
        var url = InfravetConfig.API_BASE_URL + endpoint;

        if (options.params) {
            var qs = Object.keys(options.params)
                .filter(function (k) { return options.params[k] !== null && options.params[k] !== undefined; })
                .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(options.params[k]); })
                .join('&');
            if (qs) url += '?' + qs;
        }

        var headers = { 'Accept': 'application/json' };
        var token = _getToken();
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }

        var fetchOptions = {
            method: method,
            headers: headers
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        }

        var requestKey = method === 'GET' ? method + ':' + url : null;
        if (requestKey && _pendingRequests.has(requestKey)) {
            return _pendingRequests.get(requestKey);
        }

        var promise = fetch(url, fetchOptions)
            .then(function (response) {
                if (requestKey) _pendingRequests.delete(requestKey);

                if (response.status === 401 && !options.skipAuthRedirect) {
                    _removeToken();
                    window.dispatchEvent(new CustomEvent('session-expired'));
                    return Promise.reject({ status: 401, message: 'Session expiree. Veuillez vous reconnecter.' });
                }

                if (!response.ok) {
                    return response.json().catch(function () {
                        return { message: 'Erreur serveur' };
                    }).then(function (errBody) {
                        return Promise.reject({
                            status: response.status,
                            message: errBody.message || errBody.error || 'Erreur inconnue',
                            details: InfravetConfig.FEATURES.DEBUG_LOG ? errBody : undefined
                        });
                    });
                }

                if (response.status === 204) return null;
                return response.json().then(function (json) {
                    return json.data !== undefined ? json.data : json;
                });
            })
            .catch(function (err) {
                if (requestKey) _pendingRequests.delete(requestKey);

                if (err instanceof TypeError && err.message.includes('fetch')) {
                    Utils.showToast('Connexion impossible. Verifiez votre connexion internet.', 'error');
                    return Promise.reject({ status: 0, message: 'Network error', offline: true });
                }

                return Promise.reject(err);
            });

        if (requestKey) _pendingRequests.set(requestKey, promise);
        return promise;
    }

    return {
        auth: {
            sendOtp: function (phoneNumber) {
                return _request('POST', '/auth-request-code', { phone: phoneNumber }, { skipAuthRedirect: true });
            },
            verifyOtp: function (phoneNumber, otpCode) {
                return _request('POST', '/auth-verify-code', { phone: phoneNumber, code: otpCode }, { skipAuthRedirect: true })
                    .then(function (data) {
                        if (data && data.token) _setToken(data.token);
                        return data;
                    });
            },
            me: function () {
                return _request('GET', '/profile', null, { skipAuthRedirect: true });
            },
            logout: function () {
                return _request('POST', '/auth-logout')
                    .finally(function () { _removeToken(); });
            }
        },

        client: {
            getProfile: function () {
                return _request('GET', '/profile');
            },
            updateProfile: function (data) {
                return _request('PUT', '/profile', data);
            },
            getNotificationSettings: function () {
                return _request('GET', '/notifications/settings');
            },
            updateNotificationSettings: function (settings) {
                return _request('PUT', '/notifications/settings', settings);
            }
        },

        animals: {
            list: function () {
                return _request('GET', '/animals');
            },
            get: function (animalId) {
                return _request('GET', '/animals/' + animalId);
            },
            getConsultations: function (animalId, params) {
                return _request('GET', '/animals/' + animalId + '/consultations', null, { params: params });
            },
            getVaccinations: function (animalId) {
                return _request('GET', '/animals/' + animalId + '/vaccinations');
            },
            getTreatments: function (animalId) {
                return _request('GET', '/animals/' + animalId + '/treatments');
            },
            getWeights: function (animalId) {
                return _request('GET', '/animals/' + animalId + '/weights');
            }
        },

        appointments: {
            list: function (params) {
                return _request('GET', '/appointments', null, { params: params });
            },
            get: function (appointmentId) {
                return _request('GET', '/appointments/' + appointmentId);
            },
            cancel: function (appointmentId, reason) {
                return _request('POST', '/appointments/' + appointmentId + '/cancel', { reason: reason });
            }
        },

        documents: {
            list: function (params) {
                return _request('GET', '/documents', null, { params: params });
            },
            getDownloadUrl: function (documentId) {
                return _request('GET', '/documents/' + documentId + '/download');
            }
        },

        hospitalizations: {
            list: function (params) {
                return _request('GET', '/hospitalizations', null, { params: params });
            },
            get: function (hospitalizationId) {
                return _request('GET', '/hospitalizations/' + hospitalizationId);
            }
        },

        dashboard: {
            getSummary: function () {
                return _request('GET', '/dashboard/summary');
            }
        },

        clinic: {
            getInfo: function () {
                return _request('GET', '/clinic/info', null, { skipAuthRedirect: true });
            }
        },

        push: {
            subscribe: function (subscription) {
                return _request('POST', '/push/subscribe', subscription);
            },
            unsubscribe: function (endpoint) {
                return _request('POST', '/push/unsubscribe', { endpoint: endpoint });
            }
        },

        token: {
            exists: function () { return !!_getToken(); },
            clear: function () { _removeToken(); }
        }
    };
})();
