
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame =
          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    // Temporarily disabling the realRequestAnimationFrame
    // because it wasn't giving good performance.
    //if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());

// From http://baagoe.com/en/RandomMusings/javascript/
// Johannes Baagøe <baagoe@baagoe.com>, 2010
function Mash() {
  var n = 0xefc8249d;

  var mash = function(data) {
    data = data.toString();
    for (var i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      var h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000; // 2^32
    }
    return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
  };

  mash.version = 'Mash 0.9';
  return mash;
}

// From http://baagoe.com/en/RandomMusings/javascript/
function Alea() {
  return (function(args) {
    // Johannes Baagøe <baagoe@baagoe.com>, 2010
    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    var c = 1;

    if (!args.length) {
      args = [+new Date()];
    }
    var mash = Mash();
    s0 = mash(' ');
    s1 = mash(' ');
    s2 = mash(' ');

    for (var i = 0; i < args.length; i++) {
      s0 -= mash(args[i]);
      if (s0 < 0) {
        s0 += 1;
      }
      s1 -= mash(args[i]);
      if (s1 < 0) {
        s1 += 1;
      }
      s2 -= mash(args[i]);
      if (s2 < 0) {
        s2 += 1;
      }
    }
    mash = null;

    var random = function() {
      var t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
      s0 = s1;
      s1 = s2;
      s2 = t - (c = t | 0);
      return s2;
    };
    random.uint32 = function() {
      return random() * 0x100000000; // 2^32
    };
    random.fract53 = function() {
      return random() +
        (random() * 0x200000 | 0) * 1.1102230246251565e-16; // 2^-53
    };
    random.version = 'Alea 0.9';
    random.args = args;
    return random;

  } (Array.prototype.slice.call(arguments)));
}

