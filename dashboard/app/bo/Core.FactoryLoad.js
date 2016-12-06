
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core, Factory = Bi.Core.Factory;

    Factory.extendStatic({

        LOAD_MAX_AGE: 60000, // (1mn) Max-age of the loaded Factory instances (set 0 to disable)

        load: function (settings1, settings2) {

            //////////////
            // Check site

            var location = {
                stored: tool.storage.local('biLocation'),
                current: (window.location.host + tool.url.ROOT).toLowerCase()
            };
            if (!location.stored) {
                tool.storage.local('biLocation', location.current);
            } else if (location.stored != location.current) {
                // This is another website, process an hard reload !
                tool.storage.local(null);
                tool.storage.session(null);
                window.location.reload();
            }

            //////////////
            // Check mode

            // Check that 'remote' or 'local' mode is avaiable before loading Factory
            // Try first using the current logged user or the last logged user...
            var mode = database.run.mode(), userLogin = Core.User.login() || Core.User.lastLogin();

            var notifDatabaseModeSwitched = function () {
                var prevMode = database.run.isMode('remote') ? 'Offline' : 'Online',
                    currMode = database.run.isMode('remote') ? 'Online' : 'Offline';
                Core.Notification.addPending({
                    content: '<i class="fa fa-database"></i>&nbsp; <b>' + prevMode + ' mode</b> is not available.<br />' +
                        'Automatically switched to <b>' + currMode + '</b> mode.'
                });
            },
            notifUserLoginSwitched = function () {
                Core.Notification.addPending({
                    content: '<i class="fa fa-user-md"></i>&nbsp; <b>No internet connection</b>.<br />' +
                        'The user login has been switched to the last synchronized user available.'
                });
            };

            new Core.Ping().check(mode, userLogin).queue(function (reachable) {
                if (reachable) {
                    // Load Factory !
                    return Factory._load(settings1, settings2);
                }
                mode = database.run.mode('remote' == mode ? 'local' : 'remote'); // try to switch mode

                this.check(mode, userLogin).queue(function (reachable) {
                    if (reachable) {
                        // Be able to notify the switch
                        notifDatabaseModeSwitched();
                        // Clean stored data
                        Core.User.cleanAllData();
                        // Load Factory !
                        return Factory._load(settings1, settings2);
                    }

                    // It seems that:
                    //      1. 'remote' mode is not available (for all users)
                    //      2. 'local' mode is not available for the required user...
                    // Now, the last chance to display something is to switch in 'local' mode for any available synchronized user !
                    if (userLogin = Core.Synchro.hasSynchroTime()) {
                        // Force 'local' mode
                        database.run.mode('local');
                        // Logout, force the last login and be able to notify this switch !
                        Core.User.login(null, userLogin);
                        notifUserLoginSwitched();
                        // Clean stored data
                        Core.User.cleanAllData();
                        // Check if the 'local' mode is the switched one or the original one...
                        if ('local' == mode) notifDatabaseModeSwitched();
                        // Load Factory !
                        return Factory._load(settings1, settings2);
                    }

                    // The application is unavailable :(
                    database.run.mode('remote' == mode ? 'local' : 'remote'); // restore original mode
                    if (!Bi.environment) {
                        // If there's no special Bi.environment (this is OLAP only) then go to the "unavailable" page...
                        window.location.href = tool.url.ROOT + '/dashboard/unavailable.html';
                    } else {
                        // Otherwise (the Bi is embedded inside the CRM) do nothing...
                        tool.console.error('Bi.Core.Factory.load: BI service unavailable.');
                    }
                });

            });

        },

        _load: function (settings1, settings2) {

            /////////////
            // Debugging

            var biDebug = tool.url.parse().hashQueries['bidebug'];
            if (undefined !== biDebug) {
                tool.storage.session('biDebug.status', biDebug);
            } else {
                biDebug = tool.storage.session('biDebug.status');
            }
            var debug = {}, debugConf = tool.string.split(biDebug, ' ');
            debugConf.forEach(function (module, i) { debugConf[i] = module.toLowerCase(); });
            Core.module.list.forEach(function (module) {
                debug[module] = 'all' === debugConf[0] || tool.array.exists(module.toLowerCase(), debugConf);
            });

            ////////////
            // Settings

            var settings = jQuery.extend({

                dashboardUrl: '', // Dashboards url without hash (from tool.url.ROOT)

                hashPrefix: '', // Url hash prefix of Router

                selector: 'body', // DOM selector where to append the main $router

                wrapOptions: undefined, // jQuery.fn.biWrap plugin options

                login: [/*username, password*/],

                standalone: [/*dashboardId, pageId*/]

            }, settings1 || {}, settings2 || {});

            // Set the full dashboardUrl ('/main' is the Router path to the landing page after a successful login)
            settings.dashboardUrl = (settings.dashboardUrl || '/') + '#' + settings.hashPrefix + '/main';

            var isFull = !(settings.standalone = settings.standalone || []).length; // = is not standalone

            //////////////////////////
            // Change links behaviour

            // Enable this feature if the links are opening the Safari Browser instead of staying within the WebApp.
            // For more details, read the documention in the source code (tool.js)

            //Bi.tool.forceLink2WindowLocation.on(settings.selector);

            /////////////////
            // Build factory

            var $selector = jQuery(settings.selector).biLoader({ className: 'bi-loader-theme-transparent' });

            var biFactory = new Core.Factory({

                // Configure the modules builders
                Ping: [{
                    debug: debug.Ping
                }],
                Repository: [{
                    debug: debug.Repository
                }],
                Db: [{
                    debug: debug.Db
                }],
                Translation: [{
                    debug: debug.Translation
                }],
                User: [{
                    debug: debug.User
                }],
                Template: [{
                    debug: debug.Template
                }],
                Router: [{
                    pathPrefix: settings.hashPrefix,
                    selector: settings.selector,
                    debug: debug.Router
                }],
                Context: [{
                    debug: debug.Context
                }],
                Dashboard: [{
                    rootUrl: settings.dashboardUrl, // Full dashboards URL with location hash (from tool.url.ROOT)
                    slide: /*isFull*/false,
                    wrapOptions: settings.wrapOptions,
                    standalone: settings.standalone,
                    debug: debug.Dashboard
                }],
                Filter: [{
                    processSuffix: '',
                    debug: debug.Filter
                }],
                Analysis: [{
                    debug: debug.Analysis
                }],
                Message: [{
                    debug: debug.Message
                }],
                Notification: [{
                    selector: settings.selector,
                    debug: debug.Notification
                }],
                Log: [{
                    debug: debug.Log
                }],
                Synchro: [{
                    debug: debug.Synchro
                }]

            }).addSingletons([

                'Ping', 'Repository', 'Db', 'Translation', 'User'

            ]).build([

                // Before login, build only the following modules
                'Ping', 'Repository', 'Db', 'Translation', 'User', 'Template', 'Router', 'Notification'

            ]);

            //////////////
            // Auto login (requested by client code)

            // TODO: in case the user is already logged we whould bypass the auto login even if settings.login is defined...

            var loginError = false;

            if (2 === settings.login.length) biFactory.then(function () {

                // Tricky: because the User instance is a singleton, we must clone it to prevent competitors call problems !
                this.instances.User.clone().login(settings.login[0], settings.login[1]).queue(function (success) {
                    if (!success) {
                        loginError = true;
                        tool.console.error('Bi.Core.Factory.load: login failure', settings.login);
                    }
                }).thenDone(this);

            });

            ///////////////////
            // 1. Full version

            if (isFull) biFactory.queue(function () {

                $selector.biLoader('complete');
                if (loginError) return;

                // Configure the router
                // Tricky: the Router instance is NOT singleton, thus we don't need to clone it here !
                // Because we know that the Factory is all alone to use it at this point...
                this.instances.Router.validateAll(function () {

                    // Always go to login page if not logged
                    // Warning: This test does not guarantee that remote resources are accesible.
                    // Because, even if the user is defined on the client side, the session may have been killed on the server side...
                    // Thus, you have to check the response of any web service that is requiring a logged user.
                    // If the response status is 401 (Unauthorized) then you have to call manually the static method:
                    //     Core.User.handleMissingCredentials();
                    // This method will terminate the navigation (by cleaning the local user data and fully reloading the page).
                    if (!Core.User.login()) {
                        this.redirect('/login');
                        return false;
                    }

                }).addRoute('/login', {

                    reload: true, // Reload page each time
                    validateAll: false, // Prevent infinite loop
                    validate: function () {
                        if (Core.User.login()) {
                            this.redirect('/main'); // Go to home page if logged
                            return false;
                        }
                    }

                }).addRoute('/logout', {

                    reload: true // Reload page each time

                }).addRoute('/main', {

                    home: true // Define as home page

                }).addRoute('/synchro', {

                }).enable();

                // Change page title according to website name
                if (!Bi.environment) {
                    var pageTitle = this.instances.Translation.translate('_BI_APPLICATION_NAME');
                    if (pageTitle) jQuery('head title').text(pageTitle);
                }
            });
            
            if (isFull) {
                biFactory.instances.Notification
                    .enable() // Insert the Notification main container
                    .watchAppCache(); // Notify the download progression of the cache manifest
            }

            /////////////////////////
            // 2. Standalone version

            if (!isFull) biFactory.queue(function () {

                $selector.biLoader('complete');
                if (loginError) return;

                // Tricky: the Router instance is NOT singleton, thus we don't need to clone it here !
                // Because we know that the Factory is all alone to use it at this point...
                this.instances.Router.load('/main', undefined, 'main');

            });

            //////////////////////////
            // Store factory instance

            Factory._cleanLoaded();
            biFactory.datetime = new Date().getTime();
            Factory.loaded.unshift(biFactory);

        },

        _cleanLoaded: function () {
            // Does the garbage collector disabled ?
            if (0 === Factory.LOAD_MAX_AGE) return;
            for (var now = new Date().getTime(), i = 0; i < Factory.loaded.length; i++) {
                // Does the Factory instance too young ?
                if (now - Factory.loaded[i].datetime < Factory.LOAD_MAX_AGE) continue;
                var router = Factory.loaded[i].instances.Router;
                // The Router instance property "$router" is the most external DOMElement of the User Interface.
                // We assumes this DOMElement should be a part of the DOM, otherwise the Factory instance is considered as not used anymore...
                if (router && !jQuery(router.$router).closest('html').size()) {
                    Factory.loaded.splice(i, 1);
                    i--;
                }
            }
        },

        loaded: []

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
