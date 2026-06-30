'use strict';
// Hydra front-end identifier
window['isHydraFE'] = true;

/** Handle blocked cookies */
try {
    window.localStorage;
} catch(e) {
    window.location.href = '/public/static-content/blocked-cookies/blocked-cookies.html';
}


/** Handle browser support */
// Opera
var isOpera = [navigator.userAgent.indexOf('Opera'), navigator.userAgent.indexOf('OPR')]
        .some(index => index !== -1);
// Firefox
var isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
// Safari
var isSafari = navigator.userAgent.indexOf('Safari') !== -1;
// Internet Explorer 6-11
var isIE = /*@cc_on!@*/ false || !!document.documentMode;
// Edge 20+
var isEdge = !isIE && !!window.StyleMedia;
// Chrome
var isChrome = navigator.userAgent.indexOf('Chrome') !== -1;
// Facebook or Instagram
var fbOrInstagram =
    navigator.userAgent.indexOf('Instagram') !== -1 ||
    (!!navigator.userAgent.match(/(iPod|iPhone|iPad)/) &&
        !!navigator.userAgent.match(/FBAV|FBBV|FBAN/i));
//IE 9+
var ie10AndBelow = navigator.userAgent.indexOf('MSIE') !== -1;
var isIE10 = navigator.appVersion.indexOf('MSIE 10.') !== -1;
//LinkedIn
var isLinkedin = navigator.userAgent.indexOf('LinkedInApp') !== -1 ||
    navigator.userAgent.indexOf('LinkedInBot') !== -1;

if (
    (!fbOrInstagram &&
        !isFirefox &&
        !isSafari &&
        !isEdge &&
        !isChrome &&
        !isOpera &&
        !isLinkedin &&
        !isIE) ||
    (isIE && ie10AndBelow && !isIE10)
) {
    window.location.href = '/public/static-content/browser-support/unsupported-browser.html';
}




function isCrossOrigin() {
    try {
        return !window.parent.location.hostname;
    } catch (e) {
        return true;
    }
}

/** Handle legacy url */
if (self !== window.parent) {
    if (
        !isCrossOrigin() &&
        window.parent.hasOwnProperty('isHydraFE') &&
        window.parent['isHydraFE'] === true
    ) {
        /**
         * If the the URL contains /legacy/ and angular is somehow placed inside an iframe - remove /legacy/
         */
        window.location.href = window.location.href.replace(/\/legacy\//g, '/');
    }
}
