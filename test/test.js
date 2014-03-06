var cache   = require(__dirname + '/../lib/web-cache.js')

var should  = require('should');
var express = require('express');
var request = require('supertest');
var async   = require('async');

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
})

describe('HTTP app', function () {
    var app = express()
        .use(cache.middleware({
            path: "/count",
            prefix: 'test-web-cache',
            clean: true
        }));
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
    })
});

describe("HTML content", function () {
    var app = express()
        .use(cache.middleware({
            path: "/pages",
            prefix: 'test-web-cache-html',
            clean: true,
            port: 6379
        }));
    var counter = 0;
    app.get('/pages', function (req, res) {
        counter++;
        res.send("<html><body>" + counter + "</body></html>");
    });
    it("should handle cached Content-Type: text/html", function (done) {
        function reqGet(asyncCallback) {
            request(app).get("/pages")
                .expect("Content-Type", /text\/html/)
                .expect("<html><body>1</body></html>")
                .end(function (err, res) {
                    if (err) throw err;
                    asyncCallback(null);
                });
        }
        async.waterfall([
            reqGet,
            reqGet
        ], function () { done() });
    });
});

function reqGet(req, url, expect) {
    return function (callback) {
        req.get(url)
            .expect(expect)
            .end(function (err, res) {
                if (err) throw err;
                callback(null);
            });
    };
}

describe("Complex URL", function () {
    var app = express().use(cache.middleware({ path: /^\/r/ }));
    var counter = 0;
    app.get("/r", function (req, res) {
        counter++;
        res.send({ counter: counter });
    });
    var req = request(app);
    it("should allow caching", function (done) {
        async.series([
            reqGet(req, "/r?p=1&q=2", { counter: 1 }),
            reqGet(req, "/r?p=1&q=2", { counter: 1 }),
            reqGet(req, "/r?p=1&q=3", { counter: 2 }),
        ], function (err, results) { done(); });
    });
    it("should allow caching of out-of-order keys", function (done) {
        async.series([
            reqGet(req, "/r?q=2&p=1", { counter: 1 }),
            reqGet(req, "/r?p=4&q=3", { counter: 3 })
        ], function (err, results) { done(); });
    });
})

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
