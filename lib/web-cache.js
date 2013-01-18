var Redis = require('redis');

var ONE_DAY = 86400;

var DEFAULTS = {
    path:     '/',
    maxItems: 5000,
    expire:   ONE_DAY,
    prefix:   "web-cache"
};

function cacheResponse(res, fn, key, cache) {
    return function (body) {
        // Will not cache empty values
        if (body) {
            cache.lruSet(key, body);
        }
        fn.call(res, body);
    }
}

function initializeParams(inParams) {
    var params = {};
    for (var property in DEFAULTS) { params[property] = DEFAULTS[property]; }
    for (var property in inParams) { params[property] = inParams[property]; }
    return params;
}

function lruDecorate(cache, params) {
    function lruKey(key) {
        return [params.prefix, key].join("-");
    }
    cache.lruGet = function (key, fn) {
        cache.get(lruKey(key), function (err, reply) {
            if (reply) {
                reply = JSON.parse(reply);
                cache.lruSet(key, reply);
            }
            fn(err, reply);
        });
    };
    cache.lruSet = function (key, val, fn) {
        var lkey = lruKey(key);
        var retval = cache.set(lkey, JSON.stringify(val), fn);
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
    if (!params.path instanceof RegExp) {
        params.path = new RegExp("^" + params.path);
    }
    for (var i = 0; i < params.exclude.length; i++) {
        if (!params.exclude[i] instanceof RegExp) {
            params.exclude[i] = new RegExp("^" + params.exclude[i] + "$");
        }
    }
    return function (req, res, next) {
        if (req.url.match(params.path) === null) {
            return next();
        }
        for (var i = 0; i < params.exclude.length; i++) {
            if (req.url.match(params.exclude[i]) !== null) {
                return next();
            }
        }
        res.contentType = 'application/json';
        
        cache.lruGet(req.url, function (err, reply) {
            if (reply) {
                return res.send(reply);
            }
            res.end = cacheResponse(res, res.end, req.url, cache);
            next();
        });
    }
}