// Set up namespace
var app = app || {};
(function( $, _, window, document, undefined ) {
var self = this;
// Use "self" only where "this" is unavailable
// due to a scope change

this.frequency = {};

this.random = new Alea(Math.random(), Math.random(), Math.random());

this.recordTiming = false;

this.drawFlockMesh = false;
this.drawRanges = false;
this.drawVectors = false;
this.drawHealthIndicators = false;

this.viewportWidth = window.innerWidth || $(window).width() || 1800;
this.viewportHeight = window.innerHeight || $(window).height() || 800;

this.killStats = {};
this.entityCounts = { Entity: 0, Proj: 0 };

var Entity = app.Entity = Backbone.Model.extend(
// Instance properties.
{
    defaults: {
        color: "green",
        radius: 10,

        heading: Math.PI/4,

        pos: Vector.Zero(3),
        vel: Vector.Zero(3),
        accel: Vector.Zero(3),
        jerk: Vector.Zero(3),

        playerControlled: false,

        neighborhoodRadius: 150,

        maxVel: 3,
        maxAccel: 0.5,
        maxJerk: 1,
        jerkMag: 1,
        frictionFactor: 0.07,

        avoidanceRange: 100,
        avoidanceStrength: 40,
        edgeAvoidanceRange: 50,
        edgeAvoidanceStrength: 25,
        cohesionRange: 100,
        cohesionStrength: 0.25,
        steerDampingDistance: 100,
        alignmentRange: 100,
        alignmentStrength: 2,
        separationRange: 50,
        separationStrength: 20,

        doCollisionChecks: false,

        autoFire: true,
        firingRate: 1000, // Can fire once every x milliseconds.
        lastFired: 0,
        accuracy: 0.8,
        muzzleVel: 4.5,
        weaponRange: 300,

        edgeMode: "constrain",

        health: 100,
        maxHealth: 100,
        healRate: 0.1,

        distanceTraveled: 0,
        range: Infinity
    },

    // Instance prototype properties

    initialize: function () {
        this.on('error', this.handleError, this);

        this.indexes = {};
        this.tickCache = {};

        if(this instanceof Proj){
            app.entityCounts.Proj++;
        }

        // Setup special team attributes.
        if(!(this instanceof Proj)){
            var teamDefaults = Entity.teamDefaults[this.get("color")];
            if(teamDefaults) {
                var defaults = _.result(this, 'defaults');
                if(defaults){
                    this.attributes = _.defaults({}, teamDefaults, this.attributes);
                }
            }
        }

        if(this.get("playerControlled")){
            this.attributes.health *= 1.2;
            this.attributes.health *= 3;
            this.attributes.maxHealth *= 3;
            this.attributes.healRate = 0.1;
        }
    },
    destroy: function () {
        this.trigger("destroy", this, this.collection, {});
        if(this.view) this.view.remove();
        delete this.view;

        var indexX = _.indexOf(app.entities.indexes.posX, this);
        if(indexX >= 0){
            app.entities.indexes.posX.splice(indexX, 1);
        }
        var indexY = _.indexOf(app.entities.indexes.posY, this);
        if(indexY >= 0){
            app.entities.indexes.posY.splice(indexY, 1);
        }
        if(this instanceof Proj){
            app.entityCounts.Proj--;
        }
    },

    tick: function (time, entityIndex, totalEntities) {
        //console.log(time);
        if(app.recordTiming) window.time.start("entity - tick");

        this.alreadyFoundNeighbors = false;

        var jerkV = this.get("jerk"),
            accelV = this.get("accel"),
            velV = this.get("vel"),
            posV = this.get("pos");

        this.runAI = this.shouldRunAI(time, entityIndex, totalEntities);

        jerkV = this.getImpulse(jerkV, velV, time, entityIndex, totalEntities);

        accelV = this.updateAcceleration(accelV, jerkV);

        velV = this.updateVelocity(velV, accelV);

        posV = this.updatePosition(posV, velV);

        if(this.runAI) this.runWeaponsAI(time);

        this.checkForCollision();

        this.regenHealth();

        this.saveUpdatedVectors(jerkV, accelV, velV, posV);

        // This entity is done for this tick, so we can give them a fresh tick cache;
        this.tickCache = {};

        if(app.recordTiming) window.time.stop("entity - tick");

        if(this.view) this.view.render();
        //this.trigger("change");
    },

    shouldRunAI: function (time, entityIndex, totalEntities) {
        var segments = app.segmentsOverride || 10,
            currentSegment = app.tickPhase % segments,
            segLoc = entityIndex / totalEntities,
            runAI = false;

        // do the AI calculations only if we're in the current segment.
        if(currentSegment/segments <= segLoc && (currentSegment+1)/segments > segLoc){
            runAI = true;
        }

        return runAI;
    },

    getImpulse: function (jerkV, velV, time, entityIndex, totalEntities) {
        jerkV = Vector.Zero(3);
        
        if(this.get("playerControlled")){

            jerkV = this.getImpulseFromPlayerControl(jerkV, velV, time, entityIndex, totalEntities);

        } else {
            if(this.runAI)
                jerkV = this.getImpulseFromAI(jerkV, velV, time, entityIndex, totalEntities);
        }

        jerkV = this.constrainVectorMag(jerkV, this.get("maxJerk"));

        return jerkV;
    },
    getImpulseFromPlayerControl: function (jerkV, velV, time, entityIndex, totalEntities) {
        var thrustFactor = 0.5;

        // 87 - w
        // 65 - a
        // 83 - s
        // 68 - d
        // 32 - spacebar

        if(app.view.keysPressed[87]){
            jerkV = jerkV.add(velV.dup().toUnitVector().multiply(this.get("maxJerk")));

            if(this.getVectMagGhetto(jerkV) === 0 && typeof(this.get("heading")) !== "undefined")
                jerkV = jerkV.add(Vector.j.dup().rotate(this.get("heading"), Line.Z));
        } else if(!app.view.keysPressed[65] && !app.view.keysPressed[68]){
            // If no thrust is being applied, circle left.

            jerkV = jerkV
                .add(velV.dup().toUnitVector().multiply(this.get("maxJerk")*0.5)) // Small forward thrust for wide circle.
                .add(velV.dup().rotate(-Math.PI/2, Line.Z).toUnitVector().multiply(this.get("maxJerk")*thrustFactor)); // Left thrust.
        }

        if(app.view.keysPressed[65] && this.getVectMagGhetto(velV)){
            jerkV = jerkV.add(velV.dup().rotate(-Math.PI/2, Line.Z).toUnitVector().multiply(this.get("maxJerk")*thrustFactor)); // Left thrust.
        }

        /*if(app.view.keysPressed[83]){
            jerkV = this.constrainVectorMag(jerkV.add(velV.toUnitVector().multiply(-1)), this.getVectMag(velV)).multiply(0.5);
        }*/

        if(app.view.keysPressed[68] && this.getVectMagGhetto(velV)){
            jerkV = jerkV.add(velV.dup().rotate(Math.PI/2, Line.Z).toUnitVector().multiply(this.get("maxJerk")*thrustFactor)); // Right thrust.
        }

        if(app.view.keysPressed[32] && this.canFire(time, /* playerControlled */ true)){
            this.fireProjectileAtVect(time, this.get("pos").dup().add(velV));
        }

        return jerkV;
    },
    getImpulseFromAI: function (jerkV, velV, time, entityIndex, totalEntities) {
        var neighbors;

        if(this.get("maxJerk") > 0){

            neighbors = this.getNeighbors(this.get("neighborhoodRadius"));

            var sumHealth = function(memo, entity){
                return memo + entity.get("health");
            };

            // If half of the total health of the neighbors are friends,
            // avoidance is unchanged.
            // If alone among enemies, avoid more strongly.
            // If near more friends than enemies, adjusted for health,
            // avoidance can be negative, meaning move toward enemies.
            var avoidanceFactor = (neighbors
                .reduce(sumHealth, this.get("health"))*0.5 -
            neighbors.chain().filter(function(ent){
                return this.get("color") === ent.get("color");
            }, this).reduce(sumHealth, this.get("health")).value()) *
            // Strength of the effect
            this.get("avoidanceStrength");

            jerkV = this.flock(neighbors)
                .add(this.avoidOther(neighbors, this.get("avoidanceRange")).multiply(avoidanceFactor));

            /*if(typeof(app.mouseX) != "undefined") {
                jerkV = jerkV.add(this.avoidPosition(Vector.create([app.mouseX, app.mouseY, 0]), 150).multiply(100));
            }*/

            jerkV = jerkV.add(this.avoidPosition([75, 30, 0], 200).multiply(150));

            jerkV = jerkV
                .add(this.avoidEdges(this.get("edgeAvoidanceRange"))
                .multiply(this.get("edgeAvoidanceStrength")));

            if(this.getVectMag(jerkV) === 0){
                jerkV = jerkV.add(this.wander());
            }
        }

        return jerkV;
    },

    updateAcceleration: function (accelV, jerkV) {
        if(this.get("maxAccel") <= 0){
            return accelV;
        }

        accelV = this.constrainVectorMag(accelV.add(jerkV), this.get("maxAccel"))
        // Apply ghetto drag.
        .multiply((1-this.get("frictionFactor")) || 1);

        return accelV;
    },
    updateVelocity: function (velV, accelV) {
        if(this.get("maxVel") <= 0){
            return velV;
        }

        velV = this.constrainVectorMag(velV.add(accelV), this.get("maxVel"))
            // Apply ghetto drag.
            .multiply((1-this.get("frictionFactor")) || 1);

        var radians = velV.angleFrom(Vector.j);
        this.attributes.heading = velV.e(1) > 0 ? -radians : radians;

        if(_.isFinite(this.get("range"))){
            this.attributes.distanceTraveled += this.getVectMag(velV);
            if(this.attributes.distanceTraveled >= this.get("range")) {
                this.kill();
            }
        }

        return velV;
    },
    updatePosition: function (posV, velV) {
        if(this.get("maxVel") <= 0){
            return posV;
        }

        var radius = this.get("radius");
        posV = posV
            .add(velV);

        switch (this.get("edgeMode")) {
            case "constrain":
                posV = Vector.create([this.constrainValue(posV.e(1), app.viewportWidth, 0), this.constrainValue(posV.e(2), app.viewportHeight, 0), 0]);
                break;
            case "destroy":
                if(posV.e(1) < 0 || posV.e(1) > app.viewportWidth || posV.e(2) < 0 || posV.e(2) > app.viewportHeight) {
                    this.destroy();
                }
                break;
            default:
                // Wrap edge to edge.
                posV = Vector.create([this.wrapValue(posV.e(1), app.viewportWidth+radius, 0-radius), this.wrapValue(posV.e(2), app.viewportHeight+radius, 0-radius), 0]);
                break;
        }

        return posV;
    },
    checkForCollision: function () {
        if(!this.get("doCollisionChecks")) return;

        var neighbors = this.getNeighbors((this.get("collisionRadius") || this.get("radius")) + 10),
            entity = this.getClosestEntity(_(neighbors.filter(function (entity) {
                // No friendly fire.
                return !this.get("firedBy") || (entity.get("color") !== this.get("firedBy").get("color"));
            }, this)));

        if(entity && entity !== this.get("firedBy") && !(entity instanceof Proj)){
            var entityPosV = entity.get("pos");

            if(this.isWithinDistanceGhetto(entityPosV,
                ((this.get("collisionRadius") || this.get("radius")) +
                (entity.get("collisionRadius") || entity.get("radius")))
            )){
                this.collisionCallback(entity);
            }
        }
    },
    regenHealth: function () {
        // Heal a small amount each tick.
        if(this.get("healRate") && this.get("health") < this.get("maxHealth")) this.heal(this.get("healRate")*(this.get("maxHealth")/100));
    },
    saveUpdatedVectors: function (jerkV, accelV, velV, posV) {
        this.attributes.jerk  = jerkV;
        this.attributes.accel = accelV;
        this.attributes.vel   = velV;
        this.attributes.pos   = posV;
    },

    runWeaponsAI: function (time) {
        var playerControlled = this.get("playerControlled"),
            targets;
        if(this instanceof Proj || !this.get("autoFire") || !this.canFire(time, playerControlled)) return;

        targets = this.selectTargets(playerControlled);

        _(targets).every(function(entity){
            this.fireProjectileAt(time, entity);
            // Keep firing until we can't or we run out of targets.
            return this.canFire(time, playerControlled);
        }, this);
    },
    selectTargets: function (playerControlled) {
        var target;

        target = this.getNeighbors(this.get("neighborhoodRadius")).chain()
        // Grab the neighbors of other colors (if any).
        .filter(function(entity){
            return this.get("color") !== entity.get("color");
        }, this)
        // Select the ones with the lowest health.
        .allMin(function(entity){
            return entity.get("health");
        }, this)
        // If there's more than one returned,
        // (they could all be full health)
        // pick the closest ones (could still be more
        // than one if they are at equal distances).
        .allMin(function(entity){
            return this.getDistanceGhetto(entity.get("pos"));
        }, this);

        return target.isArray() ? target.value() : [target.value()];
    },

    canFire: function (time, playerControlled) {
        return time && (time - this.get("lastFired") >= this.get("firingRate"));// &&
            //(playerControlled || app.entityCounts.Proj < app.entities.size()/2);
    },
    fireProjectileAt: function (time, at) {
        var posV = this.get("pos"),
            atPosV = at.get("pos"),
            atVelV = at.get("vel"),

            distance = posV.distanceFrom(atPosV),
            ticksToAt = distance/this.get("muzzleVel"),

            accuracyFactor = 1-this.get("accuracy"),

            atV = atPosV.dup()
                // Skate to where the puck is going to be; 1.2 is THE magic number.
                .add(atVelV.dup().multiply(ticksToAt*(1+0.2+(app.random()*accuracyFactor-(accuracyFactor/2)))));

        this.fireProjectileAtVect(time, atV, at);
    },
    fireProjectileAtVect: function (time, atV, at) {
        var posV = this.get("pos"),
            
            projectiles = [];

            projVel = atV
                .subtract(posV).toUnitVector().multiply(this.get("muzzleVel"));

        for(var i = 0; i < 1; i++){
            projectiles.push(new Proj({
                color: this.get("color"),
                radius: 2,
                pos: posV.dup(),
                vel: projVel.dup(),
                range: this.get("weaponRange"),
                firedBy: this,
                firedAt: at
            }));
        }
        
        _(projectiles).each(function (proj) {
            new ProjView({ model: proj });
        });

        /*_(projectiles).each(function (proj) {
            app.view.insertSorted(app.entities, proj);
        }, this);*/
        //app.view.sortEntities(app.entities);

        this.attributes.lastFired = app.lastAnimationTime;

        //app.projectiles.add(projectiles);
        app.entities.add(projectiles);
    },

    kill: function () {
        var color = this.get("color"),

            posV = this.get("pos"),
            posX = posV.e(1),
            posY = posV.e(2),

            radius = this.get("radius");

        this.respawn();
        this.destroy();

        app.backdropCtx.fillStyle = color;
        for(var i = 0; i <= 10; i++){
            app.backdropCtx.beginPath();
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.backdropCtx.arc(posX+(app.random()*radius*2)-radius, posY+(app.random()*radius*2)-radius, (radius/3)+(app.random()*(radius/3)), 0, 2 * Math.PI, false);
            app.backdropCtx.fill();
        }

        app.killStats[color] = app.killStats[color] || { kills: 0, deaths: 0 };
        app.killStats[color].deaths++;
        app.view.renderKillStats();
    },
    injure: function (damage) {
        var newHealth = this.get("health") - damage;
        if(newHealth <= 0){
            this.kill();
            return true;
        } else {
            this.attributes.health = newHealth;
            return false;
        }
    },
    heal: function (amount) {
        var newHealth = this.get("health") + amount;
        this.attributes.health = newHealth;
    },
    respawn: function () {
        var coll = this.collection,
            color = this.get("color"),
            playerControlled = this.get("playerControlled");

        //setTimeout(function(){
            var entity = coll.spawnEntity(
                playerControlled ? {
                    playerControlled: playerControlled
                } : {
                    color: color
                }
            );
            
            if(playerControlled){
                app.backdropCtx.strokeStyle="black";
                app.backdropCtx.beginPath();
                app.backdropCtx.moveTo(0,entity.getPosY());
                app.backdropCtx.lineTo(app.viewportWidth,entity.getPosY());
                app.backdropCtx.lineWidth=1;
                app.backdropCtx.stroke();
                app.backdropCtx.beginPath();
                app.backdropCtx.moveTo(entity.getPosX(),0);
                app.backdropCtx.lineTo(entity.getPosX(),app.viewportHeight);
                app.backdropCtx.lineWidth=1;
                app.backdropCtx.stroke();
            }

        //}, 1000+(app.random()*2000));
    },

    getNeighbors: function (neighborhoodRadius) {
        // The tickCache is deleted after the tick,
        // so it should only exist if it's been calculated in this tick.
        if(this.tickCache.neighbors && neighborhoodRadius <= this.lastNeighborhoodRadius)
            return this.tickCache.neighbors;

        this.lastNeighborhoodRadius = neighborhoodRadius;

        return this.tickCache.neighbors = _(this.findNeighbors(app.entities, neighborhoodRadius));
    },
    findNeighbors: function (entities, neighborhoodRadius) {
        /*var neighborsNaive = this.findNeighborsNaive(entities, neighborhoodRadius),
            neighborsFromSorted = this.findNeighborsFromSorted(entities, neighborhoodRadius);

        if(neighborsNaive.length != neighborsFromSorted.length)
            console.error("Neighbor lists are not equal length!");

        return neighborsNaive;*/

        //return this.findNeighborsNaive(entities, neighborhoodRadius);
        return this.findNeighborsFromSorted(entities, neighborhoodRadius);
    },

    findNeighborsNaive: function (entities, neighborhoodRadius) {
        var me = this,
            neighbors = [],
            posV = this.get("pos");

        var walked = 0;

        Array.prototype.push.apply(neighbors, entities.filter(function(entity){
            if(entity === me || entity instanceof Proj) return;
            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            walked++;

            if(distance < neighborhoodRadius){
                return true;
            }
            return false;
        }));

        //console.log("findNeighborsNaive walked: "+walked);

        return neighbors;
    },

    findNeighborsFromSorted: function (entities, neighborhoodRadius) {
        if(this.alreadyFoundNeighbors){
            console.warn("Expensive op: Calculating neighbors for entity > once during same tick.");
        }
        var posV = this.get("pos"),

            posInX = posV.e(1),
            posInY = posV.e(2),

        // Get close entities in the indexes.posX list.
        // Error is introduced by walkSortedList proportional to the distance
        // that the entities have moved, since their pos vectors are up-to-date
        // but the sort order of the indexes list is not.
        // This especially causes significant error when an entity wraps around the map.
        // This could be improved by sorting after every Entity moves,
        // at the cost of performance implications.

            //filteredEntities = [],
            //seen = {},
            neighbors = this.tickCache.neighborsSeen ?
                _.values(this.tickCache.neighborsSeen) :
                [],
            filteredEntities = [],
            seen = _.extend({}, this.tickCache.neighborsSeen || {}),

            walkLimit = this.get("walkLimit") || 5,

            sortedListX = entities.indexes.posX,
            sortedListY = entities.indexes.posY,

            sortedIndexX = typeof(this.indexes.byPosX) !== "undefined" ?
                            this.indexes.byPosX :
                            _.sortedIndex(sortedListX, this, function(entity){ return entity.getPosX(); }),
            sortedIndexY = typeof(this.indexes.byPosY) !== "undefined" ?
                            this.indexes.byPosY :
                             _.sortedIndex(sortedListY, this, function(entity){ return entity.getPosY(); });

        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, sortedIndexX, sortedListX, "x", 1,  neighborhoodRadius, posInX, walkLimit));
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, sortedIndexX, sortedListX, "x", -1, neighborhoodRadius, posInX, walkLimit));
        // Get close entities in the indexes.posY list.
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, sortedIndexY, sortedListY, "y", 1,  neighborhoodRadius, posInY, walkLimit));
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, sortedIndexY, sortedListY, "y", -1, neighborhoodRadius, posInY, walkLimit));

        Array.prototype.push.apply(neighbors, _(filteredEntities).filter(function(entity){
            var entityPosV = entity.get("pos")/*,
                distance = posV.distanceFrom(entityPosV)*/;

            /*if(distance < neighborhoodRadius){*/
            if(this.isWithinDistanceGhetto(entityPosV, neighborhoodRadius)){

                if(!this.tickCache.neighborsSeen) this.tickCache.neighborsSeen = {};
                this.tickCache.neighborsSeen[entity.cid] = entity;
                if(!entity.tickCache.neighborsSeen) entity.tickCache.neighborsSeen = {};
                entity.tickCache.neighborsSeen[this.cid] = this;

                return true;
            }
            return false;
        }, this));

        //console.log("findNeighborsFromSorted walked: "+walked);
        this.alreadyFoundNeighbors = true;

        return neighbors;
    },
    walkSortedList: function(seen, sortedIndex, sortedList, axis, dir, range, posInAxis, walkLimit){
        var foundEntities = [],
            highDist = 0,
            listLength = sortedList.length,
            step = dir ? dir < 0 ? -1 : 1 : 0,
            currIndex = sortedIndex,
            posFunc = axis === "x" ? "getPosX" : "getPosY";
            //currIndex = sortedList[sortedIndex] === this ? sortedIndex : -1;//_.indexOf(sortedList, this, /* isSorted */ false);

        // Account for trying to use the sorted list
        // from an entity not on the list.
        /*if(currIndex === -1){
            console.warn("Expensive op: Called walkSortedList() from entity not on sorted list.");

            var closestEntity = this.getClosestEntity(sortedList);
            currIndex = _.indexOf(sortedList, _.find(sortedList, function(entity){
                return entity === closestEntity;
            }));
        }*/

        var walked = 0;

        while( currIndex >= 0 && currIndex < listLength && highDist < range && (!walkLimit || walked < walkLimit) ){
            var entity = sortedList[currIndex];
            if(entity && !seen[entity.cid]){
                if(!(entity instanceof Proj) && entity !== this){
                    var thisPosInAxis = entity[posFunc]();

                    foundEntities.push(entity);

                    // Using ternary rather than Math.abs
                    // http://jsperf.com/math-abs-perf-vs-ternary
                    //highDist = Math.abs(thisPosInAxis - posInAxis);
                    highDist = thisPosInAxis > posInAxis ?
                        thisPosInAxis - posInAxis :
                        posInAxis - thisPosInAxis;
                    walked++;
                }
                seen[entity.cid] = true;
            }
            currIndex += step;
        }

        //console.log("walkSortedList walked: "+walked+" of "+listLength);

        return foundEntities;
    },
    getDistanceGhetto: function (vect) {
        var posV = this.get("pos"),
            sum = 0;

        vect.each(function(x, i) {
            sum += Math.pow(posV.e(i) - x, 2);
        });

        return sum;
    },
    isWithinDistanceGhetto: function (vect, distance) {
         return this.getDistanceGhetto(vect) < Math.pow(distance, 2);
    },

    getClosestEntity: function (entities) {
        var posV = this.get("pos"),
            closest,
            lastDistance = Infinity;

        _(entities).each(function(entity){
            var entityPosV = entity.get("pos"),
                distanceGhetto = this.getDistanceGhetto(entityPosV);

            if(distanceGhetto < lastDistance){
                closest = entity;
                lastDistance = distanceGhetto;
            }
        }, this);

        return closest;
    },

    wander: function () {
        var randomizeSign = function(x){ return x * Math.pow(-1, Math.round(Math.random()*10)); };
        var tempJerk = Vector.Random(2).to3D().map(randomizeSign).toUnitVector();

        if(this.radsToDegrees(this.get("vel").angleFrom(tempJerk)) < 90)
            return tempJerk.multiply(this.get("maxJerk")*0.2);

        return Vector.Zero(3);
    },

    flock: function(neighbors) {
        return this.cohere(neighbors, this.get("cohesionRange"))
                    .multiply(this.get("cohesionStrength"))
                .add(this.align(neighbors, this.get("alignmentRange"))
                    .multiply(this.get("alignmentStrength")))
                .add(this.separate(neighbors, this.get("separationRange"))
                    .multiply(this.get("separationStrength")));
    },

    cohere: function (entities, neighborhoodRadius) {
        var color = this.get("color"),
            posV = this.get("pos"),

            sum = Vector.Zero(3),
            count = 0;

        entities.each(function(entity){
            if(entity.get("color") !== color) return;

            var entityPosV = entity.get("pos");

            if(this.isWithinDistanceGhetto(entityPosV, neighborhoodRadius)){
                sum = sum.add(entityPosV);
                count++;
            }
        }, this);

        if(count > 0){
            sum = sum.map(function(x){ return x / count; });
            return this.steerTo(sum);
        } else {
            return sum; // Empty vector contributes nothing
        }
    },
    steerTo: function (target) {

        var posV = this.get("pos");

        var desiredV = target.subtract(posV);

        var distance = this.getVectMag(desiredV);

        if(distance > 0){
            desiredV = desiredV.toUnitVector();

            // Two options for desired vector magnitude (1 -- based on distance, 2 -- maxspeed)
            var steerDampingDistance = this.get("steerDampingDistance");
            if(distance < steerDampingDistance){
                desiredV = desiredV.multiply(this.get("maxVel")*(distance/steerDampingDistance)); // This damping is somewhat arbitrary
            } else {
                desiredV = desiredV.multiply(this.get("maxVel"));
            }

            var steer = desiredV.subtract(this.get("vel"));

            return steer;
        }

        return Vector.Zero(3);
    },
    align: function (entities, neighborhoodRadius) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.Zero(3),
            count = 0;

        entities.each(function(entity){
            if(entity.get("color") != color) return;

            var entityPosV = entity.get("pos"),
                entityVelV = entity.get("vel");

            if(this.isWithinDistanceGhetto(entityPosV, neighborhoodRadius)){
                mean = mean.add(entityVelV);
                count++;
            }
        }, this);

        if(count > 0)
            mean = mean.map(function(x){ return x / count; }).toUnitVector();

        return mean;
    },
    separate: function (entities, desiredDistance) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.Zero(3),

            count = 0;

        entities.each(function(entity){
            if(entity.get("color") != color) return;

            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            if(distance < desiredDistance){
                mean = mean.add(posV.dup().subtract(entityPosV).toUnitVector().map(function(x){ return x / distance; }));
                count++;
            }
        }, this);

        if(count > 0)
            mean = mean.map(function(x){ return x / count; });

        return mean;
    },
    avoidOther: function (entities, desiredDistance) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.Zero(3),

            count = 0;

        entities.each(function(entity){
            if(entity.get("color") == color) return;

            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            if(distance < desiredDistance){
                mean = mean.add(posV.dup().subtract(entityPosV).toUnitVector().map(function(x){ return x / distance; }));
                count++;
            }
        }, this);

        if(count > 0)
            mean = mean.map(function(x){ return x / count; });

        return mean;
    },
    avoidPosition: function (avoidV, desiredDistance) {
        var posV = this.get("pos"),
            distance = posV.distanceFrom(avoidV);

        if(distance < desiredDistance){
            return posV.dup().subtract(avoidV).toUnitVector().map(function(x){ return x / distance; });
        }

        return Vector.Zero(3);
    },
    avoidEdges: function (desiredDistance) {
        var posV = this.get("pos"),

            distanceFromLeft = posV.e(1),
            distanceFromRight = app.viewportWidth - posV.e(1),
            distanceFromTop = posV.e(2),
            distanceFromBottom = app.viewportHeight - posV.e(2),

            vect = Vector.Zero(3);

        if(distanceFromLeft <= desiredDistance)
            vect = vect.add([1, 0, 0]);

        if(distanceFromRight <= desiredDistance)
            vect = vect.add([-1, 0, 0]);

        if(distanceFromTop <= desiredDistance)
            vect = vect.add([0, 1, 0]);

        if(distanceFromBottom <= desiredDistance)
            vect = vect.add([0, -1, 0]);

        return vect;
    },

    collisionCallback: function(entity){ /* No-op by default. */ },

    radsToDegrees: function (rads) {
        // degrees = radians * (180/pi)
        return rads * (180/Math.PI);
    },
    degreesToRads: function (degrees) {
        // radians = degrees * (pi/180)
        return degrees * (Math.PI/180);
    },

    getVectMag: function (vect) {
        return Math.sqrt(this.getVectMagGhetto(vect));
    },
    getVectMagGhetto: function (vect) {
        var sumPow = 0;
        vect.each(function(x, i) {
            sumPow += Math.pow(x, 2);
        });
        return sumPow;
    },

    constrainVectorMag: function (vect, maxMag) {
        var mag = this.getVectMag(vect);
        if(mag> 0 && mag > maxMag){
            return vect.multiply(maxMag/mag);
        }
        return vect;
    },
    constrainValue: function (value, max, min) {
        min = min || 0;
        return value > max ? max : value < min ? min : value;
    },

    wrapValue: function (value, max, min) {
        min = min || 0;
        return value > max ? min : value < min ? max : value;
    },

    getElemFromVect: function (vect, elem) {
        return vect.e(elem);
    },

    getPosX: function () {
        //return this.getElemFromVect(this.get("pos"), 1);
        return this.attributes.pos.elements[0];
    },
    getPosY: function () {
        //return this.getElemFromVect(this.get("pos"), 2);
        return this.attributes.pos.elements[1];
    },

    getVelX: function () {
        return this.getElemFromVect(this.get("vel"), 1);
    },
    getVelY: function () {
        return this.getElemFromVect(this.get("vel"), 2);
    },

    getAccelX: function () {
        return this.getElemFromVect(this.get("accel"), 1);
    },
    getAccelY: function () {
        return this.getElemFromVect(this.get("accel"), 2);
    },

    getJerkX: function () {
        return this.getElemFromVect(this.get("jerk"), 1);
    },
    getJerkY: function () {
        return this.getElemFromVect(this.get("jerk"), 2);
    },

    handleError: function () {
        alert('error on entity: ' + (this.id || this.cid));
    }
},
// Class properties.
{
    compareByPosX: function (entityA, entityB) {
        var posXA = entityA.getPosX(),
            posXB = entityB.getPosX();

        //return posXA < posXB ? -1 : posXA > posXB ? 1 : 0;
        return posXA - posXB;
    },
    compareByPosY: function (entityA, entityB) {
        var posYA = entityA.getPosY(),
            posYB = entityB.getPosY();

        //return posYA < posYB ? -1 : posYA > posYB ? 1 : 0;
        return posYA - posYB;
    }
});

