
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Filter = Core.module('Filter');

    Filter.extendStatic({

        OPTIONS: {
            processSuffix: '',
            bookmarkRestApi: '/api/bi/filterBookmark',
            debug: false
        },

        HASH: 'Filters',

        EVENT: {
            READY: 'biCoreFilter.ready',
            CHANGE: 'biCoreFilter.change'
        },

        LAYOUT: {
            WRAP: 'bi-filter-wrap',
            BOX: 'bi-filter-box',
            LABEL: 'bi-filter-label',
            INPUT: 'bi-filter-input'
        }

    });

    Filter.extendStatic({

        getEmptySelection: function (withNoData) {
            var empty = { Value: [], Caption: [] };
            if (withNoData) {
                // Add 'noData' property to each part of the structure
                // This is important when you need to determine whether a filter 
                // has items but no one is selected or the filter has no items available!
                empty.Value.noData = true;
                empty.Caption.noData = true;
                empty.noData = true;
            }
            return empty; // Structure of a filter selection
        }

    });

    Filter.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Filter.OPTIONS, options || {});
            this.filtersPerDashboard = {};
            this.pendingFilters = [];
            this.submitButtons = [];
            this.triggerSelection = {};
        },

        initRepository: function (result) {
            this.db = {
                definition: {
                    info: database.format.toJson(result[0]),
                    link: database.format.toJson(result[1])
                },
                instance: {
                    info: database.format.toJson(result[2]),
                    link: database.format.toJson(result[3]),
                    filterGroup: database.format.toJson(result[4]),
                    userGroup: database.format.toJson(result[5])
                }
            };
        }

    });

    Filter.extendProto({

        // Filter
        getFilter: function (filterId) {
            return this._getFilter(filterId, this.db.definition.info);
        },
        getFilterInstance: function (filterId) {
            return this._getFilter(filterId, this.db.instance.info);
        },
        _getFilter: function (filterId, dbData) {
            if (!filterId) return dbData;
            return dbData.filter(function (row) {
                return filterId == row.ID;
            })[0];
        },

        // Slaves
        getSlaves: function (masterId) {
            return this._getSlaves(masterId, this.db.definition.link);
        },
        getSlavesInstance: function (masterId) {
            return this._getSlaves(masterId, this.db.instance.link);
        },
        _getSlaves: function (masterId, dbData) {
            var slaveId = [];
            dbData.forEach(function (link) { if (masterId == link.MASTERID) slaveId.push(link.SLAVEID); });
            return slaveId;
        },

        // Masters
        getMasters: function (slaveId) {
            return this._getMasters(slaveId, this.db.definition.link);
        },
        getMastersInstance: function (slaveId) {
            return this._getMasters(slaveId, this.db.instance.link);
        },
        _getMasters: function (slaveId, dbData) {
            var masterId = [];
            dbData.forEach(function (link) { if (slaveId == link.SLAVEID) masterId.push(link.MASTERID); });
            return masterId;
        },

        isBypassPreviousSelection: function (slaveId, mastersId) { // mastersId is optional
            if (mastersId) mastersId = [].mastersId;
            for (var link = this.db.instance.link, i = 0; i < link.length; i++) {
                if (slaveId != link[i].SLAVEID) continue;
                if (mastersId && !tool.array.exists(link[i].MASTERID, mastersId)) continue;
                return !!link[i].BYPASSPREVIOUSSELECTION;
            }
        },

        // layoutType = 'Dashboard', 'Page' or 'Container'
        getFiltersInstancePerLayout: function (layoutType, layoutId) {
            return this.db.instance.info.filter(function (row) {
                return layoutType == row.LAYOUTTYPE && layoutId == row.LAYOUTID;
            });
        },

        // Get filters group
        getFiltersInstanceGroup: function (filterId, addSelf) {
            var filterGroupId;
            this.db.instance.filterGroup.forEach(function (row) {
                if (filterId == row.FILTERID) filterGroupId = row.FILTERGROUPID;
            });
            if (!filterGroupId) return null; // return null
            // Does the returned list contains also the requested filterId itself
            // or only the other filters of the same group ?
            addSelf = (undefined === addSelf || !!addSelf);
            var list = [];
            this.db.instance.filterGroup.forEach(function (row) {
                if (filterGroupId == row.FILTERGROUPID && (filterId != row.FILTERID || addSelf))
                    list.push(row.FILTERID);
            });
            return list; // return array
        },

        // Get filters details for a user group
        getFiltersInstanceUserGroup: function (filterId) { // filterId is optional
            var userGroupId = this.factory.export('Context', 'get')('group', 'ID'),
                userGroup = this.db.instance.userGroup.filter(function (row) {
                    return (userGroupId == row.GROUPID) && (!filterId || filterId == row.FILTERID);
                });
            return filterId ? userGroup[0] : userGroup;
        },
        isUserGroupHiddenFilterInstance: function (filterId) { // filterId is required
            return !!(this.getFiltersInstanceUserGroup(filterId) || {}).ISHIDDEN;
        },

        // Get array of the diplayed filters wrapper
        // Examples:    filtersId = 94; // integer
        //              filtersId = "94"; // string
        //              filtersId = [94, "95"]; // array
        //              filtersId = undefined // to get all wrappers
        // Where 94 and 95 are the filters instance ID.
        getFiltersInstanceWrapper: function (filtersId, areIncluded) {
            if (filtersId) {
                filtersId = [].concat(filtersId);
                filtersId.forEach(function (filterId, index, array) {
                    array[index] = parseInt(filterId, 10);
                });
            }
            areIncluded = undefined === areIncluded ? true : !!areIncluded;
            var wrappers = [];
            this.db.instance.info.forEach(function (filter) {
                if (!filter.scope) return; // Not displayed
                if (filtersId) {
                    // Not requested
                    if (areIncluded && !tool.array.exists(filter.ID, filtersId)) return; // Check include list
                    else if (!areIncluded && tool.array.exists(filter.ID, filtersId)) return; // Check exclude list
                }
                wrappers.push(filter.scope.wrapper);
            });
            return wrappers; // Return the list of dom elements
        },

        // Get the list of filtersId that have been rendered
        getFiltersInstanceIdWrapped: function () {
            var filtersId = [];
            this.db.instance.info.forEach(function (filter) {
                if (!filter.scope) return; // Not displayed
                filtersId.push(filter.ID);
            });
            return filtersId;
        }

    });

    Filter.extendProto({

        // Scan dashboard to find new filters to display
        displayDashboardFilters: function (dashboardId) {
            this.filtersPerDashboard[dashboardId] = [];
            var buttonsTargets = [], add = function (filter, dom) {
                // Add filter to list
                this.filtersPerDashboard[dashboardId].push(filter.ID);
                // Create filter wrapper
                filter.scope = {
                    wrapper: jQuery('<div>').addClass(Filter.LAYOUT.WRAP).attr('data-biz-filter', filter.ID)
                        .appendTo(dom).get(0)
                };
                // Prepare target for submit button (dedicated for deferred filters)
                if (filter.ISDEFERRED) {
                    jQuery(filter.scope.wrapper).addClass('bi-filter-deferred');
                    if (!tool.array.exists(dom, buttonsTargets)) buttonsTargets.push(dom);
                }
                // Store once the list of slaves/masters of this filter instance
                filter.SLAVES = this.getSlavesInstance(filter.ID);
                filter.MASTERS = this.getMastersInstance(filter.ID);
            }.bind(this);

            var dashboard = this.factory.export('Dashboard', ['scope', 'getDashboard', 'getPages', 'getContainers']);
            if (this.options.debug) jQuery(dashboard.scope.wrapper).addClass('bi-filter-debug');

            var dbDashboard = dashboard.getDashboard(dashboardId);
            // Dashboard filter
            this.getFiltersInstancePerLayout('Dashboard', dashboardId).forEach(function (filter) {
                add(filter, dbDashboard.scope.sidebarDashboard);
            });
            dashboard.getPages(dashboardId).forEach(function (dbPage) {
                // Page filter
                this.getFiltersInstancePerLayout('Page', dbPage.ID).forEach(function (filter) {
                    add(filter, dbPage.scope.sidebar);
                });
                dashboard.getContainers(dbPage.ID).forEach(function (dbContainer) {
                    // Container filter
                    this.getFiltersInstancePerLayout('Container', dbContainer.ID).forEach(function (filter) {
                        add(filter, dbContainer.scope.wrapper);
                    });
                }.bind(this));
            }.bind(this));

            this.addSubmitButtons(buttonsTargets);
            this.displayFilters(this.filtersPerDashboard[dashboardId], "build");
            return this;
        }

    });

    Filter.extendProto({

        // Add submit button after each group of deferred filters
        addSubmitButtons: function (targets) {
            targets.forEach(function (target) {
                this.submitButtons.push(
                    jQuery('<input />').attr({
                        type: 'submit',
                        disabled: 'disabled',
                        value: this.factory.export('Translation', 'translate')('_BI_FILTERS_SUBMIT')
                    }).click(function () {
                        this.firePendingFilters();
                        //setTimeout(function () { BI.Dashboard.toggleSidebar('close'); }, 500); // Close sidebar on click
                    }.bind(this)).appendTo(target).get(0)
                );
            }.bind(this));
        },

        enableSubmitButtons: function () {
            jQuery(this.submitButtons).attr('disabled', null);

        },

        disableSubmitButtons: function () {
            jQuery(this.submitButtons).attr('disabled', 'disabled');
        }

    });

    Filter.extendAsync({

        // Give any list of filters and display the expected sequence of filters according to dependencies
        // Notice: we have to care about 3 types of interactions :
        //  - filters dependencies (cascading from masters to slaves)
        //  - filters groups (filters that have the same values all the time)
        //  - filter which is deferred (and what's appening in this case with dependencies and groups...)
        displayFilters: function (filtersId, event) {
            // Get filters dependencies
            filtersId = [].concat(filtersId);
            var dependencies = this.getFiltersDependencies(filtersId);

            // Check event (which accepts 3 values):
            //  - "build" (first time the filters are displayed)
            //  - "change" (after a user action)
            //  - "rebuild" or undefined (for any reason you need to rebuild some filters - actually after a filters propagation)
            event = event || "rebuild";

            // Update the list of pending filters
            switch (event) {
                case "build":
                    // This is tricky !
                    // Normally, the first time we don't need to add pending filters
                    // (because we triggers Filter.EVENT.READY for all dependencies.linear at the end of the process)
                    // But, if the Dashboard is not in ImmediateExecution,
                    // then the Outputs that depends on deferred filters are not displayed immediately.
                    // For this reason, deferred filters must be added to the pending list.
                    // (Notice: the first time, filtersId and dependencies.linear contains the same items)
                    var deferred = [];
                    filtersId.forEach(function (filterId) {
                        if (this.getFilterInstance(filterId).ISDEFERRED) deferred.push(filterId);
                    }.bind(this));
                    this.addPendingFilters(deferred);
                    break;
                default: // event = "change" or "rebuild"
                    this.addPendingFilters(dependencies.linear);
                    break;
            }

            dependencies.groups.forEach(function (fltrIdGroup, index) {
                // The current group depends on the previous one
                var filtersIdTrigger = index ? dependencies.groups[index - 1] : [];

                // Execute in parallel the queries in a group
                // (including the "filter query" and also the "default values query" when expected)
                this.then(function () {

                    var filterDyn = [], defaultDyn = [], // dynamic filter : options and default values
                        filterStat = [], defaultStat = []; // static filter : options and default values

                    for (var j = 0; j < fltrIdGroup.length; j++) {
                        if ("change" == event && filtersId[0] == fltrIdGroup[j]) {
                            continue; // The filter which triggers the change don't need to be updated !
                        }
                        var fBag = this._getFilterInstanceBag(fltrIdGroup[j]);
                        if (!fBag) {
                            continue;
                        }
                        var queryInstance = this.getQueryFilterInstance(fBag, 'QUERY');
                        if (queryInstance) {
                            filterDyn.push({ // Dynamic filter
                                fBag: fBag,
                                query: queryInstance,
                                dbName: fBag.definition('DBNAME')
                            });
                        } else {
                            filterStat.push({ // Static filter
                                fBag: fBag
                            });
                        }
                        // Get the default value query (if expected)
                        if (Filter.isDefaultValueTypeQuery(fBag.definition('DEFVALTYPE'))) {
                            fBag.data('DEFVAL_RESULT', false); // Prepare location to store in the "default values"
                            var defValInstance = this.getQueryFilterInstance(fBag, 'DEFVAL');
                            (queryInstance ? defaultDyn : defaultStat).push({
                                query: defValInstance,
                                dbName: fBag.definition('DBNAME')
                            });
                        }
                    }
                    if (filterDyn.length || defaultDyn.length || defaultStat.length) {
                        this.factory.get('Db').multiReads(

                            filterDyn, defaultDyn, defaultStat

                        ).then(function (results, done) {
                            var resFilterDyn = results[0],
                                resDefaultDyn = results[1],
                                resDefaultStat = results[2];

                            var i, j;

                            // Insert static filters
                            for (i = 0; i < resDefaultStat.length; i++) {
                                for (j = 0; j < filterStat.length; j++) {
                                    if (false === filterStat[j].fBag.data('DEFVAL_RESULT')) { // Find prepared location
                                        filterStat[j].fBag.data('DEFVAL_RESULT',
                                            database.format.toJson(resDefaultStat[i])); // Store "default values" result
                                        break;
                                    }
                                }
                            }
                            for (j = 0; j < filterStat.length; j++) {
                                var fBag = filterStat[j].fBag;
                                this._insertFilterInLayout(fBag, this.isBypassPreviousSelection(fBag.instance('ID'), filtersIdTrigger));
                            }

                            // Insert dynamic filters
                            for (i = 0; i < resDefaultDyn.length; i++) {
                                for (j = 0; j < filterDyn.length; j++) {
                                    if (false === filterDyn[j].fBag.data('DEFVAL_RESULT')) { // Find prepared location
                                        filterDyn[j].fBag.data('DEFVAL_RESULT',
                                            database.format.toJson(resDefaultDyn[i])); // Store "default values" result
                                        break;
                                    }
                                }
                            }
                            for (j = 0; j < resFilterDyn.length; j++) {
                                filterDyn[j].fBag.data('QUERY_RESULT',
                                    database.format.toJson(resFilterDyn[j])); // Store "query" result
                                var fBag = filterDyn[j].fBag;
                                this._insertFilterInLayout(fBag, this.isBypassPreviousSelection(fBag.instance('ID'), filtersIdTrigger));
                            }

                            done();
                        }.bind(this)).thenDone(this);
                    } else {
                        this.done();
                    }
                });
            }.bind(this));

            var $dashboard = jQuery(this.factory.export('Dashboard', 'scope').wrapper),
                $filters = jQuery(this.getFiltersInstanceWrapper());

            // While execution...
            if (dependencies.linear.length > 1) {
                // Freeze dashboard (important: prevent any user action until the filters are ready)
                $dashboard.biLoader({ className: 'bi-loader-theme-transparent' }).biLoader('success');
                // Leave focus
                $filters.find('.' + Filter.LAYOUT.INPUT).blur();
                // Freeze filters
                $filters.each(function (index, filterLayout) {
                    var $filter = jQuery(filterLayout), filterId = $filter.data('biz-filter'), action;
                    if (!tool.array.exists(filterId, dependencies.linear)) {
                        action = 'success'; // NOT pending filters without progress icon
                    } else if ("change" == event && filterId == filtersId[0]) {
                        action = 'success'; // The filter which triggers the change don't need progress icon !
                    } else {
                        action = 'progress'; // Pending filters with progress icon
                        if (this.options.debug) $filter.addClass('bi-filter-debug-highlight');
                    }
                    $filter.biLoader(action);
                }.bind(this));
            }
            // ...after execution (all filters are now ready)
            this.queue(function () {
                // Take a snapshot (notice: this is required even if all filters all displayed with they default values)
                this.takeSnapshot();
                // Enable submit buttons if there's at least one deferred filter in the dependencies
                for (var i = 0; i < dependencies.linear.length; i++) {
                    if (!this.getFilterInstance(dependencies.linear[i]).ISDEFERRED) continue;
                    this.enableSubmitButtons();
                    break;
                }
                // Unfreeze filters
                $filters.biLoader('complete');
                if (this.options.debug) $filters.delay(300).queue(function () { // delay according to biFilterDebugHighlight css animation
                    $filters.removeClass('bi-filter-debug-highlight').dequeue();
                });
                // Unfreeze main
                $dashboard.biLoader('complete');
                
                switch (event) {
                    case "build":
                        this.triggerEvent(Filter.EVENT.READY, dependencies.linear); // Trigger the ready event for new filters
                        break;
                    case "rebuild":
                        this.triggerEvent(Filter.EVENT.CHANGE, dependencies.linear); // Trigger the change event
                        break;
                    case "change":
                        // Do nothing because the change event will be triggered by .firePendingFilters
                        break;
                }
            }).done();
        }

    });

    Filter.extendProto({

        // Determine how to update the filters sequentially
        getFiltersDependencies: function (filtersId) {
            filtersId = [].concat(filtersId);
            var steps = {},
                stepMax = 0;
            var updateSteps = function (mastersId, stp) {
                if (mastersId.length) stepMax = Math.max(stepMax, stp);
                for (var i = 0; i < mastersId.length; i++) {
                    steps[mastersId[i]] = Math.max(steps[mastersId[i]] || 0, stp || 0);
                    var slavesId = this.getFilterInstance(mastersId[i]).SLAVES;
                    updateSteps(slavesId, stp + 1);
                }
            }.bind(this);
            updateSteps(filtersId, 0);

            var dependencies = {
                groups: [], // In each group the filters can be updated in parallel
                linear: []
            },
            stepCurrent = 0;
            do {
                dependencies.groups[stepCurrent] = [];
                for (var filterId in steps) if (stepCurrent == steps[filterId]) {
                    var fltr = parseInt(filterId, 10);
                    dependencies.groups[stepCurrent].push(fltr);
                    dependencies.linear.push(fltr);
                }
            } while (++stepCurrent <= stepMax);
            return dependencies;
        },

        addPendingFilters: function (filtersId) {
            for (var i = 0; i < filtersId.length; i++) 
                if (!tool.array.exists(filtersId[i], this.pendingFilters))
                    this.pendingFilters.push(filtersId[i]);
        },

        firePendingFilters: function () {
            if (!this.pendingFilters.length) return;
            this.triggerEvent(Filter.EVENT.CHANGE, this.pendingFilters);
            this.pendingFilters.length = 0; // Empty the array
            this.disableSubmitButtons();
        },

        getQueryFilterInstance: function (fBag, queryKey) {
            var queryValue = fBag.definition(queryKey);
            if (queryValue) {
                var vars = this.getQueryMasterVariablesInstance(fBag, queryKey);
                for (var variable in vars) {
                    var masterId = vars[variable].masterId,
                        type = vars[variable].type,
                        selection = this.getFilterSelection(masterId) || Filter.getEmptySelection(),
                        value = "'" + selection[type].join("', '") + "'";

                    queryValue = queryValue.replace(new RegExp(variable, "g"), value);
                }
                queryValue = this.factory.export('Context', 'replaceAll')(queryValue);
            }
            return fBag.data(queryKey + '_INSTANCE', queryValue);
        },

        // This is the tricky part of the code:
        // The filter query may contain some masters variables like #X.Value# where X refers the filter id definition.
        // We have to replace this id by the real filter id instance.
        getQueryMasterVariablesInstance: function (fBag, queryKey) {
            var queryValue = fBag.definition(queryKey),
                masters = fBag.instance('MASTERS');
            var vars = Filter.getQueryMasterVariables(queryValue);
            for (var variable in vars) {
                var masterDefinition = { ID: vars[variable].masterId },
                    replaced = false;
                for (var id = 0; id < masters.length; id++) {
                    var masterInstance = this.getFilterInstance(masters[id]);
                    if (masterInstance.FILTERID == masterDefinition.ID) {
                        vars[variable].masterId = masterInstance.ID; // Replace the definition id by the instance id !
                        replaced = true;
                        break;
                    }
                }
                if (!replaced) {
                    tool.console.error(
                        'Bi.Core.Filter.getQueryMasterVariablesInstance: ' +
                        'unable to replace the filter definition id=' + vars[variable].masterId + ' by its instance id.'
                    );
                    delete vars[variable]; // Fallback: remove the dependency to prevent a fatal javascript error
                }
            }
            // Merge with previous VARS if defined (this is currently just for debugging)
            fBag.data('VARS', tool.extend(fBag.data('VARS') || {}, vars));
            return vars; // Return only the query vars
        }

    });

    Filter.extendStatic({

        getQueryMasterVariables: function (query) {
            var vars = {}, match = query.match(/#[0-9]+(\.(Value|Caption))?#/g);
            if (match) for (var i = 0; i < match.length; i++) {
                var m = match[i];
                m = m.replace(/#/g, '').split('.');
                vars[match[i]] = {
                    masterId: m[0],
                    type: m[1] || 'Value' // default type
                };
            }
            return vars;
        }

    });

    // Specialized object that contains all filter details (definition, instance and more...)
    Filter.InstanceBag = function (def, inst) {
        this._def = {}; for (var p in def) this._def[p] = def[p];
        this._inst = {}; for (var p in inst) this._inst[p] = inst[p];
        this.userData = {};
    };
    Filter.InstanceBag.prototype = {
        definition: function (key) {
            return this._access('_def', key); // getter
        },
        instance: function (key) {
            return this._access('_inst', key); // getter
        },
        data: function (key, val) {
            return this._access('userData', key, val); // getter and setter
        },
        _access: function (prop, key, val) {
            return (undefined === key) ? this[prop] : (undefined === val) ? this[prop][key] : (this[prop][key] = val);
        }
    };

    Filter.extendProto({

        // Get specialized object
        _getFilterInstanceBag: function (filterId) {
            // Filter instance
            var instance = this.getFilterInstance(filterId);
            if (!instance) return;
            // Filter definition
            var definition = this.getFilter(instance.FILTERID);
            // Filter bag
            var fBag = new Filter.InstanceBag(definition, instance);
            // Compute once the filter visibility (check definition, instance and group)
            fBag.data('isReallyHidden', !!(
                fBag.definition('ISHIDDEN') ||
                fBag.instance('ISHIDDEN') ||
                this.isUserGroupHiddenFilterInstance(fBag.instance('ID')))
            );
            return fBag;
        },

        _debugFilter: function (fBag) {
            var fltrInst = fBag._inst;

            jQuery(fltrInst.scope.wrapper).children('.bi-filter-debug-info').remove();

            var info = ['Fid:' + fltrInst.ID + (fltrInst.ISDEFERRED ? ' (deferred)' : '')];
            if (fltrInst.MASTERS.length) info.push('Masters: ' + fltrInst.MASTERS.join(', '));
            if (fltrInst.SLAVES.length) info.push('Slaves: ' + fltrInst.SLAVES.join(', '));

            jQuery('<div>')
                .addClass('bi-filter-debug-info')
                .html(info.join('<br />'))
                .appendTo(fltrInst.scope.wrapper)
                .click(function () {
                    var $debugContent = jQuery('<div class="bi-font bi-form">');

                    // General infos
                    $debugContent.append(tool.html.table({
                        style: 'min-width:480px;',
                        className: 'bi-table-100pc',
                        caption: 'Filter instance / definition',
                        cols: ['INFO', 'VALUE'],
                        rows: [
                            ['MastersId', fltrInst.MASTERS.join(', ')],
                            ['SlavesId', fltrInst.SLAVES.join(', ')],
                            ['InstanceId', fltrInst.ID],
                            ['DefinitionId', fltrInst.FILTERID],
                            ['Type', fBag.definition('TYPE')],
                            ['DisplayType', fltrInst.DISPLAYTYPE.replace(/;/g, '<br />')],
                            ['DefaultValueType', fBag.definition('DEFVALTYPE')]
                        ]
                    }));

                    // -- QUERY_RESULT & QUERY_INSTANCE --

                    // Query result (with highlight selection)
                    var view = [],
                        viewCols = ['CAPTION', 'VALUE'], // Default columns (required)
                        result = fBag.data('QUERY_RESULT'),
                        selection = this.getFilterSelection(fltrInst.ID);
                    if (result) {
                        var viewMax = 100, // Manual config
                            viewAll = result.length <= viewMax,
                            viewLength = viewAll ? result.length : viewMax;
                        for (var r, p, i = 0; i < viewLength; i++) {
                            r = [result[i].CAPTION, result[i].VALUE];
                            // Fill the view with the others columns available in the result (optional)
                            for (p in result[i]) if ('CAPTION' != p && 'VALUE' != p) {
                                r.push(result[i][p]);
                                if (0 == i) viewCols.push(p);
                            }
                            view.push(r);
                        }
                        viewAll || view.push(['...', '<em>(' + (result.length - viewLength)  + ' more results)</em>']);
                    } else if (selection) {
                        for (var i = 0; i < selection.Value.length; i++) {
                            view.push([selection.Caption[i], selection.Value[i]]);
                        }
                    }
                    view.forEach(function (row) {
                        // Highlight row by matching the "value" against the "selection.Value"
                        if (tool.array.exists(row[1], selection.Value, false)) {
                            row[0] = '<b class="bi-table-highlight"><i class="fa fa-check-circle"></i> ' + row[0] + '</b>';
                            row[1] = '<b class="bi-table-highlight">' + row[1] + '</b>';
                        }
                    });
                    $debugContent.append(tool.html.table({
                        style: 'min-width:480px;',
                        className: 'bi-table-100pc',
                        caption: 'Filter result',
                        cols: viewCols,
                        rows: view
                    }));

                    // Query instance
                    if (fBag.userData.QUERY_INSTANCE) $debugContent.append(tool.html.table({
                        style: 'min-width:480px;',
                        className: 'bi-table-100pc',
                        caption: 'Filter query',
                        rows: [
                            ['<textarea readonly onclick="if (\'select\' in this) this.select();">' +
                                fBag.userData.QUERY_INSTANCE + '</textarea>']
                        ]
                    }));

                    // -- DEFVAL_RESULT & DEFVAL_INSTANCE --

                    if (fBag.userData.DEFVAL_INSTANCE) {
                        // Default value result
                        var rows = [], cols = [];
                        (fBag.data('DEFVAL_RESULT') || []).forEach(function (data, i) {
                            var row = [], col;
                            for (col in data) {
                                row.push(data[col]);
                                if (0 == i) cols.push(col);
                            }
                            rows.push(row);
                        });
                        $debugContent.append(tool.html.table({
                            style: 'min-width:480px;',
                            className: 'bi-table-100pc',
                            caption: 'Default value result',
                            cols: cols,
                            rows: rows
                        }));
                        // Default value instance
                        $debugContent.append(tool.html.table({
                            style: 'min-width:480px;',
                            className: 'bi-table-100pc',
                            caption: 'Default value query',
                            rows: [
                                ['<textarea readonly onclick="if (\'select\' in this) this.select();">' +
                                    fBag.userData.DEFVAL_INSTANCE + '</textarea>']
                            ]
                        }));
                    }

                    // Modal output
                    var $modal = jQuery('<div>').biModal({
                        close: true,
                        title: 'Debug filter',
                        content: $debugContent
                    })
                    .insertAfter(this.factory.export('Dashboard', 'scope').wrapper); //.appendTo('body');

                }.bind(this));
        },

        _insertFilterInLayout: function (fBag, bypassPreviousSelection) {
            // Retrieve filter scope
            var scope = fBag.instance('scope'), $wrapper = jQuery(scope.wrapper);
            // Destroy previous box
            $wrapper.children('.' + Filter.LAYOUT.BOX).remove();
            // Create new box
            var $box = jQuery('<div>').addClass(Filter.LAYOUT.BOX).appendTo($wrapper);
            // Check the filter visibility
            if (fBag.data('isReallyHidden')) $box.addClass('bi-filter-hidden');
            // Build the filter (label and input) inside the $wrapper and add them to the scope
            scope = tool.extend(scope, this._buildFilter($box, fBag, fBag.data('QUERY_RESULT')));
            // Find the built input
            var $input = jQuery(scope.input);
            // Select the input default values
            this._initFilterSelectedValues($input, fBag, bypassPreviousSelection);
            // Filters details
            var details = Filter._instanceBagDetails(fBag);
            // Fixed height ?
//          if (details.height) $box.css('height', details.height).addClass(BI.Filter.LAYOUT.BOX + '-fixed-height'); // TODO: pas encore upgradé...
            // Alias the filter instance ID
            var instanceId = fBag.instance('ID');
            // Get the filter's event type
            var process = this._getDisplayTypeProcess(details['_DisplayType'], 'event', instanceId);
            // Handle the change event
            var timeout;
            $input.on(process, function (event) {
                // Prevent multiple fire events
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(function () {

                    // Synchronize filters in a group
                    // ------------------------------
                    // We assumes that the filters in a group:
                    //  - have initially the same default selection (that's why we only cares about the change event)
                    //  - have NO master/slave dependencies between them
                    //  - have NO master filter at all
                    //  - But, they can have slaves filters... don't be so sad! :-)
                    //
                    // Notice: If you need a filter in group to be deferred, you have to set all of them deferred.

                    // Retrieve filters in a group, that belong to dashboards that has not yet been rendered
                    var filterGroup = this.getFiltersInstanceGroup(instanceId, false);
                    if (filterGroup) {
                        var sourceSelection = this.getFilterSelection(instanceId);
                        for (var i = 0; i < filterGroup.length; i++) {
                            if (filterGroup[i] in this.triggerSelection) continue;
                            // When available, the filter will be rendered with the expected values
                            Filter.updateSnapshot(filterGroup[i], sourceSelection.Value);
                        }
                    }

                    // Apply the filter selection to all filters in a group, that are already been rendered
                    var groupStack = this.filtersGroups; // Get stack
                    if (!groupStack && filterGroup) {
                        groupStack = filterGroup;
                        var sourceSelection = this.getFilterSelection(instanceId);
                        for (var i = 0; i < groupStack.length; i++) {
                            if (!(groupStack[i] in this.triggerSelection)) continue;
                            this.triggerSelection[groupStack[i]](sourceSelection.Value, 'Value');
                            this.setter('filtersGroups', groupStack); // Set stack (if at least one filter triggered)
                        }
                    } else if (groupStack) {
                        // Prevent circular filters reference...
                        for (var allNull = true, i = 0; i < groupStack.length; i++) {
                            if (!(groupStack[i] in this.triggerSelection)) continue;
                            if (groupStack[i] == instanceId) {
                                groupStack[i] = null; // Remove from stack
                            } else if (null != groupStack[i]) {
                                allNull = false; // Still not empty !
                            }
                        }
                        if (allNull) this.setter('filtersGroups', undefined); // Empty the stack (all done :-)
                    }
                    // end of filters group synchronization

                    // Handle the "change" event for dependencies !
                    this.displayFilters(instanceId, "change").queue(function () {
                        // If the filter modified by user action is deferred then do NOT fire pending filters,
                        // even if one or more of its dependencies is NOT deferred...
                        // In others words, only if the filter modified by user action is NOT deferred then fire pending filters.
                        if (!this.getFilterInstance(instanceId).ISDEFERRED) this.firePendingFilters();
                    });

                }.bind(this), 0);
            }.bind(this));

            // Make possible to easily change the filter selection
            this.triggerSelection[instanceId] = function (selection, selectionType) {
                var success;
                if (undefined === selection) {
                    success = this._initFilterSelectedValues($input, fBag, true); // re-init the filter with its default values
                } else {
                    selectionType = ('Caption' == selectionType) ? 'Caption' : 'Value'; // default type: Value
                    success = this.setFilterSelection($input, fBag, selectionType, selection, 'trigger');
                }
                if (success) $input.trigger('change');
                return success;
            }.bind(this);

            if (this.options.debug) this._debugFilter(fBag);
        },

        _buildFilter: function ($box, fBag, data) {
            var scopeAddon = { label: undefined, input: undefined },
                translation = this.factory.export('Translation', ['translate', 'replaceText']);
            // Define label
            var label = '<div class="' + Filter.LAYOUT.LABEL + '">' + translation.replaceText(
                fBag.instance('CAPTION_OVERRIDE') || fBag.definition('CAPTION')
            ) + '</div>';
            // Retrieve jQuery $label and $input
            var $label, $input;
            if (data && !data.length) {
                // No data (no element Filter.LAYOUT.INPUT)
                $label = jQuery(label).appendTo($box);
                $input = jQuery('<div><div class="' + Filter.LAYOUT.INPUT + '-empty">' +
                    translation.translate('_BI_NO_DATA') + '</div></div>').appendTo($box);
            } else {
                // Filters details
                var details = Filter._instanceBagDetails(fBag);
                // Get the "build" method
                var process = this._getDisplayTypeProcess(details['_DisplayType'], 'build', fBag.instance('ID'));
                if (!process) return scopeAddon; // Return empty scopeAddon :(
                // Translate the data "CAPTION" (only on demand)
                if (data && details['translateCaption']) {
                    var replaceText = this.factory.export('Translation', 'replaceText');
                    // WARNING: in this case, the Analysis that depends on this filter should only use the "VALUE" which is not translation-dependant.
                    data.forEach(function (item) { if (item.CAPTION) item.CAPTION = replaceText(item.CAPTION); });
                }
                // Process build
                process($box, details, data, label);
                // Retrieve label (optional) and input (required)
                $label = $box.find('.' + Filter.LAYOUT.LABEL);
                $input = $box.find('.' + Filter.LAYOUT.INPUT);
                // Check that the build is correct (the input is available)
                if (!$input.size()) tool.console.error(
                    'Bi.Core.Filter._buildFilter: The filter instance\'s build is invalid, ' +
                    'because it\'s missing the CSS class "' + Filter.LAYOUT.INPUT + '" ' +
                    '(filter instance id=' + fBag.instance('ID') + ').'
                );
            }
            scopeAddon.label = $label.addClass('bi-form-group-title')[0];
            scopeAddon.input = $input.addClass('bi-form-group-content')[0];
            return scopeAddon;
        },

        _initFilterSelectedValues: function ($input, fBag, bypassPreviousSelection) {
            var instanceId = fBag.instance('ID');

            // Init from Previous selection
            var previousValue = !bypassPreviousSelection ? Filter.getSnapshot(instanceId) : undefined;
            if (previousValue && this.setFilterSelection($input, fBag, 'Value', previousValue, 'previous')) return 'previous';

            // Init from Default values
            var defaultValues = [],
                selectionType = fBag.definition('DEFVALTYPE');
            // ...from query
            var defValTypeQuery = Filter.isDefaultValueTypeQuery(selectionType),
                defValResult = fBag.data('DEFVAL_RESULT');
            if (defValTypeQuery && defValResult) {
                for (var i = 0; i < defValResult.length; i++) defaultValues.push(defValResult[i][defValTypeQuery.toUpperCase()]);
                selectionType = defValTypeQuery; // 'QueryCaption' and 'QueryValue' becomes 'Caption' and 'Value'
            }
            // ...from list
            var defValTypeList = Filter.isDefaultValueTypeList(selectionType),
                defValList = fBag.definition('DEFVAL');
            if (defValTypeList && defValList) {
                defaultValues = tool.string.split(defValList, ';');
                selectionType = defValTypeList; // 'ListCaption' and 'ListValue' becomes 'Caption' and 'Value'
            }
            if (this.setFilterSelection($input, fBag, selectionType, defaultValues, 'defaultValues')) return 'default';
        },

        _getDisplayTypeProcess: function (displayType, method, filterInstanceId) {
            var process = 'process' + this.options.processSuffix;
            if (
                process in Filter &&
                displayType in Filter[process] &&
                method in Filter[process][displayType]
            ) {
                return Filter[process][displayType][method];
            }
            tool.console.error(
                'Bi.Core.Filter._getDisplayTypeProcess:' +
                ' Unable to process the filter instance id=' + filterInstanceId +
                ' because the method "' + ['Bi.Core.Filter', process, displayType, method].join('.') + '" is missing.'
            );
        }

    });

    Filter.extendStatic({
        
        // Get a plain object with most revelant details of a filter instance bag (including DISPLAYTYPE details)
        // For example, it's used in the filter's process method (Build, Set and Get) to hide the instance bag complexity
        _instanceBagDetails: function (fBag) {
            var details = {};

            details['_Type'] = fBag.definition('TYPE');
            details['_InstanceId'] = fBag.instance('ID');

            tool.extend(details, Filter._displayTypeDetails(fBag.instance('DISPLAYTYPE')));

            return details;
        },

        // Convert the string DISPLAYTYPE (of the filter instance) into an object
        //
        // Giving the string: "ButtonGroup; mode=radio; orientation=horizontal;"
        // Will returns the object: { _DisplayType: "ButtonGroup", mode: "radio", orientation: "horizontal" }
        //
        // Note that the first part is simply the process name "ButtonGroup" (and NOT "_DisplayType=ButtonGroup")
        //
        _displayTypeDetails: function (displayType) {
            var details = {};
            displayType = tool.string.split(displayType, ';');

            // Retrieve the process method (first info)
            details['_DisplayType'] = displayType.shift();

            displayType.forEach(function (item) {
                item = tool.string.split(item, '=');

                var key = item[0];
                if ('_DisplayType' == key) return; // Forbidden key (use first info)

                // Try to convert the val into a number...
                var val = item[1], num = tool.string.toNumber(val);
                details[key] = isNaN(num) ? val : num;
            });
            return details;
        }

    });

    Filter.extendStatic({

        isDefaultValueTypeQuery: function (defValType) {
            if ('QueryCaption' == defValType) return 'Caption';
            if ('QueryValue' == defValType) return 'Value';
            return false;
        },

        isDefaultValueTypeList: function (defValType) {
            if ('ListCaption' == defValType) return 'Caption';
            if ('ListValue' == defValType) return 'Value';
            return false;
        }

    });

    Filter.extendProto({

        setFilterSelection: function ($input, fBag, selectionType, selection, category) {
            if (!$input.size()) return true; // No data !!
            if (tool.array.exists(selectionType, ['Caption', 'Value']) && !selection.length) return true; // No selection !!
            var details = Filter._instanceBagDetails(fBag),
                process = this._getDisplayTypeProcess(details['_DisplayType'], 'set', fBag.instance('ID'));
            // The process method must return true when the selection is successfully set
            if (process) return process($input, details, selectionType, selection);
        },

        getFilterSelection: function (filterId) {
            var replaceText = this.factory.export('Translation', 'replaceText');

            var filterInstance = this.getFilterInstance(filterId);
            if (!filterInstance) {
                tool.console.error('Bi.Core.Filter.getFilterSelection: filterId=' + filterId + ' does not exists.');
                return;
            }
            var scope = filterInstance.scope;
            if (!scope) return; // This cas is possible if the user reloads a page that contains a filters propagation

            var $input = jQuery(scope.wrapper).find('.' + Filter.LAYOUT.INPUT);
            if (!$input.size()) return Filter.getEmptySelection(true); // No data !!

            var fBag = this._getFilterInstanceBag(filterId),
                details = Filter._instanceBagDetails(fBag),
                process = this._getDisplayTypeProcess(details['_DisplayType'], 'get', fBag.instance('ID'));
            if (process) {
                var selection = process($input, details);
                if (tool.is.object(selection) && tool.is.array(selection.Value) && tool.is.array(selection.Caption)) {
                    selection['Label'] = replaceText(
                        fBag.instance('CAPTION_OVERRIDE') || fBag.definition('CAPTION') // Add the filter label
                    );
                    return selection; // The selection should be like: { Value: [], Caption: [], Label: "" }
                } else {
                    tool.console.error(
                        'Bi.Core.Filter.getFilterSelection: ' +
                        '\nThe function Bi.Core.Filter.' + process + ' returns an invalid structure: ', selection,
                        '\nWhile the expected return\'s structure is: ', Filter.getEmptySelection()
                    );
                }
            }
        },

        getAllFiltersSelection: function (part) {
            var selection = {}
            this.getFiltersInstanceIdWrapped().forEach(function (filterId) {
                selection[filterId] = this.getFilterSelection(filterId);
            }.bind(this));

            // Format the return
            if (tool.array.exists(part, ['Value', 'Caption'])) {
                for (var filterId in selection) selection[filterId] = selection[filterId][part];
            }
            return selection;
        },

        // Insert filters selection (caption or value) in any text on the fly
        // Example: "The filter instance id = 25 has a value = {FID:25:Value} and a caption = {FID:25:Caption}"
        replaceText: function (text, sep) {
            sep = sep || ', ';
            return text.replace(/{FID:([0-9]+):(Caption|Value)}/g, function (match, fid, type) {
                var selection = this.getFilterSelection(fid); // fid = filterInstanceId
                if (selection) {
                    var data = selection[type];
                    return tool.is.array(data) ? data.join(sep) : data;
                }
                return match; // Return unreplaced text
            }.bind(this));
        }

    });

    Filter.extendProto({

        // Snapshots works only with the filters values (not the captions)
        takeSnapshot: function () {
            var selection = this.getAllFiltersSelection('Value');
            // Important: Filter that have noData should be removed from the snapshot.
            // Otherwise, we will unfortunately skip they default selection when data become available!
            // (Finally, replace empty-array by undefined)
            for (var filterId in selection) if (selection[filterId].noData) selection[filterId] = undefined;
            // Merge snapshot with current filters selection
            tool.storage.session('biCoreFilter.snapshot', tool.extend(Filter.getSnapshot() || {}, selection));
        }

    });

    Filter.extendStatic({

        getSnapshot: function (filterId) {
            var snapshot = tool.storage.session('biCoreFilter.snapshot');
            if (filterId) return snapshot ? snapshot[filterId] : undefined;
            return snapshot;
        },

        updateSnapshot: function (/* 2 signatures available */) {
            var snapshot = tool.storage.session('biCoreFilter.snapshot') || {};
            switch (arguments.length) {
                case 1:
                    // arguments[0]=map { filterId: selectionValue, ... }
                    tool.extend(snapshot, arguments[0] || {});
                    break;
                case 2:
                    // arguments[0]=filterId (number) and arguments[1]=selectionValue (array);
                    snapshot[arguments[0]] = arguments[1] || [];
                    break;
            }
            tool.storage.session('biCoreFilter.snapshot', snapshot);
        },

        removeSnapshot: function () {
            tool.storage.session('biCoreFilter.snapshot', null);
        }

    });

    Filter.extendProto({

        // Check for filters propagation on the following events :
        //  - Bi.Core.Dashboard.EVENT.READY
        //      In this case, call this method before calling .displayDashboardFilters
        //  - Bi.Core.Dashboard.EVENT.VIEW
        //      In this case, this method is calling .displayFilters with all current dashboard's filters
        checkFiltersPropagation: function (selection) {
            var propagation = Filter.validateSelection(selection) || Filter.bookmarkUrl2Selection();
            if (!propagation) return this;

            // Retrieve all current dashboard's filters (for Bi.Core.Dashboard.EVENT.READY, still no filter available)
            var filters = this.filtersPerDashboard[this.factory.export('Dashboard', 'current').dashboardId];
            if (filters) filters.forEach(function (filterId) {
                // Filter that don't have an expected propagation value MUST be reverted to its default value
                if (!propagation[filterId]) propagation[filterId] = undefined;
            }.bind(this));

            // Update the filters snapshot
            Filter.updateSnapshot(propagation);

            // for Bi.Core.Dashboard.EVENT.VIEW, rebuild all filters
            if (filters) {
                // The second time, we are able to verify that propagated filters are available in the current dashboard
                for (var filterId in propagation) if (!tool.array.exists(parseInt(filterId, 10), filters)) tool.console.warn(
                    'Bi.Core.Filter.checkFiltersPropagation:',
                    "\nAvailable dashboard's filterId = " +
                        filters.join(', ') + '.',
                    '\nUnexpected propagated filterId = ' + filterId +
                        ' with values = "' + propagation[filterId].join('", "') + '".'
                );
                // Let's go !
                this.displayFilters(filters, "rebuild");
            }
            return this;
        }

    });

    Filter.extendStatic({

        // The parameter selection can be an object or a string
        validateSelection: function (selection) {
            if (tool.is.string(selection)) try {
                selection = JSON.parse(selection);
            } catch (e) {
                tool.console.error('Bi.Core.Filter.validateSelection: ', selection, e.name, e.message);
                selection = undefined;
            }
            if (selection) try { // Validate selection
                var tmp = selection, selection = {};
                if (!tool.is.object(tmp)) throw new Error('Bi.Core.Filter.validateSelection: Object not found.');
                for (var filterId in tmp) {
                    if (!tool.is.array(tmp[filterId])) throw new Error('Bi.Core.Filter.validateSelection: filterId values should be an Array.');
                    for (var values = [], i = 0; i < tmp[filterId].length; i++) values.push(tmp[filterId][i].toString());
                    selection[filterId.toString()] = values;
                }
            } catch (e) {
                tool.console.error('Bi.Core.Filter.validateSelection: ', selection, e.name, e.message);
                selection = undefined;
            }
            return selection || false;
        },

        bookmarkUrl2Selection: function (url) {
            return Filter.validateSelection(tool.url.parse(url).hashQueries[Filter.HASH]);
        }

    });

    Filter.extendProto({

        // This function allows to propagate the filters values from the current dashboard to another
        // The url hash should contains a parameter "PropagateFilters" with the following pattern:
        //
        // PropagateFilters=
        //      target1 § source1   // target and source are separated by the character §
        //      ¤                   // pairs (target and source) are separated by the character ¤
        //      target2 § source2
        //
        // The target refers to a filterId instance in the Dashboard of destination.
        // If the source is wrapped into [[[ ]]], then it contains the single expected value to apply to the filter in the Dashboard of destination (actually does not handle filter with multiple selection).
        // Otherwise it should be a simple number and refers to a parameterId.
        // In that case, the filterId instance which handles this parameterId (in the current outputId instance) needs to be searched and its values will be propagated to the Dashboard of destination.
        //
        handleFiltersPropagation: function (url, outputInstanceId) {
            var getParameters = this.factory.has('Analysis') ? this.factory.export('Analysis', 'getParametersLayoutPerOutput') : undefined,
                filters = {},
                parse = tool.url.parse(url),
                propagate = parse.hashQueries["PropagateFilters"];
            if (propagate && getParameters) {
                delete parse.hashQueries["PropagateFilters"];
                var snapshot = Filter.getSnapshot();
                propagate = tool.string.split(propagate, '¤');
                for (var i = 0; i < propagate.length; i++) {
                    var param = tool.string.split(propagate[i], '§'),
                        target = param[0], // The target refers to a filterId instance in the destination page
                        source = param[1];
                    if (source.match(/^\[\[\[/) && source.match(/\]\]\]$/)) {
                        // source represents a filter instance value. Just put it into an array (multiple selection not supported)
                        source = [source.substr(3, source.length - 6) + ''];
                    } else {
                        // source refers to a parameterId. So we need to find which filter instance handles this parameter
                        var parameterId = source;
                        // Find for this output which filter handles this parameter
                        var paramLayout = getParameters(outputInstanceId, parameterId);
                        if (!paramLayout.length) continue;
                        // This paramLayout should be an array with a single item that refers to the filterId instance we are looking for !
                        source = paramLayout[0].FILTERID; // source represents now a filterId instance
                        if (!snapshot[source]) continue;
                        // Get the filter instance value from the snapshot
                        source = snapshot[source];
                    }
                    filters[target] = source;
                }
            }
            if (!jQuery.isEmptyObject(filters)) parse.hashQueries["Filters"] = JSON.stringify(filters);
            return tool.url.stringify(parse);
        }

    });

    Filter.extendProto({

        bookmarkForm: function () {
            var bookmarkRestApi = tool.url.ROOT + this.options.bookmarkRestApi;

            var filter = this,
                dashboard = this.factory.export('Dashboard', ['scope', 'current', 'getDashboard']),
                translation = this.factory.export('Translation', ['translate', 'replaceText']);

            var dashboardId = dashboard.current.dashboardId,
                dashboardTitle = translation.replaceText(dashboard.getDashboard(dashboardId).TITLE);

            var message = {};
            ['TITLE', 'NEW_NAME_MISSING', 'NEW_FILTERS_MISSING', 'ERROR', 'NO_FILTER'].forEach(function (key) {
                message[key] = translation.translate('_BI_FILTER_BOOKMARK_' + key);
            });

            // Retrieve revelant filters of the current dashboard
            var filtersId = (function () {
                var _exclude = [];
                return filter.filtersPerDashboard[dashboardId].filter(function (filterId) {
                    // Exclude duplicate filters in a group
                    if (!!~_exclude.indexOf(filterId)) return false;
                    (filter.getFiltersInstanceGroup(filterId, false) || []).forEach(function (id) {
                        !!~_exclude.indexOf(id) || _exclude.push(id);
                    });
                    // Exclude hidden filters
                    return !filter._getFilterInstanceBag(filterId).userData.isReallyHidden;
                });
            })();

            // Display the bookmark UI in a modal
            var $modal = jQuery('<div>').biModal({
                close: true,
                title: '<i class="fa fa-bookmark"></i> ' + message.TITLE + ' [' + dashboardTitle + ']'
            });

            // No filter available in this dashboard (exit the function)
            if (!filtersId.length) {
                return $modal.biModal('content', message.NO_FILTER).insertAfter(dashboard.scope.wrapper);
            }

            // Add bookmark in the list of available bookmarks
            var get$action = function (title, callback) {
                return jQuery('<a href="#"></a>').html(title).click(function (e) {
                    e.preventDefault();
                    callback.call(this, e);
                });
            },
            addBookmark2List = function (bookmark) {
                var $wrap = jQuery('<div>'),
                $apply = get$action(bookmark.BookmarkName, function () {
                    filter.checkFiltersPropagation(bookmark.BookmarkSelection);
                    $modal.biModal('cancel'); // Close modal
                }),
                $delete = get$action('<i class="fa fa-trash"></i>', function () {
                    jQuery.ajax({
                        url: bookmarkRestApi + '/' + bookmark.BookmarkId,
                        method: 'DELETE',
                        success: function () {
                            $wrap.trigger('biCoreFilter.bookmarkAction', 'delete').remove();

                        }
                    });
                }).addClass('bi-filter-bookmark-icon');

                return $wrap.append($apply).append($delete);
            };
            
            // Take a snapshot of the current filters selection
            var snapshot = [];
            filtersId.forEach(function (filterId) {
                snapshot.push(tool.extend({
                    Id: filterId, Checked: true
                }, filter.getFilterSelection(filterId)));
            });
            var getSelection = function () {
                var selection = {};
                snapshot.forEach(function (item) {
                    if (item.Checked) selection[item.Id] = item.Value;
                });
                for (var p in selection) return selection; // Return selection unless it is an empty object
            },
            createBookmark = function (name, selection) {
                return {
                    BookmarkId: null,
                    BookmarkDashboardId: dashboardId,
                    BookmarkName: name,
                    BookmarkSelection: JSON.stringify(selection)
                };
            };

            var errorMsg = function (node, content) {
                jQuery(node).append('<div class="bi-filter-bookmark-msg"><i class="fa fa-warning"></i> ' + content + '</div>');
            };

            // Manage the form to add a new bookmark
            var manageForm = function (scope) {
                // Insert a checkbox for each dashboard filter
                snapshot.forEach(function (item) {
                    var attr = { value: item.Id, type: 'checkbox' };
                    if (item.Checked) attr.checked = 'checked';

                    var $input = jQuery(tool.html.tag('input', attr, null)).click(function () {
                        item.Checked = $input.prop('checked'); // Bind view-model
                    }),
                    $label = jQuery('<label>').text(item.Label).addClass('bi-form-nested-inverted').prepend($input);

                    jQuery(scope.formItems).append($label).append('<br />');
                });
                // Handle submit button
                jQuery(scope.formSubmit).click(function () {
                    var name = jQuery(scope.formTitle).val().replace(/<|>/g, ''),
                        selection = getSelection();
                    if (!name) {
                        errorMsg(scope.formMsg, message.NEW_NAME_MISSING);
                    } else if (!selection) {
                        errorMsg(scope.formMsg, message.NEW_FILTERS_MISSING);
                    } else {
                        var newBookmark = createBookmark(name, selection);
                        jQuery.ajax({
                            url: bookmarkRestApi,
                            method: 'PUT',
                            data: newBookmark,
                            success: function (bookmarkId) {
                                newBookmark.BookmarkId = bookmarkId;
                                jQuery(scope.formTitle).val('');
                                jQuery(scope.listItems).append(addBookmark2List(newBookmark))
                                    .trigger('biCoreFilter.bookmarkAction', 'put');
                            },
                            error: function () {
                                errorMsg(scope.formMsg, message.ERROR);
                            }
                        });
                    }
                });
                // Remove message
                jQuery(scope.form).change(function () { jQuery(scope.formMsg).html(''); });
            };

            // Manage the list of available bookmarks
            var manageList = function (scope) {
                jQuery.ajax({
                    url: bookmarkRestApi + '/' + dashboardId,
                    method: 'GET',
                    success: function (bookmarks) {
                        bookmarks.forEach(function (bookmark) {
                            jQuery(scope.listItems).append(addBookmark2List(bookmark));
                        });
                        jQuery(scope.listItems).trigger('biCoreFilter.bookmarkAction', 'get');
                    },
                    error: function () {
                        errorMsg(scope.listItems, message.ERROR);
                    }
                });
            };

            // Display the bookmark interface in a modal
            this.factory.get('Template').process('tmpl/filter-bookmark-form').then(function (tmpl) {

                tmpl.$html.on('biCoreFilter.bookmarkAction', function (e, action) {
                    // Display 'no data' when the list of saved bookmarks is empty...
                    var count = jQuery(tmpl.scope.listItems).children().size();
                    if (1 === count && 'delete' === action) count = 0; // The last item is about to be removed...
                    jQuery(tmpl.scope.listNoItems).css('display', count ? 'none' : 'block');
                });

                manageForm(tmpl.scope);
                manageList(tmpl.scope);

                $modal.biModal('content', tmpl.$html).insertAfter(dashboard.scope.wrapper);
            });            
        }
    
    });

})(this, this.jQuery, this.Bi = this.Bi || {});
