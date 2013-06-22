
// Mostly from http://jsgamesoup.net/jsdocs/symbols/vectorize.html
// with heavy modifications by David Straub.

define(function () {
    /**
            @class Method to vectorize an array.
            @description Turns any array into a vector with basic, fast, in-place vector operations.
            @param x is the array that you wish to treat as a vector.
    */
    return function vectorize(x) {
        /** The isVector property lets you know if an array has been turned into a vector. */
        x.isVector = true;
        
        // this is what sylvester uses
        var precision = 1e-6;

        // Trying for sylvester compatibility.
        x.elements = x;

        /** Perform an operation on each vector element. */
        x.map = function (cb) {
            for (var i=0; i<this.length; i++) {
                this[i] = cb(this[i], i, this);
            }
            return this;
        };

        /** Perform an operation on each vector element. */
        x.each = function (cb) {
            for (var i=0; i<this.length; i++) {
                cb(this[i], i, this);
            }
            return this;
        };

        /** Returns a copy of the vector.
            Use sparingly to avoid GC. */
        x.dup = function () {
            return vectorize(this.slice());
        };

        x.e = function (i) {
            return (i < 1 || i > this.length) ? null : this[i-1];
        };

        /** Returns the number of elements the vector has. */
        x.dimensions = function () {
          return this.length;
        };

        /** Returns the angle between the vector and the argument (also a vector) */
        x.angleFrom = function (b) {
            var n = this.length, k = n, i;
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
        };

        /** Returns the angle between the vector and the argument (also a vector) */
        x.angleFromFull = function (b) {
            return Math.atan2(b[0], b[1]) - Math.atan2(this[0], this[1]);
        };

        /** Returns the vector's distance from the argument, when considered as a point in space. */
        x.distanceFrom = function (b) {
          if (b.length != this.length) { return null; }
          var sum = 0, part;
          this.each(function (x, i) {
            part = x - b[i];
            sum += part * part;
          });
          return Math.sqrt(sum);
        };

        /** Rotate a vector in 2D. */
        x.rotate = function (theta) {
            // What's the magnitude?
            var m = this.abs();
            // What's the angle?
            var a = this.heading();

            // Change the angle
            a += theta;

            // Polar to cartesian for the new xy components
            this[0] = m * Math.cos(a);
            this[1] = m * Math.sin(a);
        };
        
        /** Are two vectors equal? */
        x.equals = function (b) {
            var equal = true;
            if (this.length != b.length) {
                equal = false;
            } else {
                for (var i=0; i<this.length; i++) {
                    if (Math.abs(this[i] - b[i]) > precision) {
                        equal = false;
                    }
                }
            }
            return equal;
        }
        
        /** Add another vector to this one. */
        x.add = function (b) {
            for (var i=0; i<this.length; i++) {
                this[i] += b[i];
            }
            return this;
        }
        
        /** Subtract another vector from this one. */
        x.subtract = function (b) {
            for (var i=0; i<this.length; i++) {
                this[i] -= b[i];
            }
            return this;
        }
        
        /** Turn this vector into a unit vector. */
        x.unit = x.toUnitVector = function (b) {
            return this.divide(this.abs());
        }
        
        /** Return the absolute value of this vector. */
        x.abs = function () {
            var total = 0;
            for (var i=0; i<this.length; i++) {
                total += this[i]*this[i];
            }
            return Math.sqrt(total);
        }
        
        /** Multiply this vector by a scalar. */
        x.multiply = x.x = function (b) {
            if (typeof(b) == typeof(1)) {
                for (var i=0; i<this.length; i++) {
                    this[i] *= b;
                }
            }
            return this;
        }
        
        /** Divide this vector by a scalar. */
        x.divide = function (b) {
            if (typeof(b) == typeof(1)) {
                for (var i=0; i<this.length; i++) {
                    this[i] /= b;
                }
            }
            return this;
        }
        
        /** Find the dot product of this vector and another vector. */
        x.dot = function (b) {
            var total = 0;
            for (var i=0; i<this.length; i++) {
                total += this[i] * b[i];
            }
            return total;
        }
        
        return x;
    }

    /* test cases:

        EQUALS
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 4, 5]));
    false
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 3, 5]));
    true
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 3]));
    false
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 4]));
    false
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 3, 5]));
    true
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 3.001, 5]));
    false
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 3.000001, 5]));
    false
    >>> vectorize([2, 3, 5]).equals(vectorize([2, 3.000000001, 5]));
    true


        ABS / MAGNITUDE
    >>> vectorize([1,1]).abs();
    1.4142135623730951
    >>> vectorize([1,0]).abs();
    1
    >>> vectorize([0,1]).abs();
    1
    >>> vectorize([0,1,0]).abs();
    1
    >>> vectorize([0,1,1]).abs();
    1.4142135623730951
    >>> vectorize([1,1,1]).abs();
    1.7320508075688772
    >>> vectorize([1,1,1,1]).abs();
    2
    >>> vectorize([1,1,1,1]).abs();
    2
    >>> vectorize([1,2]).abs();
    2.23606797749979


        VECTOR ADDITION
    >>> vectorize([1, 2, 3]).add([2, 2, 3]);
    [3, 4, 6]


        UNIT VECTOR
    >>> vectorize([1, 2, 1]).unit();
    [0.4082482904638631, 0.8164965809277261, 0.4082482904638631]
    >>> vectorize([1, 2, 1]).abs();
    2.449489742783178
    >>> vectorize([2, 2, 2, 2]).abs();
    4
    >>> vectorize([2, 2, 2, 2]).unit();
    [0.5, 0.5, 0.5, 0.5]
    >>> vectorize([1, 1, 1, 1]).abs();
    2
    */
});