_.mixin({
    allMin: function(obj, iterator, context) {
    if (!iterator && _.isEmpty(obj)) return [];
    var result = {computed : Infinity, value: []};
    _.each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if(computed < result.computed){
        result = {value : [value], computed : computed};
      } else if (computed === result.computed){
        result.value.push(value);
      }
    });
    return result.value;
  }
});

Entity.teamDefaults = {
    // Speed
    green: {
        firingRate: 400,//500,
        maxVel: Entity.prototype.defaults.maxVel*1.4,
        maxAccel: Entity.prototype.defaults.maxAccel*1.6,
        //muzzleVel: Entity.prototype.defaults.muzzleVel*1.4,
        damage: 20,

        avoidanceRange: 150,
        avoidanceStength: 60,
        separationRange: 60,
        alignmentStrength: 2.5
    },
    // Firepower
    red: {
        firingRate: 240,//300,//130,
        maxVel: Entity.prototype.defaults.maxVel*0.9,

        //accuracy: 1,

        cohesionRange: 150,
        cohesionStrength: 0.3,
        separationRange: 25
    },
    // Health
    blue: {
        health: 150,
        maxHealth: 150,
        healRate: 0.15,

        avoidanceRange: 150,
        cohesionRange: 150,
        cohesionStrength: 0.3,
        separationRange: 25
    },
    // Sniper
    orange: {
        damage: 49,
        health: 40,
        healRate: 0.2,

        accuracy: 1,
        muzzleVel: 8,

        neighborhoodRadius: 300,

        cohesionRange: 100,
        cohesionStrength: 0.1,
        separationRange: 95,
        separationStrength: 40,
        alignmentRange: 80,
        alignmentStrength: 1
    }
};

