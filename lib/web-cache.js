var Redis = require('redis');

var ONE_DAY = 86400;

var DEFAULTS = {
    path:     '/',
    maxItems: 5000,
    expire:   ONE_DAY,
    prefix:   "web-cache",
    clean:    false
};

var CONTENT_TYPE_REGEX = /(?:^|\s|;)(\w+(?:\/\w+))(?:$|\s|;)/;

function cacheResponse(res, fn, key, cache) {
    return function (body) {
        fn.apply(res, arguments);
        var contentType = res.getHeader('Content-Type');
        var ctKey = null;
        if (contentType) {
            ctKey = contentType.match(CONTENT_TYPE_REGEX)[1];
        }
        // Will only cache valid, non-empty responses
        if (body && res.statusCode == 200) {
            cache.lruSet(key, ctKey, body, function (err, reply) {});
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
    cache.lruGet = function (hash, key, fn) {
        var lkey = cache.lruKey(hash);
        if (key == null) {
            cache.hkeys(lkey, function (err, keys) {
                cache.hget(lkey, keys[0], function (err, reply) {
                    if (reply) {
                        cache.lruSet(hash, keys[0], reply);
                    }
                    fn(err, reply, [hash, keys[0]]);
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
    
    return function (req, res, next) {
        if (req.url.match(params.path) === null) {
            return next();
        }
        for (var i = 0; i < params.exclude.length; i++) {
            if (req.url.match(params.exclude[i]) !== null) {
                return next();
            }
        }
        cache.lruGet(req.url, null, function (err, reply, key) {
            if (reply) {
                var contentType = key[1];
                if (contentType) {
                    res.setHeader('Content-Type', contentType);
                }
                return res.end(reply);
            }
            res.end = cacheResponse(res, res.end, req.url, cache);
            next();
        });
    }
}