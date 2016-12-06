
(function (window, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Factory = Core.module('Factory');

    // Note: Unlike other modules, the Factory itself does not have a debug option: Factory.OPTIONS.debug

    Factory.extendProto({

        // Module constructor (instantiate the Core modules)
        builder: function (options) {
            this.options = options || {};
            this.instances = {};
            this.singletons = [];
        },

        // The singletons are modules that are shared with all Factory instances
        // Important: singletons can call each other but they must never call any other non-singleton module !
        // Example: Assuming s1 and s2 are singletons modules and m1 is a non-singleton module.
        //
        //        - Singleton can access singleton
        //            s1.factory.get('s2');
        //            s2.factory.get('s1');
        //
        //        - Module can access singleton
        //            m1.factory.get('s1');
        //            m1.factory.get('s2');
        //
        //        - BUT Singleton SHOULD NEVER access module !!
        //            s1.factory.get('m1'); // Forbidden
        //            s2.factory.get('m1'); // Forbidden
        //
        addSingletons: function (modules) {
            this.singletons = tool.array.unique(this.singletons.concat(modules));
            return this;
        },

        build: function (modules, skipInitRepository) {
            if (modules) {
                modules = [].concat(modules);
            } else {
                modules = [];
                Core.module.list.forEach(function (module) {
                    if ('Factory' === module) return; // Prevent recursive instantiation
                    if (!(module in this.instances)) modules.push(module);
                }.bind(this));
            }
            modules.forEach(function (module) {
                this._instanciate(module, this.options[module]);
            }.bind(this));
            skipInitRepository || this._initRepository(modules);
            return this;
        },

        _instanciate: function (m, o) { // m = module ; o = options
            if (!(m in Core)) return tool.console.error(
                "Bi.Core.Factory._instanciate: the module 'Core." + m + "' doesn't exists !"
            );
            if (m in this.instances) return tool.console.error(
                "Bi.Core.Factory._instanciate: the module 'Core." + m + "' has already been instantiated !"
            );
            if ('Factory' === m) return; // Prevent recursive instantiation
            o = o || [];

            // Check singleton
            if (tool.array.exists(m, this.singletons) && Factory.singletons[m]) {
                this.instances[m] = Factory.singletons[m];
                return;
            }

            // Instanciate module
            switch (o.length) {
                case 0: this.instances[m] = new Core[m](); break;
                case 1: this.instances[m] = new Core[m](o[0]); break;
                case 2: this.instances[m] = new Core[m](o[0], o[1]); break;
                case 3: this.instances[m] = new Core[m](o[0], o[1], o[2]); break;
                default:
                    tool.console.error(
                        "Bi.Core.Factory._instanciate: Unable to instanciate the module 'Core." + m + "'" +
                        " because of its number of arguments: " + JSON.stringify(o)
                    );
                    break;
            }

            // Check the module availability
            var check = function (module) {
                if (!(module in this.instances)) return tool.console.error(
                    "Bi.Core." + m + ".factory.get: the instance of 'Core." + module + "' is not available !"
                );
                if (m === module) return tool.console.error(
                    "Bi.Core." + m + ".factory.get: access to the 'Core." + m + "' instance itself is not allowed !"
                );
                return true;
            }.bind(this);

            this.instances[m].factory = {
                // Dependencies injection
                get: function (module) {
                    // Clone the originial instance to prevent competitors call problems !
                    if (check(module)) return this.instances[module].clone();
                }.bind(this),
                // Dependencies availability
                has: function (module) {
                    return (module in this.instances && m !== module);
                }.bind(this),
                // Get access to the .build() method (notice: the method .factory.build returns the Factory instance)
                build: this.build.bind(this),
                // Get the master instances (not clones) [warning: use this method very carefully]
                getInstances: function (module) { // the module parameter is optional
                    if (undefined === module) return this.instances;
                    if (module in this.instances) return this.instances[module];
                }.bind(this),
                // Export a subset of instances features
                //
                //   // Using object (as unique parameter)
                //   .factory.export({ 
                //     'Module1': ['feature1', 'feature2'], // Using array for multiple features
                //     'Module2': 'feature'                 // Using string for single feature
                //   });
                //
                //   // Using string (as first parameter)
                //   .factory.export('Module', ['feature1', 'feature2']); // Using array as second parameter
                //   .factory.export('Module', 'feature');                // Using string as second parameter
                //
                export: function (features) {
                    var map = {}, module, _m;
                    if (2 == arguments.length) {
                        module = arguments[0];
                        features = {};
                        features[module] = arguments[1]; // This argument can be a string or an array of string
                    }
                    for (module in features) {
                        if (!(module in this.instances)) {
                            tool.console.error('Bi.Core.Factory._instanciate: Can not export features!\n' +
                                'Unknown module instance "' + module + '".', features);
                            continue;
                        }
                        // A map property represents a module instance which is in lower case by convention
                        _m = module.substr(0, 1).toLowerCase() + module.substr(1);
                        map[_m] = {};
                        var instance = this.instances[module];
                        [].concat(features[module]).forEach(function (item) {
                            switch (tool.typeOf(instance[item])) {
                                case 'function':
                                    // Is the instance item a method of the module prototype?
                                    if (instance.constructor.prototype[item] === instance[item]) {
                                        // Is the method Async?
                                        if (tool.array.exists(item, Core[module].extendAsyncList || [])) {
                                            // WARNING: we can not check whether a synchronous method is invoking an asynchronous one!!!
                                            // In this case, you are not protected from competitors call problems!!!
                                            // You should avoid using the .export feature in this case!!!
                                            tool.console.error('Bi.Core.Factory._instanciate: ' +
                                                'To prevent competitors call problems, it is forbidden to export Async methods!\n' +
                                                '"Bi.Core.' + module + '.prototype.' + item + '".', features);
                                            map[_m][item] = undefined;
                                        } else {
                                            // Don't forget to bind its scope "this"!
                                            map[_m][item] = instance[item].bind(instance);
                                        }
                                    } else {
                                        map[_m][item] = instance[item];
                                    }
                                    break;
                                default:
                                    map[_m][item] = instance[item];
                                    break;
                            }
                        }.bind(this));
                    }
                    if (2 == arguments.length) for (_m in map) {
                        // If the arguments[1] is a string representing a single item,
                        // then simply return the item (unwrap the returned object)
                        return tool.is.string(arguments[1]) ? map[_m][arguments[1]] : map[_m];
                    }
                    return map;
                }.bind(this)
            };

            // Init singleton
            if (tool.array.exists(m, this.singletons)) (Factory.singletons[m] = this.instances[m])._isSingleton = true;
        }

    });

    Factory.singletons = {};

    Factory.extendAsync({

        // Notice: only the ._initRepository() method is asynchronous. But its caller, the .build() method is synchronous.
        _initRepository: function (m) { // m = modules
            var modules = [];

            // Check for each module, if the method `initRepository` is defined...
            m.forEach(function (module) {
                if (this.instances[module].initRepository) modules.push(module);
            }.bind(this));
            if (!modules.length) return this.done();

            // Check Repository instance
            if (!this.instances.Repository) {
                tool.console.error('Bi.Core.Factory._initRepository: unable to retrieve data from repository ' +
                    'because Bi.Core.Repository instance is not available', modules);
                return this.done();
            }

            // Clone Repository instance to prevent competitors call problems !
            // In case multiples Factories are loaded at the same time...
            this.instances.Repository.clone().get(modules).queue(function (results) {
                modules.forEach(function (module) {
                    var data = results ? results[module] : undefined;
                    data || tool.console.warn('Bi.Core.Factory._initRepository: unable to retrieve data from repository ' +
                        'for module "' + module + '"');
                    // Inject data in each requested module
                    this.instances[module].initRepository(database.format.normalizeDataset(data || []));
                }.bind(this));
            }.bind(this)).thenDone(this);
        }

    });

})(this, this.Bi = this.Bi || {});