var EntityView = Backbone.View.extend({

    tagName: 'div',
    className: 'entity',
    
    initialize: function (args) {
        this.model.view = this;
        //this.listenTo(this.model, 'change', _.bind(this.render, this));

        var radius = this.model.get("radius"),
            diam = radius * 2,
            posX = this.model.getPosX(),
            posY = this.model.getPosY();

        if(this.model instanceof Proj){
            this.$el.addClass("circle");
            this.$el.css({
                backgroundColor: this.model.get("color")
            });
        } else {
            this.$el.addClass("triangle");
            this.$el.css({
                'border-top-color': this.model.get("color")
            });
        }

        this.$el.css({
            width: diam,
            height: diam,
            top: (posY-radius)+"px",
            left: (posX-radius)+"px",

            '-webkit-transform-origin': radius+'px '+radius+'px',
            '-moz-transform-origin': radius+'px '+radius+'px',
            '-o-transform-origin': radius+'px '+radius+'px',
            '-ms-transform-origin': radius+'px '+radius+'px',
            'transform-origin': radius+'px '+radius+'px'
        }).addClass(this.model.cid);

        this.elemStyle = this.el.style;
    },

    events: {
        'click': 'handleClick'
    },

    render: function () {
        if(app.recordTiming) time.start("entity - render");
        
        var radius = this.model.get("radius"),
            diam = radius * 2,
            jerkX = this.model.getJerkX(),
            jerkY = this.model.getJerkY(),
            accelX = this.model.getAccelX(),
            accelY = this.model.getAccelY(),
            velX = this.model.getVelX(),
            velY = this.model.getVelY(),
            posX = this.model.getPosX(),
            posY = this.model.getPosY();

        // Render entity on a canvas.
        this.renderEntity(app.overlayCtx, posX, posY);

        // Draw color trail.
        app.backdropCtx.beginPath();
        app.backdropCtx.fillStyle = this.model.get("color");
        var velMag = this.model.getVectMag(Vector.create([velX, velY, 0]));
        var trailRad = (this.model instanceof Proj) ? 1 : Math.abs(this.model.get("maxVel")+1-velMag);
        // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        app.backdropCtx.arc(posX, posY, trailRad, 0, 2 * Math.PI, false);
        app.backdropCtx.fill();

        // Draw neighbor mesh.
        if(app.drawFlockMesh){
            var neighbors = this.model.tickCache.neighbors;
            if(neighbors && neighbors.size()){
                neighbors.each(function(entity){
                    //var color = "rgb("+[Math.round(Math.random()*255),Math.round(Math.random()*255),Math.round(Math.random()*255)].join(",")+")";
                    this.drawLineTo(app.overlayCtx, entity.getPosX(), entity.getPosY(), "black", 1);
                }, this);
            }
        }

        // Draw neighborhood.
        if(app.drawRanges){
            app.overlayCtx.beginPath();
            app.overlayCtx.strokeStyle="green";
            app.overlayCtx.lineWidth=1;
            app.overlayCtx.arc(posX, posY, 100, 0, 2 * Math.PI, false);
            app.overlayCtx.stroke();

            // Draw danger zone.
            app.overlayCtx.beginPath();
            app.overlayCtx.strokeStyle="red";
            app.overlayCtx.lineWidth=1;
            app.overlayCtx.arc(posX, posY, 50, 0, 2 * Math.PI, false);
            app.overlayCtx.stroke();
        }

        if(app.drawVectors && !(this.model instanceof Proj)){
            // Draw position indicator.
            //this.drawDirectionalIndicator(app.overlayCtx, 0-posX, 0-posY, 1, "black", 1);

            // Draw velocity indicator.
            //this.drawDirectionalIndicator(app.overlayCtx, velX, velY, 5, "#F9D300");

            // Draw accel indicator.
            this.drawDirectionalIndicator(app.overlayCtx, accelX, accelY, 40, "cyan");

            // Draw jerk indicator.
            this.drawDirectionalIndicator(app.overlayCtx, jerkX, jerkY, 20, "magenta");
        }

        if(this.model.get("playerControlled")){
            // Draw player dot.
            app.overlayCtx.beginPath();
            app.overlayCtx.fillStyle = "black";
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.overlayCtx.arc(posX, posY, 5, 0, 2 * Math.PI, false);
            app.overlayCtx.fill();
        }

        if(app.drawHealthIndicators && !(this.model instanceof Proj)){
            // Draw health dot.
            app.overlayCtx.beginPath();
            app.overlayCtx.fillStyle = "white";
            var healthRad = Math.round(this.model.get("health")/25);
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.overlayCtx.arc(posX, posY, healthRad, 0, 2 * Math.PI, false);
            app.overlayCtx.fill();
        }

        // Draw smoke for damaged entity.
        if(this.model.get("health") < this.model.get("maxHealth")/4 && app.tickPhase % 8 === 0 && !(this.model instanceof Proj)){
            app.backdropCtx.beginPath();
            app.backdropCtx.fillStyle = "gray";
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.backdropCtx.arc(posX+(app.random()*8)-4, posY+(app.random()*8)-4, 2+(app.random()*2), 0, 2 * Math.PI, false);
            app.backdropCtx.fill();
        }

        if(app.recordTiming) time.stop("entity - render");
        
        return this;
    },
    renderEntity: function (ctx, posX, posY) {
        var radius = this.model.get("radius");

        ctx.beginPath();
        ctx.fillStyle=this.model.get("color");
        ctx.strokeStyle="black";
        ctx.lineWidth=1;

        ctx.save();

        ctx.translate(posX,posY);
        ctx.rotate(this.model.get("heading"));

        ctx.moveTo(0,0+radius);
        ctx.lineTo(0-radius,0-radius);
        ctx.lineTo(0+radius,0-radius);
        ctx.globalAlpha=(this.model.get("health")/this.model.get("maxHealth"))*0.9+0.1;
        ctx.fill();
        ctx.globalAlpha=1;
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    },

    // http://jsperf.com/style-versus-jquery-css/8
    updateStyles: function(posX, posY, velX, radius) {
        var style = this.elemStyle,
            lastDegree = this.lastDegree,
            degree = this.model.radsToDegrees(this.model.get("vel").angleFrom(Vector.j)),
            lastOpacity = this.lastOpacity,
            opacity = (this.model.get("health")/100)*0.5+0.5;

        if(velX > 0) degree = -degree;

        style.top = (posY-radius)+"px";
        style.left = (posX-radius)+"px";

        if(lastDegree !== degree) {
            var rotateStr = 'rotate(' + degree + 'deg)';
            style['-webkit-transform'] = rotateStr;
            //style['-moz-transform'] = rotateStr;
            //style['-o-transform'] = rotateStr;
            //style['-ms-transform'] = rotateStr;
            //style.transform = rotateStr;

            this.lastDegree = degree;
        }

        if(lastOpacity !== opacity){
            style.opacity = opacity;

            this.lastOpacity = opacity;
        }
    },

    drawDirectionalIndicator: function (ctx, diffX, diffY, scale, style, width) {
        var posX = this.model.getPosX(),
            posY = this.model.getPosY();

        scale = scale || 5;

        this.drawLineTo(ctx, posX+(diffX*scale), posY+(diffY*scale), style, width);
    },
    drawLineTo: function (ctx, x, y, style, width) {
        var posX = this.model.getPosX(),
            posY = this.model.getPosY();

        ctx.beginPath();
        ctx.moveTo(posX,posY);
        ctx.lineTo(x,y);
        ctx.strokeStyle=style||"#F9D300";
        ctx.lineWidth=width||3;
        ctx.stroke();
    },

    move: function () {
        var posX = this.model.getPosX(),
            posY = this.model.getPosY();
        
        this.$el.css({
            top: posY+"px",
            left: posX+"px"
        });
    },

    handleClick: function () {
        alert('you clicked the entity: ' + (this.model.id || this.model.cid));
    }
});

