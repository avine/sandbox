
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    var Ping = Core.module('Ping');

    Ping.extendStatic({

        OPTIONS: {
            remoteUrl: '/api/bi/alive',
            timeout: 10000,
            debug: false
        }

    });

    Ping.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Ping.OPTIONS, options || {});
        }

    });

    Ping.extendAsync({

        // Check the internet connection (does the server reachable ?)
        remote: function () {
            jQuery.ajax({
                url: tool.url.ROOT + this.options.remoteUrl,
                type: 'GET',
                cache: false,
                timeout: this.options.timeout,
                complete: function (xhr, status) {
                    this.done('success' == status);
                }.bind(this)
            });
        },

        // To check the local database availability, no need to execute a SQL statement on the database,
        // just verify that the database has been synchronized on the device for the expected user.
        // (we are doing the same thing in the Bi.Core.User.isLogged in offline mode)
        //
        // Info:
        // We assumes that if the local database has been synchronized then the "local server" is available.
        // But in reality, we also needs some other resources to run the application in offline mode
        // (like the Repository which is stored in the local storage...)
        local: function (userLogin) {
            this.done('Synchro' in Core ? !!Core.Synchro.getSynchroTime(userLogin) : undefined);
        },

        check: function (server, userLogin) {
            switch (server) {
                case 'remote': this.remote(); break;
                case 'local': this.local(userLogin); break;
            }
            this.done();
        },

        all: function (userLogin) {
            new Core().when(
                this.clone().remote(),
                this.clone().local(userLogin)
            ).then(function (responses) {
                this.done({
                    remote: responses[0],
                    local: responses[1]
                });
            }).thenDone(this);
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
