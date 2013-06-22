
define([
    'jquery','underscore','backbone','sylvester','stats',
    'app/models/entity','app/alea','app/averager','app/views/app'],
function ($, _, Backbone, Vector, Stats, Entity, Alea, SimpleMovingAverager, AppView) {

var app = {};

return (function War($, _, window, document, undefined) {
    var self = this;

    this.frequency = {};

    // Support seed being passed by query string,
    // for reproducability.
    this.randomSeed = getParameterByName("seed") || Math.random();
    this.random = new Alea(app.randomSeed);

    this.initialSpawnNum = getParameterByName("spawn") || 10*4;

    this.recordTiming = false;

    this.drawFlockMesh = false;
    this.drawRanges = false;
    this.drawVectors = false;
    this.drawHealthIndicators = false;
    this.drawAIIndicators = false;

    this.pause = false;
    this.haltRender = false;

    this.viewportWidth = window.innerWidth || $(window).width() || 1800;
    this.viewportHeight = window.innerHeight || $(window).height() || 800;

    this.viewportX = 0;
    this.viewportY = 0;

    this.worldWidth = this.viewportWidth;
    this.worldHeight = this.viewportHeight;

    this.killStats = {};
    this.entityCounts = { Entity: 0, Proj: 0 };

    var EntityView = Entity.View;

    var EntityCollection = Entity.Collection;

    var Proj = Entity.Proj;

    var frameRateAverager = new SimpleMovingAverager(3);

    try{
        this.stats = new Stats();
        this.stats.setMode(1);
    } catch(e) {
        console.warn(e);
    }

    this.framesSeen = 0;
    this.lastSecond = 0;
    this.frameRate = 0;
    this.lastAnimationTime = 0;
    this.baseTickLength = 18;
    this.tickLength = this.baseTickLength;

    this.startTime = 0;
    this.tickCount = 0;

    this.tickPhase = 0;
    this.tickPhaseLength = 100;

    this.tick = function tick(time) {
        if (app.pause) return;

        this.stats.begin();

        if (time) {
            time = this.startTime + this.tickCount*this.baseTickLength;
            app.tickLength = time - app.lastTickTime;
        } else {
            this.startTime = (new Date()).getTime();
        }

        // This is above the entity loops so the player
        // can fire his own weapons before autoFire kicks in.
        if (app.mousedown) app.view.firePlayerControlled();

        var entity,
            entitiesLength = this.entities.length;

        // The hot tick loop.
        for (var i = 0; i < entitiesLength; i++) {
            entity = this.entities.at(i);
            entity && entity.tick(time, i, entitiesLength);
        };

        this.entities.sortEntities();

        this.tickCount++;
        this.tickPhase++;
        if (this.tickPhase > this.tickPhaseLength) this.tickPhase = 0;

        this.stats.end();

        this.lastTickTime = (new Date()).getTime();
    };

    this.draw = function draw() {

        // The overlay layer should not persist,
        // so we have to clear it every frame.
        if (!app.haltRender) this.overlayCtx.clearRect(0, 0, app.overlay.width, app.overlay.height);

        var entity,
            entitiesLength = this.entities.length;

        // The hot draw loop.
        for (var i = 0; i < entitiesLength; i++) {
            entity = this.entities.at(i);
            entity && entity.draw();
        };

        /*if(!app.haltRender){
            // Fade out the backdrop layer.
            this.backdropCtx.fillStyle="#ffffff";
            this.backdropCtx.globalAlpha=0.02;
            this.backdropCtx.fillRect(0,0,app.viewportWidth,app.viewportHeight);
            this.backdropCtx.globalAlpha=1;
        }*/
    };

    this.ticksPerSecond = 40;
    this._requestAnimationFrameId = undefined;

    this.run = (function () {
        var loops = 0,
            skipTicks = 1000 / app.ticksPerSecond,
            maxFrameSkip = 10,
            nextGameTick = (new Date()).getTime();

        return function run(time) {
            loops = 0;

            while ((new Date()).getTime() > nextGameTick && loops < maxFrameSkip) {
                app.tick(time);
                nextGameTick += skipTicks;
                loops++;
            }

            // Skip ahead if we go too far behind.
            if (loops >= maxFrameSkip)
                nextGameTick = (new Date()).getTime();

            if (loops) // Don't bother drawing if nothing changed.
                app.draw();

            app._requestAnimationFrameId = window.requestAnimationFrame(run);
        };
    })();

    this.halt = function () {
        window.cancelAnimationFrame(app._requestAnimationFrameId);
    };

    // Utility function for playing
    // with the entities via the console.
    this.updateAll = function (attr, value) {
        this.entities.each(function(it){ it.attributes[attr] = value; });
    };

    this.toJSON = function () {
        return {
            startTime: this.startTime,
            tickCount: this.tickCount,
            tickPhase: this.tickPhase,
            tickPhaseLength: this.tickPhaseLength,

            random: {
                state: _.extend({}, this.random.state)
            },

            entities: this.entities,

            killStats: this.killStats
        };
    };

    this.image = function () {
        var image,
            oldPause = this.pause;
        this.pause = true;
        image = JSON.stringify(this);
        this.pause = oldPause;
        return image;
    };

    this.load = function(image) {
        var newApp = typeof(image) === "string" ? JSON.parse(image) : image,
            newEntities,

            oldPause = this.pause;
        this.pause = true;

        newEntities = _(newApp.entities).chain().map(function (ent) {

            ent.pos = Vector.create(ent.pos);
            ent.vel = Vector.create(ent.vel);
            ent.accel = Vector.create(ent.accel);
            ent.jerk = Vector.create(ent.jerk);

            if(ent.isProj){
                ent = new Proj(ent);
                new ProjView({ model: ent });
            } else {
                ent = new Entity(ent);
                new EntityView({ model: ent });
            }

            return ent;
        }).map(function (ent, i, newEntities) {
            if (!ent.get("isProj")) return ent;

            var self = ent;
            ent.attributes.firedBy = _(newEntities).find(function (ent) {
                return ent.id === self.attributes.firedBy.id;
            });
            ent.attributes.firedAt = _(newEntities).find(function (ent) {
                return ent.id === self.attributes.firedAt.id;
            });

            return ent;
        }).value();

        // Clear the indexes
        this.entities.indexes = {};
        this.entities.reset(newEntities);
        this.entities.sortEntities();

        this.startTime = newApp.startTime;
        this.tickCount = newApp.tickCount;
        this.tickPhase = newApp.tickPhase;
        this.tickPhaseLength = newApp.tickPhaseLength;

        this.killStats = newApp.killStats;
        app.view.renderKillStats();

        _.extend(this.random.state, newApp.random.state);

        this.pause = oldPause;
    };

    this.getEntDist = function (a,b) {
        return app.entities.find(function (ent) { return ent.id === a; }).get("pos").distanceFrom(app.entities.find(function(ent) { return ent.id === b; }).get("pos"));
    };

    this.startup = function (e) {
        this.view = new AppView();

        // The first tick doesn't receive a time.
        this.run();
    };

    $(window).resize(function(){
        app.view.resizeViewport(window.innerWidth || $(window).width(), window.innerHeight || $(window).height());
    });

    this.launchFullScreen = function launchFullScreen(element) {
      if(element.requestFullScreen) {
        element.requestFullScreen();
      } else if(element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if(element.webkitRequestFullScreen) {
        element.webkitRequestFullScreen();
      }
    };

    this.cancelFullscreen = function cancelFullscreen() {
      if(document.cancelFullScreen) {
        document.cancelFullScreen();
      } else if(document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if(document.webkitCancelFullScreen) {
        document.webkitCancelFullScreen();
      }
    };

    this.toggleFullscreen = function (element) {
        if(document.fullscreenEnabled || document.mozFullscreenEnabled || document.webkitFullscreenEnabled){
            app.cancelFullscreen();
        } else {
            app.launchFullScreen(element || document.documentElement);
        }
    };

    // Reimplemented from Sylvester so it uses
    // app.random() and is reproducable.
    this.randVector = function () {
        var n = 2,
            elements = [];
        do { elements.push(app.random());
        } while (--n);
        // Currently use 3 dimensional vectors,
        // but all Z dimensions are zero.
        elements.push(0);
        return Vector.create(elements);
    };

    // From http://stackoverflow.com/a/901144
    function getParameterByName(name) {
      name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
      var regexS = "[\\?&]" + name + "=([^&#]*)";
      var regex = new RegExp(regexS);
      var results = regex.exec(window.location.search);
      if(!results)
        return "";
      else
        return decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    return self;

// End namespace setup
}).call(app, jQuery, window._, window, document);
});

(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame =
          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
              app.haltRender ? 0 : timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };
}());