var EntityCollection = Backbone.Collection.extend({
    model: Entity,

    initialize: function() {
        this.indexes = {};
    },

    add: function (models, options) {
        var modelList = _.isArray(models) ? models : [models];

        // Delegate to the real Backbone.Collection#add
        var ret = Backbone.Collection.prototype.add.call(this, models, options);

        if(!(this instanceof ProjCollection)) _(modelList).each(this.insertSorted, this);

        return ret;
    },

    spawnEntities: function (num, $container) {
        return EntityCollection.spawnEntities(this, num, $container);
    },
    spawnEntity: function (obj, $container) {
        return EntityCollection.spawnEntity(this, obj, $container);
    },

    sortEntities: function () {
        return EntityCollection.sortEntities(this);
    },
    insertSorted: function (entity) {
        return EntityCollection.insertSorted(this, entity);
    },

    getIndex: function (prop) {
        return this.indexes[prop] || null;
    }
},
    // Class properties
{

    spawnEntities: function (coll, num) {
        var entities = [];

        for(var i = 0; i < num; i++){
            entities.push(coll.spawnEntity({
                //color: i % 2  ? "blue" : "red",
                color: i % 4 === 0 ? "blue" : i % 4 === 1 ? "red" : i % 4 === 2 ? "green" : "orange"
            }));
        }

        return entities;
    },
    spawnEntity: function(coll, obj){

        var rand = !obj.color ? app.random() : 0,

            entity = new Entity(_.extend({
                vel: Vector.Zero(3),
                accel: Vector.Zero(3),
                jerk: Vector.Zero(3),
                color: rand <= 0.25 ? "blue" : rand <= 0.5 ? "red" : rand <= 0.75 ? "green" : "orange",
                pos: Vector.create([Math.round(Math.random()*app.viewportWidth), Math.round(Math.random()*app.viewportHeight), 0])
            }, obj));
        
        new EntityView({ model: entity });
        
        coll.add(entity);

        return entity;
    },

    // Takes a collection of Entities and updates its custom indexes.
    sortEntities: function (coll) {
        var posXArr = coll.indexes.posX = (coll.indexes.posX || []),
            posYArr = coll.indexes.posY = (coll.indexes.posY || []);

        if(!posXArr.length) Array.prototype.push.apply(posXArr, coll.models.slice());
        if(!posYArr.length) Array.prototype.push.apply(posYArr, coll.models.slice());

        posXArr.sort(Entity.compareByPosX);
        posYArr.sort(Entity.compareByPosY);

        _(posXArr).each(function(entity, index){
            entity.indexes.byPosX = index;
        });
        _(posYArr).each(function(entity, index){
            entity.indexes.byPosY = index;
        });
    },
    insertSorted: function (coll, entity) {
        var posXArr = coll.indexes.posX = (coll.indexes.posX || []),
            posYArr = coll.indexes.posY = (coll.indexes.posY || []),

            indexX = _.sortedIndex(posXArr, entity, function(entity){ return entity.getPosX(); }),
            indexY = _.sortedIndex(posYArr, entity, function(entity){ return entity.getPosY(); });

        //Array.prototype.splice.apply(posXArr, [indexX, 0, entity]);
        //Array.prototype.splice.apply(posYArr, [indexY, 0, entity]);

        entity.indexes.byPosX = indexX;
        entity.indexes.byPosY = indexY;

        posXArr.splice(indexX, 0, entity);
        posYArr.splice(indexY, 0, entity);

        /*posXArr.push(entity);
        posYArr.push(entity);*/
    }
});

