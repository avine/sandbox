
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Synchro = Core.module('Synchro');

    Synchro.extendStatic({

        OPTIONS: {

            startDateUrl: '/api/bi/synchro/date',
            tablesUrl: '/api/bi/synchro/tables',
            structureUrl: '/api/bi/synchro/structure',
            dataUrl: '/api/bi/synchro/data',

            timeout: 0, // set a number like 15000 (in ms) or 0 to disable this feature

            tmpPrefix: 'NEW_',
            queriesStackMax: [200, 400, 600, 800], // To disable this feature set empty array: []

            // FIXME: The cache is based on indexedDB which seems to work in ipad Safari but not when launching from Desktop icon !
            useCache: false,

            debug: false
        },

        EVENT: {
            REMOTE_CONNECTION_LOST: "biCoreSynchro.remoteConnectionLost",
            REMOTE_CONNECTION_RESTORED: "biCoreSynchro.remoteConnectionRestored"
        }

    });

    Synchro.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Synchro.OPTIONS, options || {});
        }

    });

    Synchro.extendAsync({

        // Is table exists in the local database ?
        localTableExists: function (name) {
            database.run.localReads(Core.Db.getLocalDbName(),
                "select count(NAME) from SQLITE_MASTER where TYPE = 'table' and NAME = '" + name + "'",
                function (result) { this.done(!!result.data[0][0]); }.bind(this)
            );
        },

        // Get LASTSYNCDATE from local LASTSYNC table
        // Set the property this.lastSyncDate
        localLastSyncDate: function () {
            this.localTableExists('LASTSYNC').then(function (exists) {
                if (exists) {
                    database.run.localReads(Core.Db.getLocalDbName(),
                        "select LASTSYNCDATE from LASTSYNC",
                        function (result) { this.lastSyncDate = result.data[0][0]; this.done(); }.bind(this)
                    );
                } else {
                    var newSyncDate = '20010101120000';
                    database.run.localWrites(Core.Db.getLocalDbName(),
                        "create table LASTSYNC as select '" + newSyncDate + "' LASTSYNCDATE",
                        function () { this.lastSyncDate = newSyncDate; this.done(); }.bind(this)
                    );
                }
            }).done();
        }

    });

    Synchro.extendAsync({

        // Load data from the server using a HTTP GET request
        $get: function (url, data) {
            if (!url) return this.done();
            var token, request = jQuery.ajax({
                method: 'GET',
                url: tool.url.ROOT + url,
                data: data,
                success: function (result) {
                    if (this._get_pending) {
                        delete this._get_pending;
                        this.triggerEvent(Synchro.EVENT.REMOTE_CONNECTION_RESTORED);
                    }
                    this.done(result);
                }.bind(this),
                error: function (xhr) {
                    if (401 === xhr.status) {
                        // Session has been killed on server side...
                        Core.User.handleMissingCredentials('Synchro');
                        this.fail(); // Synchro failed!
                    } else {
                        // It seems the internet connection has been lost...
                        this._get_pending = true;
                        this.triggerEvent(Synchro.EVENT.REMOTE_CONNECTION_LOST);
                        // Retry the last request
                        setTimeout(function () {
                            this.$get(url, data);
                            this.done();
                        }.bind(this), 1000);
                    }
                }.bind(this),
                complete: function () {
                    clearInterval(token);
                }
            });
            //
            // TODO: the same trick has been used in database.js
            // But the setInterval has been replaced by a setTimeout
            // Thus, we should upgrade this code as well...
            //

            // Check the factory availability (because the Synchro module works fine even without the factory loader)
            if (this.options.timeout && this.factory && this.factory.has('Ping')) token = setInterval(function () {
                this.factory.get('Ping').remote().queue(function (success) {
                    // request.abort triggers the request.error and request.complete callbacks
                    // It means that clearInterval will fortunately be always executed !
                    if (!success && undefined === request.status) request.abort();
                });
            }.bind(this), this.options.timeout);
        },

        // Get the current server datetime
        getStartDate: function () {
            this.$get(this.options.startDateUrl).then(function (startDate) {
                // SQL date
                this.startDate = startDate;
                // Javascript time
                var year = startDate.substr(0, 4),
                    month = startDate.substr(4, 2) - 1, // between 0 and 11
                    day = startDate.substr(6, 2),
                    hours = startDate.substr(8, 2),
                    minutes = startDate.substr(10, 2),
                    seconds = startDate.substr(12, 2);
                this.startTime = new Date(year, month, day, hours, minutes, seconds).getTime();
                this.done();
            }).done();
        },

        // Get list of remote tables to synchronize
        getTables: function () {
            this.$get(this.options.tablesUrl, { lastSyncDate: this.lastSyncDate }).then(function (tables) {
                this.tables = {};
                this.tablesLength = tables.length;
                for (var i = 0; i < tables.length; i++) {
                    var infos = tables[i].split('/');
                    this.tables[infos[1]] = {
                        db: infos[0],
                        name: infos[1],
                        create: undefined,
                        insert: undefined,
                        duration: { remote: undefined, local: undefined }
                    };
                }
                this.done();
            }).done();
        },

        getStructure: function () {
            this.$get(this.options.structureUrl, { lastSyncDate: this.lastSyncDate }).then(function (queries) {
                for (var i = 0; i < queries.length; i++) {
                    var tableName = /create table ([a-z0-9_]+)/i.exec(queries[i])[1],
                        query = queries[i].replace(
                            /create table ([a-z0-9_]+)/i,
                            'create table ' + this.options.tmpPrefix + tableName // Create temporary table
                        );
                    this.tables[tableName].create = query;
                }
                this.done();
            }).done();
        },

        getData: function () {
            this.progress = { total: this.tablesLength, value: 0 };
            this.eachTable(function (dbName, tableName) {
                this.triggerEvent('synchro.remote.progress.begin', { table: tableName });
                var t = Synchro.timer();
                this.$get(this.options.dataUrl, { db: dbName, table: tableName }).then(function (results) {
                    var table = this.tables[tableName];
                    this.progress.value++;
                    this.triggerEvent('synchro.remote.progress.end', {
                        table: tableName,
                        duration: (table.duration.remote = Synchro.timer(t))
                    });
                    table.insert = results;
                    this.done();
                }).done();
            }).done();
        },

        cache: function (action) {
            if (!this.options.useCache || !tool.Idb.isAvailable()) {
                return this.done();
            }
            var _this = this;
            new tool.Idb('BiSynchro', 1, 'RemoteCache', function () {
                switch (action) {
                    case 'set':
                        this.add('tables', _this.tables); // Store remote data in indexedDB
                        this.add('startDate', _this.startDate);
                        _this.done();
                        break;

                    case 'get':
                        var tables = this.get('tables'),
                            startDate = this.get('startDate');
                        if (tables && startDate) {
                            _this.tables = tables;
                            _this.startDate = startDate;
                            _this.done(true);
                        } else {
                            _this.done(false);
                        }
                        break;

                    case 'del':
                        this.del('tables');
                        this.del('startDate');
                        _this.done();
                        break;
                }
            });
        }

    });

    Synchro.extendAsync({

        localDrop: function (tmpPrefix) {
            var tablePrefix = tmpPrefix ? this.options.tmpPrefix : '',
                event = tmpPrefix ? 'local.tmp.drop' : 'local.drop';

            this.triggerEvent('synchro.' + event + '.begin');

            var drop = [], t = Synchro.timer();
            this.eachTable(function (dbName, tableName) {

                tableName = tablePrefix + tableName;
                this.localTableExists(tableName).then(function (exists) {
                    if (exists) drop.push('drop table ' + tableName);
                    this.done();
                }).done();

            }).localWrites(drop).then(function () {

                this.triggerEvent('synchro.' + event + '.end', {
                    queries: drop.length,
                    duration: (this.duration[event] = Synchro.timer(t))
                }).done();

            }).done();
        },

        localSynchro: function () {

            this.progress = { total: 0, value: 0 };
            for (var tableName in this.tables) {
                this.progress.total += 1; // "create..."
                this.progress.total += this.tables[tableName].insert.data.length; // "insert..."
            }
            this.eachTable(function (dbName, tableName) {

                var table = this.tables[tableName],
                    fields = '(' + table.insert.fields.join(', ') + ')',
                    data = table.insert.data;

                var queries = [table.create];
                for (var i = 0; i < data.length; i++) {
                    var values = jQuery.map(data[i], function (value) {
                        return database.format.toSqlValue(value);
                    });
                    if ('BiRepo_User' == tableName) {
                        Synchro.encryptLocalUserPassword(table.insert.fields, values);
                    }
                    queries.push([
                        'insert into',
                        this.options.tmpPrefix + tableName, // Insert into temporary table
                        fields,
                        "values (" + values.join(',') + ")"
                    ].join(' '));
                }

                this.triggerEvent('synchro.local.tmp.insert.progress.begin', { table: tableName, queries: queries.length });

                var total = { all: queries.length, queries: 0, duration: 0 },
                    queriesStack = Synchro.adaptiveQueriesStack(queries, this.options.queriesStackMax);
                this.then(function (queries) {
                    var t = Synchro.timer();
                    this.localWrites(queries).then(function () {
                        var queriesDuration = Synchro.timer(t);
                        total.duration += queriesDuration;
                        total.queries += queries.length;
                        this.progress.value += queries.length;
                        this.triggerEvent('synchro.local.tmp.insert.progress.end', {
                            table: tableName,
                            queries: queries.length,
                            duration: queriesDuration,
                            total: total
                        }).done();
                    }).done();

                }, queriesStack).then(function () {

                    table.duration.local = total.duration;
                    this.done();

                }).done();

            }).done();

        },

        localWrites: function (queries) {
            database.run.localWrites(Core.Db.getLocalDbName(), queries, this.done.bind(this));
        },

        eachTable: function (callback) {
            var argsStack = [];
            for (var tableName in this.tables) {
                argsStack.push([this.tables[tableName].db, tableName]);
            }
            this.then(callback, argsStack, 'apply').done();
        }

    });

    Synchro.extendAsync({

        launchRemote: function () {
            this.cache('get').then(function (available) {
                if (!available) {
                    var t = Synchro.timer();
                    this.triggerEvent('synchro.remote.begin');
                    this.getStartDate().getTables().getStructure().getData().then(function () {
                        this.cache('set');
                        this.triggerEvent('synchro.remote.end', {
                            duration: (this.duration['remote'] = Synchro.timer(t))
                        }).done();
                    });
                }
                this.done();
            }).done();
        },

        launchTemporaryLocal: function () {
            var t = Synchro.timer();
            this.triggerEvent('synchro.local.tmp.insert.begin');
            this.localSynchro().then(function () {
                this.triggerEvent('synchro.local.tmp.insert.end', {
                    duration: (this.duration['local.tmp.insert'] = Synchro.timer(t))
                }).done();
            }).done();
        },

        launchLocal: function () {
            this.triggerEvent('synchro.local.rename.begin');
            var rename = [], t = Synchro.timer();
            this.eachTable(function (dbName, tableName) {
                rename.push(['alter table', this.options.tmpPrefix + tableName, 'rename to', tableName].join(' '));
                this.done();
            }).localWrites(rename).then(function () {
                this.storeSynchroTime(); // successfully synchronized !
                this.triggerEvent('synchro.local.rename.end', {
                    duration: (this.duration['local.rename'] = Synchro.timer(t))
                }).done();
            }).done();
        }

    });

    Synchro.extendProto({

        progressValue: function () {
            if (this.progress) return parseInt(this.progress.value / this.progress.total * 100, 10);
        },

        launch: function () {
            this.duration = !this._launched && this.duration ? { remote: this.duration['remote'] } : {}; // Just preserve the 'remote' property
            this._launched = false;

            this.localLastSyncDate();
            if (!this.duration['remote']) this.launchRemote(); // Get tables and data once
            this.localDrop(true).launchTemporaryLocal(); // Drop old and create new temporary tables
            this.localDrop(false).launchLocal(); // Drop old and create new real tables

            this.cache('del').then(function () {
                this._launched = true;
                this.done();
            });
            return this;
        },

        isRemoteCompleted: function () {
            return !!(this.duration && this.duration['remote']);
        },

        getPerfs: function (format) {
            var d = this.duration,
                dLocal = d['local.tmp.drop'] + d['local.tmp.insert'] + d['local.drop'] + d['local.rename'],
                perfs = { remote: this.duration['remote'], local: dLocal };
            if (format) {
                if (perfs.remote) perfs.remote = parseInt(perfs.remote / 100, 10) / 10 + ' sec';
                perfs.local = parseInt(perfs.local / 100, 10) / 10 + ' sec';
            }
            return perfs;
        },

        // At the end of the synchro process, store locally the synchro time.
        // It's the unique information that tells us the Bi.database.run.mode('local') is allowed.
        // When the stored synchro time is available, we assumes that the local database is available.
        storeSynchroTime: function () {
            if (!this.startTime) return false;
            Synchro.setSynchroTime(this.startTime);
            // Don't forget to update the local LASTSYNC table...
            database.run.localWrites(Core.Db.getLocalDbName(), "update LASTSYNC set LASTSYNCDATE=" + this.startDate);
        }

    });

    Synchro.extendStatic({

        adaptiveQueriesStack: function (queries, max) {
            for (var i = 0; i < max.length - 1; i++) if (queries.length <= 1.5 * max[i]) break;
            return Synchro.sliceArray(queries, max.length ? max[i] : 0);
        },

        sliceArray: function (array, max) {
            if (!max) return [array];
            var slices = [], l = parseInt(array.length / max, 10) + (array.length % max ? 1 : 0), i = 0;
            for (; i < l; i++) slices.push(array.slice(max * i, max * (i + 1)));
            return slices;
        },

        timer: function (before) {
            var now = new Date().getTime();
            return now - (before || 0);
        },

        setSynchroTime: function (time, userLogin) {
            var times = tool.storage.local('biCoreSynchro.time') || {};
            userLogin = userLogin || Core.User.login();
            if (time) {
                times[userLogin] = time; // set
            } else {
                delete times[userLogin]; // remove
            }
            tool.storage.local('biCoreSynchro.time', times);
        },

        getSynchroTime: function (userLogin) {
            var times = tool.storage.local('biCoreSynchro.time') || {};
            return times[userLogin || Core.User.login()]; // get
        },

        // Check the synchroTime availability
        hasSynchroTime: function (userLogin) {
            var times = tool.storage.local('biCoreSynchro.time') || {};
            if (undefined === userLogin) {
                for (userLogin in times);
                return userLogin || null; // return the user login of the last synchronized user available
            }
            return !!times[userLogin]; // return expected user availability
        },

        getSynchronizedUsers: function () {
            var users = [], times = tool.storage.local('biCoreSynchro.time') || {};
            for (var login in times) users.push(login);
            return users;
        },

        // Find and encrypt the value of the field 'USERPASSWORD' in the table 'BiRepo_User'.
        encryptLocalUserPassword: function (fields, values) {
            if (!(window.CryptoJS && window.CryptoJS.MD5)) return;
            for (var i = 0; i < fields.length; i++) {
                if ('USERPASSWORD' != fields[i]) continue;
                var password = values[i].match(/'([^']*)'/);
                password = window.CryptoJS.MD5(password ? password[1] : '').toString();
                values[i] = database.format.toSqlValue(password); // Replace original password by the encrypted one
                break;
            }
        },

        // Change the password of the current logged user
        updateSynchronizedLocalUserPassword: function (password, callback) {
            // Define onSuccess/onError handlers
            var _handler = function (error) { if (callback) callback(!error); };
            // Encrypt password
            password = window.CryptoJS.MD5(password).toString();
            // Update the unique row of the table
            database.run.localWrites(
                Core.Db.getLocalDbName(),
                'update BiRepo_User set USERPASSWORD=' + database.format.toSqlValue(password),
                _handler,
                _handler
            );
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
