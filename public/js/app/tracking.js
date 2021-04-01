
define(['piwik'], function() {
    var _paq = window._paq = window._paq || [];

    var u=(("https:" == document.location.protocol) ? "https" : "http") + "://analytics.straubdev.com/";

    _paq.push(["setTrackerUrl", u+"piwik.php"]);
    _paq.push(["setSiteId", "4"]);

    _paq.push(["trackPageView"]);
    _paq.push(["enableLinkTracking"]);
});
