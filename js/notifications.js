var Notifications = (function () {
    'use strict';

    function isSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    function requestPermission() {
        if (!isSupported()) return Promise.resolve(false);
        if (Notification.permission === 'granted') {
            return _subscribe();
        }
        if (Notification.permission === 'denied') {
            if (InfravetConfig.FEATURES.DEBUG_LOG) console.log('[Notifications] Permission denied');
            return Promise.resolve(false);
        }
        return Notification.requestPermission().then(function (permission) {
            if (permission === 'granted') return _subscribe();
            return false;
        });
    }

    function _subscribe() {
        if (!InfravetConfig.VAPID_PUBLIC_KEY) {
            if (InfravetConfig.FEATURES.DEBUG_LOG) console.log('[Notifications] No VAPID key configured');
            return Promise.resolve(false);
        }
        return navigator.serviceWorker.ready.then(function (registration) {
            return registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: _urlBase64ToUint8Array(InfravetConfig.VAPID_PUBLIC_KEY)
            });
        }).then(function (subscription) {
            return API.push.subscribe(subscription.toJSON()).then(function () { return true; });
        }).catch(function (err) {
            if (InfravetConfig.FEATURES.DEBUG_LOG) console.error('[Notifications] Subscribe failed:', err);
            return false;
        });
    }

    function unsubscribe() {
        if (!isSupported()) return Promise.resolve();
        return navigator.serviceWorker.ready.then(function (registration) {
            return registration.pushManager.getSubscription();
        }).then(function (subscription) {
            if (!subscription) return;
            var endpoint = subscription.endpoint;
            return subscription.unsubscribe().then(function () {
                return API.push.unsubscribe(endpoint);
            });
        }).catch(function (err) {
            if (InfravetConfig.FEATURES.DEBUG_LOG) console.error('[Notifications] Unsubscribe failed:', err);
        });
    }

    function getPermissionState() {
        if (!isSupported()) return 'unsupported';
        return Notification.permission;
    }

    function _urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData;
        try { rawData = window.atob(base64); } catch (e) { throw new Error('VAPID key invalide'); }
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    return {
        isSupported: isSupported,
        requestPermission: requestPermission,
        unsubscribe: unsubscribe,
        getPermissionState: getPermissionState
    };
})();
