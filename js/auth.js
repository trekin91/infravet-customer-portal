var Auth = (function () {
    'use strict';

    var _phoneNumber = '';
    var _resendTimer = null;
    var _clientData = null;
    var _otpFailCount = 0;
    var _otpLocked = false;

    function getClientData() {
        return _clientData;
    }

    function checkSession() {
        if (!API.token.exists()) {
            _clientData = null;
            return Promise.resolve(false);
        }
        return API.auth.me()
            .then(function (data) {
                _clientData = data;
                return true;
            })
            .catch(function () {
                _clientData = null;
                API.token.clear();
                return false;
            });
    }

    function showLoginScreen() {
        _clientData = null;
        document.getElementById('auth-screen').hidden = false;
        document.getElementById('app-shell').hidden = true;
        _showPhoneStep();
    }

    function showApp() {
        document.getElementById('auth-screen').hidden = true;
        document.getElementById('app-shell').hidden = false;
    }

    function _showPhoneStep() {
        document.getElementById('auth-phone-step').hidden = false;
        document.getElementById('auth-otp-step').hidden = true;
        _otpFailCount = 0;
        _otpLocked = false;
        var phoneInput = Utils.$('#phone-input');
        if (phoneInput) {
            phoneInput.value = '';
            phoneInput.focus();
        }
        var submitBtn = Utils.$('#phone-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Recevoir mon code';
        }
    }

    function _showOtpStep() {
        document.getElementById('auth-phone-step').hidden = true;
        document.getElementById('auth-otp-step').hidden = false;
        var displayEl = Utils.$('#otp-phone-display');
        if (displayEl) displayEl.textContent = Utils.formatPhoneDisplay(_phoneNumber);
        Utils.$$('.otp-input').forEach(function (i) { i.value = ''; });
        var firstInput = Utils.$('.otp-input[data-index="0"]');
        if (firstInput) firstInput.focus();
        _startResendTimer();
    }

    function _initOtpInputs() {
        var inputs = Utils.$$('.otp-input');
        inputs.forEach(function (input, index) {
            input.addEventListener('input', function (e) {
                var val = e.target.value.replace(/\D/g, '');
                e.target.value = val.slice(0, 1);
                if (val && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
                if (_getOtpValue().length === InfravetConfig.OTP_LENGTH) {
                    _handleVerifyOtp();
                }
            });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });
            input.addEventListener('paste', function (e) {
                e.preventDefault();
                var pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                for (var i = 0; i < Math.min(pasted.length, inputs.length); i++) {
                    inputs[i].value = pasted[i];
                }
                if (pasted.length >= InfravetConfig.OTP_LENGTH) {
                    _handleVerifyOtp();
                } else if (pasted.length > 0) {
                    inputs[Math.min(pasted.length, inputs.length - 1)].focus();
                }
            });
        });
    }

    function _getOtpValue() {
        return Utils.$$('.otp-input').map(function (i) { return i.value; }).join('');
    }

    function _startResendTimer() {
        var seconds = InfravetConfig.OTP_RESEND_DELAY_SECONDS;
        var btn = Utils.$('#otp-resend-btn');
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = 'Renvoyer (' + seconds + 's)';
        if (_resendTimer) clearInterval(_resendTimer);
        _resendTimer = setInterval(function () {
            seconds--;
            btn.textContent = 'Renvoyer (' + seconds + 's)';
            if (seconds <= 0) {
                clearInterval(_resendTimer);
                _resendTimer = null;
                btn.disabled = false;
                btn.textContent = 'Renvoyer le code';
            }
        }, 1000);
    }

    function _handleSendOtp(e) {
        if (e) e.preventDefault();
        var phoneInput = Utils.$('#phone-input');
        var phone = phoneInput.value.trim();

        if (!Utils.isValidFrenchPhone(phone)) {
            Utils.showToast('Numero de telephone invalide', 'error');
            phoneInput.classList.add('input--error');
            return;
        }

        phoneInput.classList.remove('input--error');
        _phoneNumber = phone;

        var submitBtn = Utils.$('#phone-submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi...';

        API.auth.sendOtp(phone)
            .then(function () {
                _showOtpStep();
            })
            .catch(function (err) {
                if (err.status === 404) {
                    Utils.showToast('Aucun compte client trouve pour ce numero.', 'error');
                } else {
                    Utils.showToast(err.message || "Erreur lors de l'envoi du code", 'error');
                }
            })
            .finally(function () {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Recevoir mon code';
            });
    }

    function _handleVerifyOtp() {
        var code = _getOtpValue();
        if (code.length !== InfravetConfig.OTP_LENGTH) return;
        if (_otpLocked) {
            Utils.showToast('Trop de tentatives. Patientez avant de reessayer.', 'warning');
            return;
        }

        Utils.showLoading();

        API.auth.verifyOtp(_phoneNumber, code)
            .then(function (data) {
                _otpFailCount = 0;
                _clientData = data.client || data;
                showApp();
                if (typeof App !== 'undefined' && App.onLogin) {
                    App.onLogin();
                }
            })
            .catch(function (err) {
                if (err.status === 400 || err.status === 401) {
                    _otpFailCount++;
                    if (_otpFailCount >= 5) {
                        _otpLocked = true;
                        var lockDuration = Math.min(_otpFailCount * 10, 60);
                        Utils.showToast('Trop de tentatives. Reessayez dans ' + lockDuration + 's.', 'error');
                        setTimeout(function () { _otpLocked = false; }, lockDuration * 1000);
                    } else {
                        Utils.showToast('Code incorrect. Veuillez reessayer.', 'error');
                    }
                    Utils.$$('.otp-input').forEach(function (i) { i.value = ''; });
                    var first = Utils.$('.otp-input[data-index="0"]');
                    if (first) first.focus();
                } else {
                    Utils.showToast(err.message || 'Erreur de verification', 'error');
                }
            })
            .finally(function () {
                Utils.hideLoading();
            });
    }

    function _handleResendOtp() {
        API.auth.sendOtp(_phoneNumber)
            .then(function () {
                Utils.showToast('Code renvoye', 'success');
                _startResendTimer();
            })
            .catch(function () {
                Utils.showToast('Impossible de renvoyer le code', 'error');
            });
    }

    function logout() {
        if (!confirm('Voulez-vous vraiment vous deconnecter ?')) return;
        if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
        API.auth.logout()
            .catch(function () {})
            .finally(function () {
                _clientData = null;
                API.token.clear();
                try { sessionStorage.clear(); } catch (e) {}
                showLoginScreen();
                if (typeof App !== 'undefined' && App.onLogout) {
                    App.onLogout();
                }
            });
    }

    function _forceLogout() {
        if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
        _clientData = null;
        API.token.clear();
        try {
            var currentPage = typeof Router !== 'undefined' ? Router.getCurrentPage() : '';
            if (currentPage) sessionStorage.setItem('infravet_session_page', currentPage);
        } catch (e) {}
        Utils.showToast('Votre session a expire. Veuillez vous reconnecter.', 'warning');
        showLoginScreen();
        if (typeof App !== 'undefined' && App.onLogout) {
            App.onLogout();
        }
    }

    function init() {
        var phoneForm = Utils.$('#phone-form');
        if (phoneForm) phoneForm.addEventListener('submit', _handleSendOtp);

        var resendBtn = Utils.$('#otp-resend-btn');
        if (resendBtn) resendBtn.addEventListener('click', _handleResendOtp);

        var backBtn = Utils.$('#otp-back-btn');
        if (backBtn) backBtn.addEventListener('click', _showPhoneStep);

        _initOtpInputs();

        window.addEventListener('session-expired', _forceLogout);
    }

    return {
        init: init,
        checkSession: checkSession,
        getClientData: getClientData,
        showLoginScreen: showLoginScreen,
        showApp: showApp,
        logout: logout
    };
})();
