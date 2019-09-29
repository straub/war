
define([
    'jquery','underscore','backbone',
    'app/vector'
    ],
function ($, _, Backbone, Vector) {

var Entity = Backbone.Model.extend(
// Instance properties.
{
    defaults: {
        color: "green",
        radius: 10,

        heading: Math.PI/4,

        pos: Vector.create(0,0),
        vel: Vector.create(0,0),
        accel: Vector.create(0,0),
        jerk: Vector.create(0,0),

        playerControlled: false,

        sightRadius: 300,

        minVel: 1,
        maxVel: 3,
        maxAccel: 0.5,
        maxJerk: 1,
        jerkMag: 1,
        frictionFactor: 0.07,

        avoidanceRange: 100,
        avoidanceStrength: 150,
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
        firingRate: 1, // Projectiles per second.
        lastFired: 0,
        accuracy: 0.8,
        muzzleVel: 6,
        weaponRange: 450,
        damage: 20,

        edgeMode: "bounce",

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

        if (this instanceof Proj) {
            app.entityCounts.Proj++;
        }

        // Merge in special team attributes.
        if (!(this instanceof Proj)) {
            var teamDefaults = Entity.teamDefaults[this.get("color")];
            if (teamDefaults) {
                var defaults = _.result(this, 'defaults');
                if (defaults) {
                    this.attributes = _.defaults({}, teamDefaults, this.attributes);
                }
            }
        }

        if (this.get("playerControlled")) {
            this.attributes.health *= 1.2;
            this.attributes.health *= 3;
            this.attributes.maxHealth *= 3;
            this.attributes.healRate = 0.1;
        }
    },
    destroy: function () {
        this.trigger("destroy", this, this.collection, {});
        if (this.view) this.view.remove();
        delete this.view;

        if (this instanceof Proj) {
            app.entityCounts.Proj--;
        }

        this.releaseVectors();
    },

    releaseVectors: function () {
        return;
        _.each(['pos','vel','accel','jerk'], function (key) {
            if (this.attributes[key]) {
                this.attributes[key].release();
                this.attributes[key] = void 0;
            }
         }, this);
    },

    tick: function (time, entityIndex, totalEntities) {

        this.alreadyFoundNeighbors = false;
        // Freshen tickCache.
        for (var key in this.tickCache) this.tickCache[key] = void 0;

        var jerkV = this.get("jerk"),
            accelV = this.get("accel"),
            velV = this.get("vel"),
            posV = this.get("pos");

        this.runAI = this.shouldRunAI(time, entityIndex, totalEntities);

        jerkV = this.getImpulse(jerkV, velV, time, entityIndex, totalEntities);

        accelV = this.updateAcceleration(accelV, jerkV);

        velV = this.updateVelocity(velV, accelV);

        posV = this.updatePosition(posV, velV);

        if (this.runAI) this.runWeaponsAI(time);

        this.checkForCollision();

        this.regenHealth();

        this.saveUpdatedVectors(jerkV, accelV, velV, posV);

        // This entity is done for this tick, so we can clear its tick cache.
        //for (var key in this.tickCache) this.tickCache[key] = void 0;
    },

    draw: function () {
        if (!app.haltRender && this.view) this.view.render();
    },

    shouldRunAI: function (time, entityIndex, totalEntities) {
        return true; // Disabling AI segments for now. 

        var segments = app.segmentsOverride || 3,
            currentSegment = app.tickPhase % segments,
            segLoc = entityIndex / totalEntities;

        // Do the AI calculations only if we're in the current segment.
        if (currentSegment/segments <= segLoc && (currentSegment+1)/segments > segLoc) {
            return true;
        }

        return false;
    },

    getImpulse: function (jerkV, velV, time, entityIndex, totalEntities) {
        // Reset jerkV to zero.
        jerkV.elements[0] = 0;
        jerkV.elements[1] = 0;

        if (this.get("playerControlled")) {

            jerkV = this.getImpulseFromPlayerControl(jerkV, velV, time, entityIndex, totalEntities);

        } else {
            if (this.runAI) {
                jerkV = this.getImpulseFromAI(jerkV, velV, time, entityIndex, totalEntities);
            }
        }

        jerkV = this.constrainVectorMag(jerkV, this.get("maxJerk"));

        return jerkV;
    },
    getImpulseFromPlayerControl: function (jerkV, velV, time, entityIndex, totalEntities) {
        var thrustFactor = 0.5;

        // 87 - w
        if (app.view.keysPressed[87]) {
            jerkV = jerkV.add(velV.dup().toUnitVector().multiply(this.get("maxJerk")));

            if (this.getVectMagGhetto(jerkV) === 0 && typeof(this.get("heading")) !== "undefined")
                jerkV = jerkV.add(Vector.j.dup().rotate(this.get("heading")));
        }/* else if (!app.view.keysPressed[65] && !app.view.keysPressed[68]) {
            // If no thrust is being applied, circle left.

            jerkV = jerkV
                .add(velV.dup().toUnitVector().multiply(this.get("maxJerk")*0.5)) // Small forward thrust for wide circle.
                .add(velV.dup().rotate(-Math.PI/2, Line.Z).toUnitVector().multiply(this.get("maxJerk")*thrustFactor)); // Left thrust.
        }*/

        // 65 - a
        if (app.view.keysPressed[65] && this.getVectMagGhetto(velV)) {
            jerkV = jerkV.add(velV.dup().rotate(-Math.PI/2).toUnitVector().multiply(this.get("maxJerk")*thrustFactor)); // Left thrust.
        }

        // 83 - s
        /*if (app.view.keysPressed[83]) {
            jerkV = this.constrainVectorMag(jerkV.add(velV.toUnitVector().multiply(-1)), this.getVectMag(velV)).multiply(0.5);
        }*/

        // 68 - d
        if (app.view.keysPressed[68] && this.getVectMagGhetto(velV)) {
            jerkV = jerkV.add(velV.dup().rotate(Math.PI/2).toUnitVector().multiply(this.get("maxJerk")*thrustFactor)); // Right thrust.
        }

        // 32 - spacebar
        if (app.view.keysPressed[32] && this.canFire(time, /* playerControlled */ true)) {
            this.fireProjectileAtVect(time, this.get("pos").dup().add(velV));
        }

        return jerkV;
    },
    getImpulseFromAI: function (jerkV, velV, time, entityIndex, totalEntities) {
        var neighbors;

        if (this.get("maxJerk") > 0) {
            // jerkV = Vector.create(0,0);

            neighbors = this.getNeighbors(this.get("sightRadius"));

            var sumHealth = function(memo, entity){
                return memo + entity.get("health");
            };

            // If half of the total health of the neighbors are friends,
            // avoidance is unchanged.
            // If alone among enemies, avoid more strongly.
            // If near more friends than enemies, adjusted for health,
            // avoidance can be negative, meaning move toward enemies.
            var sumNeighborsHealth = neighbors
                .reduce(sumHealth, this.get("health"));

            var sumTeamNeighborsHealth = neighbors
                    .chain()
                    .filter(function(ent){
                        return this.get("color") === ent.get("color");
                    }, this)
                    .reduce(sumHealth, this.get("health")).value();

            //var avoidanceFactor = sumNeighborsHealth*0.5 - sumTeamNeighborsHealth;
            var avoidanceFactor = (0.5 - (sumTeamNeighborsHealth/sumNeighborsHealth)) * 2;

            this.attributes.aiState = avoidanceFactor <= 0 ? "hunting" : "avoiding";

            if(this.get("aiState") === "avoiding"){
                avoidanceFactor *= this.get("avoidanceStrength");

                var avoidance = this.avoidOther(neighbors, this.get("avoidanceRange")).multiply(this.get("avoidanceRange")/2);

                jerkV = jerkV.add(avoidance);

                avoidance.release();

            } else if (this.get("aiState") === "hunting") {
                var firstTarget = this.selectTargets( /* playerControlled */ false )[0];

                if(firstTarget){
                    var predictedPos = firstTarget.get("pos").dup().add(firstTarget.get("vel")),
                        approach = this.approach(predictedPos, this.get("weaponRange")/2).multiply(100);

                    jerkV = jerkV.add(approach);

                    approach.release();
                }
            }

            var flock = this.flock(neighbors);

            jerkV = jerkV.add(flock);

            flock.release();

            if (typeof(app.mouseX) != "undefined") {
                var mousePos = Vector.create(app.mouseX, app.mouseY),
                    avoidMouse = this.avoidPosition(mousePos, 150).multiply(100);
                mousePos.release();

                jerkV = jerkV.add(avoidMouse);

                avoidMouse.release();
            }

            if (!app.logoPos) {
                app.logoPos = Vector.create(75, 30);
            }
            var avoidLogo = this.avoidPosition(app.logoPos, 200).multiply(150);

            jerkV = jerkV.add(avoidLogo);

            avoidLogo.release();

            var avoidEdges = this.avoidEdges(this.get("edgeAvoidanceRange"))
                                .multiply(this.get("edgeAvoidanceStrength"));

            jerkV = jerkV.add(avoidEdges);

            avoidEdges.release();

            if (this.getVectMagGhetto(jerkV) === 0) {
                this.attributes.aiState = "wander";

                var wander = this.wander();

                jerkV = jerkV.add(wander);

                wander.release();
            }

            // Since I'm currently simulating planes, I don't want to allow
            // reverse impulse/thrust, as it looks very weird when an airplane
            // immediately faces the opposite direction.
            var jerkAngle = velV.angleFromFull(jerkV);
            var jerkAngleAbs = Math.abs(jerkAngle);
            var ninetyDegreesInRads = Math.PI/2;
            if(jerkAngleAbs > ninetyDegreesInRads){ // 90 degrees
                jerkV = jerkV
                    .rotate(jerkAngle > 0 ? jerkAngle-ninetyDegreesInRads : jerkAngle+ninetyDegreesInRads);

                jerkV.multiply(1-(jerkAngleAbs-ninetyDegreesInRads)/ninetyDegreesInRads);
            }
        }

        return jerkV;
    },

    updateAcceleration: function (accelV, jerkV) {
        if (this.get("maxAccel") <= 0) {
            return accelV;
        }

        accelV = this.constrainVectorMag(accelV.add(jerkV), this.get("maxAccel"))
        // Apply ghetto drag.
        .multiply((1-this.get("frictionFactor")) || 1);

        return accelV;
    },
    updateVelocity: function (velV, accelV) {
        if (this.get("maxVel") <= 0) {
            return velV;
        }

        velV = this.constrainVectorMag(velV.add(accelV), this.get("maxVel"), this.get("minVel"))
            // Apply ghetto drag.
            .multiply((1-this.get("frictionFactor")) || 1);

        var radians = velV.angleFrom(Vector.j);
        this.attributes.heading = velV.e(1) > 0 ? -radians : radians;

        if (_.isFinite(this.get("range"))) {
            this.attributes.distanceTraveled += this.getVectMag(velV);
            if(this.attributes.distanceTraveled >= this.get("range")) {
                this.kill();
            }
        }

        return velV;
    },
    updatePosition: function (posV, velV) {
        if (this.get("maxVel") <= 0) {
            return posV;
        }

        var radius = this.get("radius") || 0;

        posV = posV.add(velV);

        switch (this.get("edgeMode")) {
            case "bounce":
                if (posV.e(1) < 0 || posV.e(1) > app.worldWidth) {
                    velV.elements[0] = -velV.elements[0];
                }
                if (posV.e(2) < 0 || posV.e(2) > app.worldHeight) {
                    velV.elements[1] = -velV.elements[1];
                }

                posV.elements[0] = this.constrainValue(posV.e(1), app.worldWidth, 0);
                posV.elements[1] = this.constrainValue(posV.e(2), app.worldHeight, 0);

                break;
            case "constrain":

                posV.elements[0] = this.constrainValue(posV.e(1), app.worldWidth, 0);
                posV.elements[1] = this.constrainValue(posV.e(2), app.worldHeight, 0);

                break;
            case "destroy":
                if (posV.e(1) < 0 || posV.e(1) > app.worldWidth || posV.e(2) < 0 || posV.e(2) > app.worldHeight) {

                    this.destroy();
                }
                break;
            case "wrap":
            default:

                // Wrap edge to edge.
                posV.elements[0] = this.wrapValue(posV.e(1), app.worldWidth+radius, 0-radius);
                posV.elements[1] = this.wrapValue(posV.e(2), app.worldHeight+radius, 0-radius);

                break;
        }

        return posV;
    },
    checkForCollision: function () {
        if(!this.get("doCollisionChecks")) return;

        var neighbors = this.getNeighbors((this.get("collisionRadius") || this.get("radius")) + 10),
            entity = this.getClosestEntity(_(neighbors.filter(function (entity) {
                // Prevent friendly fire.
                return !this.get("firedBy") || (entity.get("color") !== this.get("firedBy").get("color"));
            }, this)));

        if (entity && entity !== this.get("firedBy") && !(entity instanceof Proj)) {
            var entityPosV = entity.get("pos");

            if (this.isWithinDistanceGhetto(entityPosV,
                ((this.get("collisionRadius") || this.get("radius")) +
                (entity.get("collisionRadius") || entity.get("radius")))
            )){
                this.collisionCallback(entity);
            }
        }
    },
    regenHealth: function () {
        // Heal a small amount each tick.
        if (this.get("healRate") && this.get("health") < this.get("maxHealth")) {
            /*var friendlyNeighbors = this.getNeighbors(this.get("sightRadius"))
                .filter(function (ent) {
                    return this.get("color") === ent.get("color");
                }, this);

            // Entities heal faster near friendlies.
            var healRate = this.get("healRate") * (1 + friendlyNeighbors.length * 0.05);*/

            this.heal(this.get("healRate")*(this.get("maxHealth")/100));
        }
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
        if (this instanceof Proj || !this.get("autoFire") || !this.canFire(time, playerControlled)) return;

        targets = this.selectTargets(playerControlled);

        _(targets).every(function (entity) {
            this.fireProjectileAt(time, entity);
            // Keep firing until we can't or we run out of targets.
            return this.canFire(time, playerControlled);
        }, this);
    },
    selectTargets: function (playerControlled) {
        var target;

        target = this.getNeighbors(this.get("sightRadius")).chain()
        // Grab the neighbors of other colors (if any).
        .filter(function (entity) {
            return this.get("color") !== entity.get("color");
        }, this)
        // Select the ones with the lowest health.
        .allMin(function (entity) {
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
        // Firing rate is projectiles per second.
        return time && (time - this.get("lastFired") >= 1000/this.get("firingRate"))/* &&
            (playerControlled || app.entityCounts.Proj < app.entities.size()/2)*/;
    },
    fireProjectileAt: function (time, at) {
        var posV = this.get("pos"),
            atPosV = at.get("pos"),
            atVelV = at.get("vel"),

            distance = posV.distanceFrom(atPosV),
            ticksToAt = distance/this.get("muzzleVel"),

            accuracyFactor = 1-this.get("accuracy"),

            // Skate to where the puck is going to be.
            // 1.2 is THE magic number.
            predictedAt = atVelV.dup().multiply(ticksToAt/**(1.2+(app.random()*accuracyFactor-(accuracyFactor/2)))*/),

            atV = atPosV.dup().add(predictedAt);

        predictedAt.release();

        this.fireProjectileAtVect(time, atV, at);
    },
    // Releases atV after it's used. 
    fireProjectileAtVect: function (time, atV, at) {
        var posV = this.get("pos"),
            projVel = atV
                .subtract(posV).toUnitVector().multiply(this.get("muzzleVel"));

        //projVel.add(this.get('vel'));

        var proj = Proj.create({
            id: _.uniqueId('ent'),
            color: this.get("color"),
            radius: 5 + (2 * (this.get('damage')/20) - 2),
            pos: posV.dup(),
            vel: projVel.dup(),
            range: this.get("weaponRange"),
            firedBy: this,
            firedAt: at
        });

        projVel.release();

        if (!proj.view) new ProjView({ model: proj });

        this.attributes.lastFired = time;

        app.entities.add(proj);
    },

    kill: function () {
        var color = this.get("color"),

            posV = this.get("pos"),
            posX = posV.e(1),
            posY = posV.e(2),

            radius = this.get("radius");

        this.respawn();
        this.destroy();

        /*if(!app.haltRender){
            app.backdropCtx.fillStyle = color;
            for(var i = 0; i <= 10; i++){
                app.backdropCtx.beginPath();
                // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
                app.backdropCtx.arc(posX+(app.random()*radius*2)-radius, posY+(app.random()*radius*2)-radius, (radius/3)+(app.random()*(radius/3)), 0, 2 * Math.PI, false);
                app.backdropCtx.fill();
            }
        }*/
        for (var i = 0; i <= 5; i++) {
            Particle.spawnParticle({
                pos: Vector.create(posX+(app.random()*radius*2)-radius, posY+(app.random()*radius*2)-radius),
                vel: Vector.create(2-app.random()*4, 2-app.random()*4),
                life: 25,
                maxLife: 25,
                color: Entity.colorMap[color] || color,
                radius: (radius/3)+(app.random()*(radius/3))
            });
        }

        app.killStats[color] = app.killStats[color] || { kills: 0, deaths: 0 };
        app.killStats[color].deaths++;
        app.view.renderKillStats();
    },
    injure: function (damage) {
        var newHealth = this.get("health") - damage;
        if (newHealth <= 0) {
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

        // Using setTimeout here causes interleaving
        // and inconsistency in my randomness.
        // Could potentially use a counter, since I
        // already have a tick loop running, but I'm
        // not sure I care enough about delayed respawns
        /*setTimeout(function(){*/
            var entity = coll.spawnEntity(
                playerControlled ? {
                    playerControlled: playerControlled
                } : {
                    color: color
                }
            );

            /*if(playerControlled){
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
            }*/

        /*}, 1000+(app.random()*2000));*/
    },

    getNeighbors: function (sightRadius) {
        // The tickCache is deleted after the tick,
        // so it should only exist if it's been calculated in this tick.
        if (this.tickCache.neighbors && sightRadius <= this.lastSightRadius) {
            return this.tickCache.neighbors;
        } else if (this.tickCache.neighbors) {
            console.warn('Expensive op: rebuilding neighbors list for larger sightRadius. '+
                'sightRadius: '+sightRadius+' lastSightRadius: '+this.lastSightRadius);
        }

        this.lastSightRadius = sightRadius;

        var neighbors = this.tickCache.neighbors = _(this.findNeighbors(app.entities, sightRadius));

        return neighbors;
    },
    findNeighbors: function (entities, sightRadius) {
        /*var neighborsNaive = this.findNeighborsNaive(entities, sightRadius),
            neighborsFromSorted = this.findNeighborsFromSorted(entities, sightRadius);

        if(neighborsNaive.length != neighborsFromSorted.length)
            console.error("Neighbor lists are not equal length!");

        return neighborsNaive;

        return this.findNeighborsNaive(entities, sightRadius);*/
        return this.findNeighborsFromSorted(entities, sightRadius);
    },

    findNeighborsNaive: function (entities, sightRadius) {
        var me = this,
            neighbors = [],
            posV = this.get("pos");

        var walked = 0;

        Array.prototype.push.apply(neighbors, entities.filter(function (entity) {
            if (entity === me || entity instanceof Proj) return;
            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            walked++;

            if (distance < sightRadius) {
                return true;
            }
            return false;
        }));

        return neighbors;
    },

    findNeighborsFromSorted: function (entities, sightRadius) {
        if (this.alreadyFoundNeighbors) {
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

            neighbors = this.tickCache.neighborsSeen ?
                _.values(this.tickCache.neighborsSeen) :
                [],
            filteredEntities = [],
            seen = _.extend({}, this.tickCache.neighborsSeen || {}),

            walkLimit = this.get("walkLimit") || 5,

            sortedListX = entities.getIndex('posX'),
            sortedListY = entities.getIndex('posY'),

            sortedIndexX = typeof(this.indexes.byPosX) !== "undefined" ?
                            this.indexes.byPosX :
                            _.sortedIndex(sortedListX, this, Entity.getPosX),
            sortedIndexY = typeof(this.indexes.byPosY) !== "undefined" ?
                            this.indexes.byPosY :
                             _.sortedIndex(sortedListY, this, Entity.getPosY);

        this.walkSortedList(filteredEntities, seen, sortedIndexX, sortedListX, "x", 1,  sightRadius, posInX, walkLimit);
        this.walkSortedList(filteredEntities, seen, sortedIndexX, sortedListX, "x", -1, sightRadius, posInX, walkLimit);
        // Get close entities in the indexes.posY list.
        this.walkSortedList(filteredEntities, seen, sortedIndexY, sortedListY, "y", 1,  sightRadius, posInY, walkLimit);
        this.walkSortedList(filteredEntities, seen, sortedIndexY, sortedListY, "y", -1, sightRadius, posInY, walkLimit);

        Array.prototype.push.apply(neighbors, _(filteredEntities).filter(function (entity) {
            var entityPosV = entity.get("pos");

            if (this.isWithinDistanceGhetto(entityPosV, sightRadius)) {

                if (!this.tickCache.neighborsSeen) this.tickCache.neighborsSeen = {};
                this.tickCache.neighborsSeen[entity.id] = entity;
                if (!entity.tickCache.neighborsSeen) entity.tickCache.neighborsSeen = {};
                entity.tickCache.neighborsSeen[this.id] = this;

                return true;
            }
            return false;
        }, this));

        this.alreadyFoundNeighbors = true;

        return neighbors;
    },
    walkSortedList: function (foundEntities, seen, sortedIndex, sortedList, axis, dir, range, posInAxis, walkLimit) {
        var highDist = 0,
            listLength = sortedList.length,
            step = dir ? dir < 0 ? -1 : 1 : 0,
            currIndex = sortedIndex,
            posFunc = axis === "x" ? "getPosX" : "getPosY",
            entPosInAxis,

        // Account for trying to use the sorted list
        // from an entity not on the list.
        /*if (currIndex === -1) {
            console.warn("Expensive op: Called walkSortedList() from entity not on sorted list.");

            var closestEntity = this.getClosestEntity(sortedList);
            currIndex = _.indexOf(sortedList, _.find(sortedList, function(entity){
                return entity === closestEntity;
            }));
        }*/

            walked = 0,
            entity;

        while (currIndex >= 0 && currIndex < listLength && highDist <= range && walked < walkLimit) {
            entity = sortedList[currIndex];

            if (entity && !seen[entity.id]) {
                if (!(entity instanceof Proj) && entity !== this) {
                    entPosInAxis = entity[posFunc]();

                    foundEntities.push(entity);

                    // Using ternary rather than Math.abs
                    // http://jsperf.com/math-abs-perf-vs-ternary
                    /*highDist = Math.abs(entPosInAxis - posInAxis);*/
                    highDist = entPosInAxis > posInAxis ?
                        entPosInAxis - posInAxis :
                        posInAxis - entPosInAxis;
                } else {
                    // We can walk one more because this turned out to
                    // be a projectile or our current entity.
                    walked--;
                }
                seen[entity.id] = true;
            }

            walked++;
            currIndex += step;
        }

        // Now modifies the array directly, rather than returning new array.
        // return foundEntities;
    },
    getDistanceGhetto: function (vect) {
        var posV = this.get("pos"),
            sum = 0,
            distRoot;

        for(var i = 0; i < vect.elements.length; i++) {
            distRoot = posV.elements[i] - vect.elements[i];
            sum += distRoot*distRoot;
        }

        return sum;
    },
    isWithinDistanceGhetto: function (vect, distance) {
         return this.getDistanceGhetto(vect) < distance*distance;
    },

    getClosestEntity: function (entities) {
        var posV = this.get("pos"),
            closest,
            lastDistance = Infinity;

        _(entities).each(function(entity){
            var entityPosV = entity.get("pos"),
                distanceGhetto = this.getDistanceGhetto(entityPosV);

            if (distanceGhetto < lastDistance) {
                closest = entity;
                lastDistance = distanceGhetto;
            }
        }, this);

        return closest;
    },

    wander: function () {
        var randomizeSign = function(x){ return x * Math.pow(-1, Math.round(app.random()*10)); };
        var tempJerk = app.randVector().map(randomizeSign).toUnitVector();

        if (this.radsToDegrees(this.get("vel").angleFrom(tempJerk)) < 90)
            return tempJerk.multiply(this.get("maxJerk")*0.2);

        return Vector.create(0,0);
    },

    flock: function(neighbors) {
        var cohesion = this.cohere(neighbors, this.get("cohesionRange"))
                    .multiply(this.get("cohesionStrength")),
            alignment = this.align(neighbors, this.get("alignmentRange"))
                    .multiply(this.get("alignmentStrength")),
            separation = this.separate(neighbors, this.get("separationRange"))
                    .multiply(this.get("separationStrength"));

        return cohesion.add(alignment).add(separation);
    },

    cohere: function (entities, sightRadius) {
        var color = this.get("color"),
            posV = this.get("pos"),

            sum = Vector.create(0,0),
            count = 0;

        entities.each(function(entity){
            if (entity.get("color") !== color) return;

            var entityPosV = entity.get("pos");

            if (this.isWithinDistanceGhetto(entityPosV, sightRadius)) {
                sum = sum.add(entityPosV);
                count++;
            }
        }, this);

        if (count > 0) {
            sum = sum.divide(count);
            return this.steerTo(sum);
        } else {
            return sum; // Empty vector contributes nothing
        }
    },
    approach: function (target, desiredDistance) {

        var posV = this.get("pos");

        var desiredV = target.subtract(posV);

        var distance = this.getVectMag(desiredV);

        if (distance > desiredDistance) {
            desiredV = desiredV.toUnitVector();

            // Two options for desired vector magnitude (1 -- based on distance, 2 -- maxspeed)
            var steerDampingDistance = this.get("steerDampingDistance")+desiredDistance;
            if (distance < steerDampingDistance) {
                desiredV = desiredV.multiply(this.get("maxVel")*(distance/steerDampingDistance)); // This damping is somewhat arbitrary
            } else {
                desiredV = desiredV.multiply(this.get("maxVel"));
            }

            var steer = desiredV.subtract(this.get("vel"));

            return steer;
        }

        return Vector.create(0,0);
    },
    steerTo: function (target) {
        return this.approach(target, 0);
    },
    align: function (entities, sightRadius) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.create(0,0),
            count = 0;

        entities.each(function(entity){
            if (entity.get("color") != color) return;

            var entityPosV = entity.get("pos"),
                entityVelV = entity.get("vel");

            if (this.isWithinDistanceGhetto(entityPosV, sightRadius)) {
                mean = mean.add(entityVelV);
                count++;
            }
        }, this);

        if (count > 0)
            mean = mean.divide(count).toUnitVector();

        return mean;
    },
    separate: function (entities, desiredDistance) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.create(0,0),

            count = 0;

        entities.each(function(entity){
            if (entity.get("color") != color) return;

            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            if (distance > 0 && distance < desiredDistance) {
                var force = posV.dup().subtract(entityPosV).toUnitVector().divide(distance);
                mean = mean.add(force);
                force.release();
                count++;
            }
        }, this);

        if (count > 0)
            mean = mean.divide(count);

        return mean;
    },
    avoidOther: function (entities, desiredDistance) {
        var color = this.get("color"),
            posV = this.get("pos"),

            mean = Vector.create(0,0),

            count = 0;

        entities.each(function(entity){
            if (entity.get("color") == color) return;

            var entityPosV = entity.get("pos"),
                distance = posV.distanceFrom(entityPosV);

            if (distance > 0 && distance < desiredDistance) {
                var force = posV.dup().subtract(entityPosV).toUnitVector().divide(distance);
                mean = mean.add(force);
                force.release();
                count++;
            }
        }, this);

        if (count > 0)
            mean = mean.divide(count);

        return mean;
    },
    avoidPosition: function (avoidV, desiredDistance) {
        var posV = this.get("pos"),
            distance = posV.distanceFrom(avoidV);

        if (distance > 0 && distance < desiredDistance) {
            return posV.dup().subtract(avoidV).toUnitVector().divide(distance);
        }

        return Vector.create(0,0);
    },
    avoidEdges: function (desiredDistance) {
        var posV = this.get("pos"),

            distanceFromLeft = posV.e(1),
            distanceFromRight = app.worldWidth - posV.e(1),
            distanceFromTop = posV.e(2),
            distanceFromBottom = app.worldHeight - posV.e(2),

            vect = Vector.create(0,0);

        if (distanceFromLeft <= desiredDistance)
            vect = vect.add([1, 0]);

        if (distanceFromRight <= desiredDistance)
            vect = vect.add([-1, 0]);

        if (distanceFromTop <= desiredDistance)
            vect = vect.add([0, 1]);

        if (distanceFromBottom <= desiredDistance)
            vect = vect.add([0, -1]);

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
        return vect.abs();
    },
    getVectMagGhetto: function (vect) {
        return vect.absGhetto();
    },

    constrainVectorMag: function (vect, maxMag, minMag) {
        var mag = this.getVectMag(vect);
        if (mag > 0 && mag < minMag) {
            vect.multiply(minMag/mag);
        }
        if (mag > 0 && mag > maxMag) {
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
        // Accessing this directly for performance.
        /*return this.getElemFromVect(this.get("pos"), 1);*/
        return this.attributes.pos.elements[0];
    },
    getPosY: function () {
        // Accessing this directly for performance.
        /*return this.getElemFromVect(this.get("pos"), 2);*/
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

        return posXA - posXB;
    },
    compareByPosY: function (entityA, entityB) {
        var posYA = entityA.getPosY(),
            posYB = entityB.getPosY();

        return posYA - posYB;
    },
    getPosX: function (entity) {
        return entity.getPosX();
    },
    getPosY: function (entity) {
        return entity.getPosY();
    },
    colorMap: {
        "red": "#ED002F",
        "green": "#48DD00",
        "blue": "#0969A2",
        "orange": "#FF8C00"
    }
});

var EntityView = Entity.View = Backbone.View.extend({

    tagName: 'div',
    className: 'entity',

    initialize: function (args) {
        this.model.view = this;
    },

    events: {
        'click': 'handleClick'
    },

    render: function () {
        var radius = this.model.get("radius"),
            diam = radius * 2,
            jerkX = this.model.getJerkX(),
            jerkY = this.model.getJerkY(),
            accelX = this.model.getAccelX(),
            accelY = this.model.getAccelY(),
            velX = this.model.getVelX(),
            velY = this.model.getVelY(),
            posX = this.model.getPosX()-app.viewportX,
            posY = this.model.getPosY()-app.viewportY;

        // Render entity on a canvas.
        this.renderEntity(app.overlayCtx, posX, posY);

        // Draw color trail.
        /*app.backdropCtx.beginPath();
        app.backdropCtx.fillStyle = this.model.get("color");
        var velMag = this.model.getVectMag(Vector.create([velX, velY]));
        var trailRad = (this.model instanceof Proj) ? 1 : Math.abs(this.model.get("maxVel")+1-velMag);
        // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        app.backdropCtx.arc(posX, posY, trailRad, 0, 2 * Math.PI, false);
        app.backdropCtx.fill();*/

        // Draw neighbor mesh.
        if (app.drawFlockMesh) {
            var neighbors = this.model.tickCache.neighbors;
            if (neighbors && neighbors.size()) {
                neighbors.each(function (entity) {
                    this.drawLineTo(app.overlayCtx, entity.getPosX(), entity.getPosY(), "white", 1);
                }, this);
            }
        }

        if (app.drawRanges && !(this.model instanceof Proj || this.model instanceof Particle)) {
            _([
            // Draw neighborhood.
            {
                radius: this.model.get("sightRadius"),
                color: "green"
            },
            // Draw cohesion range.
            {
                radius: this.model.get("cohesionRange"),
                color: "blue"
            },
            // Draw separation range.
            {
                radius: this.model.get("separationRange"),
                color: "red"
            },
            // Draw avoidance range.
            {
                radius: this.model.get("avoidanceRange"),
                color: "magenta"
            },
            // Draw weapons range.
            {
                radius: this.model.get("weaponRange"),
                color: "orange"
            }
            ]).each(function (range) {
                app.overlayCtx.beginPath();
                app.overlayCtx.strokeStyle = range.color;
                app.overlayCtx.lineWidth = 1;
                app.overlayCtx.arc(posX, posY, range.radius, 0, 2 * Math.PI, false);
                app.overlayCtx.stroke();
            });
        }

        if (app.drawVectors && !(this.model instanceof Proj)) {
            // Draw position indicator.
            /*this.drawDirectionalIndicator(app.overlayCtx, 0-posX, 0-posY, 1, "black", 1);*/

            // Draw velocity indicator.
            /*this.drawDirectionalIndicator(app.overlayCtx, velX, velY, 5, "#F9D300");*/

            // Draw accel indicator.
            this.drawDirectionalIndicator(app.overlayCtx, accelX, accelY, 40, "cyan");

            // Draw jerk indicator.
            this.drawDirectionalIndicator(app.overlayCtx, jerkX, jerkY, 20, "magenta");
        }

        if (this.model.get("playerControlled")) {
            // Draw player dot.
            app.overlayCtx.beginPath();
            app.overlayCtx.fillStyle = "white";
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.overlayCtx.arc(posX, posY, 5, 0, 2 * Math.PI, false);
            app.overlayCtx.fill();
        }

        if (app.drawHealthIndicators && !(this.model instanceof Proj)) {
            // Draw health dot.
            app.overlayCtx.beginPath();
            app.overlayCtx.fillStyle = "white";
            var healthRad = Math.round(this.model.get("health")/25);
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.overlayCtx.arc(posX, posY, healthRad, 0, 2 * Math.PI, false);
            app.overlayCtx.fill();
        }

        // Draw smoke for damaged entity.
        /*if(this.model.get("health") < this.model.get("maxHealth")/4 && app.tickPhase % 8 === 0 && !(this.model instanceof Proj)){
            app.backdropCtx.beginPath();
            app.backdropCtx.fillStyle = "gray";
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            app.backdropCtx.arc(posX+(app.random()*8)-4, posY+(app.random()*8)-4, 2+(app.random()*2), 0, 2 * Math.PI, false);
            app.backdropCtx.fill();
        }*/
        // Draw smoke for damaged entity.
        if(this.model.get("health") < this.model.get("maxHealth")/4 && app.tickPhase % 8 === 0 && !(this.model instanceof Proj)){
            Particle.spawnParticle({
                pos: Vector.create(posX, posY),
                color: "gray",
                life: 50,
                maxLife: 100,
                radius: 4+(app.random()*4)
            });
        }

        return this;
    },
    renderEntity: function (ctx, posX, posY) {
        var radius = this.model.get("radius");

        ctx.beginPath();
        ctx.fillStyle=Entity.colorMap[this.model.get("color")] || this.model.get("color");
        var strokeStyle = app.drawAIIndicators ?
            this.model.get("aiState") === "hunting" ?
                "magenta" :
            this.model.get("aiState") === "avoiding" ?
                "cyan" :
                "white"
            : "black";
        ctx.strokeStyle = strokeStyle;
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

var EntityCollection = Entity.Collection = Backbone.Collection.extend({
    model: Entity,

    initialize: function() {
        this.indexes = {};
    },

    add: function (models, options) {
        var modelList = _.isArray(models) ? models : [models];

        // Delegate to the real Backbone.Collection#add
        var ret = Backbone.Collection.prototype.add.call(this, models, options);

        _(modelList).each(this.insertSorted, this);

        return ret;
    },

    // Destroy?

    remove: function (models, options) {
        var modelList = _.isArray(models) ? models : [models];

        // Delegate to the real Backbone.Collection#remove
        var ret = Backbone.Collection.prototype.remove.call(this, models, options);

        _(modelList).each(this.removeIndex, this);

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

    removeIndex: function (entity) {
        var indexX = _.indexOf(app.entities.indexes.posX, entity);
        if (indexX >= 0) {
            this.indexes.posX.splice(indexX, 1);
        }
        var indexY = _.indexOf(app.entities.indexes.posY, entity);
        if (indexY >= 0) {
            this.indexes.posY.splice(indexY, 1);
        }

        for (var key in entity.indexes) entity.indexes[key] = void 0;
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
                // Saving the code for two teams, for ease of switching.
                // Need to make teams configurable soon.
                /*color: i % 2  ? "green" : "red"*/
                color: i % 4 === 0 ? "blue" : i % 4 === 1 ? "red" : i % 4 === 2 ? "green" : "orange"
            }));
        }

        return entities;
    },
    spawnEntity: function(coll, obj){

        var rand = !obj.color ? app.random() : 0,

            entity = new Entity(_.extend({
                vel: Vector.create(0,0),
                accel: Vector.create(0,0),
                jerk: Vector.create(0,0),
                color: rand <= 0.25 ? "blue" : rand <= 0.5 ? "red" : rand <= 0.75 ? "green" : "orange",
                pos: Vector.create(Math.round(app.random()*app.worldWidth), Math.round(app.random()*app.worldHeight))
            }, obj, { id: _.uniqueId('ent') }));

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

        entity.indexes.byPosX = indexX;
        entity.indexes.byPosY = indexY;

        posXArr.splice(indexX, 0, entity);
        posYArr.splice(indexY, 0, entity);
    }
});

var modelOptions = ['url', 'urlRoot', 'collection'];

var projPool = window.projPool = [];

var Proj = Entity.Proj = Entity.extend({
    defaults: _.extend({}, Entity.prototype.defaults, {
        maxJerk: 0,
        maxAccel: 0,
        maxVel: Infinity,
        frictionFactor: 0,

        edgeMode: "destroy",
        doCollisionChecks: true,

        walkLimit: 1,

        isProj: true
    }),

    /*updatePosition: function (posV, velV) {
        Entity.prototype.updatePosition.call(this, posV, velV);

        var radius = this.get('radius'),
            color = this.get('color');

        Particle.spawnParticle({
            pos: Vector.create(posV.e(1)+(app.random()*radius*2)-radius, posV.e(2)+(app.random()*radius*2)-radius),
            color: Entity.colorMap[color] || color,
            life: 10,
            maxLife: 10,
            radius: (radius/3)+(app.random()*(radius/3))
        });
    },*/

    kill: function() {
        var color = this.get("color"),

            posV = this.get("pos"),
            posX = posV.e(1),
            posY = posV.e(2),

            radius = this.get("radius");

        this.destroy();

        for (var i = 0; i <= 2; i++) {
            Particle.spawnParticle({
                pos: Vector.create(posX+(app.random()*radius*2)-radius, posY+(app.random()*radius*2)-radius),
                color: Entity.colorMap[color] || color,
                life: 5,
                maxLife: 5,
                radius: (radius/3)+(app.random()*(radius/3))
            });
        }
    },

    destroy: function () {
        this.trigger("destroy", this, this.collection, {});

        this.releaseVectors();
        this.release();
    },

    collisionCallback: function (entity) {
        var firedBy = this.get("firedBy");

        // Entity#injure returns true when the injury was fatal.
        if (entity.injure((firedBy && firedBy.get("damage")) || 20) && firedBy) {
            app.killStats[firedBy.get("color")] = app.killStats[firedBy.get("color")] || { kills: 0, deaths: 0 };
            app.killStats[firedBy.get("color")].kills++;
            app.view.renderKillStats();
        }
        this.kill();
    },

    release: function () {

        // Clear
        for (var key in this.attributes) this.attributes[key] = void 0;
        for (var key in this.changed) this.changed[key] = void 0;

        this.lastSightRadius = 0;

        if (this instanceof Proj) {
            app.entityCounts.Proj--;
        }

        Proj._projPool.push(this);

        if (Proj._projPool.length && Proj._projPool.length % 50 === 0)
            console.warn('Proj pool growing large. length: '+Proj._projPool.length);
    }
},
{
    create: function (attrs, options) {
        if (Proj._projPool.length) {
            var proj = Proj._projPool.shift();

            // Code from Backbone.Model constructor.
            if (options) _.extend(proj, _.pick(options, modelOptions));
            if (options && options.parse) attrs = proj.parse(attrs, options) || {};
            if (defaults = _.result(proj, 'defaults')) {
              attrs = _.defaults(attrs, defaults);
            }
            proj.set(attrs, options);
            proj.initialize.apply(proj, arguments);

            return proj;
        } else {
            return new Proj(attrs, options);
        }
    },

    _projPool: projPool
});

var ProjView = EntityView.extend({
    className: 'entity proj',

    renderEntity: function(ctx, posX, posY) {
        var radius = this.model.get("radius");

        /*ctx.beginPath();
        ctx.fillStyle = Entity.colorMap[this.model.get("color")] || this.model.get("color");
        // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
        ctx.arc(posX, posY, radius, 0, 2 * Math.PI, false);
        ctx.fill();*/

        ctx.beginPath();
        ctx.fillStyle = Entity.colorMap[this.model.get("color")] || this.model.get("color");
        ctx.strokeStyle = "black";

        var startingX = 0, startingY = 0;

        ctx.save();

        ctx.translate(posX, posY);
        ctx.rotate(this.model.get("heading"));

        ctx.moveTo( startingX, startingY );
        ctx.bezierCurveTo( startingX - (2 * radius), startingY + (4 * radius), startingX + (2 * radius), startingY + (4 * radius), startingX, startingY );

        ctx.restore();

        ctx.fill();
        ctx.stroke();
    }
});

var partPool = window.partPool = [];

var Particle = Entity.Particle = Entity.extend({
    defaults: _.extend({}, Entity.prototype.defaults, {
        maxJerk: 0,
        maxAccel: 0,
        maxVel: Infinity,
        frictionFactor: 0,

        color: 'white',
        radius: 2,

        life: 50,
        maxLife: 50,

        edgeMode: "destroy",
        doCollisionChecks: false,

        walkLimit: 1
    }),

    tick: function (time, entityIndex, totalEntities) {

        var accelV = this.get("accel"),
            velV = this.get("vel"),
            posV = this.get("pos");

        this.attributes.vel = this.updateVelocity(velV, accelV);

        this.attributes.pos = this.updatePosition(posV, velV);
    },

    kill: function() {
        this.destroy();
    },
    destroy: function () {
        this.trigger("destroy", this, this.collection, {});

        this.releaseVectors();
        this.release();
    },

    release: function () {

        // Clear
        //for (var key in this.attributes) this.attributes[key] = void 0;
        for (key in this.changed) this.changed[key] = void 0;

        this.lastSightRadius = 0;

        Particle._partPool.push(this);

        if (Particle._partPool.length && Particle._partPool.length % 300 === 0)
            console.warn('Part pool growing large. length: '+Particle._partPool.length);
    }
},
{
    create: function (attrs, options) {
        if (Particle._partPool.length) {
            var particle = Particle._partPool.shift();

            // Code from Backbone.Model constructor.
            if (options) _.extend(particle, _.pick(options, modelOptions));
            if (options && options.parse) attrs = particle.parse(attrs, options) || {};
            if (defaults = _.result(particle, 'defaults')) {
              attrs = _.defaults(attrs, defaults);
            }
            particle.set(attrs, options);
            particle.initialize.apply(particle, arguments);

            return particle;
        } else {
            return new Particle(attrs, options);
        }
    },

    spawnParticle: function (attrs) {

        //if (!attrs.vel) attrs.vel = Vector.create(1-app.random()*2, 1-app.random()*2);

        var particle = Particle.create(attrs);

        app.particles.add(particle);

        if (!particle.view) new ParticleView({ model: particle });
    },

    _partPool: partPool
});

var ParticleView = EntityView.extend({
    className: 'entity particle',

    renderEntity: function(ctx, posX, posY) {
        var radius = this.model.get("radius"),
            life = this.model.get("life");
            maxLife = this.model.get("maxLife");

        if (life > 0) {

            ctx.beginPath();
            ctx.fillStyle = this.model.get("color");
            // arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
            ctx.arc(posX, posY, radius, 0, 2 * Math.PI, false);

            ctx.globalAlpha = life/maxLife;
            ctx.fill();
            ctx.globalAlpha=1;

            this.model.set("life", life - 1);

        } else {
            this.model.destroy();
        }
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
        firingRate: 2.5,
        maxVel: Entity.prototype.defaults.maxVel*1.4,
        maxAccel: Entity.prototype.defaults.maxAccel*1.6,

        weaponRange: 200,

        avoidanceRange: 150,
        separationRange: 60,
        alignmentStrength: 2.5
    },
    // Firepower
    red: {
        firingRate: 4.2,
        maxVel: Entity.prototype.defaults.maxVel*0.9,

        accuracy: 1,
        weaponRange: 200,

        cohesionRange: 150,
        cohesionStrength: 0.3,
        separationRange: 25
    },
    // Health
    blue: {
        health: 90,
        maxHealth: 90,
        //healRate: 0.5,
        healRate: 0.65,

        avoidanceRange: 150,
        cohesionRange: 250,
        cohesionStrength: 0.3,
        separationRange: 25,
        alignmentStrength: 2.5
    },
    // Sniper
    orange: {
        damage: 40,
        health: 50,
        healRate: 0.2,

        accuracy: 1,
        muzzleVel: 8,

        cohesionRange: 100,
        cohesionStrength: 0.1,
        separationRange: 95,
        separationStrength: 40,
        alignmentRange: 80,
        alignmentStrength: 1
    }
};

return Entity;

});