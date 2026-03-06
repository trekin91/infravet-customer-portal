var InfravetConfig = (function () {
    'use strict';

    var isDev = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'
        || window.location.hostname.endsWith('.github.io');

    var config = {
        API_BASE_URL: '/api/customer-portal',

        APP_VERSION: '0.0.1',

        OTP_LENGTH: 6,
        OTP_RESEND_DELAY_SECONDS: 60,

        VAPID_PUBLIC_KEY: '',

        ANIMATION_DURATION_MS: 250,
        TOAST_DURATION_MS: 4000,
        DEBOUNCE_MS: 300,

        DEFAULT_PAGE_SIZE: 20,

        FEATURES: {
            PUSH_NOTIFICATIONS: true,
            MOCK_API: isDev,
            DEBUG_LOG: isDev
        }
    };

    if (window.INFRAVET_CONFIG) {
        Object.keys(window.INFRAVET_CONFIG).forEach(function (key) {
            if (key !== 'FEATURES') config[key] = window.INFRAVET_CONFIG[key];
        });
    }

    return Object.freeze(config);
})();
