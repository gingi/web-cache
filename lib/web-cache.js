var Redis = require('redis');

var ONE_DAY = 86400;

var DEFAULTS = {
    path:     '/',
    maxItems: 5000,
    expire:   ONE_DAY,
    prefix:   "web-cache",
    clean:    false
};

function cacheResponse(res, fn, key, cache) {
    return function (body) {
        // Will not cache empty values
        if (body) {
            cache.lruSet(key, body, function (err, reply) {
                fn.call(res, body);
            });
        } else {
            fn.call(res, body);
        }
    }
}

function initializeParams(inParams) {
    var params = {};
    [DEFAULTS, inParams].forEach(function (list) {
        for (var prop in list) params[prop] = list[prop];
    });
    return params;
}

function lruDecorate(cache, params) {
    cache.lruKey = function (key) {
        return [params.prefix, key].join(":");
    };
    cache.lruGet = function (key, fn) {
        var lkey = cache.lruKey(key);
        cache.get(lkey, function (err, reply) {
            if (reply) {
                cache.lruSet(key, reply);
            }
            fn(err, reply);
        });
    };
    cache.lruSet = function (key, val, fn) {
        var lkey = cache.lruKey(key);
        var retval = cache.set(lkey, val, function () {
            if ("function" === typeof fn)
                fn.call(null, arguments)
        });
        cache.expire(lkey, params.expire);
        return retval;
    }
    return cache;
}

exports.middleware = function (params) {
    params = initializeParams(params);

    var cache = Redis.createClient(params.port, params.host);
    lruDecorate(cache, params);
    
    if ("string" !== typeof params.prefix) {
        throw new Error("'prefix' property must be a string");
    }
    if ("string" === typeof params.path) {
        params.path = new RegExp("^" + params.path + '\\b');
    }
    params.exclude = params.exclude || [];
    for (var i = 0; i < params.exclude.length; i++) {
        if ("string" === typeof params.exclude[i]) {
            params.exclude[i] = new RegExp("^" + params.exclude[i] + "\\b");
        }
    }
    if (params.clean) {
        cache.keys(cache.lruKey('*'), function (err, keys) {
            cache.del(keys, function () {
            });
        });
    }
    
    var timesCalled = 0;
    
    return function (req, res, next) {
        if (req.url.match(params.path) === null) {
            return next();
        }
        for (var i = 0; i < params.exclude.length; i++) {
            if (req.url.match(params.exclude[i]) !== null) {
                return next();
            }
        }
        cache.lruGet(req.url, function (err, reply) {
            res.set("Content-Type", "application/json");
            if (reply) {
                res.send(reply);
                return res.end();
            }
            res.end = cacheResponse(res, res.end, req.url, cache);
            next();
        });
    }
}