
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame =
          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
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
this.drawVectors = true;
this.drawHealthIndicators = false;

this.viewportWidth = window.innerWidth || $(window).width() || 1800;
this.viewportHeight = window.innerHeight || $(window).height() || 800;

this.killStats = {};

var Entity = Backbone.Model.extend(
// Instance properties.
{
    defaults: {
        color: "green",
        radius: 10,

        pos: Vector.Zero(3),
        vel: Vector.Zero(3),
        accel: Vector.Zero(3),
        jerk: Vector.Zero(3),

        maxVel: 3,
        maxAccel: 0.5,
        maxJerk: 1,
        jerkMag: 1,
        frictionFactor: 0.07,

        doCollisionChecks: false,

        firingRate: 1000, // Can fire once every x milliseconds.
        lastFired: 0,

        health: 100,

        distanceTraveled: 0,
        range: Infinity
    },

    // Instance prototype properties

    initialize: function () {
        this.on('error', this.handleError, this);
    },
    destroy: function () {
        this.trigger("destroy", this, this.collection, {});
        if(this.view) this.view.remove();
        delete this.view;

        var indexX = _.indexOf(app.entities.sortedBy.posX, this);
        if(indexX >= 0){
            app.entities.sortedBy.posX.splice(indexX, 1);
        }
        var indexY = _.indexOf(app.entities.sortedBy.posY, this);
        if(indexY >= 0){
            app.entities.sortedBy.posY.splice(indexY, 1);
        }
    },
    
    validate: function (attrs, options) {
        if("radius" in attrs){
            if( !_.isNumber(attrs.radius) || attrs.radius < 0 ){
                return true;
            }
        }
        if("color" in attrs){
            if( !_.isString(attrs.color) || attrs.color === "" ){
                return true;
            }
        }
    },

    tick: function (time, index, total) {
        //console.log(time);
        if(app.recordTiming) window.time.start("entity - tick");

        var radius = this.get("radius"),
            jerkV = this.get("jerk"),
            accelV = this.get("accel"),
            velV = this.get("vel"),
            posV = this.get("pos"),
            neighbors;

        var doImpulse = false;
        var segments = app.segmentsOverride || 5;
        var currentSegment = app.tickPhase % segments;
        var segLoc = index / total;
        // do the impulse (jerk) calculations only if we're in the current segment.
        if(currentSegment/segments <= segLoc && (currentSegment+1)/segments > segLoc){
            doImpulse = true;
        }

        if(this.get("maxJerk") > 0 && doImpulse){

            neighbors = _(this.findNeighbors(app.entities, 150));

            this.attributes.neighbors = neighbors;

            if(time && time - this.get("lastFired") >= this.get("firingRate")){
                neighbors.find(function(entity){
                    if(this.get("color") === entity.get("color")) return;

                    this.fireProjectileAt(entity);

                    return true;
                }, this);
                this.set("lastFired", time);
            }

            jerkV = this.flock(neighbors)
                            .add(this.avoidOther(neighbors, 100).multiply(50));

            if(typeof(app.mouseX) != "undefined") {
                jerkV = jerkV.add(this.avoidPosition(Vector.create([app.mouseX, app.mouseY, 0]), 150).multiply(100));
            }

            jerkV = jerkV.add(this.avoidPosition(Vector.create([75, 30, 0]), 150).multiply(100));

            jerkV = jerkV.add(this.avoidEdges(100).multiply(1.5));

            if(this.getVectMag(jerkV) === 0){
                jerkV = jerkV.add(this.wander());
            }

            jerkV = this.constrainVectorMag(jerkV, this.get("maxJerk"));

            accelV = this.constrainVectorMag(accelV.add(jerkV), this.get("maxAccel"));
        }

        if(this.get("maxAccel") > 0){

            accelV = accelV
            // Apply ghetto drag.
            .multiply((1-this.get("frictionFactor")) || 1);

            velV = this.constrainVectorMag(velV.add(accelV), this.get("maxVel"));
        }

        if(this.get("maxVel") > 0){

            velV = velV
            // Apply ghetto drag.
            .multiply((1-this.get("frictionFactor")) || 1);

            /* Begin Experimental Vector code */

            if(this.cid === "c9") {
                // Set the color on the first tick to highlight the experimental entity.
                //if(!time) this.set("color", "green");

                /*console.log("jerkDir: " + this.radsToDegrees(jerkV.angleFrom(Vector.i)) + ", jerkMag: " + this.getVectMag(jerkV));
                console.log("accelDir: " + this.radsToDegrees(accelV.angleFrom(Vector.i)) + ", accelMag: " + this.getVectMag(accelV));
                console.log("velDir: " + this.radsToDegrees(velV.angleFrom(Vector.i)) + ", velMag: " + this.getVectMag(velV));*/
            }

            /* End Experimental Vector code */

            this.attributes.distanceTraveled += this.getVectMag(velV);
            if(this.attributes.distanceTraveled >= this.get("range")) {
                this.destroy();
                return;
            }

            posV = posV
            .add(velV);

            switch (this.get("edgeMode")) {
                case "constrain":
                    posV = Vector.create([this.constrainValue(posV.e(1), app.viewportWidth+radius, 0-radius), this.constrainValue(posV.e(2), app.viewportHeight+radius, 0-radius), 0]);
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
        }

        if(this.get("doCollisionChecks")){
            neighbors = neighbors || (this.attributes.neighbors = _(this.findNeighbors(app.entities, 15)));

            /*if(neighbors.size() > 0)
                console.log("neighbors: " + neighbors.size());*/

            var entity = this.getClosestEntity(_(neighbors.filter(function (entity) { return !this.get("firedBy") || (entity.get("color") !== this.get("firedBy").get("color")); }, this)));

            /*if(typeof entity != "undefined")
                console.log("entity was defined");*/

            if(entity && entity !== this.get("firedBy")){
                var entityPosV = entity.get("pos");

                if(this.isWithinDistanceGhetto(entityPosV,
                    ((this.get("collisionRadius") || this.get("radius")) +
                    (entity.get("collisionRadius") || entity.get("radius")))
                )){
                    this.collisionCallback(entity);
                }
            }
        }

        // Heal a small amount each tick.
        if(this.get("health") < 100) this.heal(0.1);

        var newProps = {
            jerk: jerkV,
            accel: accelV,
            vel: velV,
            pos: posV
        };

        if(app.recordTiming) window.time.stop("entity - tick");

        //this.set(newProps, { silent: true });
        _.extend(this.attributes, newProps);
        this.trigger("change");

        //if(this.cid === "c9")
            //console.log(newProps);
    },

    fireProjectileAt: function (at) {
        var posV = this.get("pos"),
            velV = this.get("vel"),
            atPosV = at.get("pos"),
            atVelV = at.get("vel"),
            
            projectiles = [],

            distance = posV.distanceFrom(atPosV),
            ticksToAt = distance/Proj.prototype.defaults.maxVel,

            projVel = atPosV
                .add(atVelV.multiply(ticksToAt*(1.1+app.random()*0.2))) // Skate to where the puck is going to be; 1.2 is THE magic number.
                .subtract(posV).toUnitVector().multiply(Proj.prototype.defaults.maxVel);

        for(var i = 0; i < 1; i++){
            projectiles.push(new Proj({
                color: this.get("color"),
                radius: 2,
                pos: posV.dup().subtract(velV.multiply(3)),
                vel: projVel.dup(),
                firedBy: this,
                firedAt: at
            }));
        }

        var $container = app.view.$el;
        var elems = [];
        
        _(projectiles).each(function (proj) {
            elems.push((new ProjView({ model: proj })).render().el);
        });
        
        $container.append($(elems));

        app.projectiles.add(projectiles);
    },

    kill: function () {
        var color = this.get("color"),

            posV = this.get("pos"),
            posX = posV.e(1),
            posY = posV.e(2),

            radius = this.get("radius");

        app.view.spawnEntity({
            color: color
        });
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
            if(entity === me) return;
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
        var neighbors = [],
            posV = this.get("pos"),

            filteredEntities = [],

            posInX = posV.e(1),
            posInY = posV.e(2);

        // Get close entities in the sortedBy.posX list.
        // Error is introduced by walkSortedList proportional to the distance
        // that the entities have moved, since their pos vectors are up-to-date
        // but the sort order of the sortedBy list is not.
        // This especially causes significant error when an entity wraps around the map.
        // This could be improved by sorting after every Entity moves,
        // at the cost of performance implications.
        var seen = {};
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, entities.sortedBy.posX, "x", 1, neighborhoodRadius, posInX));
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, entities.sortedBy.posX, "x", -1, neighborhoodRadius, posInX));
        // Get close entities in the sortedBy.posY list.
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, entities.sortedBy.posY, "y", 1, neighborhoodRadius, posInY));
        Array.prototype.push.apply(filteredEntities, this.walkSortedList(seen, entities.sortedBy.posY, "y", -1, neighborhoodRadius, posInY));

        var walked = 0;

        Array.prototype.push.apply(neighbors, _(filteredEntities).filter(function(entity){
            var entityPosV = entity.get("pos")/*,
                distance = posV.distanceFrom(entityPosV)*/;

            walked++;

            /*if(distance < neighborhoodRadius){*/
            if(this.isWithinDistanceGhetto(entityPosV, neighborhoodRadius)){
                return true;
            }
            return false;
        }, this));

        //console.log("findNeighborsFromSorted walked: "+walked);

        return neighbors;
    },
    walkSortedList: function(seen, list, axis, dir, range, posInAxis){
        var foundEntities = [],
        highDist = 0,
        listLength = list.length,
        dirSign = dir ? dir < 0 ? -1 : 1 : 0,
        step = (1*dirSign),
        currIndex = _.indexOf(list, this);

        // Account for trying to use the sorted list
        // from an entity not on the list.
        if(currIndex === -1){
            var closestEntity = this.getClosestEntity(list);
            currIndex = _.indexOf(list, _.find(list, function(entity){
                return entity === closestEntity;
            }));
        }

        while( currIndex >= 0 && currIndex < listLength && highDist < range ){
            var entity = list[currIndex];
            if(entity && !seen[entity.cid] && entity !== this){
                seen[entity.cid] = true;

                var thisPosInAxis = entity[axis === "x" ? "getPosX" : "getPosY"]();
                foundEntities.push(entity);
                highDist = Math.abs(thisPosInAxis - posInAxis);
            }
            currIndex += step;
        }

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
        return this.cohere(neighbors, 100).multiply(0.25)
                .add(this.align(neighbors, 100).multiply(2))
                .add(this.separate(neighbors, 50).multiply(50));
    },

    cohere: function (entities, neighborhoodRadius) {
        var color = this.get("color"),
            posV = this.get("pos"),

            sum = Vector.Zero(3),
            count = 0;

        entities.each(function(entity){
            if(entity.get("color") != color) return;

            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            /*if(distance > 0 && distance < neighborhoodRadius){*/
            if(this.isWithinDistanceGhetto(entityPosV, neighborhoodRadius)){
                sum = sum.add(entityPosV);
                count++;
            }
        }, this);

        if(count > 0){
            sum = sum.map(function(x){ return x / count; });
            //console.log("sum: "+sum.inspect());
            return this.steerTo(sum);
        } else {
            return sum; // Empty vector contributes nothing
        }
    },

    steerTo: function (target) {
        //console.log("target: " + target.inspect());

        var posV = this.get("pos");

        /*console.log("posX: " + posX);
        console.log("posY: " + posY);
        console.log("posV: " + posV.inspect());*/

        var desiredV = target.subtract(posV);

        //console.log("desiredV: " + desiredV.inspect());

        var distance = this.getVectMag(desiredV);

        //console.log("distance: " + distance);

        if(distance > 0){
            desiredV = desiredV.toUnitVector();

            // Two options for desired vector magnitude (1 -- based on distance, 2 -- maxspeed)
            if(distance < 100.0){
                desiredV = desiredV.multiply(this.get("maxVel")*(distance/100.0)); // This damping is somewhat arbitrary
            } else {
                desiredV = desiredV.multiply(this.get("maxVel"));
            }

            //console.log("desiredV: " + desiredV.inspect());

            var velV = this.get("vel");

            //console.log("velV: " + velV.inspect());

            var steer = desiredV.subtract(velV);

            //console.log("steer: " + steer.inspect());

            steer = this.constrainVectorMag(steer, this.get("maxJerk"));
            //console.log("steer: " + steer.inspect());

            //exit();

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
                entityVelV = entity.get("vel"),
                distance = posV.distanceFrom(entityPosV);

            /*if(distance > 0 && distance < neighborhoodRadius){*/
            if(this.isWithinDistanceGhetto(entityPosV, neighborhoodRadius)){
                mean = mean.add(entityVelV);
                count++;
            }
        }, this);

        if(count > 0)
            mean = mean.map(function(x){ return x / count; }).toUnitVector();

        //mean = this.constrainVectorMag(mean, this.get("maxJerk"));

        return mean;
    },

    separate: function (entities, desiredDistance) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.Zero(3),

            count = 0;

        entities.each(function(entity){
            if(entity.get("color") != color) return;
            //console.log("each entity");
            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            //console.log(distance);

            /*if(distance > 0 && distance < desiredDistance){*/
            if(this.isWithinDistanceGhetto(entityPosV, desiredDistance)){
                mean = mean.add(posV.subtract(entityPosV).toUnitVector().map(function(x){ return x / distance; }));
                //console.log("mean:" + mean.inspect());
                count++;
            }
        }, this);

        if(count > 0)
            mean = mean.map(function(x){ return x / count; });

        //console.log("mean:" + mean.inspect());

        return mean;
    },

    avoidOther: function (entities, desiredDistance) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.Zero(3),

            count = 0;

        entities.each(function(entity){
            if(entity.get("color") == color) return;
            //console.log("each entity");
            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            //console.log(distance);

            /*if(distance > 0 && distance < desiredDistance){*/
            if(this.isWithinDistanceGhetto(entityPosV, desiredDistance)){
                mean = mean.add(posV.subtract(entityPosV).toUnitVector().map(function(x){ return x / distance; }));
                //console.log("mean:" + mean.inspect());
                count++;
            }
        }, this);

        if(count > 0)
            mean = mean.map(function(x){ return x / count; });

        //console.log("mean:" + mean.inspect());

        return mean;
    },

    avoidPosition: function (avoidV, desiredDistance) {
        var posV = this.get("pos"),

            distance = posV.distanceFrom(avoidV);

        /*if(distance < desiredDistance){*/
        if(this.isWithinDistanceGhetto(avoidV, desiredDistance)){
            return posV.subtract(avoidV).toUnitVector().map(function(x){ return x / distance; });
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
            vect = vect.add(Vector.create([1, 0, 0]));

        if(distanceFromRight <= desiredDistance)
            vect = vect.add(Vector.create([-1, 0, 0]));

        if(distanceFromTop <= desiredDistance)
            vect = vect.add(Vector.create([0, 1, 0]));

        if(distanceFromBottom <= desiredDistance)
            vect = vect.add(Vector.create([0, -1, 0]));

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
        var sumPow = 0;
        vect.each(function(x, i) {
            sumPow += Math.pow(x, 2);
        });
        return Math.sqrt(sumPow);
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

var EntityView = Backbone.View.extend({

    tagName: 'div',
    className: 'entity',
    
    initialize: function (args) {
        this.model.view = this;
        this.listenTo(this.model, 'change', _.bind(this.render, this));

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

        var degree = this.model.radsToDegrees(this.model.get("vel").angleFrom(Vector.j));
        if(velX > 0) degree = -degree;
        
        // Update entity element CSS.
        this.$el.css({
            /*backgroundColor: this.model.get("color"),
            width: diam,
            height: diam,*/
            top: (posY-radius)+"px",
            left: (posX-radius)+"px",

            '-webkit-transform': 'rotate(' + degree + 'deg)',
            '-moz-transform': 'rotate(' + degree + 'deg)',
            '-o-transform': 'rotate(' + degree + 'deg)',
            '-ms-transform': 'rotate(' + degree + 'deg)',
            'transform': 'rotate(' + degree + 'deg)',

            'opacity': (this.model.get("health")/100)*0.5+0.5
        });

        // Draw color trail.
        app.backdropCtx.beginPath();
        app.backdropCtx.fillStyle = this.model.get("color");
        var velMag = this.model.getVectMag(Vector.create([velX, velY, 0]));
        var trailRad = Math.abs(this.model.get("maxVel")+1-velMag);
        // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        app.backdropCtx.arc(posX, posY, trailRad, 0, 2 * Math.PI, false);
        app.backdropCtx.fill();

        // Draw neighbor mesh.
        if(app.drawFlockMesh){
            var neighbors = this.model.get("neighbors");
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
        if(this.model.get("health") < 25 && app.tickPhase % 8 === 0 && !(this.model instanceof Proj)){
            app.backdropCtx.beginPath();
            app.backdropCtx.fillStyle = "gray";
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.backdropCtx.arc(posX+(app.random()*8)-4, posY+(app.random()*8)-4, 2+(app.random()*2), 0, 2 * Math.PI, false);
            app.backdropCtx.fill();
        }

        if(app.recordTiming) time.stop("entity - render");
        
        return this;
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
  model: Entity
});

var Proj = Entity.extend({
    defaults: _.extend({}, Entity.prototype.defaults, {
        maxJerk: 0,
        maxAccel: 0,
        maxVel: Entity.prototype.defaults.maxVel*1.5,
        frictionFactor: 0,
        edgeMode: "destroy",
        doCollisionChecks: true,

        range: 300
    }),

    collisionCallback: function (entity) {
        //console.log("projectile collided with entity: " + entity.cid);
        var firedBy = this.get("firedBy");

        if(entity.injure(20) && firedBy){
            app.killStats[firedBy.get("color")] = app.killStats[firedBy.get("color")] || { kills: 0, deaths: 0 };
            app.killStats[firedBy.get("color")].kills++;
            app.view.renderKillStats();
        }
        this.destroy();
    }
});

var ProjView = EntityView.extend({
    className: 'entity proj'
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

        var $el = this.$el = $("#app");

        this.model = new AppModel({
            //
        });

        $el.css({
            width: app.viewportWidth,
            height: app.viewportHeight
        });
        
        var entities = this.model.entities = app.entities = new EntityCollection();
        entities.sortedBy = { posX: [], posY: [] };

        this.model.projectiles = app.projectiles = new ProjCollection();
        
        this.spawnEntities(12*4);

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

    spawnEntities: function (num) {
        var $container = this.$el,
            elems = [];

        var entities = [];
        for(var i = 0; i < num; i++){
            entities.push(new Entity({
                //color: i % 2  ? "blue" : "red",
                color: i % 4 === 0 ? "blue" : i % 4 === 1 ? "red" : i % 4 === 2 ? "green" : "orange",
                pos: Vector.create([Math.round(Math.random()*app.viewportWidth), Math.round(Math.random()*app.viewportHeight), 0])
            }));
        }
        
        _(entities).each(function (entity) {
            elems.push((new EntityView({ model: entity })).el);
        });
        
        $container.append($(elems));
        this.model.entities.add(entities);

        // Insert these entities into the proper locations in
        // the custom sortedBy lists.
        _(entities).each(function (entity) {
            this.insertSorted(this.model.entities, entity);
        }, this);
        this.sortEntities(this.model.entities);
    },
    spawnEntity: function(obj){
        var $container = this.$el,

            entity = new Entity(_.extend({
                pos: Vector.create([Math.round(Math.random()*app.viewportWidth), Math.round(Math.random()*app.viewportHeight), 0])
            }, obj)),
        
            elem = (new EntityView({ model: entity })).el;
        
        $container.append($(elem));
        this.model.entities.add(entity);

        // Insert these entities into the proper locations in
        // the custom sortedBy lists.
        this.insertSorted(this.model.entities, entity);
        this.sortEntities(this.model.entities);
    },

    // Takes a collection of Entities and updates its custom
    // sortedBy arrays.
    sortEntities: function (entities) {
        var posXArr = entities.sortedBy.posX = (entities.sortedBy.posX || []),
            posYArr = entities.sortedBy.posY = (entities.sortedBy.posY || []);

        if(!posXArr.length) Array.prototype.push.apply(posXArr, entities.models.slice());
        if(!posYArr.length) Array.prototype.push.apply(posYArr, entities.models.slice());

        posXArr.sort(Entity.compareByPosX);
        posYArr.sort(Entity.compareByPosY);
    },
    insertSorted: function(entities, entity){
        var posXArr = entities.sortedBy.posX,
            posYArr = entities.sortedBy.posY;/*,

            indexX = _.sortedIndex(posXArr, entity, Entity.compareByPosX),
            indexY = _.sortedIndex(posYArr, entity, Entity.compareByPosY);*/

        //Array.prototype.splice.apply(posXArr, [indexX, 0, entity]);
        //Array.prototype.splice.apply(posYArr, [indexY, 0, entity]);

        /*posXArr.splice(indexX, 0, entity);
        posYArr.splice(indexY, 0, entity);*/

        posXArr.push(entity);
        posYArr.push(entity);
    },

    events: {
        // any user events (clicks etc) we want to respond to
        "mousemove": "recordMouseMove",
        "click": "handleClick"
    },

    recordMouseMove: function (e) {
        var offset = this.$el.offset();

        app.mouseX = e.pageX-offset.left,
        app.mouseY = e.pageY-offset.top;
    },

    handleClick: function (e) {
        var randomizeSign = function(x){ return x * Math.pow(-1, Math.round(Math.random()*10)); };
        var projectiles = [];
        for(var i = 0; i < 10; i++){
            projectiles.push(new Proj({
                color: "black",
                radius: 2,
                pos: Vector.create([app.mouseX, app.mouseY, 0]),
                vel: Vector.Random(2).to3D().map(randomizeSign).toUnitVector().multiply(Proj.prototype.defaults.maxVel)
            }));
        }

        var $container = this.$el;
        var elems = [];
        
        _(projectiles).each(function (proj) {
            elems.push((new ProjView({ model: proj })).render().el);
        });
        
        console.log(elems);
        
        $container.append($(elems));

        this.model.projectiles.add(projectiles);
    },

    // grab and populate our main template
    render: function () {
    
        /*var $container = this.$el;
        var elems = [];
        
        this.model.entities.each(function (entity) {
            elems.push((new EntityView({ model: entity })).render().el);
        });
        
        console.log(elems);
        
        $container.append($(elems));*/
        
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

var frameRateAverager = new SimpleMovingAverager(10);

this.framesSeen = 0;
this.lastSecond = 0;
this.frameRate = 0;
this.lastAnimationTime = 0;
this.baseTickLength = 18;
this.tickLength = this.baseTickLength;

this.tickPhase = 0;
this.tickPhaseLength = 100;

this.tick = function tick (time) {
    if(time){
        time = (new Date()).getTime();
        app.tickLength = time - app.lastAnimationTime;
    }

    // The overlay layer should not persist.
    this.overlayCtx.clearRect(0, 0, app.overlay.width, app.overlay.height);

    this.entities.each(function (entity, index) {
        entity.tick(time, index, app.entities.models.length);
    });

    this.projectiles.each(function (proj, index) {
        proj.tick(time, index, app.projectiles.models.length);
    });

    this.view.sortEntities(this.entities);

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

    window.requestAnimationFrame(_.bind(tick, this));
};

this.target = Vector.create([0,0,0]);

this.getEntDist = function(a,b){
    return app.entities.find(function(ent) { return ent.cid === a; }).get("pos").distanceFrom(app.entities.find(function(ent) { return ent.cid === b; }).get("pos"));
};

this.startup = function (e) {
    this.view = new AppView();

    // The first tick doesn't receive a time.
    this.tick();
};

$(document).ready(_.bind(this.startup, this));

$(window).resize(function(){
    app.view.resizeViewport(window.innerWidth || $(window).width(), window.innerHeight || $(window).height());
});

// End namespace setup
}).call(app, jQuery, window._, window, document);