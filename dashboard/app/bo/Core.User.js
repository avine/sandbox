
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var User = Core.module('User');

    User.extendStatic({

        OPTIONS: {
            autoLoginUrl: '/api/bi/autologin',
            loginUrl: '/api/bi/login',
            logoutUrl: '/api/bi/logout',
            loggedUrl: '/api/bi/logged',
            sessionExpires: 7, // Session expires after n days
            debug: false
        },

        EVENT: {
            LOGIN: 'biCoreUser.login',
            LOGOUT: 'biCoreUser.logout'
        }

    });

    User.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, User.OPTIONS, options || {});
        },

        initRepository: function (result) {
            // We need the databaseModeSwitch information in the login form (when the Context module not yet instanciated)
            // Once the Bi.Core.Context module is instanciated, we can assume the equality:
            //      this.databaseModeSwitch == this.factory.export('Context', 'getConfig')('Menu.DatabaseModeSwitch');
            this.databaseModeSwitch = !result[0].data.length || "1" == result[0].data[0][0];

            // Is autoLogin enabled ?
            this.enableAutoLogin = result[1].data.length ? "1" == result[1].data[0][0] : false;
        }

    });

    User.extendStatic({

        // Manage the session token
        // Note: to send the session token in the header of any ajax request, we just have to store it in a cookie!
        sessionToken: function (token) {
            var key = 'biCoreUser.sessionToken';
            switch (arguments.length) {
                case 1:
                    if (token) {
                        tool.cookie.set(key, token, User.OPTIONS.sessionExpires); // Set
                    } else {
                        tool.cookie.erase(key); // Delete
                    }
                    break;
                case 0:
                    return tool.cookie.get(key) || undefined; // Get
            }
        },

        // Use login=null to remove login from storage.
        // In this case use storeLastLogin=false if you want to forget it completely.
        // Otherwise the login will still be available in lastLogin (this is usefull to autocomplete the login form the next time...)
        // Another option is to give a specific value like storeLastLogin="stephane" to force the lastLogin value.
        login: function (login, storeLastLogin) {
            var _login = tool.storage.local('biCoreUser.login');
            if (undefined !== login) {
                if (null === login) {
                    // Logout
                    switch (storeLastLogin) {
                        case false: // Forget the login (just don't store the lastLogin...)
                            break;
                        case undefined: // (default behaviour)
                        case true:
                            tool.storage.local('biCoreUser.lastLogin', _login); // Store last login
                            break;
                        default:
                            tool.storage.local('biCoreUser.lastLogin', storeLastLogin); // Store specific lastLogin
                            break;
                    }
                } else {
                    // Login
                    tool.storage.local('biCoreUser.lastLogin', null); // Remove last login
                    login += ''; // Convert into string
                }
                tool.storage.local('biCoreUser.login', _login = login);
            }
            return _login;
        },

        lastLogin: function () {
            return tool.storage.local('biCoreUser.lastLogin');
        }

    });

    User.extendAsync({

        // If the website is deployed on the intranet and the WinNTLoggedUserName is matching 
        // the BiRepo_User.UserLogin then the matched user will be automatically authentified
        autoLogin: function (clientName) {
            // If the optional "clientName" is given then the autologin will only succeed against it
            jQuery.post(tool.url.ROOT + this.options.autoLoginUrl, {
                clientName: clientName || undefined
            }).done(function (session) {

                if (session) {
                    // Update token
                    User.sessionToken(session.token);
                    // Compare with current login
                    if (session.token && User.login() !== (session.userLogin + '')) { // Convert into string before strict comparaison
                        User.login(session.userLogin); // Set new login
                        this.triggerEvent(User.EVENT.LOGIN, User.login());
                    }
                }
                this.done(session ? true : false);

            }.bind(this)).fail(function () {

                this.done(false);

            }.bind(this));
        },

        // Authentify the user against the client data login/password
        login: function (login, password, passwordNew) {
            // Always try to log the user on server side (to eventually restore the session token)
            // Remember that after a logout, the session token is destroyed, and this token is
            // mandatory to get protected data from the server (like in the synchro process)
            this._remoteLogin(login, password, passwordNew);

            // In offline mode, try after that to log the user on client side 
            if (database.run.isMode('local')) this._localLogin(login, password);

            this.done();
        },

        _remoteLogin: function (login, password, passwordNew) {
            // Send request
            jQuery.post(tool.url.ROOT + this.options.loginUrl, {
                login: login,
                password: password,
                passwordNew: passwordNew
            }).done(function (token) {

                // Update token
                User.sessionToken(token);
                // Compare with current login
                if (token && User.login() !== (login + '')) { // Convert into string before strict comparaison
                    User.login(login); // Set new login
                    this.triggerEvent(User.EVENT.LOGIN, User.login());
                }
                this.done(token ? true : false);

            }.bind(this)).fail(function () {

                this.done(false);

            }.bind(this));
        },

        // Security issue: In offline mode, it's easy to log in a user that has been synchronized!
        // You just need to call the static method: Bi.Core.User.login(userLogin);
        // Thus, this login process can be easily bypassed...
        _localLogin: function (login, password) {
            if (window.CryptoJS && window.CryptoJS.MD5) {
                // Match encrypted password
                password = window.CryptoJS.MD5(password).toString();
            }
            var query = "select count(UserLogin) as COUNT from BiRepo_User " +
                "WHERE UserLogin=" + Core.Db.quote(login) + " AND UserPassword=" + Core.Db.quote(password);
            // For local database access, the login must be setted before the query execution
            // (because the name of the local database depends on the user login !)
            var current = User.login();
            User.login(login);
            // Execute query on local database
            database.run.localReads(Core.Db.getLocalDbName(), query, function (result) {

                var success = result && result.data.length && result.data[0][0];
                if (success && current !== (login + '')) { // Convert into string before strict comparaison
                    this.triggerEvent(User.EVENT.LOGIN, User.login());
                } else {
                    User.login(current); // Rollback if the login has failed
                }
                this.done(success);

            }.bind(this), function () {

                User.login(current); // Rollback if the login has failed
                this.done(false);

            }.bind(this));
        },

        logout: function () {
            // Remove login on client side
            User.login(null);
            var mode = database.run.mode(), callback = function (remoteSuccess) {
                if (remoteSuccess) {
                    // After, the "remote" session token has been removed successfully,
                    // we can remove the "local" session token, accordingly.
                    User.sessionToken(null);
                }
                this.done({
                    mode: remoteSuccess ? "remote" : mode,
                    success: remoteSuccess || "local" == mode
                });
                this.triggerEvent(User.EVENT.LOGOUT);
            }.bind(this);
            // Try to remove remote session token (the token is sended in the cookie)
            jQuery.get(tool.url.ROOT + this.options.logoutUrl)
                .done(function () {
                    callback(true);
                }).fail(function () {
                    callback(false);
                });
        },

        isLogged: function () {
            if (database.run.isMode('remote')) {
                // In online mode, check the user session on server side
                // Note: in case the session has been killed on server side,
                // it is up to you to logout the user on client side (just by calling: User.login(null);)
                // For example, if the application is running in offline mode then it's probably right to keep the session on client side...
                jQuery.ajax({
                    url: tool.url.ROOT + this.options.loggedUrl,
                    type: 'GET',
                    cache: false,
                    success: function (result) { this.done(result); }.bind(this),
                    error: function () { this.done(null); }.bind(this)
                });
            } else {
                // In offline mode, simply check that the database has been synchronized on the device for the expected user
                // (we are doing the same thing in the Bi.Core.Ping.local)
                var userLogin = User.login();
                this.done('Synchro' in Core ? !!Core.Synchro.getSynchroTime(userLogin) : undefined);
            }
        }

    });

    User.extendStatic({

        // Cross-modules method to clean up all user data...
        cleanAllData: function () {
            if (Core.Repository) Core.Repository.removeCache();
            if (Core.Db) Core.Db.removeCache();
            if (Core.Filter) Core.Filter.removeSnapshot();
        },

        // Call this method each time you have detected that credentials are missing
        // (Usually when the server respond an error 401 after an ajax request...)
        handleMissingCredentials: function (errorCode, errorText) {
            // Inform the user about the problem
            jQuery('<div>').appendTo('body').biModal({
                close: false,
                title: 'Credentials are missing',
                content:
                    '<i class="fa fa-sign-in"></i> &nbsp; ' +
                    (errorText || 'Login required to access protected resources on the remote server.') +
                    (errorCode ? '<p style="color:#ccc;text-align:right;">(code: ' + errorCode + ')</p>' : '')
            });
            // Critical: Be sure that the login stored on client side is removed!
            // (Otherwise some modules assumes that if there's a defined user on client side, the application is ready to go!)
            User.login(null);
            // Remove local session token which seems to be useless...
            User.sessionToken(null);
            // Clean it's data
            User.cleanAllData();
            // And simply reload the page (this will automatically redirect the user to the logout page...
            setTimeout(function () { window.location.reload() }, 4000);
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
