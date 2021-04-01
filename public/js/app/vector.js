
define(['underscore'], function (_) {

    function Vector(x, y) {
        this.elements = this.elements || [];
        this.elements[0] = x;
        this.elements[1] = y;
    };

    // Prototype properties.
    _.extend(Vector.prototype, new Array(), {
        constructor: Vector,

        isVector: true,

        /** Perform an operation on each vector element. */
        map: function (cb) {
            for (var i=0; i<this.elements.length; i++) {
                this.elements[i] = cb(this.elements[i], i, this.elements);
            }
            return this;
        },

        /** Perform an operation on each vector element. */
        each: function (cb) {
            for (var i=0; i<this.elements.length; i++) {
                cb(this.elements[i], i, this.elements);
            }
            return this;
        },

        /** Returns a cloned copy of the vector.
            Use sparingly to avoid GC. */
        dup: function () {
            return Vector.create(this.elements[0], this.elements[1]);
        },

        /** Get one-indexed element from the vector. */
        e: function (i) {
            return (i < 1 || i > this.elements.length) ? null : this.elements[i-1];
        },

        /** Returns the number of elements the vector has. */
        dimensions: function () {
            return this.elements.length;
        },

        /** Returns the angle between the vector and the argument (also a vector) */
        angleFrom: function (b) {
            b = b.elements || b;
            var n = this.elements.length, k = n, i;
            if (n != b.length) { return null; }
            var dot = 0, mod1 = 0, mod2 = 0;
            // Work things out in parallel to save time
            this.each(function(x, i) {
                dot += x * b[i];
                mod1 += x * x;
                mod2 += b[i] * b[i];
            });
            mod1 = Math.sqrt(mod1); mod2 = Math.sqrt(mod2);
            if (mod1*mod2 === 0) { return null; }
            var theta = dot / (mod1*mod2);
            if (theta < -1) { theta = -1; }
            if (theta > 1) { theta = 1; }
            return Math.acos(theta);
        },

        /** Returns the angle between the vector and the argument (also a vector) */
        angleFromFull: function (b) {
            b = b.elements || b;
            return Math.atan2(b[0], b[1]) - Math.atan2(this.elements[0], this.elements[1]);
        },

        heading: function () {
            return this.angleFromFull([1,-1]);
        },

        /** Returns the vector's distance from the argument, when considered as a point in space. */
        distanceFrom: function (b) {
            b = b.elements || b;
            if (b.length != this.elements.length) { return null; }
            var sum = 0, part;
            this.each(function (x, i) {
                part = x - b[i];
                sum += part * part;
            });
            return Math.sqrt(sum);
        },

        /** Rotate a vector in 2D. */
        rotate: function (theta) {
            // What's the magnitude?
            var m = this.abs();
            // What's the angle?
            var a = this.heading();

            // Change the angle
            a += theta;

            // Polar to cartesian for the new xy components
            this.elements[0] = m * Math.cos(a);
            this.elements[1] = m * Math.sin(a);

            return this;
        },
        
        /** Are two vectors equal? */
        equals: function (b) {
            b = b.elements || b;
            var equal = true;
            if (this.elements.length != b.length) {
                equal = false;
            } else {
                for (var i=0; i<this.elements.length; i++) {
                    if (Math.abs(this.elements[i] - b[i]) > Vector.precision) {
                        equal = false;
                    }
                }
            }
            return equal;
        },
        
        /** Add another vector to this one. */
        add: function (b) {
            b = b.elements || b;
            for (var i=0; i<this.elements.length; i++) {
                this.elements[i] += b[i];
            }
            return this;
        },
        
        /** Subtract another vector from this one. */
        subtract: function (b) {
            b = b.elements || b;
            for (var i=0; i<this.elements.length; i++) {
                this.elements[i] -= b[i];
            }
            return this;
        },
        
        /** Turn this vector into a unit vector. */
        toUnitVector: function () {
            var mag = this.abs();
            if (mag === 0) return this;
            return this.divide(mag);
        },
        
        /** Return the absolute value of this vector. */
        abs: function () {
            return Math.sqrt(this.absGhetto());
        },
        
        /** Return the absolute value of this vector
            without performing the final Math.sqrt(). */
        absGhetto: function () {
            var sumPow = 0;
            for (var i = 0; i < this.elements.length; i++) {
                sumPow += this.elements[i]*this.elements[i];
            }
            return sumPow;
        },
        
        /** Multiply this vector by a scalar. */
        multiply: function (b) {
            b = b.elements || b;
            if (typeof(b) == typeof(1)) {
                for (var i=0; i<this.elements.length; i++) {
                    this.elements[i] *= b;
                }
            }
            return this;
        },
        
        /** Divide this vector by a scalar. */
        divide: function (b) {
            b = b.elements || b;
            if (typeof(b) == typeof(1)) {
                for (var i=0; i<this.elements.length; i++) {
                    this.elements[i] /= b;
                }
            }
            return this;
        },
        
        /** Find the dot product of this vector and another vector. */
        dot: function (b) {
            b = b.elements || b;
            var total = 0;
            for (var i=0; i<this.elements.length; i++) {
                total += this.elements[i] * b[i];
            }
            return total;
        },

        release: function () {
            this.elements.length = 0;
            Vector._vectorPool.push(this);

            if (Vector._vectorPool.length && Vector._vectorPool.length % 50 === 0)
                console.warn('Vector pool growing large. length: '+Vector._vectorPool.length);
        }
    });

    // Class properties.
    _.extend(Vector, {
        // This is the value that sylvester uses.
        precision: 1e-6,

        create: function (x, y) {
            if (Vector._vectorPool.length) {
                var v = Vector._vectorPool.shift();
                //console.log('Removed from Vector pool. length: '+Vector._vectorPool.length);
                Vector.call(v, x, y);
                return v;
            } else {
                return new Vector(x, y);
            }
        },

        _vectorPool: []
    });

    Vector.i = Vector.create(1,0);
    Vector.j = Vector.create(0,1);

    return Vector;
});
