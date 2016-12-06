
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    var Router = Core.module('Router');

    Router.extendStatic({

        OPTIONS: {
            pathPrefix: '', // Url hash prefix
            selector: 'body', // DOM selector where to append the $router
            slide: false,
            background: false,
            debug: false
        },

        EVENTS: {
            CHANGE: "biCoreRouter.change"
        }

    });

    Router.controllers = {};

    Router.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Router.OPTIONS, options || {});
            this.routes = {};
            this.$router = jQuery('<div>').biRouter({
                // Do not use .biRouter({ slide: true }) for the main Router of the App, unless you know exactly the impact.
                // Otherwise at the beginning of the animation, if some page contains an <input autofocus />, 
                // then this input will appear outside of the window (because of the slide animation), 
                // but the browser will try to make it visible immediately (because of the HTML attribute autofocus) !
                // Unfortunately, this will brake the animation and will produce a strange behaviour.
                slide: this.options.slide,
                background: this.options.background
            }).appendTo(this.options.selector);
        },

        validateAll: function (fn) {
            this._validateAll = fn;
            return this;
        },

        addRoute: function (path, param) {
            this.routes[path] = tool.extend({

                validateAll: true,
                validate: function () { /* return false; */ },
                template: path,
                home: false,
                reload: false

            }, param || {});

            if (this.routes[path].home) this.home = path;
            return this;
        },

        enable: function (controllerScope) {
            if (this.enabled) {
                this.disabled = false;
                return this;
            }
            this.enabled = true;

            var handle = function () {
                if (this.disabled) return false;

                var fullNewPath = tool.url.parse().hashPathname,
                    newPath = this.removePathPrefix(fullNewPath);

                if (false === newPath) return false; // Path prefix is missing
                if (!newPath || '/' == newPath) {
                    if (this.home) window.location.href = tool.url.extend(null, {
                        hashPathname: this.options.pathPrefix + this.home
                    });
                    return false; // No path requested
                }

                var fullPath = this.path ? this.options.pathPrefix + this.path : undefined;
                if (fullPath == fullNewPath || !this.routes[newPath]) return false; // Path unchanged or unavailable

                if (this.routes[newPath].validateAll && this._validateAll) {
                    if (false === this._validateAll.call(this)) return false; // Global validation
                }
                if (this.routes[newPath].validate) {
                    if (false === this.routes[newPath].validate.call(this)) return false; // Local validation
                }

                this.path = newPath;
                var route = this.routes[this.path]; // alias
                if (this.$router.biRouter('isPath', this.path) && !route.reload) {
                    this.$router.biRouter('goTo', this.path);
                } else {
                    this.load(route.template, controllerScope);
                }
                this.triggerEvent(Router.EVENTS.CHANGE, { path: newPath, home: route.home, reload: route.reload });
                return true;
            }.bind(this);

            jQuery(window).on(jQuery.biPlugin.events('hashchange'), handle);
            handle();
            return this;
        },

        disable: function () {
            this.disabled = true;
        },

        // The parameter path supports 2 signatures:
        //
        //      - string: represents the hashPathname 
        //      - array: represents [hashPathname, hashQueries]
        //
        redirect: function (path, withQueries, reload) {
            if (reload) this.disable(); // Disable the router handler before changing the url hash

            var isArray = tool.is.array(path);

            window.location.href = tool.url.extend(null, {
                hashPathname: this.options.pathPrefix + (isArray ? path[0] : path),
                hashQueries: isArray ? path[1] : {}
            }, withQueries);

            if (reload) setTimeout(function () { window.location.reload(); }, 0);
        },

        removePathPrefix: function (path) {
            if (!this.options.pathPrefix) return path; // No prefix
            var p = path.replace(new RegExp('^' + this.options.pathPrefix), '');
            if (p != path) return p; // Return unprefixed path
            return false; // Prefix is missing !
        },

        load: function (template, controllerScope, controller) {
            this.factory.get('Template').process(template).queue(function (tmpl) {
                // Insert template in DOM (or replace existing path in case route.reload = true)
                var wrapper = this.$router.biRouter('add', this.path || template, tmpl.$html);
                // Add wrapper in tmpl.scope
                if (!tmpl.scope.wrapper) tmpl.scope.wrapper = wrapper;
                // Call controller
                controller = (controller || template).replace(/^\/|\/$/g, '').replace(/\/./g, function (match) {
                    return match.substr(1).toUpperCase(); // '/my/template/path/' => 'myTemplatePath'
                });
                if (Router.controllers[controller]) {
                    Router.controllers[controller].call(controllerScope || this, tmpl.scope, tmpl.data, tmpl.bind);
                }
            }.bind(this));
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