var Proj = app.Proj = Entity.extend({
    defaults: _.extend({}, Entity.prototype.defaults, {
        maxJerk: 0,
        maxAccel: 0,
        maxVel: Infinity,
        frictionFactor: 0,

        edgeMode: "destroy",
        doCollisionChecks: true,

        walkLimit: 1
    }),

    kill: function() {
        this.destroy();
    },

    collisionCallback: function (entity) {
        var firedBy = this.get("firedBy");

        // Injure returns true when the injury was fatal.
        if(entity.injure((firedBy && firedBy.get("damage")) || 20) && firedBy){
            app.killStats[firedBy.get("color")] = app.killStats[firedBy.get("color")] || { kills: 0, deaths: 0 };
            app.killStats[firedBy.get("color")].kills++;
            app.view.renderKillStats();
        }
        this.kill();
    }
});

var ProjView = EntityView.extend({
    className: 'entity proj',

    renderEntity: function(ctx, posX, posY) {
        var radius = this.model.get("radius");

        ctx.beginPath();
        ctx.fillStyle = this.model.get("color");
        // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        ctx.arc(posX, posY, radius, 0, 2 * Math.PI, false);
        ctx.fill();
    }
});

var ProjCollection = Backbone.Collection.extend({
  model: Proj
});

var AppModel = Backbone.Model.extend({
    initialize: function () {
    }
});

