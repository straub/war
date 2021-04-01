
define([
    'jquery','backbone','app/vector',
    'app/models/entity','app/models/app','app/views/settings'
    ], function ($, Backbone, Vector, Entity, AppModel, SettingsView) {

    var EntityCollection = Entity.Collection;

    var AppView = Backbone.View.extend({
        el: 'body',

        initialize: function () {
            var $el = this.$el;

            this.model = new AppModel();

            this.keysPressed = {};
            $(window).on("keydown", _.bind(this.recordKeydown, this));
            $(window).on("keyup", _.bind(this.recordKeyup, this));

            $el.css({
                width: app.viewportWidth,
                height: app.viewportHeight
            });

            var entities = this.model.entities = app.entities = new EntityCollection();
            var particles = this.model.particles = app.particles = new EntityCollection();

            entities.spawnEntities(app.initialSpawnNum);
            /*entities.spawnEntity({
                playerControlled: true
            });*/

            var backdrop = app.backdrop = $("#backdrop")[0];
            backdrop.width = app.viewportWidth;
            backdrop.height = app.viewportHeight;

            var overlay = app.overlay = $("#overlay")[0];
            overlay.width = app.viewportWidth;
            overlay.height = app.viewportHeight;

            app.backdropCtx = backdrop.getContext("2d");
            app.overlayCtx = overlay.getContext("2d");

            this.settingsView = new SettingsView();

            $("body").on("click", ".fullscreen", function (e) {
                e.preventDefault();
                app.launchFullScreen(document.documentElement);
            });

            if (app.stats)
                $(app.stats.domElement)
                    .css({
                        position: 'absolute',
                        top: '0px',
                        right: '0px',
                        'z-index': 4
                    })
                    .appendTo($el);
        },

        events: {
            // any user events (clicks etc) we want to respond to
            "mousemove": "recordMousemove",
            "mousedown": "recordMousedown",
            "mouseup": "recordMouseup"
        },

        recordMousemove: function (e) {
            var offset = this.$el.offset();

            app.mouseX = e.pageX-offset.left,
            app.mouseY = e.pageY-offset.top;
        },
        recordMousedown: function (e) {
            app.mousedown = true;
        },
        recordMouseup: function (e) {
            app.mousedown = false;
        },
        recordKeydown: function (e) {
            this.keysPressed[e.keyCode] = e.keyCode;
        },
        recordKeyup: function (e) {
            this.keysPressed[e.keyCode] = false;
        },

        handleClick: function (e) {
        },

        firePlayerControlled: function () {
            var pos = Vector.create(app.mouseX, app.mouseY),
            time = (new Date()).getTime();

            app.entities.chain().filter(function(ent){
                return ent.get("playerControlled") && ent.canFire(time, /* playerControlled */ true);
            }).each(function(ent){
                ent.fireProjectileAtVect(time, pos);
            });
        },

        renderKillStats: function () {
            $(".kill-stats").html("");

            _(app.killStats).chain().pairs().sort(function(a,b){
                var aSum = a[1].kills-a[1].deaths,
                    bSum = b[1].kills-b[1].deaths;
                return bSum > aSum ? 1 : bSum < aSum ? -1 : 0;
            }).each(function(stats){
                var color = stats[0],
                    elem = $("<li></li>");
                    stats = stats[1];

                elem.text((stats.kills-stats.deaths)+" ("+stats.kills+"/"+stats.deaths+")").css({ color: Entity.colorMap[color] || color });

                $(".kill-stats").append(elem);
            });
        },

        resizeViewport: function (width, height) {
            app.viewportWidth = width || 1800;
            app.viewportHeight = height || 800;

            app.view.$el.css({
                width: app.viewportWidth,
                height: app.viewportHeight
            });

            var backdrop = $("#backdrop")[0];
            backdrop.width = app.viewportWidth;
            backdrop.height = app.viewportHeight;

            var overlay = $("#overlay")[0];
            overlay.width = app.viewportWidth;
            overlay.height = app.viewportHeight;
        }
    });

    return AppView;
});
