#Web Cache
A seamless web cache using [Redis](http://redis.io/) as a backend. The cache
allows the server to avoid making repeated expensive or long-waiting route
handling. This is useful for serving static content or a relatively static
data API.

This module acts as middleware for web servers built on
[Connect](https://npmjs.org/package/connect), such as
[Express](https://npmjs.org/package/express). Other than configuring it in
the web server, it does not require any other custom code. It also has some
sensible defaults so you can hit the ground running.

The cache expires items not accessed after a configurable age.

Note that a Redis server needs to be running for the cache to operate.

##Example

    var express = require('express'),
        cache   = require('web-cache');
    
    var app = express();
    
    app.configure(function () {
        app.use(cache.middleware({
            path:    '/api',
            exclude: [ /ignore\/.*\/path/ ],
            expire:  86400 // One day
        }));
    });
    
    // This path will be cached
    app.get('/api/resource/:id', function (req, res, next) {
        // Fancy-pants calculation
        res.end(/* Large JSON object */);
    });
    
    app.get('/docs/:id');                 // Will NOT be cached
    app.get('/api/list/ignore/:id/path'); // Will NOT be cached
    
    app.listen(3000);
    
## Installation
The module can be downloaded from [the NPM Registry](https://npmjs.org/ "npm") using:

    npm install web-cache
    
## API
The only API call **Web Cache** supports (at the moment) is `middleware`.

###client.middleware(params)
Provides Redis-based caching for the web server. `params` is an associative list with the following supported properties:

* `prefix`: *string* \[default: `web-cache`]

  The prefix to use for caching. Useful for running multiple caches on the same server.
  
* `expire`: *integer* \[default: `86400`]

  The age of items (in seconds) at which to expire them from the cache.
  
* `path`: *string* or *RegExp* \[default: `/`]

  The path matching routes that should be cached.

* `exclude`: *array* of *string* or *RegExp* \[default: `null`]

  A list of routes which the cache should exclude.

* `host`: *string* \[default: `127.0.0.1`]

  The Redis host.

* `port`: *string* \[default: `6379`]

  The Redis port.

* `clean`: *boolean* \[default: `false`]

  Remove all currently-cached items.

##Limitations
The following are temporary and are being implemented, or thought about.

* Will not cache multiple chunks from streaming responses.
* No limit on size or count of cached items.
* Not using Cache-Control headers at the moment.

##Changelog
####v0.0.3
* Only caches responses with non-error statuses (200).

##License
    Copyright (c) 2013 Shiran Pasternak <shiranpasternak@gmail.com>

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to
    deal in the Software without restriction, including without limitation the
    rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
    sell copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
    DEALINGS IN THE SOFTWARE.
