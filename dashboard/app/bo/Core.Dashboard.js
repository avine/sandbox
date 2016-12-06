
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Dashboard = Core.module('Dashboard');

    Dashboard.extendStatic({

        OPTIONS: {
            rootUrl: '/#/main', // URL to the Dashboards with location hash (from tool.url.ROOT)
            slide: true,
            wrapOptions: undefined, // Setting of the jQuery .biWrap() plugin
            standalone: [/*dashboardId, pageId*/], // Notice: to keep all pages leave pageId undefined
            countryUrl: '/api/bi/country',
            debug: false
        },

        HASH: {
            DASHBOARD: 'd',
            PAGE: 'p'
        },

        EVENT: {
            READY: "biCoreDashboard.ready", // Navigate to new dashboard
            VIEW: "biCoreDashboard.view", // Navigate to rendered dashboard
            RESIZING: "biCoreDashboard.resizing", // Dashboard resizing (pre-process)
            RESIZED: "biCoreDashboard.resized" // Dashboard resized (post-process)
        },

        // Choose between optimized/full sizes collection (make the same choice in the file: /app/ui/less/grid.less)

        /////////////////////////////
        // Optimized sizes colection
        /*SIZES: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]*/

        ////////////////////////
        // Full sizes colection
        SIZES: [
            1, 2, 3, 4, 5, 6, 7, 8, 9,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
            40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
            50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
            60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
            70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
            80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
            90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
            100
        ]

    });

    Dashboard.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Dashboard.OPTIONS, options || {});
            this.current = { dashboardId: undefined, pagesId: {} };
            this.menu = {
                items: [],
                disabled: [] // List of disabled DashboardId (because they are not available offline, which is the current mode !)
            };
            this.menu.items.init = false;
            this.bottomAction = {};
        },

        initRepository: function (result) {
            this.db = {
                menu: database.format.toJson(result[0]),
                dashboard: database.format.toJson(result[1]),
                page: database.format.toJson(result[2]),
                container: database.format.toJson(result[3])
            };
        }

    });

    Dashboard.extendProto({

        getMenu: function (parentId) {
            return this.db.menu.filter(function (row) {
                return parentId == row.PARENTMENUID;
            });
        },

        getDashboard: function (dashboardId) {
            return this.db.dashboard.filter(function (row) {
                return dashboardId == row.ID;
            })[0];
        },

        getPages: function (dashboardId) {
            return this.db.page.filter(function (row) {
                return !dashboardId || dashboardId == row.DASHBOARDID;
            });
        },

        getPage: function (pageId) {
            return this.db.page.filter(function (row) {
                return pageId == row.ID;
            })[0];
        },

        getContainers: function (pageId) {
            return this.db.container.filter(function (row) {
                return !pageId || pageId == row.PAGEID;
            });
        },

        getContainer: function (containerId) {
            return this.db.container.filter(function (row) {
                return containerId == row.ID;
            })[0];
        }

    });

    /* ----
       Menu
       ---- */

    Dashboard.extendProto({

        initMenu: function () {
            var replaceText = this.factory.export('Translation', 'replaceText'), getItems = function (parentId, _menu) {
                this.getMenu(parentId).forEach(function (item) {
                    if (database.run.isMode('local') && !item.ISAVAILABLEOFFLINE) {
                        this.menu.disabled.push(item.DASHBOARDID);
                        return;
                    }
                    var _submenu = [];
                    _menu.push({
                        icon: item.IMAGEPATH,
                        caption: item.MENUCAPTIONKEY,
                        label: replaceText(item.MENUCAPTIONKEY),
                        dashboardId: item.DASHBOARDID,
                        url: item.DASHBOARDID ? this.getUrl(item.DASHBOARDID) : null,
                        items: _submenu
                    });
                    getItems(item.MENUID, _submenu);
                }.bind(this));
            }.bind(this);
            getItems(null, this.menu.items);
            this.menu.items.init = true;
            return this;
        },

        // Get the menu as a jQuery <ul><li>...</li></ul>
        jQueryMenu: function () {
            if (!this.menu.items.init) {
                tool.console.error('Bi.Core.Dashboard.jQueryMenu: Unable to generate the menu !');
                return jQuery('<ul>');
            }
            var traverse = function (menu, $menu) {
                if (menu.length) {
                    var ul = jQuery('<ul class="bi-menu bi-hover-wrap">');
                    $menu.append(ul);
                    $menu = ul;
                }
                for (var i = 0; i < menu.length; i++) {
                    var icon = menu[i].icon ? '<i class="bi-menu-icon fa fa-' + menu[i].icon + '"></i>' : '',
                        item = icon + menu[i].label;
                    if (menu[i].url) {
                        item = '<a href="' + menu[i].url + '">' + item + '</a>';
                    } else {
                        item = '<span>' + item + '</span>';
                    }
                    var data = menu[i].dashboardId ? ' data-biz-dashboard="' + menu[i].dashboardId + '"' : '',
                        li = jQuery('<li' + data + '>' + item + '</li>').appendTo($menu);
                    traverse(menu[i].items, li);
                }
            };
            var $menu = jQuery('<div>');
            traverse(this.menu.items, $menu);
            return $menu.children(); // Remove the '<div>' wrapper
        },

        // Is the requested dashboardId currently disabled ?
        // (because it is not available offline, which is the current mode)
        isDisabled: function (dashboardId) {
            if (!this.menu.items.init) {
                tool.console.error('Bi.Core.Dashboard.isDisabled: ' +
                    'Unable to determine which Dashboards are disabled offline !');
                return false;
            }
            return tool.array.exists(parseInt(dashboardId, 10), this.menu.disabled);
        }

    });

    /* ------
       Layout
       ------ */

    Dashboard.extendProto({

        // Get the scope of the main template: views/main.html
        initScope: function (scope) {
            // Because this method can be called from a clone instance,
            // use the method 'setter' to affect the original instance and not only the clone.
            // (You need to do this each time you need to share properties)
            this.setter('scope', scope);

            // Overwrite some scope properties to fit our needs
            // For example: Originally this.scope.wrapper contains .bi-router-container
            // But after that, this.scope.wrapper will contains .bi-wrap

            // The entire Bi user interface
            this.scope.wrapper = jQuery(this.scope.wrapper).children('.bi-wrap').biWrap(this.options.wrapOptions).get(0);

            // Enable Dashboards routers
            this.scope.main = jQuery('<div>').biRouter({ slide: this.options.slide }).appendTo(this.scope.main).get(0);
            this.scope.sidebar = jQuery('<div>').biRouter({ static: true }).appendTo(this.scope.sidebar).get(0);
            this.scope.topTitle = jQuery('<span>').biRouter({ static: true }).appendTo(this.scope.topTitle).get(0);

            // Init sidebar behaviour
            var isFluid = this.sidebarFluid();
            // If the sidebar is fluid then it appears closed
            if (isFluid) this.sidebarToggle('close');
            // Enable screen large/small detection and update sidebar behaviour accordingly
            jQuery(this.scope.wrapper).biScreen({ callback: function () { this.sidebarFluid(); }.bind(this) });

            // Enable action-bar in the bottom
            this.scope.bottomAction = jQuery('<ul>').biMenu({ breadcrumbDisabled: true }).prependTo(this.scope.bottom);

            // Check standalone
            !this.options.standalone.length || jQuery(this.scope.wrapper).addClass('bi-standalone');

            // Show the entire UI
            jQuery(this.scope.wrapper).removeClass('bi-hide-wrap');

            // Retrieve the Assembly build version and the Repo version
            var infos = this.factory.export('Repository', 'db').infos,
                buildVersion = infos['BUILDVERSION'] || '',
                repoVersion = infos['REPOVERSIONID'] || '',
                dataSource = infos['DATASOURCE'] || '';

            // Display buildVersion
            jQuery(this.scope.wrapper).find('.bi-version').text(buildVersion);

            // Show the current user login
            if (Core.User) jQuery(scope.username).html(Core.User.login() + ' <i class="fa fa-user"></i>');

            // Enable debugging with a "very hard to hack" password...
            var debugApp = function (debug) {
                window.location.href = tool.url.extend(undefined, {
                    hashQueries: {
                        bidebug: debug ? 'all' : '',
                        biconsole: jQuery.biPlugin.isMobile ? 'document' : 'window'
                    }
                });
                window.location.reload();
            };
            jQuery(this.scope.adminDebugLink).click(function (e) {
                e.preventDefault();
                var version = [];
                if (buildVersion) version.push('    - Build: ' + buildVersion);
                if (repoVersion) version.push('    - Repo: ' + repoVersion);
                if (dataSource) version.push('    - Data source: ' + dataSource);
                version = 'Bi App Version\n' + (version.length ? version.join('\n') + '\n\n' : '');
                if (!this.options.debug) {
                    if ('bidebug' === window.prompt(version +
                        'Enter password to enable debugging:')) debugApp(true);
                } else {
                    if (window.confirm(version +
                        'Confirm to disable debugging ?\n')) debugApp(false);
                }
            }.bind(this));
            
            return this;
        },

        // Use the optional parameter position to overwrite the default position defined in the database
        displayMenu: function (position) {
            var translate = this.factory.export('Translation', 'translate'),
                getConfig = this.factory.export('Context', 'getConfig');
            if (!position) position = getConfig('Dashboard.SidebarMenu') ? 'sidebar' : 'top';
            var param = 'sidebar' == position ? { closeDelay: false } : undefined;

            var $navMenu = jQuery(this.scope.wrapper).find('.bi-nav-menu'),
                $menu = this.jQueryMenu().biMenu(param);

            // Add link (to synchro page) to the menu (when switching database mode is enabled)
            if (getConfig('Menu.DatabaseModeSwitch') && this.factory.has('Router')) $menu.biMenu('addItem', {
                content: '<i class="bi-menu-icon fa fa-database"></i> ' + translate('_BI_SYNCHRO')
            }, function (e, menu) {
                e.preventDefault();
                this.factory.export('Router', 'redirect')('/synchro', false);
            }.bind(this));

            switch (position) {
                case 'top':
                    // Insert the menu
                    this.menu.dom = $menu.get(0);
                    jQuery(this.scope.topMenu).append($menu);

                    // Enable nav-menu (will collapse the menu on small screen)
                    $navMenu.biNavMenu().on(jQuery.biPlugin.events('menu navMenu'), function (e) {
                            if ('menu' == e.type) {
                                $navMenu.delay(750).queue(function () {
                                    // Close the nav-menu after a menu link was clicked
                                    $navMenu.biNavMenu('close').dequeue();
                                });
                            } else {
                                $navMenu.clearQueue();
                            }
                        });
                    // Close nav-menu in case the top is closed
                    jQuery(this.scope.wrapper).find('.bi-top .bi-toggle-trigger')
                        .on(jQuery.biPlugin.events('mousedown'), function () {
                            $navMenu.biNavMenu('close');
                        });
                    break;

                case 'sidebar':
                    // Insert the menu
                    this.menu.dom = $menu.get(0);
                    jQuery(this.scope.sidebarMenu).append($menu);
                    // do not break;
                default:
                    $navMenu.addClass('bi-nav-menu-disabled'); // Disable the top nav-menu
                    break;
            }
            if (position) this.menu.position = position;
        },

        displayDashboard: function (dashboardId, pageId) {
            if (!this.checkRequest(dashboardId, pageId)) {
                return false;
            }
            var dbDashboard = this.getDashboard(dashboardId),
                isNew = !dbDashboard.scope; // If the dashboard has a scope, it means that is has been already created
            if (isNew) {
                // Create new dashboard
                this._createDashboard(dashboardId);
                if (!pageId) pageId = this.getPages(dashboardId)[0].ID; // First page selected
            } else {
                // Go to existing dashboard
                jQuery(this.scope.topTitle).add(this.scope.main).add(this.scope.sidebar)
                    .biRouter('goTo', this.path2Dashboard(dashboardId));
            }
            if (this.menu.dom) {
                // Highlight dashboards menu item
                var $menu = jQuery(this.menu.dom);
                $menu.biMenu('open', $menu.find('[data-biz-dashboard="' + dashboardId + '"]'));
            }
            if (pageId) this.queue(function () {
                // Go to existing page
                jQuery(dbDashboard.scope.mainPages).add(dbDashboard.scope.sidebarPages)
                    .biRouter('goTo', this.path2Page(pageId));

                // Highlight pages menu item
                var $menu = jQuery(dbDashboard.scope.mainLinks);
                $menu.biMenu('open', $menu.find('[data-biz-page="' + pageId + '"]'));
            });
            this.queue(function () {
                var hasChanged = false;
                dashboardId = parseInt(dashboardId, 10);
                if (dashboardId !== this.current.dashboardId) {
                    this.current.dashboardId = parseInt(dashboardId, 10);
                    hasChanged = true;
                }
                if (pageId = parseInt(pageId, 10)) {
                    if (pageId !== this.current.pagesId[dashboardId]) {
                        this.current.pagesId[dashboardId] = pageId;
                        hasChanged = true;
                    }
                }
                if (hasChanged) this.triggerEvent(isNew ? Dashboard.EVENT.READY : Dashboard.EVENT.VIEW, {
                    dashboardId: this.current.dashboardId,
                    pageId: this.current.pagesId[dashboardId]
                });
            });
            return true;
        },

        // Get the list of pageId that have been rendered
        getPagesIdWrapped: function () {
            var pageId = [];
            this.db.page.forEach(function (page) { if (page.scope) pageId.push(page.ID); });
            return pageId;
        }

    });

    Dashboard.extendAsync({

        _createDashboard: function (dashboardId) {
            var standalonePageId = dashboardId == this.options.standalone[0] ? this.options.standalone[1] : undefined;
            
            var replaceText = this.factory.export('Translation', 'replaceText');

            var dbDashboard = this.getDashboard(dashboardId),
                dashboardTitle = replaceText(dbDashboard.TITLE);

            if (this.options.debug) tool.console.log('\nDashboard:', dbDashboard);

            this.factory.get('Template').process('tmpl/body-head', function (html) {

                // Preprocess the html template
                return Core.Template.replaceHtml(html, { TITLE: dashboardTitle });

            }).queue(function (tmpl) {

                dbDashboard.scope = tmpl.scope;

                // Dashboard title for small screen
                dbDashboard.scope.topTitle =
                    jQuery(this.scope.topTitle).biRouter('add', this.path2Dashboard(dashboardId), dashboardTitle);

                // Dedicate area in the main
                dbDashboard.scope.main =
                    jQuery(this.scope.main).biRouter('add', this.path2Dashboard(dashboardId), tmpl.$html);
                // Dedicate area in the sidebar
                dbDashboard.scope.sidebar =
                    jQuery(this.scope.sidebar).biRouter('add', this.path2Dashboard(dashboardId));
                // Dedicate area in the sidebar for dashboard filters
                dbDashboard.scope.sidebarDashboard =
                    jQuery('<div role="dashboard-filters">').appendTo(dbDashboard.scope.sidebar).get(0);

                // Dedicate area in the main for the dashboard pages
                jQuery(dbDashboard.scope.mainPages).biRouter({ slide: false });
                // Dedicate area in the sidebar for the dashboard pages
                dbDashboard.scope.sidebarPages = jQuery('<div>').biRouter().appendTo(dbDashboard.scope.sidebar).get(0);

                // Traverse pages in dashboard
                var dbPages = this.getPages(dashboardId);
                if (this.options.debug) tool.console.log('\nPages:', dbPages);
                dbPages.forEach(function (dbPage, index) {

                    if (standalonePageId && standalonePageId != dbPage.ID) return;

                    var mainPage = jQuery(dbDashboard.scope.mainPages).biRouter('add', this.path2Page(dbPage.ID));

                    dbPage.scope = {
                        // Dedicated area in the main page for containers
                        main: jQuery('<div class="bi-grid-wrap">').appendTo(mainPage).get(0),
                        // Dedicated area in the sidebar page for page filters
                        sidebar: jQuery(dbDashboard.scope.sidebarPages).biRouter('add', this.path2Page(dbPage.ID))
                    };

                    // Add link to this page (only if its TITLE is defined)
                    var pageTitle = replaceText(dbPage.TITLE);
                    if (pageTitle) jQuery(dbDashboard.scope.mainLinks).append(
                        '<li data-biz-page="' + dbPage.ID + '">' +
                            '<a href="' + this.getUrl(dashboardId, dbPage.ID) + '">' + pageTitle + '</a></li>'
                    );

                    // Traverse containers in page
                    var infos = {
                        $parentCtnr: jQuery(dbPage.scope.main),
                        parentStack: [],
                        previous: { $ctnr: null, isChildEnd: false }
                    };
                    if (this.options.debug) tool.console.log(
                        '\nContainers (pageId=' + dbPage.ID + '):', this.getContainers(dbPage.ID)
                    );
                    this.getContainers(dbPage.ID).forEach(function (dbContainer) {

                        if (dbContainer.CHILDSTART && !infos.previous.isChildEnd) {
                            infos.parentStack.push(infos.previous.$ctnr);
                        }
                        if (!dbContainer.CHILDSTART && infos.previous.isChildEnd) {
                            infos.$parentCtnr = (infos.parentStack.pop()).parent();
                        }
                        //if (dbContainer.NEWROW) jQuery('<div style="clear:left">').appendTo(infos.$parentCtnr);
                        if (dbContainer.CHILDSTART) infos.$parentCtnr = infos.$parentCtnr.children(':last-child');

                        // One of the containers of this page
                        var sizes = this.getContainerSizes(dbContainer);
                        dbContainer.scope = {
                            wrapper: jQuery('<div class="bi-grid">')
                                .addClass('bi-grid-w-' + sizes.width)
                                .addClass('bi-grid-h-' + sizes.height)
                                .attr('data-biz-container', dbContainer.ID).get(0)
                        };
                        infos.previous = {
                            $ctnr: jQuery(dbContainer.scope.wrapper).appendTo(infos.$parentCtnr),
                            isChildEnd: dbContainer.CHILDEND
                        };

                    }.bind(this));

                }.bind(this));

                // Hide single page link without title
                if (1 == dbPages.length && !jQuery(dbDashboard.scope.mainLinks).text().replace(/\s+/, '')) {
                    jQuery(dbDashboard.scope.mainLinks).css('visibility', 'hidden');
                }

                this.findOutputContainers(dbDashboard.scope.mainPages);

            }.bind(this)).thenDone(this);
        }

    });

    Dashboard.extendProto({

        // Get the full Url to the main page (parameters dashboardId and pageId are optionals)
        getUrl: function (dashboardId, pageId) {
            var map = { hashQueries: {} };
            if (dashboardId) map.hashQueries[Dashboard.HASH.DASHBOARD] = dashboardId;
            if (pageId) map.hashQueries[Dashboard.HASH.PAGE] = pageId;
            return tool.url.extend(tool.url.ROOT + this.options.rootUrl, map, false);
        },

        checkRequest: function (dashboardId, pageId, log) {
            try {
                if (!dashboardId) throw 'dashboardId is missing';
                var dbDashboard = this.getDashboard(dashboardId);
                if (!dbDashboard) throw 'Invalid dashboardId=' + dashboardId;
                if (pageId) {
                    var dbPage = this.getPage(pageId);
                    if (!dbPage) throw 'Invalid pageId=' + pageId;
                    if (dashboardId != dbPage.DASHBOARDID) {
                        throw 'no pageId=' + pageId + ' in dashboardId=' + dashboardId;
                    }
                }
            } catch (errMsg) {
                if (undefined === log || !!log) tool.console.error('Bi.Core.Dashboard.checkRequest: ' + errMsg);
                return false;
            }
            return true;
        }

    });

    Dashboard.extendProto({

        // Router path identifier to goTo dashboard
        path2Dashboard: function (id) {
            return 'dashboard' + id;
        },

        // Router path identifier to goTo page
        path2Page: function (id) {
            return 'page' + id;
        }

    });

    Dashboard.extendProto({

        findOutputContainers: function (mainPages) {
            jQuery(mainPages).find('.bi-grid').each(function (index, container) {
                var $container = jQuery(container);
                // Remember that it's an output... (final container)
                if (!$container.find('.bi-grid').size()) {
                    // ...in the DOM
                    $container.attr('data-biz-container-output', '');
                    // ...in this.db.container
                    this.getContainer($container.data('biz-container')).isOutput = true;

                    // Debugging: view the dashboardId of each final container
                    if (this.options.debug) $container.addClass('bi-grid-debug').append(
                        jQuery('<div>').addClass('bi-grid-debug-info').text('Cid:' + $container.data('biz-container'))
                    );
//					// Debugging: display empty output in each final container
//					$container.append(
//						'<div class="bi-grid-cell">' +
//							'<div class="bi-grid-cell-title"> ContainerId ' + $container.data('biz-container') + '</div>' +
//							'<div class="bi-grid-cell-content"></div>' +
//						'</div>');
                }
            }.bind(this));
        },

        // Get the output containers that have been rendered (they have properties .isOutput and .scope)
        getOutputContainers: function (dashboardId) {
            var containers = [];
            this.getPages(dashboardId).forEach(function (page) {
                this.getContainers(page.ID).forEach(function (container) {
                    if (container.isOutput) containers.push(container);
                }.bind(this));
            }.bind(this));
            return containers;
        },

        getContainerSizes: function (dbContainer) {
            var closest = function (size) {
                if (tool.array.exists(size, Dashboard.SIZES)) {
                    return size;
                }
                tool.console.error('Bi.Core.Dashboard.getContainerSizes: ' +
                    'Invalid container WIDTH and/or HEIGHT.\n' +
                    'Available sizes: [' + Dashboard.SIZES.join(', ') + '].\n',
                    dbContainer
                );
                for (var i = 0; i < Dashboard.SIZES.length; i++) {
                    if (size < Dashboard.SIZES[i]) return Dashboard.SIZES[i > 0 ? i/* - 1*/ : i];
                }
            };
            return {
                width: closest(dbContainer.WIDTH),
                height: closest(dbContainer.HEIGHT)
            };
        }

    });

    Dashboard.extendProto({

        handleLocationHash: function () {
            var getUrlRequest = function () {
                var queries = tool.url.parse().hashQueries;
                return { dashboardId: queries[Dashboard.HASH.DASHBOARD], pageId: queries[Dashboard.HASH.PAGE] };
            };

            // Handle hash change
            jQuery(window).on(jQuery.biPlugin.events('hashchange'), function () {
                var request = getUrlRequest();
                if (!request.dashboardId) return false;
                this.displayDashboard(request.dashboardId, request.pageId);

                this.handleBackButton();
            }.bind(this));

            // Handle current hash
            var request = getUrlRequest(), result = false;
            if (request.dashboardId) {
                result = this.displayDashboard(request.dashboardId, request.pageId);
            }
            if (!result) {
                var dashboardId = this.factory.export('Context', 'get')('group', 'DEFAULTDASHBOARDID');
                if (dashboardId) window.location.href = this.getUrl(dashboardId); // trigger hash change
            }
        },

        // Handle the resize of the browser window and the main container
        // Note: the Bi interface might be integrated inside the Crm interface, and the size of
        // the main container might change without the triggering of the window resize event !
        // For this reason, we have to watch the window resize event and the main container resize...
        handleResize: function () {
            var $main = jQuery(this.scope.main), get$mainSize = function () {
                return { w: $main.width(), h: $main.height() };
            }, mainSize = get$mainSize(), hasMainSize = function () {
                return 0 != mainSize.w && 0 != mainSize.h;
            }, resizing = false, timeout = null;
            // Window resize
            jQuery(window).on(jQuery.biPlugin.events('resize'), function () {
                if (!timeout) {
                    resizing = true;
                    this.triggerEvent(Dashboard.EVENT.RESIZING); // pre-process
                } else {
                    clearTimeout(timeout); // Prevent multiple triggers...
                }
                timeout = setTimeout(function () {
                    resizing = false;
                    timeout = null;
                    // Trigger the event now, when the dashboard is stable
                    mainSize = get$mainSize();
                    if (hasMainSize()) this.triggerEvent(Dashboard.EVENT.RESIZED, mainSize); // post-process
                }.bind(this), 250);
            }.bind(this));
            // Main resize
            var watchSize = function () {
                if (resizing) return;
                var newMainSize = get$mainSize();
                if (mainSize.w != newMainSize.w || mainSize.h != newMainSize.h) {
                    mainSize = newMainSize;
                    if (hasMainSize()) this.triggerEvent(Dashboard.EVENT.RESIZED, mainSize);
                }
            }.bind(this), interval = setInterval(function () {
                // Watch size until the $main has been removed from the DOM
                $main.parents('body').size() ? watchSize() : clearInterval(interval);
            }, 1000);
        }

    });

    Dashboard.extendStatic({

        // Remove the listeners attached to the window
        // The is strongly required when you reload the Bi interface twice in the DOM.
        // In this case, you must remove the previous handlers like:
        //      .handleLocationHash()
        //      .handleResize()
        removeEventsFootprint: function () {
            jQuery(window).off(jQuery.biPlugin.events());
        }

    });

    Dashboard.extendProto({

        // Close/open sidebar
        sidebarToggle: function (action) {
            action = tool.array.exists(action, ['show', 'hide']) ? action : 'toggle';
            jQuery(this.scope.wrapper).biWrap(action, 'sidebar');
        },

        // Change sidebar behaviour
        sidebarFluid: function (bool) {
            if (tool.is.boolean(bool)) {
                // Set expected status
                tool.storage.local('biCoreDashboard.sidebarFluid', bool);
            } else {
                // Get stored expected status
                bool = tool.storage.local('biCoreDashboard.sidebarFluid');
                // Get default expected status
                if (null === bool) {
                    bool = this.factory.export('Context', 'getConfig')('Dashboard.SidebarOverlay');
                    bool = undefined !== bool ? bool : true;
                }
                // Define default expected status
                if (undefined === bool) bool = true;
                // Update expected status
                tool.storage.local('biCoreDashboard.sidebarFluid', bool);
            }
            // Here's the trick: If the screen is small then force the main to be fixed
            // (notice: when the main is "fixed" then the sidebar is "fluid")
            var $wrapper = jQuery(this.scope.wrapper),
                realBool = 'small' === $wrapper.biScreen('status') ? true : bool;
            // Apply and return the real status
            $wrapper.biWrap('fixedMain', realBool);
            return realBool;
        },

        // Toggle sidebar behaviour
        sidebarFluidToggle: function () {
            this.sidebarToggle('show');
            this.sidebarFluid(!this.sidebarFluid());
        }

    });

    Dashboard.extendProto({

        addBottomAction: function (id, param, callback) {
            this.bottomAction[id] = jQuery(this.scope.bottomAction).biMenu('addItem', param, callback);
        },

        removeBottomAction: function (id) {
            if (!this.hasBottomAction(id)) return false;
            jQuery(this.scope.bottomAction).biMenu('removeItem', this.bottomAction[id]);
            delete this.bottomAction[id];
            return true;
        },

        hasBottomAction: function (id) {
            return (id in this.bottomAction);
        }
    });

    Dashboard.extendProto({

        // TODO: je n'ai pas pris en compte la suppression de la session 'BiCoreDashboard.backButton'
        // lorsqu'on clique dans le boutton "refresh" (qui surpprime le cache des queries et le reste...)

        addBackButton: function (nextUrl, backUrl) {
            // Format Urls
            nextUrl = nextUrl ? tool.url.stringify(tool.url.parse(nextUrl)) : undefined;
            backUrl = tool.url.stringify(tool.url.parse(backUrl || window.location.href)); // Default backUrl is the current location
            if (nextUrl == backUrl) return; // Security: the back url is the current location
            // Check that the nextUrl is a Bi Dashboard (we assumes that the backUrl is a Bi Dashboard)
            if (nextUrl) {
                var nextRootUrl = tool.url.parse(nextUrl);
                nextRootUrl = nextRootUrl.pathname + '#' + nextRootUrl.hashPathname;
                if (nextRootUrl != tool.url.ROOT + this.options.rootUrl) return;
            }
            this.removeBottomAction('BackButton'); // Security: remove previous button
            this.addBottomAction('BackButton', {
                content: '<i class="fa fa-arrow-left"></i>',
                attributes: {
                    href: backUrl,
                    title: 'Go back',
                    class: 'bi-bottom-menu-highlight'
                }
            }, function (e) {
                // iPad "bug" fix: when the App is displayed in the mode "apple-mobile-web-app-capable" 
                // (launched from desktop icon), the back button might open the Safari Browser instead of staying in the App.
                // So we need to emulate the link action by changing mannualy the window.location...
                e.preventDefault();
                window.location = jQuery(this).find('a').attr('href');
            });
            var breadcrumb = tool.storage.session('BiCoreDashboard.backButton') || [];
            breadcrumb.unshift([nextUrl, backUrl]);
            tool.storage.session('BiCoreDashboard.backButton', breadcrumb);
        },
        
        // Call this method on hashchange to check if the backButton should be removed...
        handleBackButton: function () {

            // If 2 Bi interfaces (Bi.Core.Factory) are loaded in the same page (with full render - not in standalone mode)
            // then only the backup button of the "first" interface will be removed...
            // (because the first call of this method will remove tool.storage.session)
            //
            // Because of that we assumes that in the page there's only one Bi interface with full render,
            // and the others interfaces are rendered in standalone mode.
            // (remember that in standalone mode we don't need to handle the backButton because it's available in this.scope.bottom which is hidden)
            if (this.options.standalone.length) return;

            var breadcrumb = tool.storage.session('BiCoreDashboard.backButton') || [], backButton = breadcrumb.shift();
            // No back button or the expected nextUrl has just been reached...
            if (!backButton || backButton[0] == window.location.href) return;
            // The url hash has "really" changed ! Remove the back button whatever
            this.removeBottomAction('BackButton');
            // Update session
            tool.storage.session('BiCoreDashboard.backButton', breadcrumb.length ? breadcrumb : null);
            // Check for a previous back button
            this.restoreBackButton();
        },

        restoreBackButton: function () {
            var breadcrumb = tool.storage.session('BiCoreDashboard.backButton') || [], backButton;
            // Check a previous back buttons associated to the current location
            while (backButton = breadcrumb.shift()) if (backButton[0] == window.location.href) break;
            // Update session before adding previous back button
            tool.storage.session('BiCoreDashboard.backButton', breadcrumb.length ? breadcrumb : null);
            if (backButton) this.addBackButton(backButton[0], backButton[1]);
        }

    });

    Dashboard.extendStatic({

        setCountryIcons: function () {
            var set = function () {
                var country = tool.storage.local('biCoreDashboard.country');
                if (!country) {
                    return tool.console.warn('Bi.Core.Dashboard.setCountryIcons: no country defined');
                }
                // Insert <link> tags unless they already exist in the DOM...
                var hrefbase = tool.url.ROOT + '/dashboard/resources/images/logos/' + country;
                if (!jQuery('head [rel="icon"]').size()) {
                    jQuery('<link rel="icon" type="image/png" />').attr('href', hrefbase + '.png').appendTo('head');
                }
                if (!jQuery('head [rel="apple-touch-icon"][sizes="76x76"]').size()) {
                    jQuery('<link rel="apple-touch-icon" sizes="76x76" />').attr('href', hrefbase + '.png').appendTo('head');
                }
                if (!jQuery('head [rel="apple-touch-icon"][sizes="152x152"]').size()) {
                    jQuery('<link rel="apple-touch-icon" sizes="152x152" />').attr('href', hrefbase + '-retina.png').appendTo('head');
                }
            };
            if (database.run.isMode('remote')) {
                jQuery.get(tool.url.ROOT + Dashboard.OPTIONS.countryUrl, function (country) {
                    tool.storage.local('biCoreDashboard.country', country ? country.toLowerCase() : null);
                    set();
                });
            } else {
                set();
            }
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
