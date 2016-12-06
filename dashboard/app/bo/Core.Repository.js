
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Repository = Core.module('Repository');

    Repository.extendStatic({

        OPTIONS: {
            url: '/api/bi/db/repository',
            debug: false
        }

    });

    Repository.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Repository.OPTIONS, options || {});
        },

        initRepository: function (result) {
            this.db = {
                infos: result && result[0] && result[0].data.length ?
                    database.format.toJson(result[0])[0] : {}
            };
        }

    });

    Repository.extendAsync({

        get: function (/*modulesList1, modulesList2, ...*/) {
            var modules = Repository._getModules(arguments);
            if (database.run.isMode('remote')) {
                this._getRemote(modules);
            } else {
                this._getLocal(modules);
            }
            this.done();
        },

        // Retrieve the modules data from remote repository
        _getRemote: function (/*modulesList1, modulesList2, ...*/) {
            var modules = Repository._getModules(arguments), cache = {};
            if (modules.length) {
                // If modules in defined then try to get data (or a part of it) from cache
                cache = Repository.getCache(modules);
                var _new = [];
                modules.forEach(function (module) { module in cache || _new.push(module); });
                if (!_new.length) {
                    this.done(cache);
                    return;
                }
                modules = _new; // List of non cached modules
            }
            jQuery.get(tool.url.ROOT + this.options.url, {
                modules: modules.join('-') || undefined
            }).success(function (response) {
                Repository.updateCache(response.results); // Add new modules to cache
                this.done(tool.extend(cache, response.results)); // Return all requested modules
            }.bind(this)).fail(function (xhr) {
                if (401 === xhr.status) {
                    // Session has been killed on server side...
                    this.fail();
                    Core.User.handleMissingCredentials('Repository');
                } else {
                    // It's probably an problem of internet connection  lost...
                    this.done(false);
                }
            }.bind(this));
        },

        // Retrieve the modules data from local repository
        _getLocal: function (/*modulesList1, modulesList2, ...*/) {
            var modules = Repository._getModules(arguments);
            this.done(Repository.getStorage(modules));
        },

        // Download remote repository to make available the local repository (for offline mode)
        synchronize: function () {
            this._getRemote().then(function (results) {
                if (results) Repository.updateStorage(results);
                this.done(!!results);
            }).done();
        }

    });

    Repository.extendStatic({

        // Online cache (modulesListX supports string or array of string)
        getCache: function (/*modulesList1, modulesList2, ...*/) {
            return Repository._getData(
                tool.storage.session('biCoreRepository.cache') || {},
                Repository._getModules(arguments)
            );
        },
        updateCache: function (results) {
            tool.storage.session('biCoreRepository.cache', tool.extend(Repository.getCache(), results || {}));
        },
        removeCache: function () {
            tool.storage.session('biCoreRepository.cache', null);
        },

        // Offline storage (modulesListX supports string or array of string)
        getStorage: function (/*modulesList1, modulesList2, ...*/) {
            return Repository._getData(
                tool.storage.local('biCoreRepository.storage') || {},
                Repository._getModules(arguments)
            );
        },
        updateStorage: function (results) {
            tool.storage.local('biCoreRepository.storage', tool.extend(Repository.getStorage(), results || {}));
        },

        // Get all data or a subset of it
        _getData: function (data, modules) {
            if (!modules.length) {
                return data; // Get all data
            } else {
                var results = {};
                modules.forEach(function (module) {
                    if (data[module]) results[module] = data[module];
                });
                return results; // Get subset of data
            }
        },
        // Merge function arguments into a single array
        _getModules: function (args) {
            for (var modules = [], i = 0; i < args.length; i++) modules = modules.concat(args[i]);
            return modules;
        },

        // Debugging function: display the Repository cache in a textarea for copy/paste in external file...
        _export_cache_: function () {
            jQuery('body').html(
                '<h1>Bi.Core.Repository export cache</h1>' +
                '<textarea style="display:block; width:90%; height:480px;">' +
                    JSON.stringify(Repository.getCache()) + '</textarea>'
            );
        }
        
    });

})(this, this.jQuery, this.Bi = this.Bi || {});