var AppView = Backbone.View.extend({

    initialize: function () {

        var $el = this.setElement($("#app")).$el;

        this.model = new AppModel({
            //
        });

        this.keysPressed = {};
        $(window).on("keydown", _.bind(this.recordKeydown, this));
        $(window).on("keyup", _.bind(this.recordKeyup, this));

        $el.css({
            width: app.viewportWidth,
            height: app.viewportHeight
        });
        
        var entities = this.model.entities = app.entities = new EntityCollection();

        this.model.projectiles = app.projectiles = new ProjCollection();
        
        entities.spawnEntities(24*4, $el);
        entities.spawnEntity({
            playerControlled: true
        }, $el);

        var backdrop = app.backdrop = $("#backdrop")[0];
        backdrop.width = app.viewportWidth;
        backdrop.height = app.viewportHeight;

        var overlay = app.overlay = $("#overlay")[0];
        overlay.width = app.viewportWidth;
        overlay.height = app.viewportHeight;

        app.backdropCtx = backdrop.getContext("2d");
        app.overlayCtx = overlay.getContext("2d");
        
        this.render();
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
        var pos = Vector.create([app.mouseX, app.mouseY, 0]),
        time = (new Date()).getTime();

        app.entities.chain().filter(function(ent){
            return ent.get("playerControlled") && ent.canFire(time, /* playerControlled */ true);
        }).each(function(ent){
            ent.fireProjectileAtVect(time, pos);
        });
    },

    /*handleClick: function (e) {
        var randomizeSign = function(x){ return x * Math.pow(-1, Math.round(Math.random()*10)); };
        var projectiles = [];
        for(var i = 0; i < 10; i++){
            projectiles.push(new Proj({
                color: "black",
                radius: 2,
                range: 150,
                pos: Vector.create([app.mouseX, app.mouseY, 0]),
                vel: Vector.Random(2).to3D().map(randomizeSign).toUnitVector().multiply(Proj.prototype.defaults.maxVel)
            }));
        }

        var $container = this.$el;
        var elems = [];
        
        _(projectiles).each(function (proj) {
            elems.push((new ProjView({ model: proj })).render().el);
        });
        
        $container.append($(elems));

        this.model.projectiles.add(projectiles);
    },*/

    // grab and populate our main template
    render: function () {
        return this;
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
            elem.text((stats.kills-stats.deaths)+" ("+stats.kills+"/"+stats.deaths+")").css({ color: color });


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

// Implementation from http://rosettacode.org/wiki/Averages/Simple_moving_average#JavaScript
function SimpleMovingAverager(period) {
    var nums = [];
    return function(num) {
        nums.push(num);
        if (nums.length > period)
            nums.splice(0,1);  // remove the first element of the array
        var sum = 0;
        for (var i in nums)
            sum += nums[i];
        var n = period;
        if (nums.length < period)
            n = nums.length;
        return(sum/n);
    };
}

var frameRateAverager = new SimpleMovingAverager(3);

this.framesSeen = 0;
this.lastSecond = 0;
this.frameRate = 0;
this.lastAnimationTime = 0;
this.baseTickLength = 18;
this.tickLength = this.baseTickLength;

this.tickPhase = 0;
this.tickPhaseLength = 100;

this.tick = _.bind(function tick (time) {
    if(app.recordTiming) window.time.start("tick");

    if(time){
        time = (new Date()).getTime();
        app.tickLength = time - app.lastAnimationTime;
    }

    // The overlay layer should not persist,
    // so we have to clear it every frame.
    this.overlayCtx.clearRect(0, 0, app.overlay.width, app.overlay.height);

    // This is above the entity loops so the player
    // can fire his own weapons before autoFire kicks in.
    if(app.mousedown) app.view.firePlayerControlled();

    var entitiesLength = app.entities.size(),
        projsLength = app.projectiles.size();

    // The hot loop.
    this.entities.each(function (entity, index) {
        entity.tick(time, index, entitiesLength);
    });
    this.projectiles.each(function (proj, index) {
        proj.tick(time, index, projsLength);
    });

    this.entities.sortEntities();

    // Fade out the backdrop layer.
    this.backdropCtx.fillStyle="#ffffff";
    this.backdropCtx.globalAlpha=0.02;
    this.backdropCtx.fillRect(0,0,app.viewportWidth,app.viewportHeight);
    this.backdropCtx.globalAlpha=1;

    this.lastAnimationTime = time || (new Date()).getTime();

    if(!this.lastSecond) this.lastSecond = this.lastAnimationTime;
    this.framesSeen++;

    if(this.lastAnimationTime - this.lastSecond >= 1000){
        this.frameRate = frameRateAverager(this.framesSeen);
        this.framesSeen = 0;
        this.lastSecond = time;
    }

    this.tickPhase++;
    if(this.tickPhase > this.tickPhaseLength) this.tickPhase = 0;

    if(app.recordTiming) window.time.stop("tick");

    window.requestAnimationFrame(app.tick);
}, this);

this.updateAll = function (attr, value) {
    this.entities.each(function(it){ it.attributes[attr] = value; });
};

this.target = Vector.create([0,0,0]);

this.getEntDist = function(a,b){
    return app.entities.find(function(ent) { return ent.cid === a; }).get("pos").distanceFrom(app.entities.find(function(ent) { return ent.cid === b; }).get("pos"));
};

this.startup = function (e) {
    this.view = new AppView();

    $("body").on("click", ".fullscreen", function(e){
        e.preventDefault();
        app.launchFullScreen(document.documentElement);
    });

    // The first tick doesn't receive a time.
    this.tick();
};

$(document).ready(_.bind(this.startup, this));

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

// End namespace setup
}).call(app, jQuery, window._, window, document);