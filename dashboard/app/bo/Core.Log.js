
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    var Log = Core.module('Log');

    Log.extendStatic({

        OPTIONS: {
            url: '/api/bi/log',
            timeout: 10000,
            debug: false
        }

    });

    Log.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Log.OPTIONS, options || {});
        },

        add: function (type, data) {
            if (this.options.debug) {
                // Show message once
                this._debugMsg || tool.console.log('Bi.Core.Log: records are disabled in debug mode');
                this.setter('_debugMsg', true); // set
                return; // No logs in debug mode
            } else {
                this.setter('_debugMsg', undefined); // delete
            }
            var logs = tool.storage.local('biLog.pending') || [], token = Log._getToken();
            logs.push({
                datetime: tool.date.format('yyyy-mm-dd hh:mn:ss'),
                type: type || null,
                data: data || null,
                token: token
            });
            tool.storage.local('biLog.pending', logs);
            this.synchro();
            return token;
        },

        update: function (token, data) {
            if (this.options.debug) return; // No logs in debug mode
            token = (token || '') + '';
            var logs = tool.storage.local('biLog.pending') || [], isLocal = false;
            jQuery.map(logs, function (log, index) {
                if (token === log.token) {
                    logs[index].data = data;
                    isLocal = true;
                }
            });
            if (!isLocal) logs.push({
                data: data || null,
                token: token
            });
            tool.storage.local('biLog.pending', logs);
            this.synchro();
        }

    });

    Log.extendAsync({

        synchro: function () {
            var logs = tool.storage.local('biLog.pending') || [];
            if (!logs.length || this._inProgress) return this.done();

            this._inProgress = true;
            jQuery.ajax({
                type: 'POST',
                url: tool.url.ROOT + this.options.url,
                timeout: this.options.timeout,

                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(logs),

                success: function () {
                    delete this._inProgress;
                    tool.storage.local('biLog.pending', null);
                }.bind(this),

                //error: function () {
                //    // What's appening ? The application is probably in offline mode and the remote server is not reachable !
                //    // In this case, stop trying to synchronize logs (and just keep this._inProgress=true)
                //    // The next time the page will be completely reloaded, the application will try again to synchronize logs...
                //}.bind(this),

                complete: this.done.bind(this)
            });
        }

    });

    Log.extendStatic({

        viewLocal: function (type) {
            var logs = tool.storage.local('biLog.pending') || [];
            if (!type) return logs;
            return jQuery.grep(logs, function (log) {
                return type === log.type;
            });
        },

        _getToken: function () {
            return Math.random().toString().substr(2) + Math.random().toString().substr(2); // String of 32 char length
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
