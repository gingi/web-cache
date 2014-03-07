var Redis = require('redis');

var ONE_DAY = 86400;

var DEFAULTS = {
    path:     /^\//,
    maxItems: 5000,
    expire:   ONE_DAY,
    prefix:   "web-cache",
    clean:    false,
    host:     "127.0.0.1",
    port:     6379
};

var CONTENT_TYPE_REGEX = /(?:^|\s|;)(\w+(?:\/\w+))(?:$|\s|;)/;

/**
 * @method cacheResponse
 *
 * Continues the response workflow while caching the body content
 *
 * @param {ServerResponse} response The server response.
 * @param {Function}       fn       The response callback (e.g., send, end).
 * @param {String}         fn.body  The body content to send.
 * @param {String}         url      The cache key.
 * @param {Object}         cache    The cache client.
 */
function cacheResponse(res, fn, url, cache) {
    return function (body) {
        fn.apply(res, arguments);
        var contentType = res.getHeader('Content-Type');
        var nURL = normalizeURL(url);
        var ctKey = null;
        if (contentType) {
            ctKey = contentType.match(CONTENT_TYPE_REGEX)[1];
        }
        // Will only cache valid, non-empty responses
        if (body && res.statusCode == 200) {
            cache.lruSet(url, ctKey, body, function () {});
        }
    }
}

/**
 * @method defaults
 *
 * Inserts default values for unspecified properties.
 *
 *     @example
 *     var options = { a: "x", b: "y" };
 *     defaults(options, { b: "w", c: "z" });
 *     // options: { a: "x", b: "y", c: "z" };
 *
 * @param {Object} options The target object.
 * @param {Object} defaults The defaults to add to the target object.
 */
function defaults(options, defaults)
{
    if (typeof defaults !== "object" || typeof options !== "object") return;
    for (var d in defaults)
        if (defaults.hasOwnProperty(d) && !options.hasOwnProperty(d))
            options[d] = defaults[d];
}

/**
 * @method normalizeURL
 *
 * Sort query params to allow caching URLs with unordered params.
 *
 * @param {String} url The input URL.
 *
 * @return {String} The normalized URL.
 */
function normalizeURL(url) {
    var parts = url.split("?");
    if (parts.length !== 2) {
        return url;
    }
    var params = [];
    parts[1].split(/[;&]/).forEach(function (pair) {
        params.push(pair);
    });
    return [parts[0], params.sort().join("&")].join("?");
}

/**
 * @method lruDecorate
 *
 * Adds LRU functions to the cache client.
 *
 * @param {Object} cache The cache client.
 * @param {Object} options An options hash.
 * @param {String} options.prefix A prefix for the hash key.
 * @param {Number} options.expire The expiration for a hash item.
 *
 * @return {Object} The decorated cache.
 */
function lruDecorate(cache, options) {
    cache.lruKey = function (key) {
        return [options.prefix, key].join(":");
    };
    cache.lruGet = function (hash, key, fn) {
        var lkey = cache.lruKey(hash);
        if (key == null) {
            cache.hkeys(lkey, function (err, keys) {
                var key0 = keys[0];
                if (typeof key0 === "undefined") {
                    key0 = "";
                }
                cache.hget(lkey, key0, function (err, reply) {
                    if (reply) {
                        cache.lruSet(hash, key0, reply);
                    }
                    fn(err, reply, [hash, key0]);
                });
            })
        } else {
            cache.hget(lkey, key, function (err, reply) {
                if (reply) {
                    cache.lruSet(hash, key, reply);
                }
                fn(err, reply);
            });
        }
    };
    cache.lruSet = function (hash, key, val, fn) {
        var lkey = cache.lruKey(hash);
        var retval = cache.hset(lkey, key, val, function () {
            if ("function" === typeof fn)
                fn.call(null, arguments)
        });
        cache.expire(lkey, options.expire);
        return retval;
    }
    return cache;
}

/**
 * @see README.md
 */
exports.middleware = function (options) {
    options = (options || {});
    defaults(options, DEFAULTS);

    var cache = Redis.createClient(options.port, options.host);
    lruDecorate(cache, options);
    
    if ("string" !== typeof options.prefix) {
        throw new Error("'prefix' property must be a string");
    }
    if ("string" === typeof options.path) {
        options.path = new RegExp("^" + options.path + '\\b');
    }
    options.exclude = options.exclude || [];
    for (var i = 0; i < options.exclude.length; i++) {
        if ("string" === typeof options.exclude[i]) {
            options.exclude[i] = new RegExp("^" + options.exclude[i] + "\\b");
        }
    }
    if (options.clean) {
        cache.keys(cache.lruKey('*'), function (err, keys) {
            cache.del(keys, function () {});
        });
    }
    
    return function (req, res, next) {
        if (req.url.match(options.path) === null) {
            return next();
        }
        for (var i = 0; i < options.exclude.length; i++) {
            if (req.url.match(options.exclude[i]) !== null) {
                next();
                return;
            }
        }
        var url = normalizeURL(req.url);
        cache.lruGet(url, null, function (err, reply, key) {
            if (reply) {
                var contentType = key[1];
                if (contentType) {
                    res.setHeader('Content-Type', contentType);
                }
                return res.end(reply);
            }
            res.end = cacheResponse(res, res.end, url, cache);
            next();
        });
    }
}