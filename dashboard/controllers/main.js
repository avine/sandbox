
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core; // Alias

    Core.Router.controllers.main = function (scope, scopeData, scopeBind) {

        if (!Core.User.login()) return tool.console.error('Core.Router.controllers.main: user login is missing !');

        // Once the user is logged, build the other modules (Context, Dashboard, Filter, Analysis, Message, ...)
        this.factory.build().queue(function () {

            // Get original instances to attach listener to them
            var factInst = this.factory.getInstances(), translation = factInst.Translation;

            var $blur;
            this.factory.get('Db')
            .addListener(factInst.Db, Core.Db.EVENT.REMOTE_CONNECTION_LOST, function (event, data) {
                if (!$blur) $blur = jQuery(factInst.Dashboard.scope.wrapper).biLoader({
                    css: { 'background-color': 'rgba(0,0,0,.75)' },
                    error:
                        '<div style="font-size:2.5em;">' +
                            '<i class="fa fa-globe"></i> &nbsp; ' +
                            translation.translate('_BI_INTERNET_CONNECTION_LOST') +
                        '</div>'
                });
                $blur.biLoader('error');
            }).addListener(factInst.Db, Core.Db.EVENT.REMOTE_CONNECTION_RESTORED, function (event, data) {
                $blur.biLoader('remove');
                $blur = undefined;
            });

            this.factory.get('Log')
            .addListener(factInst.Dashboard, [Core.Dashboard.EVENT.READY, Core.Dashboard.EVENT.VIEW], function (e, d) {
                // For non async process, access the master instances Transaltion and Dashboard safely
                var dashboardTitle =
                        translation.replaceText(factInst.Dashboard.getDashboard(d.dashboardId).TITLE),
                    pageTitle =
                        translation.replaceText(factInst.Dashboard.getPage(d.pageId).TITLE);

                this.add('DashboardNav', dashboardTitle +
                    (pageTitle ? ' | ' + pageTitle : '') +
                    ' [' + d.dashboardId + ' | ' + d.pageId + ']'
                );
            });

            this.factory.get('Filter')
            .addListener(factInst.Dashboard, Core.Dashboard.EVENT.READY, function (event, data) {

                // Display filters once a new dashboard is available
                this.checkFiltersPropagation().displayDashboardFilters(data.dashboardId);

            }).addListener(factInst.Dashboard, Core.Dashboard.EVENT.VIEW, function (event, data) {

                this.checkFiltersPropagation();

            })/*.addListener(factInst.Dashboard, [Core.Dashboard.EVENT.READY, Core.Dashboard.EVENT.VIEW], function (event, data) {
                
                var dashboardMenu = this.factory.export('Dashboard', 'menu');
                if (dashboardMenu && 'sidebar' == dashboardMenu.position) return;

                // TODO: s'il n'y a pas de filtres dans la sidebar alors la fermer.

            })*/;

            this.factory.get('Analysis')
            .addListener(factInst.Dashboard, Core.Dashboard.EVENT.RESIZED, function () {

                this.refreshAllOutputs();

            }).addListener(factInst.Dashboard, [Core.Dashboard.EVENT.READY, Core.Dashboard.EVENT.VIEW], function () {

                this.zoomOut();

            }).addListener(factInst.Dashboard, Core.Dashboard.EVENT.VIEW, function () {

                this.handlePendingRefreshOutputs();

            }).addListener(factInst.Filter, Core.Filter.EVENT.READY, function (event, filtersId) {

                // Display analysis once a new filters are availables
                this.displayDashboardOutputs();

            }).addListener(factInst.Filter, Core.Filter.EVENT.CHANGE, function (event, filtersId) {

                this.zoomOut();
                this.updateOutputsOnFiltersChange(filtersId);

            });

            this.factory.get('Message')
            .addListener(factInst.Filter, Core.Filter.EVENT.READY, function (event, filtersId) {

                this.displayDashboardMessages();

            }).addListener(factInst.Filter, Core.Filter.EVENT.CHANGE, function (event, filtersId) {

                this.refresh();

            });

            /*new Core().addListener([
                Core.Filter.EVENT.READY,
                Core.Filter.EVENT.CHANGE
            ], function (event, filtersId) {
                console.log('controllers.main', event, filtersId);
            });*/

            this.then(function () {

                // Init context
                this.factory.get('Context').initVariables().thenDone(this);

            }).then(function () {

                // Init dashboard
                this.factory.export('Dashboard', 'initMenu')().initScope(scope).queue(function () {

                    if (!this.options.standalone.length) {
                        var menuPosition = undefined; // Overwrite: 'top', 'sidebar' or undefined (to get default)
                        this.displayMenu(menuPosition);

                        // Navigate between dashboards using location hash
                        this.handleLocationHash();

                        this.handleResize();
                    } else {
                        // Load standalone required dashboardId and pageId
                        this.displayDashboard(this.options.standalone[0], this.options.standalone[1]);
                    }

                }).thenDone(this);

            }).queue(function () {
                // Init the dashboard actions...

                var instances = this.factory.export({
                    Context: 'getConfig',
                    Dashboard: ['addBottomAction', 'sidebarFluidToggle', 'restoreBackButton'],
                    Filter: ['firePendingFilters', 'bookmarkForm']
                });

                // List of actions keys that are disabled when the BI is included inside the CRM
                // To enable this feature, just set in the main page: Bi.environment = 'CRM';
                var noEnvCRM = [
                    'Menu.DatabaseModeSwitch',
                    'Menu.LinkToLogoutPage'
                ], hasAction = function (key) {
                    if ('CRM' === Bi.environment && tool.array.exists(key, noEnvCRM)) return false;
                    return instances.context.getConfig(key);
                };

                instances.dashboard.addBottomAction('ToggleSidebarFluid', {
                    content: '<i class="fa fa-columns"></i>', attributes: { title: translation.translate('_BI_TOGGLE_SIDEBAR_BEHAVIOR') }
                }, function (e, menu) {
                    e.preventDefault();
                    instances.dashboard.sidebarFluidToggle();
                });

                instances.dashboard.addBottomAction('RemoveCacheAndReloadPage', {
                    content: '<i class="fa fa-refresh"></i>', attributes: { title: translation.translate('_BI_RESTORE_DEFAULT_VALUES') }
                }, function (e, menu) {
                    e.preventDefault();
                    Core.User.cleanAllData();
                    window.location.reload();
                });

                if (hasAction('Menu.SubmitFiltersButton')) instances.dashboard.addBottomAction('SubmitFilters', {
                    content: '<i class="fa fa-filter"></i>', attributes: { title: translation.translate('_BI_FILTERS_SUBMIT') }
                }, function (e, menu) {
                    e.preventDefault();
                    instances.filter.firePendingFilters();
                });

                if (database.run.isMode('remote')) { // For now, the bookmark form is only available ONLINE !
                    if (hasAction('Menu.BookmarkFormButton')) instances.dashboard.addBottomAction('BookmarkForm', {
                        content: '<i class="fa fa-bookmark"></i>', attributes: { title: translation.translate('_BI_FILTER_BOOKMARK_TITLE') }
                    }, function (e, menu) {
                        e.preventDefault();
                        instances.filter.bookmarkForm();
                    });
                }

                var routerInstance = this;

                if (hasAction('Menu.DatabaseModeSwitch')) {
                    // Link to synchro page
                    instances.dashboard.addBottomAction('LinkSynchro', {
                        content: '<i class="fa fa-database"></i>', attributes: { title: translation.translate('_BI_SYNCHRO') }
                    }, function (e, menu) {
                        e.preventDefault();
                        routerInstance.redirect('/synchro', false);
                    });

                    // Switch mode button
                    var $switchMode = jQuery('<span style="margin-left:5px;"></span>'), switchModeText = function () {
                        $switchMode.text(translation.translate(database.run.isMode('remote') ? '_BI_MODE_GO_OFFLINE' : '_BI_MODE_GO_ONLINE'));
                    };
                    switchModeText();

                    var notif = this.factory.export('Notification', ['add', 'show']),
                        noSynchro = notif.add({ content: translation.translate('_BI_MODE_GO_OFFLINE_ERROR') }),
                        noInternet = notif.add({ content: translation.translate('_BI_MODE_GO_ONLINE_ERROR') });

                    instances.dashboard.addBottomAction('SwitchMode', {
                        content: jQuery('<div><i class="fa fa-globe"></i></div>').append($switchMode),
                        attributes: { title: 'Switch mode' }
                    }, function (e, menu) {
                        e.preventDefault();
                        var newMode = database.run.isMode('remote') ? 'local' : 'remote';
                        this.factory.get('Ping').check(newMode).queue(function (reachable) {
                            if (!reachable) {
                                switch (newMode) {
                                    case 'local': notif.show(noSynchro); break;
                                    case 'remote': notif.show(noInternet); break;
                                }
                                return;
                            }
                            database.run.mode(newMode);
                            switchModeText();

                            Core.User.cleanAllData();

                            window.location.reload();
                        });
                    }.bind(this));
                }

                if (hasAction('Menu.LinkToLogoutPage')) instances.dashboard.addBottomAction('LinkLogout', {
                    content: '<i class="fa fa-sign-out"></i>', attributes: { title: translation.translate('_BI_SIGN_OUT') }
                }, function (e, menu) {
                    e.preventDefault();
                    routerInstance.redirect('/logout');
                });

                instances.dashboard.restoreBackButton();

            });

        }.bind(this));

    };

})(this, this.jQuery, this.Bi = this.Bi || {});
