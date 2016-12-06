
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Core = Bi.Core;

    var Notification = Core.module('Notification');

    Notification.extendStatic({

        OPTIONS: {
            selector: 'body', // DOM selector where to append the main container
            newOnTop: true,
            debug: false
        }

    });

    Notification.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Notification.OPTIONS, options || {});
            this.scope = {
                wrapper: jQuery('<div>').addClass('bi-notification').get(0)
            };
            this.items = [];
        },

        enable: function (selector) {
            this._handleRouterEvent();
            this.options.selector = selector || this.options.selector || Notification.OPTIONS.selector;
            jQuery(this.scope.wrapper).appendTo(this.options.selector);
            // Process pending notif when the instance is enabled
            this.processPending();
            return this;
        },

        disable: function () {
            jQuery(this.scope.wrapper).detach();
            return this;
        },

        add: function (opts) {
            opts = opts || {};

            var id = this.items.length,
            item = {
                scope: {
                    main: jQuery('<div>').get(0),
                    content: jQuery('<div>').addClass('bi-notification-content').append(opts.content || undefined).get(0),
                    close: jQuery('<span>').addClass('bi-notification-close').get(0)
                },
                enabled: false,
                onRoutes: Notification.option(opts.onRoutes, []),
                offRoutes: Notification.option(opts.offRoutes, [])
            };

            jQuery(item.scope.main).append(item.scope.content).append(item.scope.close);
            jQuery(item.scope.close).on('click', function () { this.hide(id); }.bind(this));

            this.items[id] = item;
            if (opts.show) this.show(id);
            return id;
        },

        content: function (id, html, action) {
            var item = this.items[id];
            if (!item) return;
            if (undefined === html) return item.scope.content; // getter
            action = ('prepend' == action || 'append' == action) ? action : 'html';
            jQuery(item.scope.content)[action](html); // setter
        },

        getScope: function (id) {
            if (this.items[id]) return this.items[id].scope;
        },

        show: function (id) {
            this._checkHidden(id);
            var item = this.items[id];
            if (!item) return;
            this._clear$mainQueue();
            var $main = jQuery(item.scope.main),
                action = this.options.newOnTop ? 'prependTo' : 'appendTo';
            if (!item.enabled) {
                $main[action](this.scope.wrapper);
                item.enabled = true;
            }
            var $main = jQuery(item.scope.main);
            if (!$main.hasClass('bi-notification-active')) {
                $main[action](this.scope.wrapper).addClass('bi-notification-active');
            }
        },

        hide: function (id, delay) {
            var item = this.items[id];
            if (!item) return;
            this._clear$mainQueue();
            var $main = this.$mainQueue = jQuery(item.scope.main);
            $main.delay(delay).queue(function () {
                $main.removeClass('bi-notification-active').dequeue();
            });
        },

        toggle: function (id) {
            var item = this.items[id];
            if (!item) return;
            if (!jQuery(item.scope.main).hasClass('bi-notification-active')) {
                this.show(id);
            } else {
                this.hide(id);
            }
        },

        remove: function (id) {
            if (!this.items[id]) return;
            jQuery(this.items[id].scope.main).remove();
            delete this.items[id];
        },

        _handleRouterEvent: function () {
            if (this._routerEventHandled) return; // Add listener once !
            var routerInst = this.factory.getInstances('Router');
            if (!routerInst) return;
            this.addListener(routerInst, Core.Router.EVENTS.CHANGE, function (core, route) {
                for (var id = 0; id < this.items.length; id++) this._checkHidden(id, route.path);
            });
            this.setter('_routerEventHandled', true);
        },

        // When a notification is active, it might be hidden in some page or context
        _checkHidden: function (id, path) {
            var item = this.items[id];
            if (!item) return;
            // Retrieve current path from Router if not given as parameter
            if (!path && this.factory.has('Router')) {
                path = this.factory.export('Router', 'path');
            }
            var $main = jQuery(item.scope.main), hidden = false;
            if (item.onRoutes.length) {
                hidden = !tool.array.exists(path, item.onRoutes);
            } else if (item.offRoutes.length) {
                hidden = tool.array.exists(path, item.offRoutes);
            }
            $main[hidden ? 'addClass' : 'removeClass']('bi-notification-hidden');
        },

        _clear$mainQueue: function () {
            if (!this.$mainQueue) return;
            this.$mainQueue.clearQueue();
            this.$mainQueue = undefined;
        }

    });

    Notification.extendStatic({

        option: function (value, defaultValue) {
            return (undefined !== value) ? value : defaultValue;
        }

    });

    Notification.extendProto({

        watchAppCache: function () {
            // There's no translation for these messages...
            // The reason is that we want to invoke the watchAppCache method as soon as possible in the process of the page rendering,
            // even at a time where the Translation module is not instanciated yet.
            // The problem we face is that the application cache update duration may end before the Notification box is rendered!
            // In this case, the user will unfortunately not be informed about the new cache availability...
            var msg = {
                title: "Downloading application cache",
                warning: "Please, do not close the page<br /> until the operation completes.",
                success: "The operation completed successfully.<br />Restart the application to reflect the changes.",
                error: "The operation failed."
            },
            $progress = jQuery('<div>').biProgress({
                colorsRange: [],
                title: msg.title
            }),
            notifId = this.add({
                content: $progress
            });

            $progress.biProgress('details', msg.warning, 'warning');

            jQuery(window.applicationCache).on('progress', function (e) {

                this.show(notifId);
                var value = parseInt(e.originalEvent.loaded / e.originalEvent.total * 100, 10);
                $progress.biProgress('value', value);

            }.bind(this)).on('cached updateready', function (e) {

                this.show(notifId);
                this.hide(notifId, 3000); // Optional: close the notification automatically.
                $progress.biProgress('details', msg.success, 'success');

            }.bind(this)).on('error', function (e) {

                $progress.biProgress('details', msg.error, 'error');
                $progress.biProgress({ colorsRange: ['red'], value: 0 });

            }.bind(this));
        }

    });

    Notification.extendStatic({

        // Add statically pending notification
        // (it's designed to show a notification the next time the entire page will be reloaded)
        //
        // It's usefull for example to call this method just before reloading the page.
        // In this case, the notification will be displayed when the page is reloaded...
        addPending: function (opts) {
            var pending = tool.storage.session('BiCoreNotificationPending') || [];
            pending.push(opts);
            tool.storage.session('BiCoreNotificationPending', pending);
        }

    });

    Notification.extendProto({

        // Pending notifications are processed by the first instance available
        processPending: function () {
            var pending = tool.storage.session('BiCoreNotificationPending') || [];
            pending.forEach(function (opts) {
                'show' in opts || (opts.show = true); // By default, pending notifications are automatically showed...
                this.add(opts);
            }.bind(this));
            tool.storage.session('BiCoreNotificationPending', null); // delete
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
