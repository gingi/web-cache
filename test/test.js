var cache   = require(__dirname + '/../lib/web-cache.js')

var should  = require('should');
var express = require('express');
var request = require('supertest');
var async   = require('async');

var CACHE_PREFIX = "web-cache-tests";

// Force cleaning
afterEach(function () {
    testCache();
});

function testCache(options) {
    options = (options || {});
    options.prefix = CACHE_PREFIX;
    options.clean  = true;
    return cache.middleware(options);
}

function reqGet(req, url, expect, contentType) {
    return function (callback) {
        req = req.get(url);
        if (contentType !== undefined) {
            req.expect("Content-Type", contentType);
        }
        req.expect(200).expect(expect)
            .end(function (err, res) {
                if (err) throw err;
                callback(null);
            });
    };
}

describe('web-cache', function () {
    it("should export constructors", function () {
        cache.middleware.should.be.a.Function;
    });
    describe('middleware', function () {
        it("should return a valid function with no arguments", function () {
            cache.middleware().should.be.a.Function;
        });
    });
});

describe('redis server', function () {
    it("should complain when not running", function () {
        // cache.middleware({port: 53131}).should.throw(/Server not running/);
    })
});

describe('Basic functionality', function () {
    var app = express()
        .use(testCache({ path: "/count" }));
    var counter = 0;
    var respond = function (req, res) {
        counter++;
        res.send({ value: counter });
    };
    app.get('/count',  respond);
    app.get('/count2', respond);
    
    it("should cache routes", function (done) {
        var req = request(app);
        var times = 2;
        var reqs = [];
        for (var i = 0; i < times; i++) {
            (function (i) { // Scoping 'i'
                reqs.push(function (callback) {
                    req.get('/count')
                        .expect("Content-type", /json/)
                        .expect(200)
                        .expect({ value: 1 })
                        .end(function (err, res) {
                            if (err) throw err;
                            callback(null, i);
                        });
                });
            })(i);
        }
        async.series(reqs, function (err, results) { done(); });
    });
    it("should not cache other routes", function (done) {
        var times = 3;
        var reqs = [];
        var start = counter + 1;
        for (var i = start; i < start + times; i++) {
            (function (i) { // Scoping 'i'
                reqs.push(function (callback) { 
                    request(app).get('/count2')
                        .expect(200)
                        .expect({ value: i }, function (err) {
                            if (err) throw err;
                            callback(null, i);
                        });
                });
            })(i);
        }
        async.series(reqs, function () { done() });
    });
    it("should not cache error responses", function (done) {
        var errRequestCounter = 1;
        app.get('/err500', function (req, res) {
            res.send(500, {
                error: "Error" + errRequestCounter 
            });
            errRequestCounter++;
        })
        async.series([
            function (callback) {
                // First request
                request(app).get('/err500')
                    .expect(500)
                    .expect({ error: "Error1" }, function (err) {
                        callback(err);
                    }
                );
            },
            function (callback) {  
                // Second request
                request(app).get('/err500')
                    .expect(500).expect({ error: "Error2" }, function (err) {
                        callback(err);
                    }
                )
            }
        ], function (err, results) {
            if (err) {
                throw err;
            }
            done();
        });
    });
});

describe("web-cache with default route", function () {
    var app = express().use(testCache());
    var counter = 0;
    var respond = function (req, res) {
        counter++;
        res.send({ value: counter });
    };
    app.get("/", respond);
    app.get("/cats", respond);
    
    it("should allow caching", function (done) {
        var req = request(app);
        async.series([
            reqGet(req, "/",     { value: 1 }, /json/),
            reqGet(req, "/cats", { value: 2 }, /json/),
            reqGet(req, "/",     { value: 1 }, /json/),
            reqGet(req, "/cats", { value: 2 }, /json/)
        ], function (err, results) { done(); });
    });
});

describe("web-cache with HTML response", function () {
    var app = express().use(testCache({ path: "/pages" }));
    var counter = 0;
    app.get('/pages', function (req, res) {
        counter++;
        res.send("<html><body>" + counter + "</body></html>");
    });
    it("should handle cached Content-Type: text/html", function (done) {
        var req = request(app);
        async.waterfall([
            reqGet(req, "/pages", "<html><body>1</body></html>", /text\/html/),
            reqGet(req, "/pages", "<html><body>1</body></html>", /text\/html/)
        ], function () { done() });
    });
});

describe("web-cache with parameterized URLs", function () {
    var app = express().use(testCache({ path: /^\/r/ }));
    var counter = 0;
    app.get("/r", function (req, res) {
        counter++;
        res.send({ counter: counter });
    });
    var req = request(app);
    it("should allow caching", function (done) {
        async.series([
            reqGet(req, "/r?p=1&q=2", { counter: 1 }), // CacheSet
            reqGet(req, "/r?p=1&q=2", { counter: 1 }), // CacheGet
            reqGet(req, "/r?p=1&q=3", { counter: 2 }), // CacheSet
            reqGet(req, "/r?q=2&p=1", { counter: 1 }), // CacheGet (unsorted)
            reqGet(req, "/r?p=4&q=3", { counter: 3 }), // CacheSet
            reqGet(req, "/r?q=4&p=1", { counter: 4 }), // CacheSet (unsorte)
            reqGet(req, "/r?p=1&q=4", { counter: 4 })  // CacheGet (sorted)
        ], function (err, results) { done(); });
    });
});

describe("web-cache with custom key generator", function () {
    var counter = 0;
    var respond = function (req, res) {
        counter++;
        res.send({ counter: counter });
    };

    it("should cache routes with the same key", function (done) {
        var app = express()
            .use(testCache({
                keyGen: function (url) {
                    return url.split("/")[3];
                }
            }));

        app.get("/pets/:type/:color", respond);
        var req = request(app);
        async.series([
            reqGet(req, "/pets/cat/black", { counter: 1 }),
            reqGet(req, "/pets/cat/white", { counter: 2 }),
            reqGet(req, "/pets/dog/black", { counter: 1 }),
            reqGet(req, "/pets/dog/white", { counter: 2 }),
            reqGet(req, "/pets/chinchilla/white", { counter: 2 }),
        ], function () { done(); });
    });
    it("should not cache routes with different keys", function (done) {
        var reqCount = 0;
        var app = express()
            .use(testCache({
                keyGen: function (url) {
                    return ++reqCount; // Different key each request
                }
            }));
    
        app.get("/pet", respond);
        var req = request(app);
        async.series([
            reqGet(req, "/pet", { counter: 3 }),
            reqGet(req, "/pet", { counter: 4 }),
            reqGet(req, "/pet", { counter: 5 }),
            reqGet(req, "/pet", { counter: 6 }),
            reqGet(req, "/pet", { counter: 7 }),
        ], function () { done(); });
    });
});

/*
describe('expire param', function () {
    var seconds = 13;
    var app = express()
        .use(cache.middleware({
            name: "test-web-cache-expire",
            expire: seconds
        }));
    it("should expire cache", function (done) {
        done();
    })
})
*/
