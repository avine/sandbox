
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool;

    // Always display a default log for errors
    var logError = true;

    // You can change the configuration until the first request is executed.
    var config = {
        'Ajax': {
            url: '/api/bi/db/reads',
            timeout: 0 // set a number like 15000 (in ms) or 0 to disable this feature
        },
        'WebSql': {
            version: '1.0',
            desc: 'database',
            size: 25 * 1024 * 1024 // 25 Mo
        },
        'SqlJs': {

        },
        'SqlJsIdb': {

        },
        'NativeSql': {

        }
    };

    // pipe.local : Auto-detection
    // IE, Firefox and Opera Mini doesn't support "Web SQL Database".
    // For those browsers switch automatically to "SQL.js" library
    // (the script "plugins/sql.js-master/js/sql.js" must be loaded in the main HTML page before "app/bo/database.js")

    var pipeLocal;
    if (window.openDatabase) {
        pipeLocal = 'WebSql';
    } else if (window.SQL) {
        pipeLocal = 'SqlJsIdb';
    } else {
        console.warn('Bi.database: no local driver available.');
    }

    var pipe = {
        remote: 'Ajax', // Ajax
        local: pipeLocal // WebSql, SqlJsIdb or NativeSql
    };

    function getConfig(DriverName, option) {
        if (config && DriverName in config && option in config[DriverName]) {
            return config[DriverName][option];
        }
    }

    var isString = (function () {
        var toStr = Object.prototype.toString, str = toStr.call('');
        return function (data) { return toStr.call(data) === str; };
    })();

    function normalizeDataset(results, unwrap) {
        // UpperCase columns names
        for (var i = 0; i < results.length; i++)
            for (var j = 0; j < results[i].columns.length; j++)
                results[i].columns[j] = (results[i].columns[j] || '').toUpperCase();
        // Unwrap single result
        return (1 === results.length && unwrap) ? results[0] : results;
    }

    var driver = {

        /*// MyDriver API
        'MyDriver': (function () {
            var Db = function (name) {
                this.name = name;
            };
            Db.prototype = {
                connect: function (onSuccess, onError) {
                    onSuccess.call(this, false); // false means there's no error !
                    //onError.call(this, message);
                    return this;
                },
                reads: function (queries, onSuccess, onError) {
                    var results;
                    onSuccess.call(this, results);
                    //onError.call(this, message);
                },
                writes: function (queries, onSuccess, onError) {
                    onSuccess.call(this, false); // false means there's no error !
                    //onError.call(this, message);
                }
            };
            return Db;
        })(),*/

        'Ajax': (function () {
            var Db = function (name, url, timeout) {
                this.name = name;
                this.url = tool.url.ROOT + (url || getConfig('Ajax', 'url'));
                this.timeout = timeout || getConfig('Ajax', 'timeout');
            };
            Db.prototype = {
                connect: function (onSuccess, onError) {
                    if (onSuccess) onSuccess.call(this, false);
                    return this;
                },
                reads: function (queries, onSuccess, onError) {
                    this._run(true, queries, onSuccess, onError);
                },
                writes: function (queries, onSuccess, onError) {
                    this._run(false, queries, onSuccess, onError);
                },
                _run: function (read, queries, onSuccess, onError) {
                    var unwrap = isString(queries), token, _this = this, request = jQuery.ajax({
                        url: this.url,
                        type: "POST",
                        traditional: true,
                        data: {
                            db: this.name,
                            queries: [].concat(queries)
                        },
                        success: function (response) {
                            if (!response.error) {
                                if (onSuccess) onSuccess.call(_this, !!read ?
                                    normalizeDataset(response.results, unwrap) : false
                                );
                            } else {
                                // In this case propagate a string (a message that probably describes the SQL error...)
                                !logError || tool.console.error(queries, response.message);
                                if (onError) onError.call(_this, response.message);
                            }
                        },
                        error: function (response) {
                            // In this case, propagate a number (that represents the response status)
                            //   - 401 (Unauthorized): probably means the user session has been killed on server side...
                            //   - Any other status: probably means the internet connection has been lost...
                            if (onError) onError.call(_this, response.status);
                        },
                        complete: function () {
                            clearTimeout(token);
                        }
                    });
                    var makePing = function () {
                        token = setTimeout(function () {
                            this.ping(function (success) {
                                if (undefined === request.status) {
                                    // request.abort triggers the request.error and request.complete callbacks
                                    // It means that clearTimeout will fortunately be always executed !
                                    success ? makePing() : request.abort();
                                }
                            });
                        }.bind(this), this.timeout);
                    }.bind(this);
                    if (this.timeout) makePing();
                },
                // Execute the most simple database query.
                // We assumes the remote server should respond quickly.
                // Otherwise, we assumes that remote server connection has been lost...
                ping: function (callback) {
                    jQuery.ajax({
                        url: this.url,
                        type: "POST",
                        traditional: true,
                        data: { db: this.name, queries: ["SELECT 'aVal' aCol"] },
                        success: callback.bind(this, true),
                        error: callback.bind(this, false),
                        timeout: this.timeout
                    });
                    /*// This is a test version based on request to a simple static resource
                    jQuery.ajax({
                        url: tool.url.ROOT + '/api/bi/alive',
                        type: 'GET',
                        cache: false,
                        success: function () { callback(true); },
                        error: function () { callback(false); },
                        timeout: this.timeout
                    });*/
                }
            };
            return Db;
        })(),

        'WebSql': (function () {
            var Db = function (name, version, desc, size) {
                this.name = name;
                this.version = version || getConfig('WebSql', 'version');
                this.desc = desc || getConfig('WebSql', 'desc');
                this.size = size || getConfig('WebSql', 'size');
            };
            Db.prototype = {
                connect: function (onSuccess, onError) {
                    try {
                        this.db = window.openDatabase(this.name, this.version, this.desc, this.size);
                        if (onSuccess) onSuccess.call(this, false);
                    } catch (e) {
                        if (onError) onError.call(this, e.message);
                    }
                    return this;
                },
                reads: function (queries, onSuccess, onError) {
                    this._sql(true, queries, onSuccess, onError);
                },
                writes: function (queries, onSuccess, onError) {
                    this._sql(false, queries, onSuccess, onError);
                },
                _sql: function (read, queries, onSuccess, onError) {
                    var unwrap = isString(queries), _copy = [].concat(queries = [].concat(queries)),
                        results = [], _this = this;
                    this._transaction(read, function processQuery(transaction) {
                        var query = queries.shift();
                        if (query) {
                            transaction.executeSql(query, [], function (transaction, response) {
                                if (read) results.push(_this._result(response.rows));
                                processQuery(transaction);
                            }, function (transaction, error) {
                                !logError || tool.console.error(_copy, error);
                                if (onError) onError.call(_this, error);
                            });
                        } else {
                            if (onSuccess) onSuccess.call(_this, !!read ?
                                normalizeDataset(results, unwrap) : false
                            );
                        }
                    }, onError);
                },
                _transaction: function (read, onSuccess, onError) {
                    var _this = this;
                    this.db[!!read ? 'readTransaction' : 'transaction'](function (transaction) {
                        if (onSuccess) onSuccess.call(_this, transaction);
                    }, function (error) {
                        if (onError) onError.call(_this, error);
                    });
                },
                _result: function (rows) {
                    var result = { columns: [], data: [] };
                    if (rows.length) {
                        for (var i = 0; i < rows.length; i++) {
                            result.data[i] = [];
                            var row = rows.item(i);
                            for (var col in row) result.data[i].push(row[col]);
                        }
                        for (var col in row) result.columns.push(col);
                    }
                    return result;
                }
            };
            return Db;
        })(),

        // SQL.js (without persistence)
        'SqlJs': (function () {
            var Db = function (name, data) {
                this.name = name;
                this._data = data;
            };
            Db.prototype = {
                connect: function (onSuccess, onError) {
                    try {
                        this.db = new window.SQL.Database(this._data ? new Uint8Array(this._data) : undefined);
                        delete this._data;
                        if (onSuccess) onSuccess.call(this, false);
                    } catch (e) {
                        if (onError) onError.call(this, e.message);
                    }
                    return this;
                },
                reads: function (queries, onSuccess, onError) {
                    // An error occurs in Firefox while processing the Synchronization: "too much recursion".
                    // If you needs to target this browser, uncomment the setTimeout(); to fix this bug.

                    //setTimeout(function () {
                        var unwrap = isString(queries), _copy = [].concat(queries = [].concat(queries));
                        try {
                            var results = [], result, query;
                            while (query = queries.shift()) {
                                result = this.db.exec(query)[0];
                                if (result) {
                                    result.data = result.values;
                                    delete result.values;
                                } else {
                                    result = { columns: [], data: [] };
                                }
                                results.push(result);
                            }
                            onSuccess.call(this, normalizeDataset(results, unwrap));
                        } catch (error) {
                            !logError || tool.console.error(_copy, error.message);
                            if (onError) onError(error.message);
                        }
                    //}.bind(this), 0);
                },
                writes: function (queries, onSuccess, onError) {
                    var _copy = [].concat(queries = [].concat(queries));
                    try {
                        var query;
                        while (query = queries.shift()) this.db.run(query);
                        onSuccess.call(this, false);
                    } catch (error) {
                        !logError || tool.console.error(_copy, error.message);
                        if (onError) onError.call(this, error.message);
                    }
                }
            };
            return Db;
        })(),

        // SQL.js (using IndexedDB for persistence)
        'SqlJsIdb': (function () {
            var Db = function (name) {
                this.name = name;
            };
            Db.prototype = {
                connect: function (onSuccess, onError) {
                    this.idb = new tool.Idb('SQLjs', 1, 'export', function () {
                        this.sqlJs = new driver.SqlJs(this.name, this.idb.get(this.name));
                        this.sqlJs.connect((onSuccess || noop).bind(this), (onError || noop).bind(this));
                    }.bind(this));
                    return this;
                },
                reads: function (queries, onSuccess, onError) {
                    this.sqlJs.reads(queries, (onSuccess || noop).bind(this), (onError || noop).bind(this));
                },
                writes: function (queries, onSuccess, onError) {
                    this.sqlJs.writes(queries, function () {
                        // db['export']() === db.export() But the real syntax will not be compiled by IE8
                        this.idb.add(this.name, this.sqlJs.db['export'](), function () {
                            if (onSuccess) onSuccess.call(this, false);
                        }.bind(this), function (e) {
                            if (onError) onError.call(this, e);
                        }.bind(this));
                    }.bind(this), (onError || noop).bind(this));
                }
            };
            function noop() { }
            return Db;
        })(),

        // SQLite embbeded in ipad
        'NativeSql': (function () {
            var Db = function (name) {
                this.name = name;
            };
            Db.prototype = {
                connect: function (onSuccess, onError) {
                    onSuccess.call(this, false);
                    return this;
                },
                reads: function (queries, onSuccess, onError) {
                    this._set(true, queries, onSuccess, onError);
                },
                writes: function (queries, onSuccess, onError) {
                    this._set(false, queries, onSuccess, onError);
                },
                _set: function (read, queries, onSuccess, onError) {
                    var unwrap = isString(queries), _this = this;
                    nativeSqlManager.set(this.name, queries, !!read, function (results) {
                        if (onSuccess) onSuccess.call(_this, !!read ?
                            normalizeDataset(results, unwrap) : false
                        );
                    }, function (error) {
                        !logError || tool.console.error(queries, error);
                        if (onError) onError.call(_this, error);
                    });
                }
            };
            return Db;
        })()

    };

    // API for communication between website and ipad
    var nativeSqlManager = (function () {
        var _id = 0, _queries = {}, _debugMode = false;
        return {
            // website request
            set: function (dbName, queries, hasResult, onSuccess, onError) {
                _queries[_id] = {
                    dbName: dbName,
                    queries: [].concat(queries),
                    onSuccess: onSuccess,
                    onError: onError,
                    hasResult: !!hasResult,
                    result: undefined,
                    hasError: false,
                    error: undefined
                };

                // Indicates where to find the Bi.database.nativeSqlManager object
                // In case the page is inside an iframe, the object is available
                // at:         window.frames[0].Bi.database.nativeSqlManager
                // instead of:           window.Bi.database.nativeSqlManager
                var locationPrefix = (window.top == window.self) ? '' : '/frames[0]';

                var iframe = document.createElement("iframe");
                iframe.setAttribute("src", "native://runSQLiteQueries/" + _id + locationPrefix);
                document.body.appendChild(iframe);
                iframe.parentNode.removeChild(iframe);
                iframe = null;

                _id++;
            },
            get: function (id) {
                return undefined === id ? _queries : _queries[id];
            },
            // ipad retrieves the request
            getSerializedQuery: function (id) {
                if (!(id in _queries)) return JSON.stringify({});
                var q = _queries[id];
                return JSON.stringify({
                    dbName: q.dbName,
                    queries: q.queries.join('; '),
                    hasResult: q.hasResult
                });
            },
            // ipad gives the result
            setResult: function (id, result) {
                if (!(id in _queries)) return;
                _queries[id].result = result;
                return 'setResult:' + id;
            },
            // ipad gives the error
            setError: function (id, error) {
                if (!(id in _queries)) return;
                _queries[id].hasError = true;
                _queries[id].error = error;
                return 'setError:' + id;
            },
            // ipad fires callbacks
            fireCallbacks: function (id) {
                if (!(id in _queries)) return;
                var q = _queries[id];
                if (!q.hasError) {
                    if (q.onSuccess) q.onSuccess(q.result);
                } else {
                    if (q.onError) q.onError(q.error);
                }
                if (!_debugMode) delete q.queries[id];
                return 'fireCallbacks:' + id;
            },
            debug: function (status) {
                _debugMode = !!status;
            }
        };
    })();

    // Drivers instances factory
    var factory = function (DriverName, dbName, onSuccess, onError) {
        if (!driver[DriverName]) return (onError || tool.console.error)(
            'Bi.database.factory: Invalid driver name "' + DriverName + '"'
        );
        var _cache = factory._cache;
        if (!_cache[DriverName]) _cache[DriverName] = {};
        if (!_cache[DriverName][dbName]) {
            _cache[DriverName][dbName] = new driver[DriverName](dbName).connect(onSuccess, onError);
        } else {
            if (onSuccess) onSuccess.call(_cache[DriverName][dbName]);
        }
    };
    factory._cache = {};

    var _run = function (DriverName, dbName, read, queries, onSuccess, onError) {
        factory(DriverName, dbName, function () {
            this[!!read ? 'reads' : 'writes'](queries, onSuccess, onError);
        }, onError);
    },
    run = {
        remoteReads: function (dbName, queries, onSuccess, onError) {
            _run(pipe.remote, dbName, true, queries, onSuccess, onError);
        },
        remoteWrites: function (dbName, queries, onSuccess, onError) {
            _run(pipe.remote, dbName, false, queries, onSuccess, onError);
        },
        localReads: function (dbName, queries, onSuccess, onError) {
            _run(pipe.local, dbName, true, queries, onSuccess, onError);
        },
        localWrites: function (dbName, queries, onSuccess, onError) {
            _run(pipe.local, dbName, false, queries, onSuccess, onError);
        }
    };

    var _mode = tool.storage.local('biDb.mode'); // remote, local
    if ('remote' !== _mode && 'local' !== _mode) _mode = 'remote';
    run.mode = function (value) {
        if ('remote' === value || 'local' === value) _mode = tool.storage.local('biDb.mode', value);
        return _mode;
    };
    run.isMode = function (value) {
        return value === _mode;
    };
    run.reads = function (/*dbName, queries, onSuccess, onError*/) {
        run[_mode + 'Reads'].apply(this, arguments);
    };
    run.writes = function (/*dbName, queries, onSuccess, onError*/) {
        run[_mode + 'Writes'].apply(this, arguments);
    };

    var format = {
        toJson: function (result) {
            for (var json = [], row = 0; row < result.data.length; row++) {
                for (var map = {}, col = 0; col < result.columns.length; col++) {
                    map[result.columns[col]] = result.data[row][col];
                }
                json.push(map);
            }
            return json;
        },
        fromJson: function (json) {
            for (var result = { columns: [], data: [] }, row = 0; row < json.length; row++) {
                result.data[row] = [];
                for (var col in json[row]) result.data[row].push(json[row][col]);
            }
            if (json.length) for (var col in json[0]) result.columns.push(col);
            return result;
        },
        jsonToMap: function (json, keyIndex) {
            var map = {};
            for (var i = 0; i < json.length ; i++) {
                // Warning: If the variable `key` is like a number (example: '1', '2', ...) then the rows
                // order of the original json will not be preserved when using: for (var key in map) { }
                var key = json[i][keyIndex];
                map[key] = json[i];
            }
            return map;
        },
        // Convert value from JS to SQL
        // null       -> " NULL "
        // undefined  -> " NULL "
        // 1          -> " 1 "            (integer, unless quote === true)
        // "1"        -> " '1' "          (string, unless quote === false)
        // ""         -> " '' "           (empty string)
        // "this"     -> " 'this' "       (string)
        // "that's"   -> " 'that''s' "    (escaped string)
        toSqlValue: function (jsValue, quote) {
            // In case jsValue is null or undefined...
            if (null === jsValue || undefined === jsValue) return " NULL ";
            // Retrieve real jsValue type
            var type = tool.typeOf(jsValue);
            // Force jsValue type to be considered...
            if (true === quote && 'string' != type) {
                // ...as a string
                type = 'string';
            } else if (false === quote && 'number' != type) {
                //...as a number (if possible)
                var _val = tool.string.toNumber(jsValue);
                if (!isNaN(_val)) {
                    jsValue = _val;
                    type = 'number';
                } else {
                    tool.console.error('Bi.database.format.toSqlValue: Unable to convert value to number:', jsValue);
                }
            }
            switch (type) {
                case 'number':
                    return " " + jsValue + " ";
                case 'string':
                default:
                    return " '" + (jsValue + '').replace(/'/g, "''") + "' ";
            }
        },
        normalizeDataset: normalizeDataset
    };

    // Expose
    window.Bi.database = {
        config: config,
        pipe: pipe,
        driver: driver,
        factory: factory,
        run: run,
        format: format,
        nativeSqlManager: nativeSqlManager
    };

})(this, this.jQuery, this.Bi = this.Bi || {});
