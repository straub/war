
var requireConfig = {
    baseUrl: '/public/js/vendor',
    waitSeconds: 15,
    paths: {
        'war': '../war',
        'app': '../app',
        'socket.io': '/socket.io/socket.io.js',
        'jquery': ['//ajax.googleapis.com/ajax/libs/jquery/1.10.1/jquery.min','jquery']
    },
    shim: {
        'jquery': {
            exports: '$'
        },
        'backbone': {
            deps: ['underscore', 'jquery'],
            exports: 'Backbone'
        },
        'underscore': {
            exports: '_'
        },
        'bootstrap': {
            deps: ['jquery']
        },
        'sylvester': {
            exports: 'Vector'
        }
    }
};

if (typeof require !== 'undefined' && require.config) {
    require.config(requireConfig);
} else if (typeof require === 'undefined') {
    var require = requireConfig;
}
