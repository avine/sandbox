
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Db = Core.module('Db');

    Db.extendStatic({

        OPTIONS: {
            debug: false
        },

        LOCAL_DBNAME_PREFIX: 'olap_',

        EVENT: {
            REMOTE_CONNECTION_LOST: "biCoreDb.remoteConnectionLost",
            REMOTE_CONNECTION_RESTORED: "biCoreDb.remoteConnectionRestored"
        }
    });

    // Debugging: add a max random delay in ms before returning the results to queries
    var randomDelay = 0;
    if (randomDelay) tool.console.log('Bi.Core.Db: ' + randomDelay + 'ms random delay enabled (debug mode)');

    // Debugging: store the queries duration
    var timers = [], stats = { cache: 0, total: 0 };

    Db.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Db.OPTIONS, options || {});
        }

    });

    Db.extendAsync({

        // Execute writes in a single database
        // `queries` can be a string or an array of strings
        // Choose between `server` = 'remote', 'local' or undefined (for auto switch)
        writes: function (queries, dbName, server) {
            if (tool.is.string(queries)) queries = [queries];
            dbName = Db.getDbName(dbName);

            server = (server || '').toLowerCase();
            var method = 'remote' === server ? 'remoteWrites' : 'local' === server ? 'localWrites' : 'writes';

            // Frontend security:
            // The .write() method is only authorized to execute "write" on the local database.
            //
            // Backend security: (should be implemented in backend)
            // The SQL-user which is exposed in the front-application should be only authorized to execute "read" on the remote database.
            if ('remoteWrites' == method || (database.run.isMode("remote") && 'writes' == method)) {
                tool.console.error('Bi.Core.Db.writes: method is not authorized on remote server.', dbName, queries);
                return this.done(false);
            }

            database.run[method](dbName, queries, function () {
                if (randomDelay) this.delay(Math.random() * randomDelay);
                this.done(true);
            }.bind(this), function () {
                this.done(false);
            }.bind(this));
        },

        // Execute reads in a single database
        // `queries` can be a string or an array of strings
        // `useCache` is a boolean (in case useCache is undefined, its default value is useCache = true)
        reads: function (queries, dbName, useCache) {
            if (undefined === useCache) useCache = true;

            dbName = Db.getDbName(dbName);

            var isString = tool.is.string(queries);
            if (isString) { // string
                if (!queries) return this.done(undefined);
                queries = [queries];
            } else { // array
                if (!queries.length) return this.done([]);
            }

            var cache = Db.getCache();
            stats.total += queries.length;
            cache.results[dbName] = cache.results[dbName] || {};

            var newQueries = [], allResults = [];
            for (var i = 0; i < queries.length; i++) {
                var cacheResult = useCache ? cache.results[dbName][queries[i]] : undefined;
                if (!cacheResult) newQueries.push(queries[i]);
                allResults.push(cacheResult);
            }
            if (!newQueries.length) {
                stats.cache += queries.length;
                Db.setCache(cache);
                if (randomDelay) this.delay(Math.random() * randomDelay);
                return this.done(isString ? allResults[0] : allResults); // All queries are available from cache !
            }
            var start = new Date().getTime();
            database.run.reads(dbName, newQueries, function (newResults) {

                if (this._reads_pending) {
                    // Connection to the remote server has been restored !
                    this.setter('_reads_pending'); // delete temporary variable
                    this.triggerEvent(Db.EVENT.REMOTE_CONNECTION_RESTORED);
                }
                // In debug mode we stores the queries duration (but not in production to preserve memory)
                if (this.options.debug) timers.push({
                    duration: (new Date().getTime() - start) + 'ms',
                    queries: newQueries
                });
                for (var a = 0, n = 0; a < allResults.length; a++) {
                    if (allResults[a]) continue;
                    allResults[a] = cache.results[dbName][newQueries[n]] = newResults[n];
                    n++;
                }
                stats.cache += queries.length - newQueries.length;
                Db.setCache(cache);
                if (randomDelay) this.delay(Math.random() * randomDelay);
                this.done(isString ? allResults[0] : allResults);

            }.bind(this), function (message) {

                // The message contains different types of information...
                switch (tool.typeOf(message)) {
                    case 'number':
                        // The message represents the response status
                        if (401 === message) {
                            // Session has been killed on server side...
                            Core.User.handleMissingCredentials('Db');
                            this.fail(); // Empty the stack...
                        } else {
                            // Probably means the internet connection has been lost...
                            this.triggerEvent(Db.EVENT.REMOTE_CONNECTION_LOST);
                            this.setter('_reads_pending', true);
                            setTimeout(function () {
                                this.reads(isString ? queries[0] : queries, dbName, useCache).done();
                            }.bind(this), 1000);
                        }
                        break;

                    case 'string':
                    default:
                        // The message probably describes the SQL error... (Propagate empty results)
                        var emptyResults = [];
                        for (var i = 0; i < queries.length; i++) emptyResults.push(Db.emptyResult(true));
                        this.done(isString ? emptyResults[0] : emptyResults);
                        break;
                }

            }.bind(this));
        },

        // [Public method] Execute reads in multiple databases (using single parameter `dataArray`)
        multiReadsArray: function (dataArray, useCache) {
            this.multiReads.apply(this, [].concat(dataArray, useCache)).done();
        },

        // [Public method] Execute reads in multiple databases (using multiple parameters `data1`, `data2`, ... )
        //
        // Here some examples of ONE of the expected dataX parameter :
        //
        //    'select * from BiRepo_Version' // 1 query in 'olap' database (object returned)
        //    ['select * from BiRepo_Version'] // 1 query in 'olap' database (array returned)
        //    ['select * from BiRepo_Version', 'select * from BiRepo_Culture'] // 2 queries in 'olap' database
        //    [{ query: 'select * from BiRepo_Version' }] // 1 query in 'olap' database
        //    [{ query: 'select * from BiRepo_Version', dbName: 'olap' }] // 1 query in 'olap' database
        //    [{ query: 'select * from BiRepo_Version' }, { query: 'select * from BiInfo', dbName: 'olapBrazil' }] // 2 queries in 'olap' and 'olapBrazil' databases
        //
        multiReads: function (/* data1, data2, ..., useCache */) {
            var args = arguments, lastArg = args[args.length - 1], useCache = undefined, argsLength = args.length;
            if (tool.array.exists(lastArg, [true, false, undefined], true)) {
                useCache = lastArg;
                argsLength--;
            }
            for (var i = 0, data = []; i < argsLength; i++) data = data.concat(args[i]);
            this._multiReads(data, useCache).then(function (results) {
                for (var i = 0, start = 0, slices = []; i < argsLength; i++) {
                    var isString = tool.is.string(args[i]),
                        length = isString ? 1 : args[i].length,
                        slice = results.slice(start, start + length);
                    if (isString) slice = slice[0];
                    slices.push(slice);
                    start = start + length;
                }
                //if (1 == slices.length) slices = slices[0]; // If there is only one data, remove the slices wrapper
                this.done(slices);
            }).done();
        },

        // [Private method] Execute reads in multiple databases
        // Notice: We assume that if the "data" parameter contains duplicates pairs of query/dbName,
        // they should have the same resuts !
        _multiReads: function (_data, useCache) {
            if (undefined === _data || null == _data) return this.done([]);
            // In case one Object of one query given { query: 'SELECT...', dbName: '' }
            if (!(_data instanceof Array)) _data = [_data];

            var data = []; // Formatted _data
            for (var i = 0; i < _data.length; i++) {
                data.push({});
                if (tool.is.string(_data[i])) {
                    data[i].query = _data[i];
                } else for (var prop in _data[i]) switch (prop.toUpperCase()) {
                    case 'QUERY': data[i].query = _data[i][prop]; break;
                    case 'DBNAME': data[i].dbName = _data[i][prop]; break;
                }
            }
            for (var d = 0, queries = {}; d < data.length; d++) {
                data[d].dbName = data[d].dbName || Db.getDbName(dbName);
                queries[data[d].dbName] = queries[data[d].dbName] || [];
                queries[data[d].dbName].push(data[d].query);
            }
            for (var dbName in queries) (function (_this, dbName) {
                _this.reads(queries[dbName], dbName, useCache).then(function (results) {
                    if (results) for (var r = 0; r < results.length; r++) {
                        for (var d = 0; d < data.length; d++) {
                            if (!data[d].results && queries[dbName][r] == data[d].query && dbName == data[d].dbName) {
                                data[d].results = results[r];
                                break;
                            }
                        }
                    }
                    this.done();
                });
            })(this, dbName);
            this.then(function () {
                var results = [];
                for (var d = 0; d < data.length; d++) results.push(data[d].results);
                this.done(results);
            }).done();
        }

    });

    Db.extendStatic({

        getDbName: function (dbName) {
            if (database.run.isMode('local')) {
                dbName = Db.getLocalDbName(); // Local DB is always "olap_[USER]" (overwrite given parameter)
            } else {
                dbName = dbName || "olap"; // Default remote DB is "olap" (set given parameter if not defined)
            }
            return dbName;
        },

        getLocalDbName: function (userLogin) {
            if (undefined === userLogin && 'User' in Core) {
                userLogin = Core.User.login();
                // Notice: After a logout Core.User.login() is null.
                // But we needs to be able to access some local database...
                // (for example to retrieve the BiRepo_Version when coming back to the login page).
                // For this reason, we also look at Core.User.lastLogin(). 
                if (null === userLogin) userLogin = Core.User.lastLogin();
            }
            if (!userLogin) tool.console.error('Bi.Core.Db.getLocalDbName: userLogin is missing.');
            return Db.LOCAL_DBNAME_PREFIX + userLogin;
        },

        emptyResult: function (withError) {
            var result = { columns: [], data: [] };
            if (withError) result.error = true;
            return result;
        },

        isEmptyResult: function (result) {
            return !result.columns.length && !result.data.length; // { columns: [], data: [] }
        }

    });

    Db.extendStatic({

        getCache: function () {
            var cache = { results: tool.storage.session('biCoreDb.cache') || {} };
            // Add stats (calculate usage on the fly)
            cache.stats = tool.extend({
                usage: (stats.total ? (100 * stats.cache / stats.total).toFixed(1) : 0) + '%'
            }, stats);
            // Add timers (availables when debug mode is enabled)
            if (timers.length) cache.timers = timers;
            return cache;
        },

        setCache: function (cache) {
            // Store only the cache results (notice that the cache argument supports 2 signatures)
            return tool.storage.session('biCoreDb.cache', 'results' in cache ? cache.results : cache);
        },

        removeCache: function () {
            tool.storage.session('biCoreDb.cache', null);
        },

        getCacheSize: function () {
            return tool.storage.sessionSize('biCoreDb.cache', true);
        },

        // Debugging function: display the Db cache in a textarea for copy/paste in external file...
        _export_cache_: function () {
            jQuery('body').html(
                '<h1>Bi.Core.Db export cache</h1>' +
                '<textarea style="display:block; width:90%; height:480px;">' +
                    JSON.stringify({ results: Db.getCache().results }) + '</textarea>'
            );
        }

    });

    Db.extendStatic({

        quote: function (value, wrap) {
            value = ((value || '') + '').replace(/'/g, "''");
            if (undefined === wrap || !!wrap) value = "'" + value + "'";
            return value;
        },

        prepareInsert: function (map) {
            var columns = [], values = [];
            for (var col in map) {
                columns.push(col);
                values.push(map[col]);
            }
            return ' (' + columns.join(', ') + ') values (' + values.join(', ') + ') ';
        },

        prepareUpdate: function (map) {
            var set = [];
            for (var col in map) set.push(col + '=' + map[col]);
            return ' set ' + set.join(', ') + ' ';
        }

    });

    Db.extendAsync({

        // Ping local or remote (default) server
        pingServer: function (server) {
            var reads = 'local' == server ? 'localReads' : 'remoteReads',
                query = 'SELECT count(*) C FROM BiRepo_Version';
            database.run[reads]('olap', query, function () {
                this.done(true);
            }.bind(this), function () {
                this.done(false);
            }.bind(this));
        },

        // Ping both local and remote servers
        pingServers: function () {
            new Core().when(
                this.clone().pingServer('remote'),
                this.clone().pingServer('local')
            ).then(function (responses) {
                this.done({
                    remote: responses[0],
                    local: responses[1]
                });
            }).thenDone(this);
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
