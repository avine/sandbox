
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Analysis = Core.module('Analysis');

    Analysis.extendStatic({

        OPTIONS: {
            zoomTarget: 'body',
            debug: false
        },

        EVENT: {
            DISPLAY: 'biCoreAnalysis.display', // one analysis displayed
            READY: 'biCoreAnalysis.ready', // all expected analysis displayed
            ZOOM: 'biCoreAnalysis.zoom'
        },

        LAYOUT: {
            OUTPUT: 'bi-analysis-output',
            SELECTOR: 'bi-analysis-selector',
            ZOOM: 'bi-analysis-zoom',
            FORMATTING: 'bi-analysis-formatting'
        }

    });

    Analysis.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Analysis.OPTIONS, options || {});
            this.lastAnalysisFn = {};
            this.pendingRefreshOutputId = {};
        },

        initRepository: function (result) {
            this.dbAnalysis = {
                infos: database.format.toJson(result[0]),
                dataset: database.format.toJson(result[1]),
                query: database.format.toJson(result[2]),
                link: database.format.toJson(result[3])
            };
            this.dbOutput = {
                definition: database.format.toJson(result[4]),
                attribute: database.format.toJson(result[5]),
                instance: database.format.toJson(result[6]),
                attributeInstance: database.format.toJson(result[7])
            };
            this.dbParameter = {
                parameter: database.format.toJson(result[8]),
                linkQuery: database.format.toJson(result[9]),
                linkLayout: database.format.toJson(result[10])
            };
        }

    });

    Analysis.extendProto({

        getAnalysisInfos: function (analysisId) {
            if (!analysisId) return this.dbAnalysis.infos;
            return this.dbAnalysis.infos.filter(function (row) {
                return analysisId == row.ID;
            })[0];
        },

        getAnalysisDataset: function (analysisId) {
            return database.format.jsonToMap(
                this.dbAnalysis.dataset.filter(function (row) {
                    return analysisId == row.ANALYSISID;
                }), 'ID');
        },

        getDatasetQueries: function (datasetId) {
            return database.format.jsonToMap(
                this.dbAnalysis.query.filter(function (row) {
                    return !datasetId || datasetId == row.DATASETID;
                }), 'ID');
        },

        getDatasetLinks: function (datasetId) {
            return this.dbAnalysis.link.filter(function (row) {
                return !datasetId || datasetId == row.DATASETID;
            });
        }

    });

    Analysis.extendProto({

        getOutputDefinition: function (outputId) {
            if (!outputId) return database.format.jsonToMap(this.dbOutput.definition, 'ID');
            return this.dbOutput.definition.filter(function (row) {
                return outputId == row.ID;
            })[0];
        },

        getOutputAttributes: function (outputId) {
            return database.format.jsonToMap(
                this.dbOutput.attribute.filter(function (row) {
                    return !outputId || outputId == row.OUTPUTID;
                }), outputId ? 'NAME' : 'ID');
        },

        getOutputInstance: function (otptInstId) {
            if (!otptInstId) return database.format.jsonToMap(this.dbOutput.instance, 'ID');
            return this.dbOutput.instance.filter(function (row) {
                return otptInstId == row.ID;
            })[0];
        },

        getOutputInstanceFromDashboard: function (containerId) {
            return this.dbOutput.instance.filter(function (row) {
                return containerId == row.CONTAINERID;
            })[0];
        },

        getOutputAttributesInstance: function (otptInstId, outputId) {
            return database.format.jsonToMap(
                this.dbOutput.attributeInstance.filter(function (row) {
                    return (otptInstId == row.OUTPUTINSTANCEID) && (!outputId || outputId == row.OUTPUTID);
                }), outputId ? 'NAME' : 'ID');
        }

    });

    Analysis.extendProto({

        getParametersInfos: function (analysisId) {
            return database.format.jsonToMap(
                this.dbParameter.parameter.filter(function (row) {
                    return !analysisId || analysisId == row.ANALYSISID;
                }), 'ID');
        },

        getParameterQuery: function (queryId) {
            return database.format.jsonToMap(
                this.dbParameter.linkQuery.filter(function (row) {
                    return queryId == row.QUERYID;
                }), 'ID');
        },

        // outputId is required. parameterId is optional.
        getParametersLayoutPerOutput: function (outputId, parameterId) {
            return this.dbParameter.linkLayout.filter(function (row) {
                return (outputId == row.OUTPUTID) && (undefined === parameterId || parameterId == row.PARAMETERID);
            });
        },

        // filterId is required. parameterId is optional.
        getParametersLayoutPerFilter: function (filterId, parameterId) {
            return this.dbParameter.linkLayout.filter(function (row) {
                return (filterId == row.FILTERID) && (undefined === parameterId || parameterId == row.PARAMETERID);
            });
        }

    });

    Analysis.extendProto({

        // parametersValues = { parameterId1: value1, parameterId2: value2, ... }
        //
        // For debugging: If parametersValues is setted to the boolean true
        // then all parameters are replaced by the column BiRepo_LinkQueryParameter.SuffixExample
        getQueries: function (analysisId, parametersValues) {
            if (!this.getAnalysisInfos(analysisId)) return [];
            var queries = [], dataSet = this.getAnalysisDataset(analysisId);
            for (var datasetId in dataSet) {
                var result = this.getQuery(datasetId, parametersValues);
                // The method Core.Db.multiReadsArray needs the .query and .dbName properties to execute queries
                result.query = this.factory.export('Context', 'replaceAll')(result.queryBasic); // Replace variables and apply security
                result.dbName = dataSet[datasetId].DBNAME;
                // Add dataset infos
                result.dataset = dataSet[datasetId];

                queries.push(result);
            }
            return queries;
        },

        getQuery: function (datasetId, parametersValues) {
            this._currentQuery = { // Set temporary property
                queries: this.getDatasetQueries(datasetId),
                links: this.getDatasetLinks(datasetId),
                parametersValues: parametersValues || {},
                debug: []
            };
            var result = { queryBasic: this.query(), queryParts: this._currentQuery.debug };
            delete this._currentQuery; // Delete temporary property
            return result;
        },

        query: function () {
            if (!this._currentQuery.links.length) {
                for (var queryId in this._currentQuery.queries) {
                    return this._query(queryId); // If there's no links, then there's only one query
                }
            }
            var query = [], _this = this;
            jQuery.each(this._currentQuery.links, function (i, lnk) {
                var link = _this._link(lnk.ID);
                if (!query.length) query.push('SELECT * FROM', link.lQuery);
                query.push(link.type, link.rQuery, link.join);
            });
            return query.join('\n');
        },

        _link: function (linkId) {
            var link = this._currentQuery.links.filter(function (row) {
                return linkId == row.ID;
            })[0];
            return {
                lQuery: '( ' + this._query(link.LEFTQUERYID) + ' ) AS Query' + link.LEFTQUERYID,
                rQuery: '( ' + this._query(link.RIGHTQUERYID) + ' ) AS Query' + link.RIGHTQUERYID,
                type: link.ISOUTER ? 'LEFT OUTER JOIN' : 'INNER JOIN',
                join: link.JOINCLAUSE
            };
        },

        _query: function (queryId) {
            var query = this._currentQuery.queries[queryId].QUERY,
                parameters = this.getParameterQuery(queryId),
                paramExample = {}, useExample = (true === this._currentQuery.parametersValues);

            var debug = { query: query, params: [] };
            this._currentQuery.debug.push(debug);

            for (var search in parameters) {
                var param = parameters[search], value;
                if (useExample) {
                    // For debugging: replace all parameters by the SuffixExample
                    paramExample[param.PARAMETERID] = value = param.SUFFIXEXAMPLE;
                } else {
                    // For production: use the given parameter value
                    value = this._currentQuery.parametersValues[param.PARAMETERID];
                }
                // Note: space between "param.SYNTAX" and "value" should be added to the syntax when necessary
                var replace = value ? (param.SYNTAX + value) : '';
                query = query.replace(new RegExp('#' + search + '#', "g"), replace);

                debug.params.push({ PARAMETERID: param.PARAMETERID, search: '#' + search + '#', replace: replace });
            }
            if (useExample) this._currentQuery.parametersValues = paramExample;
            // Check that there are no more parameter to replace in the query
            var queryParameters = query.match(/#[0-9]+#/g) || [];
            if (queryParameters.length) {
                tool.console.error('Bi.Core.Analysis._query: not all parameters have been replaced in the queryId=',
                    queryId, '\nUnreplaced parameters=', queryParameters);
                for (var i = 0; i < queryParameters.length; i++) {
                    query = query.replace(new RegExp(queryParameters[i], "g"), ''); // Clean the query
                }
            }
            return query;
        }

    });

    Analysis.extendAsync({

        displayDashboardOutputs: function () {
            // Store output template once
            if (!this.outputTmpl) this.then(function () {
                // The template's scope contains .title and .content
                // The scope.content must be an empty tag because we are using
                // isRefresh = !!scope.content.innerHTML
                // to determine if the output has been already displayed once or not
                this.factory.get('Template').load('tmpl/output').queue(function (tmpl) {
                    this.setter('outputTmpl', tmpl);
                }.bind(this)).thenDone(this);
            });
            // Retrieve list of new output instance ID
            var newId = [],
                currentDashboardId = this.factory.export('Dashboard', 'current').dashboardId;

            this.factory.export('Dashboard', 'getOutputContainers')().forEach(function (container) {
                var otptInst = this.getOutputInstanceFromDashboard(container.ID);
                if (!otptInst || otptInst.scope) return;
                // Start the output scope from the dashboard container
                // Warning: For interactions with filters (for example), do not refer to this container.
                // Why ? Because the output can be in zoom mode and in this case it is temporarily out of this DOM container.
                otptInst.scope = { container: container.scope.wrapper };
                // Store the dashboardId of the new scoped container
                otptInst.dashboardId = currentDashboardId;
                newId.push(otptInst.ID);
            }.bind(this));
            // Let's go !
            if (newId.length) this.displayOutputs(newId, true);
            this.done();
        }

    });

    Analysis.extendProto({

        updateOutputsOnFiltersChange: function (filtersIdList) {
            if (!filtersIdList || !filtersIdList.length) return;
            var otptInstIdList = [], debugFilterId = {};
            for (var i = 0; i < filtersIdList.length; i++) {
                var filterId = filtersIdList[i],
                    paramLayout = this.getParametersLayoutPerFilter(filterId);
                for (var j = 0; j < paramLayout.length; j++) {
                    var otptInstId = paramLayout[j].OUTPUTID;
                    if (!tool.array.exists(otptInstId, otptInstIdList)) {
                        otptInstIdList.push(otptInstId);
                    }
                    (debugFilterId[filterId] = debugFilterId[filterId] || []).push(otptInstId);
                }
            }
            if (this.options.debug) {
                tool.console.log('\n-----------------------\n>>> Filters update <<<<');
                for (var filterId in debugFilterId) tool.console.log(
                    'filterInstanceId:' + filterId, '/  Affects outputInstanceId:', debugFilterId[filterId]
                );
                tool.console.log('Total affected outputInstanceId: ', otptInstIdList);
            }
            if (otptInstIdList.length) this.displayOutputs(otptInstIdList); // Update only the outputs which are outdated
        }

    });

    Analysis.extendAsync({

        // Just for infos, the list of attributes in this script is:
        // Refresh, Dataset, DatasetSort, DatasetJoin, GroupRender, Title, Zoom, DatasetFormat, 
        // ColumnExpressionBeforeRowSplitter, RowSplitter, RowSplitterLimit, ColumnExpression, RemoveEmptyRows,
        // PivotGraphsColorsFromDataSource, 
        // AxisX, AxisY, AxisXTitle, AxisYTitle, PivotY, PivotIndicators

        displayOutputs: function (otptInstIdList, isNewIdList) {

            var log = this.options.debug ? function () { tool.console.log.apply(window, arguments); } : function () {};

            // Get filters selection when available
            var filtersSelection = this.factory.has('Filter') ? this.factory.export('Filter', 'getAllFiltersSelection')() : undefined;

            // Prepare queries
            var datasetsQueries = [], otptInstDetails = {};
            for (var i = 0; i < otptInstIdList.length; i++) {
                // Get output instance
                var otptInstId = otptInstIdList[i],
                    otptInst = this.getOutputInstance(otptInstId);
                // Check that its scope is available
                if (!otptInst.scope) {
                    tool.console.error('Bi.Core.Analysis.displayOutputs: ' +
                        'unable to display the requested output because its scope is missing', otptInst);
                    otptInstIdList.splice(i--, 1); // Warning: the given parameter is overwritten !
                    continue;
                }
                // Get behaviours
                var behaviours = this.getOutputBehaviours(otptInst.OUTPUTID, otptInst.ID);
                // List of usefull Datasets
                for (var datasetNames = [], j = 0; j < behaviours.length; j++) {
                    var datasetArr = behaviours[j].attributes.arr('Dataset');
                    if (datasetArr.length) {
                        datasetNames = tool.array.unique(datasetNames.concat(datasetArr));
                    } else {
                        tool.console.error('Bi.Core.Analysis.displayOutputs: ' +
                            'the required attribute "Dataset" is missing !', behaviours[j]);
                    }
                }
                // In case this is a MultipleOutput controlled by a CatchFilter attribute, we must check if it's Deferred
                // It means that only the expected behaviour should be rendered
                if (behaviours.multipleOutput) {
                    var masterAttr = behaviours.multipleOutput.attributes;
                    if (masterAttr.get('CatchFilter')/* && masterAttr.bool('Deferred')*/) { // 'Deferred' has been deprecated
                        var catchedOtptInstId = this.catchFilter2SelectedOutputInstanceId(masterAttr.get('CatchFilter'));
                        if (catchedOtptInstId) for (var j = 0; j < behaviours.length; j++) {
                            if (catchedOtptInstId == behaviours[j].output.ID) {
                                // Overwrite datasetNames and behaviours !
                                // From now, this MultipleOutput has been replaced by a simple output.
                                datasetNames = behaviours[j].attributes.arr('Dataset');
                                behaviours = [behaviours[j]];
                                break;
                            }
                        }
                    }
                }
                // Find the current parameters (Value/Caption) of the filters which are required for this output
                var parametersValues = {};
                if (filtersSelection) {
                    var paramLayout = this.getParametersLayoutPerOutput(otptInst.ID);
                    for (var j = 0; j < paramLayout.length; j++) {
                        var current = paramLayout[j];
                        parametersValues[current.PARAMETERID] =
                            Analysis.fillParameterSuffixWithSelection(current.SUFFIX, filtersSelection[current.FILTERID]);
                    }
                }
                // Get queries
                var queries = this.getQueries(otptInst.ANALYSISID, parametersValues);
                // Remove queries based on useless Datasets
                for (var q = [], j = 0; j < queries.length; j++) {
                    if (tool.array.exists(queries[j].dataset.NAME, datasetNames)) q.push(queries[j]);
                }
                queries = q;
                // Add queries
                datasetsQueries.push(queries);
                // Just for debugging, completes the queryParts details with the association between FILTERID and PARAMETERID
                queries.forEach(function (result) {
                    result.queryParts.forEach(function (queryPart) {
                        queryPart.params.forEach(function (paramQuery) {
                            for (var j = 0; j < paramLayout.length; j++) {
                                if (paramLayout[j].PARAMETERID == paramQuery.PARAMETERID) {
                                    paramQuery.FILTERID = paramLayout[j].FILTERID;
                                    break;
                                }
                            }
                        });
                    });
                });
                // Store all details about this output instance
                otptInstDetails[otptInstId] = {
                    otptInst: otptInst,
                    behaviours: behaviours,
                    datasetNames: datasetNames,
                    queries: queries
                };
                // Loading data in progress...
                jQuery(otptInst.scope.container).biLoader({ className: 'bi-loader-theme-transparent' });
            }
            // End of "Prepare queries"

            log('\n\n###################\n# PROCESS OUTPUTS #');
            log(otptInstDetails);

            // Init or get the unique OutputsStack instance
            var outputsStack = this.outputsStack = this.outputsStack || new Analysis.OutputsStack(),
                now = outputsStack.set(otptInstIdList);

            var otptInstIdErrors = [];
            this.factory.get('Db').multiReadsArray(datasetsQueries).queue(function (datasetsResults) {

                // If even one query has failed, then all queries has failed (so check for error in the first result)
                if (true === datasetsResults[0][0].error) {

                    log('\nStatus: ' + datasetsResults.length + '/' + datasetsResults.length +
                        ' queries stacks has globaly failed. Try now to execute each stack separatly...\n\n');

                    // In this case, try again to execute each stack of queries separatly
                    for (var cores = [], i = 0; i < datasetsQueries.length; i++) (function (i) {
                        cores.push(this.factory.get('Db').multiReads(datasetsQueries[i]).queue(function (datasetResult) {
                            datasetsResults[i] = datasetResult;
                        }));
                    }.bind(this))(i);
                    this.when.apply(this, cores).queue(function () {
                        for (var datasetsSuccess = 0, i = 0; i < datasetsResults.length; i++) {
                            !datasetsResults[i][0].error ? datasetsSuccess++ : otptInstIdErrors.push(otptInstIdList[i]);
                        }
                        log('\nStatus: ' + datasetsSuccess + '/' + datasetsResults.length +
                            ' queries stacks has been successfully executed separatly !');
                        log('Outputs ID on error: ', otptInstIdErrors);
                    });
                }

                this.queue(function () {

                    // Check what remain in the list of still requested displays
                    var otpts = outputsStack.get(now);
                    if (otpts.length) {
                        for (var displayed = {}, i = 0; i < otpts.length; i++) {
                            // Behaviours count per output
                            displayed[otpts[i]] = otptInstDetails[otpts[i]].behaviours.length;
                        }
                        var onDisplay = function (event, otptInstId) {
                            if (!(otptInstId in displayed)) return; // Security
                            if (displayed[otptInstId] > 0) displayed[otptInstId]--; // Reduce outputs count
                            for (var otpt in displayed) if (0 != displayed[otpt]) return; // Wait for others outputs
                            // All analysis behaviours displayed, so let's trigger the analysis-ready event !
                            this.removeListener(this, Analysis.EVENT.DISPLAY, onDisplay);
                            this.triggerEvent(Analysis.EVENT.READY, otpts);
                        };
                        this.addListener(this, Analysis.EVENT.DISPLAY, onDisplay);
                    } else {
                        this.triggerEvent(Analysis.EVENT.READY, otpts); // otpts = []
                    }

                    // Here we go, last step !
                    for (var i = 0; i < otptInstIdList.length; i++) {
                        var details = otptInstDetails[otptInstIdList[i]],
                            datasetQueries = datasetsQueries[i],
                            datasetResults = datasetsResults[i],
                            otptInst = details.otptInst;

                        log('\n-----------------------\n>>> Output instance <<<');
                        log(otptInst);

                        if (!tool.array.exists(otptInst.ID, otpts)) {
                            log('\n---> SKIPPED (newer display available)');
                            continue;
                        }

                        // Is the output expected to be executed immediately ?
                        var dashboard = this.factory.export('Dashboard', ['getDashboard', 'current']),
                            isDashboardImmediateExecution = !(
                                0 === dashboard.getDashboard(dashboard.current.dashboardId).IMMEDIATEEXECUTION
                            ),
                            isImmediate =
                                !isNewIdList ||
                                isDashboardImmediateExecution ||
                                this.isOutputImmediateExecution(otptInst.ID);

                        // Build the datasetMap which is needed to combine the output datasets and get the analysisData
                        var datasetMap = {};
                        for (var j = 0; j < datasetResults.length; j++) {
                            log('\n---> Analysis dataset ');
                            log(datasetQueries[j].dataset); // Dataset infos
                            log(database.format.toJson(datasetResults[j])); // Analysis dataset

                            datasetMap[datasetQueries[j].dataset.NAME] = datasetResults[j];
                        }

                        // Remove previous router and build a new one
                        jQuery(otptInst.scope.main).remove();
                        otptInst.scope.main = jQuery('<div>').biRouter({ skipAnimation: true }).appendTo(otptInst.scope.container).get(0);

                        var behaviours = details.behaviours;
                        for (var j = 0; j < behaviours.length; j++) {
                            log('\n---> Output behaviour ' + (j + 1) + ' (definition/attributes)');
                            log(behaviours[j].output);
                            log(behaviours[j].attributes.get());

                            // Router item
                            var bind = Core.Template.bindHtml(this.outputTmpl);
                            behaviours[j].scope = bind.scope;
                            behaviours[j].scope.main = jQuery(otptInst.scope.main).biRouter(
                                'add', Analysis.getOutputInstancePath(otptInst, behaviours[j]), bind.$html, !j
                            );

                            // Get analysis data
                            var analysisData = Analysis.combineDatasetMap(datasetMap, behaviours[j].attributes);

                            // If the output has error on queries or has no data,
                            // then replace the Ouptut TYPE dynamically and use Core.Analysis.display.NoData
                            // (replace "Table", "Map", ... by "NoData")
                            if (tool.array.exists(otptInst.ID, otptInstIdErrors) ||
                                !analysisData.columns.length ||
                                !analysisData.data.length
                            ) {
                                behaviours[j].output.TYPE = 'NoData';
                                log('\n[no data]');
                            }

                            // Prepare analysis function
                            var analysisFn;
                            if (isImmediate) {
                                analysisFn = this.getAnalysisFn(analysisData, otptInst, behaviours[j], details.queries);
                            } else {
                                analysisFn = function () { };
                                // Just consider that the analysis has been displayed
                                this.outputDisplayed(otptInst.ID);
                                log('\n[no immediate execution]');
                            }
                            // Execute analysis function
                            analysisFn();
                            // Store analysis function (to be able to refresh the output)
                            if (behaviours[j].attributes.bool("Refresh", true)) this.storeOutput(otptInst.ID, j, analysisFn);
                        }
                        this.displaySelector(otptInst, behaviours);
                        // Loading data complete
                        jQuery(otptInst.scope.container).biLoader('complete');
                    }

                }).done();

            }.bind(this)).thenDone(this);
        }

    });

    Analysis.extendProto({

        // Determine the immediate execution status of an output instance
        isOutputImmediateExecution: function (otptInstId) {
            // Get filter instance
            var getFilterInstance = this.factory.has('Filter') ? this.factory.export('Filter', 'getFilterInstance') : undefined;
            // Unable to determine the immediate execution status
            if (!getFilterInstance) return true;
            // Looking for this output dependencies...
            var paramLayout = this.getParametersLayoutPerOutput(otptInstId);
            for (var i = 0; i < paramLayout.length; i++) {
                // Get filter instance details
                var fltrInstId = paramLayout[i].FILTERID, fltrInst = getFilterInstance(fltrInstId);
                // If the output depends on at least one deferred filter then wait for user click (on submit filters button) to display output.
                if (fltrInst.ISDEFERRED) return false;
            }
            return true;
        },

        // Important: each display method in the script "Core.AnalysisDisplay.js"
        // must call this method to trigger event DISPLAY !
        outputDisplayed: function (otptInstId) {
            this.triggerEvent(Analysis.EVENT.DISPLAY, otptInstId);
        },

        getAnalysisFn: function (analysisData, otptInst, behaviour, debugQueries) {
            var debugData, debugBehaviour;
            if (this.options.debug) {
                // Duplicate original data (before "Filter" and "Sort" actions)
                debugData = new Analysis.Data(analysisData);
                // Duplicate the behaviour and (most important) clone the behaviour.attributes property
                debugBehaviour = tool.extend({}, behaviour);
                debugBehaviour.attributes = behaviour.attributes.clone();
            }
            return function (analysisFilter) {
                var duplicateData = new Analysis.Data(analysisData);
                // Filter
                if (analysisFilter) duplicateData.grepData(analysisFilter.column, analysisFilter.value);
                // Sort
                var datasetSort = behaviour.attributes.get('DatasetSort');
                if (datasetSort) duplicateData.multiSortRows(datasetSort);
                // Debug
                if (this.options.debug) this.debugAnalysis(debugData, otptInst, debugBehaviour, debugQueries, analysisFilter);
                // Display
                this.displayAnalysis(duplicateData, otptInst, behaviour);
            }.bind(this);
        },

        // Store the function analysisFn to be able to refresh the current output at any time
        storeOutput: function (otptInstId, behaviourIndex, analysisFn) {
            this.lastAnalysisFn[otptInstId] = this.lastAnalysisFn[otptInstId] || [];
            this.lastAnalysisFn[otptInstId][behaviourIndex] = analysisFn;
        },

        refreshOutput: function (otptInstId, behaviourIndex, analysisFilter) {
            var analysisFnList = this.lastAnalysisFn[otptInstId];
            if (!analysisFnList) return;
            analysisFnList.forEach(function (analysisFn, i) {
                if (undefined !== behaviourIndex && i != behaviourIndex) return;
                switch (analysisFilter) {
                    case null:
                        delete analysisFn.lastFilter; // Delete
                        break;
                    case undefined:
                        if (analysisFn.lastFilter) analysisFilter = analysisFn.lastFilter; // Get
                        break;
                    default:
                        // Store the given parameter to be able to refresh the output in its exact state
                        analysisFn.lastFilter = analysisFilter; // Set
                        break;
                }
                analysisFn(analysisFilter);
            });
        },

        // When the UI is resized, we need to refresh the displayed outputs
        // To do this, we want to refresh only the outputs of the current visible Dashboard (for performances optimizations...).
        // And next, when the user will navigate to other Dashboards, it will be the time to refresh them just in time...
        refreshAllOutputs: function (allDashboards) {
            if (!allDashboards) {
                // Refresh only the outputs of the current visible Dashboard
                var currentDashboardId = this.factory.export('Dashboard', 'current').dashboardId;
                this.dbOutput.instance.forEach(function (item) {
                    if (!item.scope) return; // Unscoped item is an output that is still not rendered in the UI...
                    if (currentDashboardId == item.dashboardId) {
                        this.refreshOutput(item.ID);
                    } else {
                        // Remember that this output is in another Dashboard which is currently hidden.
                        // We'll need to refresh it the next time the user will navigate to its Dashboard...
                        this.pendingRefreshOutputId[item.ID] = item;
                    }
                }.bind(this));
            } else {
                // Refresh outputs in all displayed Dashboards
                for (var otptInstId in this.lastAnalysisFn) this.refreshOutput(otptInstId);
                // Obviously, there's no pending output to refresh anymore...
                // (tip: use the .setter in case the method is called from a clone)
                this.setter('pendingRefreshOutputId', {});
            }
        },

        // Call this method on Bi.Core.Dashboard.EVENT.VIEW event...
        handlePendingRefreshOutputs: function () {
            var currentDashboardId = this.factory.export('Dashboard', 'current').dashboardId;
            for (var otptInstId in this.pendingRefreshOutputId) {
                if (currentDashboardId == this.pendingRefreshOutputId[otptInstId].dashboardId) {
                    this.refreshOutput(otptInstId);
                    delete this.pendingRefreshOutputId[otptInstId];
                }
            }
        }

    });

    Analysis.extendProto({

        // Notice: the parameter otptInstId is optional
        getOutputBehaviours: function (outputId, otptInstId) {
            var _this = this, getAttr = function (otptId) {
                var attr = new Analysis.Attributes(Analysis.reduceAttr2Value(
                    _this.getOutputAttributes(otptId) // Get definition attributes
                ));
                if (otptInstId) attr.merge(Analysis.reduceAttr2Value(
                    _this.getOutputAttributesInstance(otptInstId, otptId) // Merge with instance attributes
                ));
                return attr;
            };
            var output = tool.extend({}, this.getOutputDefinition(outputId)); // Duplicate the original object
            if (!output) return [];
            var behaviours = [];
            switch (output.TYPE) {
                case 'MultipleOutput':
                    var masterAttr = getAttr(outputId);
                    // Add behaviour for each OutputId of the Multiple
                    outputId = masterAttr.arr('OutputId');
                    for (var i = 0; i < outputId.length; i++) behaviours.push({
                        output: tool.extend({}, this.getOutputDefinition(outputId[i])) // Duplicate the original object
                    });
                    // Remember the master output
                    behaviours.multipleOutput = {
                        output: output,
                        attributes: masterAttr
                    };
                    break;

                default:
                    behaviours.push({ output: output });
                    break;
            }
            for (var i = 0; i < behaviours.length; i++) behaviours[i].attributes = getAttr(behaviours[i].output.ID);
            return behaviours;
        },

        // In case output.TYPE = MultipleOutput display the outputs selector
        displaySelector: function (otptInst, behaviours) {
            if (behaviours.length < 2) return;
            // Output container
            var $container = jQuery(otptInst.scope.container);
            // Get the current behaviour index and destroy the current selector
            var behaviourIndex = 0,
                $prevSelector = $container.children('.' + Analysis.LAYOUT.SELECTOR).remove();
            if ($prevSelector.size()) {
                var prevValue = $prevSelector.find('input:checked').val();
                behaviours.forEach(function (behaviour, index) {
                    if (behaviour.output.ID == prevValue) behaviourIndex = index;
                });
            }
            // Selector settings
            var masterAttr = behaviours.multipleOutput.attributes, // Contains definition and instance attributes
                selectorType = ('Radio' == masterAttr.get('SelectorType')) ? 'Radio' : 'Select',
                outputTitle = masterAttr.arr('OutputTitle'), // Overwrite the outputs captions
                selectorTitle = masterAttr.get('SelectorLabel', ''); // Selector main-title
            // Build the new selector
            var selectorData = [], replaceText = this.factory.export('Translation', 'replaceText');
            behaviours.forEach(function (behaviour, index) {
                var checked = behaviourIndex == index;
                selectorData.push({
                    value: behaviour.output.ID,
                    label: replaceText(outputTitle[index] || behaviour.output.CAPTION),
                    checked: checked
                });
                // When the output is built, the first behaviour is selected by default
                // In case, the checked behaviour is not the first, we need to go to the checked one
                if (behaviourIndex && checked) {
                    jQuery(otptInst.scope.main).biRouter('goTo', Analysis.getOutputInstancePath(otptInst, behaviour));
                }
            });
            var $selector = jQuery('<div>').addClass(Analysis.LAYOUT.SELECTOR),
                $title = jQuery('<div>').addClass('bi-form-group-title'),
                $content = jQuery('<div>').addClass('bi-form-group-content bi-form-group-inline').appendTo($selector);
            // Set title
            if (selectorTitle) $title.text(selectorTitle).appendTo($selector);
            // Create DOM selector
            $content.append(
                jQuery('<div>')['Radio' == selectorType ? 'biButtonGroup' : 'biTreeView']({
                    data: selectorData,
                    type: 'radio',
                    vertical: false, // for biButtonGroup
                    dropDown: true // for biTreeView
                })
            );
            var $inputs = $content.find('input').on('change', function (e) {
                var outputId = jQuery(this).val();
                behaviours.forEach(function (behaviour) {
                    if (behaviour.output.ID != outputId) return;
                    jQuery(otptInst.scope.main).biRouter('goTo', Analysis.getOutputInstancePath(otptInst, behaviour));
                });
            });
            // Insert selector in DOM
            $container.prepend($selector);
            // Select the index according to the status of a filterInstanceId
            var catchedOtptInstId = this.catchFilter2SelectedOutputInstanceId(masterAttr.get('CatchFilter'));
            if (catchedOtptInstId) {
                $inputs.filter('[value=' + catchedOtptInstId + ']').prop("checked", true).trigger('change');
                $selector.addClass('bi-filter-hidden');
            }
        },

        // When MultipleOutput is controlled by a filter, this function returns the expected visible outputInstanceId in the Multiple
        catchFilter2SelectedOutputInstanceId: function (catchFilterAttr) {
            if (!catchFilterAttr || !this.factory.has('Filter')) return;
            var filterId = catchFilterAttr.id,
                filterType = ((catchFilterAttr.type || '').toLowerCase() == 'caption') ? 'Caption' : 'Value',
                filterMap = catchFilterAttr.map,
                filterSelection = this.factory.export('Filter', 'getFilterSelection')(filterId);
            if (filterSelection && filterSelection[filterType].length) {
                var filterData = filterSelection[filterType][0];
                return filterMap[filterData]; // This is the selected otptInstId. Trust me !
            }
        }

    });

    Analysis.extendStatic({

        reduceAttr2Value: function (attributes) {
            var attr = {};
            for (var name in attributes) attr[name] = attributes[name].VALUE;
            return attr;
        },

        // Get the router path to an output behaviour
        getOutputInstancePath: function (otptInst, behaviour) {
            return Analysis.LAYOUT.OUTPUT + [otptInst.ID, otptInst.OUTPUTID, behaviour.output.ID].join('-');
        },

        fillParameterSuffixWithSelection: function (suffix, filterSelection) {
            // Pattern structure : Filter~[type]~[quote]~[separator]~[default]~
            // Note: the "default" is optional. Because of that the last ~ is optional
            var match = suffix.match(/Filter~(Value|Caption)~([^~]*)~([^~]*)~(([^~]*)~)?/),
                type = match[1], // Value or Caption
                quote = match[2],
                sep = match[3],
                def = match[5]; // It should contains the quoted value(s) or caption(s) with separator [not only the value...]

            var query = quote + filterSelection[type].join(quote + sep + quote) + quote;

            // If "default" is available and the selection is an empty array then take the "default" !
            if (def && !filterSelection[type].length) query = def;

            return suffix.replace(match[0], query);
        },

        // The datasetMap parameter represents the query result per datasetName
        // datasetMap = { name1:{ columns:[], data:[] }, name2:{ columns:[], data:[] }, ... }
        combineDatasetMap: function (datasetMap, attributes) {

            var map = tool.extend({}, datasetMap); // Duplicate original object to keep it safe

            var name = attributes.arr('Dataset'), // Ordered parts of the dataset we need to combine
                join = attributes.arr('DatasetJoin'); // The way to combine the parts

            try {
                for (var i = 0; i < name.length; i++) if (!(name[i] in map)) throw new Error('invalid value of "Dataset" attribute (' + name[i] + ')');
                if (name.length && !(join.length == name.length - 1)) throw new Error('invalid number of "DatasetJoin" clauses');

                if (!join.length) {
                    if (name.length) return map[name[0]];
                    throw new Error(''); // This is not an error ! But the analysisData is simply the first dataset...
                }

                // Add alias to all columns of each dataset
                for (var n in map)
                    for (var i = 0; i < map[n].columns.length; i++)
                        map[n].columns[i] = n.toUpperCase() + '.' + map[n].columns[i];

                // Start with the first part of the dataset (converted to objects)
                var analysisData = database.format.toJson(map[name[0]]);

                var reverse = function (data) {
                    data = database.format.fromJson(data); // Reverse the database.format.toJson effect
                    for (var col = 0; col < data.columns.length; col++) {
                        data.columns[col] = data.columns[col].replace(/^[a-z0-9]+\./i, ''); // Remove the columns alias
                    }
                    return data;
                };

                // Combine the others parts
                for (var i = 0; i < join.length; i++) {
                    var addonData = database.format.toJson(map[name[i + 1]]),
                        addonCols = map[name[i + 1]].columns,
                        clause = join[i];

                    // Get the clause type
                    var type = (clause.match(/^(INNERJOIN|LEFTJOIN|GROUP)\s/));
                    if (!type) throw new Error('unknown clause type in "DatasetJoin" attribute (' + clause + ')');

                    // Get the clause expression (dataset_A.column_X = dataset_B.column_Y)
                    clause = tool.string.split(clause.replace(type[0], ''), '|'); // The clauses are separated by the character '|' which means ' AND '
                    for (var c = 0; c < clause.length; c++) clause[c] = tool.string.split(clause[c].toUpperCase(), '=');
                    type = type[1];

                    // Is two rows check all clauses ?
                    var match2Rows = function (rowA, rowB) {
                        for (var c = 0; c < clause.length; c++) {
                            var col1 = clause[c][0],
                                col2 = clause[c][1];
                            if (col1 in rowA && col2 in rowB) {
                                if (rowA[col1] != rowB[col2]) return false;
                            } else if (col2 in rowA && col1 in rowB) {
                                if (rowA[col2] != rowB[col1]) return false;
                            } else {
                                throw new Error('unknown column alias in "DatasetJoin" attribute (' + col1 + ' and/or ' + col2 + ')');
                            }
                        }
                        return true;
                    };

                    var newData = [];
                    for (var row = 0; row < analysisData.length; row++) {

                        // Subset of addonData that matches this analysisData row
                        var grepAddonData = addonData.filter(function (addonRow) {
                            return match2Rows(analysisData[row], addonRow);
                        });

                        // Combine the subset with the analysisData
                        switch (type) {
                            case 'INNERJOIN':
                            case 'LEFTJOIN':
                                for (var j = 0; j < grepAddonData.length; j++) {
                                    newData.push(tool.extend(null, analysisData[row], grepAddonData[j]));
                                }
                                if ('LEFTJOIN' == type && 0 == grepAddonData.length) {
                                    var emptyAddonDataRow = {};
                                    for (var col = 0; col < addonCols.length; col++) emptyAddonDataRow[addonCols[col]] = undefined;
                                    newData.push(tool.extend(null, analysisData[row]), emptyAddonDataRow);
                                }
                                break;
                            case 'GROUP':
                                newData.push(tool.extend(null, analysisData[row], { "_GROUP": reverse(grepAddonData) }));
                                break;
                        }
                    }
                    analysisData = newData;
                }
                if ("GROUP" == type) Analysis.groupRender(analysisData, attributes.get('GroupRender'));
                return reverse(analysisData);

            } catch (e) {
                if (e.message) tool.console.error('Bi.Core.Analysis.combineDatasetMap: ' + e.message + '\n\n', map, attributes);
                for (var n in map) return map[n]; // Simply return the first dataset
            }
        },

        groupRender: function (analysisData, render) {
            var type = (render.match(/^(Sparkline)\s/));
            render = render.replace(type[0], '');
            type = type[1];
            switch (type) {
                case 'Sparkline':
                    var attributes = {/* "AxisX": '', "AxisY": '', Colors: '' */ };
                    render = tool.string.split(render, ';');
                    for (var i = 0; i < render.length; i++) {
                        var c = tool.string.split(render[i], '=');
                        attributes[c[0]] = c[1];
                    }
                    for (var row = 0; row < analysisData.length; row++) {
                        var sparkDiv = jQuery('<div>').css({ width: '70px', height: '25px' }),
                            sparkData = new Analysis.Data(analysisData[row]["_GROUP"]),
                            sparkAttr = new Analysis.Attributes(attributes);

                        Analysis.display.Sparkline.call(sparkDiv.get(0), sparkData, sparkAttr);
                        analysisData[row]["_GROUP"] = sparkDiv.get(0).outerHTML;
                    }
                    break;
            }
        }

    });

    Analysis.extendProto({

        displayAnalysis: function (analysisData, otptInst, behaviour) {
            // If the method is called from .refreshOutput() then isRefresh=true
            var isRefresh = !!behaviour.scope.content.innerHTML,
                isMultipleOutput = (otptInst.OUTPUTID != behaviour.output.ID);

            // Init title
            if (!isRefresh) {
                // Title
                var titleText = behaviour.attributes.get("Title");
                if (titleText) {
                    jQuery(behaviour.scope.title).attr('bi-data-output-title', titleText);
                } else if (!isMultipleOutput) {
                    // Remove the title only it's not a MultipleOutput
                    // (if there's a selector (for MultipleOutput) then the title is necessary to make this selector visible)
                    jQuery(behaviour.scope.title).remove();
                }
                // Zoom button
                var zoom = behaviour.attributes.bool("Zoom", true);
                if (zoom || this.options.debug) this.addZoomButton(otptInst, !zoom && this.options.debug);
            }
            // Set title
            var $title = jQuery(behaviour.scope.title);
            if ($title.size()) {
                var titleText = $title.attr('bi-data-output-title') || '';
                titleText = titleText.replace('{OUTPUT_NUM_ROWS}', analysisData.data.length); // Replace num rows
                $title.html(this.factory.export('Context', 'replaceText')(titleText));
            }

            // Prepare the tools for the display[type] function
            var instances = this.factory.export({
                Context: 'replaceText',
                Analysis: 'columnFormatting'
            }),
            tools = {
                $title: $title, // Give access to the title area from the analysis content
                replaceText: instances.context.replaceText,
                columnFormatting: function (analysisData, colExp, colFormat) {
                    // Call the method with parameter "outputInstanceId"=otptInst.ID
                    return instances.analysis.columnFormatting(analysisData, colExp, colFormat, otptInst.ID);
                },
                outputInstanceId: otptInst.ID,
                isRefresh: isRefresh
            };

            if (behaviour.output.TYPE in Analysis.display) {
                Analysis.display[behaviour.output.TYPE].apply(behaviour.scope.content, [
                    analysisData,
                    behaviour.attributes,
                    tools,
                    this.outputDisplayed.bind(this, otptInst.ID) // It's the "finish" method!
                ]);
            } else {
                tool.console.error(
                    'Bi.Core.Analysis.displayAnalysis:' +
                    ' Unable to display the output instance id=' + otptInst.ID +
                    ' because the method "Bi.Core.Analysis.display.' + behaviour.output.TYPE + '" is missing.'
                );
            }
            this.datasetFormatting(behaviour.scope.title, analysisData, behaviour.attributes);
        },

        datasetFormatting: function (title, analysisData, attributes) {
            var $title = jQuery(title),
                getColumn = function (col, callback) {
                    callback = callback || function (item) { return item; };
                    for (var items = [], row = 0; row < analysisData.data.length; row++) {
                        items.push(callback(analysisData.data[row][col]));
                    }
                    return items;
                },
                formats = attributes.startWith('DatasetFormat'),
                replaceText = this.factory.export('Translation', 'replaceText');

            for (var colExp in formats) {
                var colIndex = analysisData.getColIndex(colExp), format = formats[colExp];
                if (undefined === colIndex) continue;
                switch (format.type) {
                    case 'link':
                        // Originally designed to add link to EasyMedWeb protocol
                        // In this case, the format should be like this:
                        // { "type": "link", "separator": "&", "prefix": "easymedweb://", "suffix": "", "title": "Open in EasyMed" }
                        var items = getColumn(colIndex, encodeURIComponent),
                            href = (format.prefix || '') + items.join(format.separator || '') + (format.suffix || '');
                        // Warning: To use this feature, the $title should have been setted with something (just to be available in the DOM)
                        $title.append(
                            '<a data-biz-analysis="dataset-formatting" href="' + href + '">' +
                            replaceText(format.title || '[title]') + '</a>'
                        );
                        break;
                }
            }
        },

        debugAnalysis: function (analysisData, otptInst, behaviour, queries, analysisFilter) {
            // Update scope (once)
            if (!behaviour.scope.debugContent) {
                var $content = jQuery(behaviour.scope.content);

                // Add a second content for the debugging infos
                behaviour.scope.debugContent =
                    jQuery('<div>').addClass('bi-grid-cell-content bi-background-white bi-display-none')
                        .insertAfter($content).get(0);

                // Add a toggle button to show/hide the debugging infos
                behaviour.scope.debugToggler =
                    jQuery('<span>').addClass('bi-grid-cell-button').on(jQuery.biPlugin.events('mousedown'), function () {
                        jQuery(behaviour.scope.debugContent).toggleClass('bi-display-none');
                    }).appendTo($content.parent()).get(0);
            }

            // Preprocess data (use the same pattern as in the method .displayAnalysis)
            var analysisPreproc = Analysis.preprocessCommunAttr(
                analysisData.clone(), behaviour.attributes, this.factory.export('Context', 'replaceText')
            );
            
            // Fill content
            var $debugContent = jQuery(behaviour.scope.debugContent).html('');

            // Add info about the current analysisFilter setting
            if (analysisFilter)
                $debugContent.append('<h3 style="margin:10px;"><i class="fa fa-info-circle"></i> ' +
                    'Analysis is filtered on column = "' + analysisFilter.column + '" with value = "' + analysisFilter.value + '".</h3>');

            // Get sorted list of attributes
            var attrObj = behaviour.attributes.get(), attrArr = [];
            for (var p in attrObj) attrArr.push([p, attrObj[p]]);
            attrArr.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

            // Notice:
            // in case the output is based on more than one dataset (using .combineDatasetMap())
            // it's possible to have more than one query used...
            queries.forEach(function (_query) {
                var datasetTitle = ['Dataset "', _query.dataset.NAME, '" on "', _query.dataset.DBNAME, '"'].join('');
                // Query result (before preprocess)
                $debugContent
                    .append(tool.html.table({
                        className: 'bi-table-100pc',
                        caption: 'Output instance / definition',
                        cols: ['INFO', 'VALUE'],
                        rows: [
                            ['Type', behaviour.output.TYPE],
                            ['ContainerId', otptInst.CONTAINERID],
                            ['OutputInstanceId', otptInst.ID],
                            ['MultipleOutputId', otptInst.OUTPUTID],
                            ['OutputId', behaviour.output.ID],
                            ['AnalysisId', otptInst.ANALYSISID]
                        ]
                    }))
                    .append(tool.html.table({
                        className: 'bi-table-100pc bi-table-pre',
                        caption: 'Attributes',
                        cols: ['NAME', 'VALUE'],
                        rows: attrArr,
                        stringify: true,
                        entities: true
                    }))
                    .append(tool.html.table({
                        className: 'bi-table-100pc',
                        caption: datasetTitle + ' <b>(query result)</b>',
                        cols: analysisData.getCols(),
                        rows: analysisData.getSafeData()
                    }))
                    .append(tool.html.table({
                        className: 'bi-table-100pc',
                        caption: datasetTitle + ' <b>(preprocessed)</b>',
                        cols: analysisPreproc.getCols(),
                        rows: analysisPreproc.getSafeData()
                    }))
                    .append(tool.html.table({
                        className: 'bi-table-100pc',
                        caption: 'Output query',
                        rows: [
                            ['<textarea readonly onclick="if (\'select\' in this) this.select();">' +
                                _query.query + '</textarea>']
                        ]
                    }))
                ;
                // Clone queryParts before modifying it !
                tool.extend([], _query.queryParts).forEach(function (part, i) {
                    var _q = part.query;
                    part.params.forEach(function (param) {
                        var text = '<span class="bi-bullet">' + param.search + '</span>';
                        _q = _q.replace(new RegExp(param.search, 'g'), text);
                        param.search = text;
                    });
                    var parameters = database.format.fromJson(part.params),
                        index = _query.queryParts.length > 1 ? (i + 1) : '';
                    $debugContent
                        .append(tool.html.table({
                            className: 'bi-table-100pc',
                            caption: 'Dataset query part ' + index,
                            cols: parameters.columns,
                            rows: parameters.data
                        }))
                        .append(tool.html.table({
                            className: 'bi-table-100pc',
                            cols: ['QUERY'],
                            rows: [['<pre>' + _q + '</pre>']]
                        }));
                });
            });
        },

        // We are assuming that only one analysis can be in zoom mode at a given time
        addZoomButton: function (otptInst, onlyDebug) {
            if (otptInst.scope.zoom) return;
            var $container = jQuery(otptInst.scope.container), // "Regular analysis container"
                $wrapper = jQuery(this.options.zoomTarget); // DOM element where to append the "Zoomed analysis container"
            if (!$wrapper.size()) {
                tool.console.error('Bi.Core.Analysis.addZoomButton: zoomTarget not founded "' + this.options.zoomTarget + '"');
                return;
            }
            otptInst.scope.zoom = jQuery('<span>').addClass('bi-grid-zoom-button').on('click', function () {
                var $target = $wrapper.children('.bi-grid-zoom-target'), // This is the "Zoomed analysis container"!
                    zoomIn = !$target.size();
                if (zoomIn) {
                    jQuery('<div><div></div></div>').addClass('bi-grid-zoom-target bi-form')
                        .appendTo($wrapper).children().append($container.children()); // The $container.children() are all that analysis stuff...
                    $container.attr('data-biz-container-zoomed', '');
                } else {
                    $container.attr('data-biz-container-zoomed', null);
                    $target.children().children().appendTo(otptInst.scope.container);
                    $target.remove();
                }
                this.refreshOutput(otptInst.ID);
                this.triggerEvent(Analysis.EVENT.ZOOM, { id: otptInst.ID, zoom: zoomIn });
            }.bind(this)).appendTo(otptInst.scope.container).get(0);
            // Inform that the button is displayed only in debug mode
            if (onlyDebug) jQuery(otptInst.scope.zoom).css('border', '1px dashed crimson').attr('title', 'debug mode');
        },

        // If there's zoomed analysis then close it!
        zoomOut: function () { 
            var $target = jQuery(this.options.zoomTarget).children('.bi-grid-zoom-target');
            if ($target.size()) $target.children().children('.bi-grid-zoom-button').click();
        }

    });

    // When an output is ready to be displayed, check whether a newer has not been requested
    Analysis.OutputsStack = function () {
        this.stack = [];
    };
    Analysis.OutputsStack.prototype = {
        // Store the list and return its identifier
        set: function (idList) {
            var now = new Date().getTime();
            this.stack.push({ time: now, list: tool.extend([], idList) });
            return now;
        },
        // Get what remains in the list by giving its identifier
        get: function (now) {
            this._clean();
            for (var i = 0; i < this.stack.length; i++) {
                if (now == this.stack[i].time) return this.stack[i].list;
            }
            return [];
        },
        // Clean all lists
        _clean: function () {
            var stack = [], idOnce = [];
            while (this.stack.length) {
                var last = this.stack.pop(), now = last.time, idList = [];
                for (var i = 0; i < last.list.length; i++) {
                    var id = last.list[i];
                    if (tool.array.exists(id, idOnce)) continue;
                    idOnce.push(id);
                    idList.push(id);
                }
                if (idList.length) stack.unshift({ time: now, list: idList });
            }
            this.stack = stack;
        }

    };

    // Data manager
    Analysis.Data = function (analysisData) {
        this.cols = [];
        this.data = [];
        this.safeData = [];
        // Alternative signature: the argument is a JSON
        if (tool.is.array(analysisData)) {
            analysisData = database.format.fromJson(analysisData);
        }
        // Default signature: the argument is an object like: { columns: [], data: [[], [], ...] }
        if (tool.is.object(analysisData)) {
            this.cols = Analysis.Data.tools.duplicate(analysisData.columns);
            this.callOnData(function (d) {
                this[d] = Analysis.Data.tools.duplicate(analysisData.data);
            });
        }
        this.check();
    };
    Analysis.Data.prototype = {

        // Call a function on this.data and this.safeData
        callOnData: function (fn) {
            fn.call(this, 'data');
            fn.call(this, 'safeData');
        },

        check: function () {
            for (var errors = [], i = 0; i < this.data.length; i++) {
                if (this.data[i].length != this.cols.length) errors.push({ row: i, data: this.data[i] });
            }
            if (!errors.length) return;
            this.error = true;
            tool.console.error(
                'Bi.Core.Analysis.Data.check: The analysis data are inconsistent.\n' + this.cols.length + ' column(s) expected', this.cols
            );
            for (var i = 0; i < errors.length; i++) {
                tool.console.error('Row ' + errors[i].row + ' has ' + errors[i].data.length + ' column(s)', errors[i].data);
            }
            tool.console.log('');
        },

        get: function () {
            return { columns: this.cols, data: this.data };
        },

        clone: function () {
            var clone = new Analysis.Data(this.get());
            clone.safeData = Analysis.Data.tools.duplicate(this.safeData); // Restore the clone safeData
            return clone;
        },

        getCols: function (index) {
            if (undefined === index) return this.cols;
            if ('first' === index) return this.cols[0];
            if ('last' === index) return this.cols[this.cols.length - 1];
            return this.cols[index];
        },

        replaceCols: function (cols) {
            for (var i = 0; i < this.cols.length; i++) this.cols[i] = cols[i] || this.cols[i];
        },

        getData: function () {
            return this.data;
        },

        getSafeData: function () {
            return this.safeData;
        },

        getMap: function () {
            return database.format.toJson(this.get());
        },

        grepData: function (col, val, notEqual) {
            var safeData = [],
                data = [];
            col = this.getColIndex(col);
            var test = (function () {
                return notEqual ? function (a, b) { return a != b; } : function (a, b) { return a == b; };
            })();
            for (var row = 0; row < this.safeData.length; row++) if (test(val, this.safeData[row][col])) {
                safeData.push(this.safeData[row]);
                data.push(this.data[row]);
            }
            this.safeData = safeData;
            this.data = data;
        },

        // colsInfos = [{ col: '@1', order: 'asc' }, { col: '@2', order: 'desc' }, ...];
        multiSortRows: function (colsInfos) {
            colsInfos = tool.extend([], colsInfos); // Duplicate to preserve original
            for (var i = 0; i < this.safeData.length; i++) {
                this.safeData[i]._dataBag = this.data[i]; // Embbed data in safeData
            }
            for (var i = 0; i < colsInfos.length; i++) {
                colsInfos[i]['col'] = this.getColIndex(colsInfos[i]['col']);
                colsInfos[i]['order'] = ('DESC' != (colsInfos[i]['order'] || '').toUpperCase()) ? 1 : -1;
            }
            this.safeData.sort(function (row1, row2) {
                for (var i = 0; i < colsInfos.length; i++) {
                    var sortCol = colsInfos[i]['col'],
                        sortOrder = colsInfos[i]['order'];
                    if (row1[sortCol] > row2[sortCol]) return +1 * sortOrder;
                    if (row1[sortCol] < row2[sortCol]) return -1 * sortOrder;
                }
                return 0;
            });
            for (var i = 0; i < this.safeData.length; i++) {
                this.data[i] = this.safeData[i]._dataBag; // Overwrite this.data !
                delete this.safeData[i]._dataBag;
            }
        },

        agregate: function (params) {
            // Duplicate the data row
            var firstSafeDataRow = this.safeData.length ? [].concat(this.safeData[0]) : [];

            // Apply "group by"
            this.multiSortRows(params.orderBy);

            // Columns to group by
            var orderIndex = [];
            for (var col = 0; col < params.orderBy.length; col++) {
                orderIndex.push(this.getColIndex(params.orderBy[col]['col']));
            }
            // Columns to agregate
            var agregateIndex = [];
            for (var col = 0; col < params.agregate.length; col++) {
                agregateIndex.push(this.getColIndex(params.agregate[col]['col']));
            }
            // Other columns
            var otherIndex = [];
            if (this.safeData.length) {
                for (var col = 0; col < this.safeData[0].length; col++) {
                    if (!tool.array.exists(col, orderIndex) && !tool.array.exists(col, agregateIndex)) {
                        otherIndex.push(col);
                    }
                }
            }

            var data = [], currentHash, currentData;
            for (var row = 0; row < this.safeData.length; row++) {
                // Token of the "group by" columns of the safeData row
                var orderHash = [];
                for (var col = 0; col < orderIndex.length; col++) {
                    orderHash.push(this.safeData[row][orderIndex[col]]);
                }
                orderHash = orderHash.join('|');

                if (currentHash !== orderHash || 0 === row) {
                    currentHash = orderHash;
                    data.push(currentData = []);
                    // Fill the "group by" columns once
                    for (var col = 0; col < orderIndex.length; col++) {
                        currentData[orderIndex[col]] = this.safeData[row][orderIndex[col]];
                    }
                    // Prepare the "agregate" columns
                    for (var col = 0; col < agregateIndex.length; col++) {
                        currentData[agregateIndex[col]] = [];
                    }
                }
                // Add item to the "agregate" columns
                for (var col = 0; col < agregateIndex.length; col++) {
                    currentData[agregateIndex[col]].push(this.safeData[row][agregateIndex[col]]);
                }
            }

            for (var row = 0; row < data.length; row++) {
                // Process the indicator of the "agregate" columns
                for (var col = 0; col < agregateIndex.length; col++) {
                    var fn = tool.PivotTable.tools.indicators[params.agregate[col]['indicator']];
                    data[row][agregateIndex[col]] = fn(data[row][agregateIndex[col]]);
                }
                // Complete other columns with the values of the first row in the original dataset
                for (var col = 0; col < otherIndex.length; col++) {
                    data[row][otherIndex[col]] = firstSafeDataRow[otherIndex[col]];
                }
            }

            // Replace this.safeData and this.data (destructive operation)
            this.safeData = Analysis.Data.tools.duplicate(data);
            this.data = Analysis.Data.tools.duplicate(data);
        },

        getColIndex: function (expression) {
            var colIndex;
            if (tool.is.number(expression) || tool.string.trim('' + expression).match(/^[0-9]+$/)) {
                // Try column index
                colIndex = parseInt(expression, 10);
            } else if (tool.is.string(expression)) {
                expression = tool.string.trim(expression).toUpperCase();
                // Try column name
                var orderedCols = Analysis.Data.tools.orderByMaxLength(this.cols);
                for (var i = 0; i < orderedCols.length; i++)
                    if (orderedCols[i].toUpperCase() == expression)
                        for (var index = 0; index < this.cols.length; index++)
                            if (orderedCols[i] === this.cols[index]) return index;
                // Try column alias
                var match = expression.match(/^@([0-9]+)$/);
                if (match) colIndex = parseInt(match[1], 10) - 1; // "@1" refers to the column 0 in the data array
            }
            if (undefined !== colIndex && colIndex >= 0 && colIndex < this.cols.length) return colIndex;
        },

        getColName: function (expression) {
            var colIndex = this.getColIndex(expression);
            if (undefined !== colIndex) return this.cols[colIndex];
        },

        getColAlias: function (expression) { // Get the column with arobase format (like: @1, @2, ...)
            var colIndex = this.getColIndex(expression);
            if (undefined !== colIndex) return '@' + (colIndex + 1);
        },

        getColRange: function (expression) {
            var range = { min: undefined, max: undefined },
                colIndex = this.getColIndex(expression);
            if (undefined !== colIndex) for (var i = 0; i < this.safeData.length; i++) {
                var val = this.safeData[i][colIndex];
                if (undefined === range.min || range.min > val) range.min = val;
                if (undefined === range.max || range.max < val) range.max = val;
            }
            return range;
        },

        evalColExpression: function (expression, columnName, columnIndex, noValue, replaceFn) {
            ////////
            // HACK
            // The following variable was originally named "i".
            // But we faced a strange problem when building a "Release" (using the C# ScriptBundle minifier)
            // At the top of this script, the minifier picked the variable "i" to point to the variable "Analysis" (== Bi.Core.Analysis).
            // But inside the current function (evalColExpression), the minifier did not rename the local variable "i"!
            // Thus, the reference of "Analysis" was lost in this scope!
            // (Bug occured in VS 2012)
            // By simply replacing the variable name "i" by "idx" (or anything), the problem was solved!
            // Microsoft when you hold us...!
            // ---
            // For testing i have successfully minified this script using the well known minifier: http://dean.edwards.name/packer/
            var idx;
            // HACK
            ///////

            expression = expression || '';
            var expressionOriginal = expression;
            // Remove all spaces (espacially \n and \r) to get a single line expression (before calling: eval())
            expression = (expression + '').replace(/\s+/g, ' ');

            // Replace short name of functions
            // Example: replace 'fn.rowSplitterIndex' by 'Bi.Core.Analysis.Data.fnEval.rowSplitterIndex'
            var fnEval = Analysis.Data.fnEval;
            for (var name in fnEval) expression = expression.replace(new RegExp('fn\\.' + name, "gi"), 'Bi.Core.Analysis.Data.fnEval.' + name);

            // Sort columns by string length [ example: 'SalesUnits' (length=10) before 'Sales' (length=5) ]
            Analysis.Data.tools.orderByMaxLength(this.cols).forEach(function (colName) {
                // Note: A column alias is like @1, @2, ..., @Alias (where "Alias" in an number)
                // A valid column name is like MyCol1, MyCol2, ..., Name (where "Name" starts with a letter or the symbol '_')
                // The expression accepts both column alias and column name.
                // But to use a column name in an expression, it must be prefixed by the symbol '@'.
                //
                // Examples:
                // Assuming the dataset has 2 columns named 'product' and 'sales', the following expressions are identicals:
                //      " ' @product sales reach: ' + @sales + ' units' "
                //      " ' @proDuct sales reach: ' + @2 + ' units' "
                //      " ' @1 sales reach: ' + @Sales + ' units' "
                //      " ' @1 sales reach: ' + @2 + ' units' "
                if (/^[a-z_][0-9a-z_]*$/gi.test(colName)) { // Here's the column name pattern :-)
                    expression = expression.replace(new RegExp('@' + colName, "gi"), this.getColAlias(colName));
                }
            }.bind(this));

            // Sort alias by string length [ example: @11 (length=3) before @1 (length=2) ]
            var colAlias = tool.array.unique(expression.match(/@[0-9]+/g) || []).sort(function (a, b) {
                return a.length < b.length ? 1 : a.length > b.length ? -1 : 0;
            });
            var colIndex = [];
            for (idx = 0; idx < colAlias.length; idx++) colIndex[idx] = this.getColIndex(colAlias[idx]);

            // The expression can be customized by a user function (use it to replace translation or context variable...)
            if (replaceFn) expression = replaceFn(expression);

            // For each row, evaluate the result of the expression
            var colData = [], instruction, row = 0;
            noValue = (undefined !== noValue) ? noValue : '';
            try {
                if (!colAlias.length) {
                    // For static expression, just evaluate it once!
                    instruction = expression; // copy
                    colData = new Array(this.safeData.length).fill(eval(instruction));
                } else {
                    // For dynamic expression, evaluate each row!
                    for (row = 0; row < this.safeData.length; row++) {
                        instruction = expression; // copy
                        for (idx = 0; idx < colAlias.length; idx++) {
                            instruction = instruction.replace(new RegExp(colAlias[idx], "g"), this.safeData[row][colIndex[idx]] + '' || noValue);
                        }
                        colData[row] = eval(instruction);
                    }
                }
            } catch (e) {
                var debugCols = [];
                for (idx = 0; idx < this.cols.length; idx++) {
                    // Indent the alias with a tabulation and mark the used columns with the symbol "->".
                    var debugAlias = this.getColAlias(idx),
                        debugPrefix = tool.array.exists(debugAlias, colAlias) ? ' -> ' : '    ';
                    debugCols.push(
                        debugPrefix + debugAlias + ' (' + this.cols[idx] + ') ' +
                        (this.safeData[row] ? (this.safeData[row][idx] || noValue) : '[empty row]')
                    );
                }
                tool.console.error([
                    'Bi.Core.Analysis.evalColExpression (' + e.message + ')',
                    'Expression  : ' + expressionOriginal,
                    'Exp. aliased: ' + expression,
                    'Instruction : ' + instruction,
                    'Cols alias  : ' + colAlias.join(', '),
                    'Cols list   :\n' + debugCols.join('\n')
                ].join('\n') + '\n\n');

                colData = new Array(this.safeData.length); // return an empty column!
            }

            // Set colName parameter to false or null if you just want to get the result (without adding a column)
            if (false !== columnName && null !== columnName) this.addCol(colData, columnName || expressionOriginal, columnIndex);
            return colData;
        },

        addCol: function (colData, colName, colIndex) {
            if (undefined === colIndex) colIndex = this.cols.length;
            this.cols = Analysis.Data.tools.add(this.cols, colName, colIndex);
            this.callOnData(function (d) {
                for (var i = 0; i < this[d].length; i++) this[d][i] = Analysis.Data.tools.add(this[d][i], colData[i], colIndex);
            });
        },

        removeCol: function (colIndex) {
            this.cols = Analysis.Data.tools.remove(this.cols, colIndex);
            this.callOnData(function (d) {
                for (var i = 0; i < this[d].length; i++) this[d][i] = Analysis.Data.tools.remove(this[d][i], colIndex);
            });
        },

        subsetCols: function (colsIndex) {
            if (0 == colsIndex.length) {
                this.cols = [];
                this.data = [];
                this.safeData = [];
                return;
            }
            this.cols = Analysis.Data.tools.subset(this.cols, colsIndex);
            this.callOnData(function (d) {
                for (var i = 0; i < this[d].length; i++) this[d][i] = Analysis.Data.tools.subset(this[d][i], colsIndex);
            });
        },

        // Assuming that:
        //      map = { "@1": var1, "1": var2, "colName3": var3, "unknown": var4, ... }
        // Then the map parameter itself will be modified like this:
        //      map = { "colName1": var1, "colName2": var2, "colName3": var3, "unknown": var4, ... }
        // The operation is destructive on the map parameter and the map is also returned by the method.
        normalizeMapByColName: function (map) {
            for (var col in map) {
                var colName = this.getColName(col);
                if (col === colName || undefined === colName) continue;
                map[colName] = map[col];
                delete map[col];
            }
            return map;
        },

        mapColsTitle: function (titleList, translate) {
            translate = translate || function (title) { return title; };
            var titles = { list: [], map: {} };
            titleList = titleList || []; // titleList should be an array
            for (var i = 0; i < this.cols.length; i++) {
                titles.list[i] = translate(undefined !== titleList[i] ? titleList[i] : this.cols[i]);
                titles.map[this.cols[i]] = titles.list[i];
            }
            return titles; // Notice that this method just return the map and does not create any property (like this.titles)
        },

        getColsWidthPercentage: function (max, titleList) {
            for (var width = [], row = 0; row < this.data.length; row++)
                for (var col = 0; col < this.data[row].length; col++)
                    width[col] = Math.max(width[col] || 0, jQuery('<div>' + this.data[row][col] + '</div>').text().length);
            if (titleList) for (var col = 0; col < width.length; col++) width[col] = Math.max(width[col], (titleList[col] || '').length);
            for (var total = 0, col = 0; col < width.length; col++) total += width[col];
            max = max || 100;
            if (total) for (var col = 0; col < width.length; col++) width[col] = (width[col] / total * max).toFixed(1) + '%';
            return width;
        }

    };
    Analysis.Data.tools = {

        duplicate: function (array) {
            return tool.extend([], array || []);
        },

        add: function (array, item, index) {
            if (array.length <= index || undefined === index) {
                array.push(item);
            } else {
                for (var tmp = [], i = 0; i < array.length; i++) {
                    if (index == i) tmp.push(item);
                    tmp.push(array[i]);
                }
                array = tmp;
            }
            return array;
        },

        remove: function (array, index) {
            if (undefined !== index) for (var i = index; i < array.length - 1; i++) {
                array[i] = array[i + 1];
            }
            array.pop();
            return array;
        },

        subset: function (array, indexes) {
            var newArray = [];
            for (var i = 0; i < indexes.length; i++) {
                if (indexes[i] >= 0 && indexes[i] < array.length) newArray.push(array[indexes[i]]);
            }
            return newArray;
        },

        orderByMaxLength: function (array) {
            return array.concat([]).sort(function (a, b) { // Use concat to preserve the original array
                var a = (a || '').length, b = (b || '').length;
                return (a > b) ? -1 : (a < b) ? 1 : 0;
            });
        }

    };
    Analysis.Data.fnEval = {

        rowSplitterIndex: function (string, index) {
            return tool.string.split(string, ';')[index - 1];
        }

    };

    // Attributes manager
    Analysis.Attributes = function (attributes) {
        this.attr = this.scan(attributes);
    };
    Analysis.Attributes.prototype = {

        clone: function () {
            return new Analysis.Attributes(this.attr);
        },

        scan: function (attributes) {
            if (!tool.is.object(attributes)) {
                tool.console.error('Bi.Core.Analysis.Attributes: Invalid parameter', attributes);
                return {};
            }
            attributes = tool.extend({}, attributes);
            for (var name in attributes) {
                var val = attributes[name];
                if (tool.is.string(val)) {
                    val = tool.string.trim(val);
                    if (/^\[?\s*{/.test(val) && /"/.test(val) && /:/.test(val) && /}\s*\]?$/.test(val)) {
                        // The attribute value looks like an object (plain object or JSON supported)
                        try {
                            var parseVal = JSON.parse(val);
                            attributes[name] = parseVal;
                        } catch (e) {
                            tool.console.error('Bi.Core.Analysis.Attributes: Unable to parse attribute ' +
                                '(' + e.name + ' - ' + e.message + ')\n\t' + name + ' = ' + val, attributes);
                        }
                    } else if (/^\\\\/.test(val)) {
                        // If you really need to avoid parsing an attribute value that matches the object pattern, 
                        // simply prefix it with 2 backslashes!
                        attributes[name] = val.substr(2);
                    }
                }
            }
            return attributes;
        },

        merge: function (attributes, deep) {
            attributes = this.scan(attributes);
            if (!deep) {
                // Overwrite: new attributes overwites the old ones (default behaviour)
                for (var name in attributes) this.attr[name] = attributes[name];
            } else {
                // Merge: when the new attribute and the old one are objects, we are merging they properties
                for (var name in attributes) this.attr[name] = tool.extend(this.attr[name], attributes[name]);
            }
        },

        isDef: function (data) {
            return (undefined !== data);
        },

        isAttr: function (name) {
            return this.isDef(this.attr[name]);
        },

        get: function (name, defVal) {
            if (!arguments.length) {
                return this.attr; // Just a Getter of all attributes
            }
            return this.isAttr(name) ? this.attr[name] : defVal;
        },

        int: function (name, defVal) {
            return this.isAttr(name) ? parseInt(this.attr[name], 10) : (this.isDef(defVal) ? defVal : 0);
        },

        str: function (name, defVal) {
            return this.isAttr(name) ? this.attr[name] : (this.isDef(defVal) ? defVal + '' : '');
        },

        bool: function (name, defVal) {
            return this.isAttr(name) ? ("1" == this.attr[name]) : !!defVal;
        },

        arr: function (name, sep, skipEmpty) {
            if (!this.isAttr(name)) return [];
            if (tool.is.array(this.attr[name])) return this.attr[name];
            //if (tool.is.number(this.attr[name])) this.attr[name] += '';
            if (tool.is.string(this.attr[name])) {
                sep = sep || ';';
                var escape = function (str) {
                    // Note:
                    //     If skipEmpty=true then "a;b;;c" will becomes ["a", "b", "c"] (default behavior)
                    //     If skipEmpty=false then "a;b;;c" will becomes ["a", "b", "", "c"]
                    // Detail:
                    //     Even when skipEmpty=false we expect that "a;b;c;" will becomes ["a", "b", "c"] adn NOT ["a", "b", "c", ""]
                    //
                    // To achieve this, we have to always remove the ";" at the end of the string
                    return str.replace(new RegExp('\\\\' + sep, 'gi'), '_ESC_SEP_')
                            .replace(new RegExp(sep + '\\s*$'), '');
                }, restore = function (escaped) {
                    return escaped.replace(new RegExp('_ESC_SEP_', 'g'), sep);
                };
                var arr = tool.string.split(escape(this.attr[name]), sep, skipEmpty);
                for (var i = 0; i < arr.length; i++) arr[i] = restore(arr[i]);
                return arr;
            }
        },

        map: function (name, sep1, sep2) {
            if (!this.isAttr(name)) return {};
            if (tool.is.object(this.attr[name])) return this.attr[name];
            if (tool.is.string(this.attr[name])) {
                var map = {}, item = tool.string.split(this.attr[name], sep1 || ';');
                for (var i = 0; i < item.length; i++) {
                    var info = tool.string.split(item[i], sep2 || '='), key = info[0], val = info[1];
                    map[key] = val;
                }
                return map;
            }
        },

        startWith: function (name) {
            var attributes = {}, pattern = new RegExp('^' + name);
            for (var n in this.attr) {
                var suffix = n.replace(pattern, '');
                if (suffix != n) attributes[tool.string.trim(suffix)] = this.attr[n];
            }
            return attributes;
        }

    };

    Analysis.extendProto('columnFormatting', function (analysisData, colExp, colFormat, outputInstanceId) {

        // Which column index needs to be formatted ?
        var colIndex = analysisData.getColIndex(colExp);
        if (undefined === colIndex) return;

        // Do we have a factory to enable advanced formatting ?
        // Tip: The "instance" variable should be optional!
        // This variable exports some features from other factory instances
        // Thus, don't forget to check that it's defined before using it...
        var instance;
        if (this.factory &&
            this.factory.has('Context') &&
            this.factory.has('Dashboard') &&
            this.factory.has('Filter')
        ) {
            instance = this.factory.export({
                Context: 'replaceText',
                Dashboard: ['options', 'addBackButton'],
                Filter: ['handleFiltersPropagation', 'triggerSelection'],
                Analysis: 'refreshOutput'
            });
        }

        // Do we have a replaceFn for the method .evalColExpression ?
        var replaceFn = instance ? instance.context.replaceText : undefined;

        // Is a .noValue property defined for a format ?
        var noValue = function (format) { return 'noValue' in format ? format.noValue : undefined; };

        // Ordered list of formatting types
        //
        // There's 3 categories of type:
        //      1. Types like "percentage" simply works on string to transform '1' into '100%'.
        //      2. Types like "filterFilter" works on DOM (jQuery object) to transform 'Hello' into jQuery('<a href="#">Hello</a>').
        //      3. Types like "style" also works on DOM (jQuery object) to transform 'World' into jQuery('<span style="color:red;">World</span>').
        //
        // We need to order the expected types available in the colFormat (JSON) in this exact order!
        // Note: It's important to process the point 2. before the point 3. because if those 2 points are expected the result should be:
        //      '<a href="#" style="color:red;">Hello World!</a>' and NOT '<a href="#"><span style="color:red;">Hello World</span></a>'
        var types = { string: [], link: [], span: [] };
        colFormat.forEach(function (format) {
            if (Analysis.columnFormattingTypes.string[format.type]) {
                types.string.push(format);
            } else if (Analysis.columnFormattingTypes.link[format.type]) {
                types.link.push(format);
            } else if (Analysis.columnFormattingTypes.span[format.type]) {
                types.span.push(format);
            }
        });

        // Bind the getColIndex method (to make it available in the following scope)
        var getColIndex = analysisData.getColIndex.bind(analysisData);

        // Give a scope to each columnFormattingTypes function
        var getScope = function (rowIndex, rowData) {
            return {
                // Contextual properties
                rowIndex: rowIndex,
                rowData: rowData,
                // Global properties
                getColIndex: getColIndex,
                instance: instance,
                outputInstanceId: outputInstanceId
            };
        };

        // Let's process the differents types!

        types.string.forEach(function (format) {

            analysisData.evalColExpression(format.data, false, undefined, noValue(format), replaceFn).forEach(function (value, row) {

                var result = Analysis.columnFormattingTypes.string[format.type].apply(getScope(row, analysisData.data[row]), [
                    analysisData.data[row][colIndex], value, format
                ]);

                if (undefined !== result) analysisData.data[row][colIndex] = result;

            });
        });

        var once = false;
        types.link.forEach(function (format) {
            // The particularity of this type is that only one of them is allowed per column!
            if (once) return;
            once = true;

            analysisData.evalColExpression(format.data, false, undefined, noValue(format), replaceFn).forEach(function (value, row) {

                var $result = Analysis.columnFormattingTypes.link[format.type].apply(getScope(row, analysisData.data[row]), [ 
                    analysisData.data[row][colIndex], value, format
                ]);
                Analysis.columnFormattingCss($result);
                Analysis.columnFormattingCss($result, format.type);

                if (undefined !== $result) analysisData.data[row][colIndex] = $result;

            });

        });

        types.span.forEach(function (format) {

            analysisData.evalColExpression(format.data, false, undefined, noValue(format), replaceFn).forEach(function (value, row) {

                var $data = analysisData.data[row][colIndex];
                // Note: Testing instanceof is equivalent to test once=true|false
                if (!($data instanceof jQuery)) $data = jQuery('<span>').html(analysisData.data[row][colIndex] || '');

                var $result = Analysis.columnFormattingTypes.span[format.type].apply(getScope(row, analysisData.data[row]), [
                    $data, value, format
                ]);
                Analysis.columnFormattingCss($result);
                Analysis.columnFormattingCss($result, format.type);

                if (undefined !== $result) analysisData.data[row][colIndex] = $result;

            });
        });

        // Actually, the analysis data finally contains only string (and not jQuery objects...)
        // TODO: il serait bon de conserver les objet jQuery afin de pouvoir utiliser attacher des evenements...
        for (var value, row = 0; row < analysisData.data.length; row++) {
            if (analysisData.data[row][colIndex] instanceof jQuery) {
                value = analysisData.data[row][colIndex][0];
                analysisData.data[row][colIndex] = value ? value.outerHTML : '';
            }
        }

    });

    Analysis.extendStatic('columnFormattingTypes', {

        // Let's explain the signature of thoses functions:
        //      - "current" represents the current value of the cell (analysisData[row][col])
        //      - "data" is the result of the .evalColExpression method for this cell
        //      - "format" is the configuration object of how the "current" should be formatted
        //
        // In other words, "current" is the input, "data" is the ouput and "format" is how to replace the input with the output!
        // 
        // Tip: In each function the scope "this" is available and contains some usefull properties:
        //      - "rowIndex" property represents the row index of the current cell
        //      - "rowData" property represents the row data of the current analysis (analysisData[row])
        //      - "getColIndex" is the function analysisData.getColIndex() of the current analysis
        //      - "instance" property is an advanced object generated by the method .factory.export()
        //      - "outputInstanceId" property is the current formatted output instance id

        string: {

            percentage: function (current, data, format) {
                // Available format properties: "precision"
                // The range of "current" is between "0" (for 0%) and "data" (for 100%)
                if (current) return parseFloat(100 * current / (data || 1)).toFixed(format.precision || 0) + '%';
            },
            number: function (current, data, format) {
                // Available format properties: "options" = { plus, minus, thousand, decimal, precision }
                if (current) return tool.number.format((current + '').replace(/\s+/g, ''), format.options);
            },
            date: function (current, data, format) {
                // Available format properties: none
                // The "data" represents the Date mask (like "yyyy-mm-dd")
                if (current) try {
                    var date = new Date(current);

                    // IE8 Bug fix (replace '2014-10-11T00:00:00' by '2014/10/11T00:00:00')
                    if (isNaN(date.getTime())) date = new Date(current.replace(/\-/g, '/'));
                    if (isNaN(date.getTime())) throw new Error("Invalid Date");

                    var yyyy = date.getUTCFullYear(), mm = date.getUTCMonth() + 1, dd = date.getUTCDate();
                    var replace = { 'yyyy': yyyy, 'mm': mm > 9 ? mm : "0" + mm, 'dd': dd > 9 ? dd : "0" + dd };
                    data = data || '';
                    for (var search in replace) data = data.replace(search, replace[search]);

                    return data;
                } catch (e) {
                    tool.console.error('Bi.Core.Analysis.columnFormattingTypes.string.date:', e.message, current, data, format);
                }
            }

        },
        link: {

            link: function ($current, data, format) {
                // Available format properties: "dataApplication", "title"
                if (!$current || !data) return;
                if (format.dataApplication) {
                    switch ((format.dataApplication + '').toLowerCase()) {
                        case 'pdf':
                        default:
                            // Test Internet Explorer
                            var isIE = /MSIE|Trident/i.test(window.navigator.userAgent);
                            if (isIE) {
                                // Internet explorer does not support "data:" protocol for "application/pdf"
                                // And also not allows URL with big size length
                                // For this browser we use the plugin pdfjs to display the PDF from base64 data in a modal window.
                                return jQuery('<a></a>').attr({
                                    'href': '#openPdfJs',
                                    'onclick': 'Bi.Core.Analysis.displayPdfJs("' + data + '"); return false;',
                                    'title': format.title
                                }).append($current);
                            } else {
                                // Send base64 data application to the external page
                                // it's designed to force the opening of Safari in iPad when the BI is in WebView mode.
                                return jQuery('<a></a>').attr({
                                    'href': tool.url.ROOT + '/dashboard/resources/ViewDataAppPdf.html#' + data,
                                    'target': '_blank',
                                    'title': format.title
                                }).append($current);
                            }
                            break;
                    }
                } else {
                    // Regular link. In this case, the data represents the full href.
                    return jQuery('<a></a>').attr({
                        'href': data,
                        'target': '_blank',
                        'title': format.title
                    }).append($current);
                }
            },
            dashboardFilter: function ($current, data, format) {
                // Available format properties: "dashboardId", "pageId", "backButton", "title"
                if (!this.instance) {
                    tool.console.warn('Bi.Core.Analysis.columnFormattingTypes.link.dashboardFilter: not available.');
                    return;
                }
                if (!$current) return;
                // Get the Dashboard root url
                var rootUrl = tool.url.ROOT + this.instance.dashboard.options.rootUrl, url;
                // Compose the url
                if (format.dashboardId) {
                    // If the "dashboardId" is static and given in the "format" parameter
                    // then the "data" simply containers the value of "&PropagateFilters="
                    url = rootUrl +
                        '?' + Core.Dashboard.HASH.DASHBOARD + '=' + format.dashboardId +
                        (format.pageId ? '&' + Core.Dashboard.HASH.PAGE + '=' + format.pageId : '') + // The pageId is optional
                        (data ? '&PropagateFilters=' + data : ''); // The optional "data" contains the filters propagation details
                } else {
                    // Otherwise, the "data" should start with "?" and contains the entire hashQueries value, like:
                    //      ?d=1&p=2&PropagateFilters=... (where "d" and "p" are aliases for "dashboardId" and "pageId")
                    // This is more complicated but allow the "dashboardId" and "pageId" to be evaluated...
                    // Kepp in mind that you have to know the settings values of "Core.Dashboard.HASH".
                    url = rootUrl + data;
                }
                var $link = Analysis.columnFormattingStack.get$link(function (event, url) {

                    var href = this.instance.filter.handleFiltersPropagation(url, this.outputInstanceId);
                    // Add back button
                    if (undefined === format.backButton || format.backButton) {
                        this.instance.dashboard.addBackButton(href);
                    }
                    // Goto the next location
                    window.location.href = href;

                }.bind(this), [url]);

                // Note: The href value is just a visual information for debugging purpose
                return $link.append($current).attr('href', url).attr('title', format.title);
            },
            analysisFilter: function ($current, data, format) {
                // Available format properties: "outputId", "column", "title"
                if (!this.instance) {
                    tool.console.warn('Bi.Core.Analysis.columnFormattingTypes.link.analysisFilter: not available.');
                    return;
                }
                if (!$current || !data) return;
                var $link = Analysis.columnFormattingStack.get$link(function (event, otptInstId, column, data) {

                    this.instance.analysis.refreshOutput(otptInstId, undefined, { column: column, value: data });

                }.bind(this), [format.outputId, format.column, data]);

                // Note: The href value is just a visual information for debugging purpose
                return $link.append($current).attr('href', '#analysisFilter?column=' + format.column + '&data=' + data).attr('title', format.title || 'Filter analysis');
            },
            filterFilter: function ($current, data, format) {
                // Available format properties: "selectionType", "filterId", "title"
                if (!this.instance) {
                    tool.console.warn('Bi.Core.Analysis.columnFormattingTypes.link.filterFilter: not available.');
                    return;
                }
                if (!$current || !data) return;
                var selectionType = ('Caption' == format.selectionType) ? 'Caption' : 'Value'; // default type: Value
                var $link = Analysis.columnFormattingStack.get$link(function (event, filterId, selection) {

                    this.instance.filter.triggerSelection[filterId](selection, selectionType);

                }.bind(this), [format.filterId, data]);

                // Note: The href value is just a visual information for debugging purpose
                return $link.append($current).attr('href', '#filterFilter?filterId=' + format.filterId + '&data=' + data).attr('title', format.title || 'Filter analysis');
            },
            // Open a toolbox with some actions.
            //
            // Warning: there's an issue!
            // The 'links' type is based on columns that are formatted by a 'link', 'analysisFilter' or 'filterFilter' type...
            // Thus, the 'links' type SHOULD be invoked ONLY after ALL the columns it refers to has been already formatted...
            // This requirements is NOT actually possible in the application config tool (developed by Sylvain Driancourt).
            // The workaround consist to always define the attribute 'ColumnFormat MyLinks' at the end!
            links: function ($current, data, format) {
                if (!$current) return;
                // Available format properties: "columns", "title"
                var columns = tool.string.split(format.columns, ';');
                if (!columns.length) return;
                for (var actions = [], i = 0; i < columns.length; i++) {
                    columns[i] = this.getColIndex(columns[i]);
                    if (undefined !== columns[i]) actions.push(this.rowData[columns[i]]);
                }
                var $link = Analysis.columnFormattingStack.get$link(function (event, actions) {

                    var popup = Analysis.getPopupSingleton();
                    for (var i = 0; i < actions.length; i++) popup.add(jQuery(actions[i]).removeClass());

                    // In case the Output is a chart or a map, the link is not rendered in the DOM.
                    // So, we need this hack: the links popup will be positionned near the last click event.
                    var pos = Analysis.lastClickPosition,
                        left = event.clientX || pos.clientX,
                        top = event.clientY || pos.clientY,
                        delta = 20;

                    popup.open(left + delta + 'px', top + delta + 'px');

                }, [actions]);
                // Note: The href value is just a visual information for debugging purpose
                return $link.append($current).attr('href', '#links?columns=' + columns.join(',')).attr('title', format.title || 'Open links action');
            }

        },
        span: {
                
            css: function ($current, data, format) {
                if (data) {
                    // Available format properties: none
                    // The "data" represents the css class suffix (the css class prefix is "bi-analysis-formatting-css-")
                    Analysis.columnFormattingCss($current, 'css-' + data);
                    return $current;
                }
            },
            style: function ($current, data, format) {
                // Available format properties: none
                // The "data" represents the style attribute value (like: "color:red")
                if (data) {
                    var style = $current.attr('style') || '';
                    if (style) style = style.replace(/;\s*/, '') + ';';
                    $current.attr('style', style + data);
                    return $current;
                }
            },
            icon: function ($current, data, format) {
                // Available format properties: "replace", "title", "position"
                // Is the icon replacing the cell content ?
                if (format.replace) $current.text('');
                if (!data) return; // no icon in this cell!
                // The data structure is: "icon ; color"
                //      - data[0] = font-awesome icon suffix
                //      - data[1] = optional icon color (based on the css class defined in the "css" formatting)
                data = tool.string.split(data, ';');
                var $icon = jQuery('<i class="fa fa-' + data[0] + '"></i>');
                if (data[1]) Analysis.columnFormattingCss($icon, 'css-' + data[1]);
                // Title
                if (format.title) $icon.attr('title', title);
                // Position
                $current[('left' == format.position) ? 'prepend' : 'append']($icon);
                return $current;
            },
            image: function ($current, data, format) {
                // Available format properties: "replace", "title", "position"
                // Is the image replacing the cell content ?
                if (format.replace) $current.text('');
                if (!data) return; // no image in this cell!
                // Path of the image is relative to a dedicated directory (and the "data" completes it)
                data = (data + '').replace(/^\//, '');
                var $image = jQuery('<img alt="" />').attr('src', tool.url.ROOT + '/dashboard/resources/images/analysis/' + data);
                // Title
                if (format.title) $image.attr('title', title);
                // Position
                $current[('left' == format.position) ? 'prepend' : 'append']($image);
                return $current;           
            },
            sparkline: function ($current, data, format) {
                // Available format properties: "limit", "color", "width", "height", "separator", "type"
                if (format.limit && this.rowIndex > format.limit - 1) {
                    // Due to performances issues on IE, it's possible to limit the number of rendered sparklines
                    $current.html('<span style="color:' + (format.color || '#999') + '">...</span>');
                    return;
                }
                // The cell text represents the sparkline data (like: "5 ; 7 ; 3 ; ...")
                // This text will be replaced by a nice sparkline
                var sparkDiv = jQuery('<div>').css({ width: format.width || '70px', height: format.height || '25px' }),
                    sparkData = tool.string.split($current.text(), format.separator || ';'),
                    sparkAttr = new Analysis.Attributes({ AxisX: 'SparkX', AxisY: 'SparkY', Colors: format.color || '', Type: format.render || '' });

                for (var i = 0; i < sparkData.length; i++) sparkData[i] = [i, sparkData[i]];
                sparkData = new Analysis.Data({ columns: ['SparkX', 'SparkY'], data: sparkData });

                Analysis.display.Sparkline.call(sparkDiv.get(0), sparkData, sparkAttr);
                $current.html(sparkDiv);
                return $current;
            },
            stackedChart: function ($current, data, format) {
                // Available format properties: "separator", "height", "colors", "showValue", "unit"
                // The cell text represents the chart data (like: "5 ; 7 ; 3 ; ...")
                // This text will be replaced by a nice and simple stacked chart
                var stackedData = tool.string.split($current.text(), format.separator || ';');
                $current.html(Analysis.simpleStackedChart(stackedData, format));
                return $current;
            }

        }

    });

    Analysis.extendStatic('columnFormattingCss', function ($current, type) {
        if ($current) {
            $current.addClass(Analysis.LAYOUT.FORMATTING + (type ? '-' + type : ''));
        }
    });

    Analysis.extendStatic('columnFormattingStack', (function () {
        // Prevent multiples triggered events
        var disabled = false, triggered = function () {
            disabled = true;
            setTimeout(function () { disabled = false; }, 250);
        };
        // Prevent default event behavior (for standard browser and IE...)
        var preventDefault = function (event) {
            event = event || window.event;
            event.preventDefault ? event.preventDefault() : (event.returnValue = false);
        };
        var stack = [], methods = {
            // Setter & Getter
            set: function (data) {
                stack.push(data);
                return stack.length - 1; // Return stack index
            },
            get: function (index) {
                return undefined !== index ? stack[index] : stack; // Get stack data (or entire stack)
            },
            // Code generators
            getExp: function (data) {
                return 'Bi.Core.Analysis.columnFormattingStack.get(' + methods.set(data) + ')';
            },
            getOnclickExp: function (fn, param) {
                // "this" refers to the DOM <a> element that is being clicked, and "event" is the mouse click event
                var fnWrap = function (_this, event) {
                    preventDefault(event);
                    if (disabled) return;
                    triggered();
                    // Invoke the original "fn" like an event callback
                    //   - "this" refers to the DOM element 
                    //   - "event" is given as the first argument
                    //
                    // Assuming that the original "param" is an array
                    //   - "param[0]" is given as the second parameter
                    //   - "param[1]" is given as the third parameter
                    //   - ...
                    fn.apply(_this, [event].concat(param));
                };
                fnWrap.toString = function () {
                    return fn.toString(); // Fix .tostring
                };
                return methods.getExp(fnWrap) + '(this, event);';
            },
            get$link: function (fn, param) {
                var exp = methods.getOnclickExp(fn, param),
                    index = stack.length - 1;
                return jQuery('<a></a>').attr({
                    "href": '#',
                    "onclick": exp,
                    "analysis-formatting-stack-index": index
                });
            },
            _checkStack: function () {
                return stack; // Just for debugging purposes...
            }
        };
        /*
        FIXME:  The following assumption is wrong!
                It is only for the jqxGrid that the links are realy a part of the DOM...
                But, for the AmCharts analysis, there are links that exists but NOT in the DOM!!!
                Thus, this important feature can be added... :-(

        // Clean the stack, we assumes that a link that is not available in the DOM can be destroyed...
        setInterval(function () {
            var inDom = [];
            jQuery('[analysis-formatting-stack-index]').each(function () {
                inDom.push(parseInt(jQuery(this).attr('analysis-formatting-stack-index'), 10));
            });
            for (var index = 0; index < stack.length; index++) {
                if (stack[index] && !tool.array.exists(index, inDom)) delete stack[index];
            }
        }, 10000);
        */
        return methods;
    })());

    Analysis.extendStatic({

        // Display a simple horizontal stacked chart using simple html tags
        simpleStackedChart: function (data, format) {
            if (!data.length) return '';
            format = tool.extend({
                height: 18,
                colors: [],
                showValue: true,
                unit: ''
            }, format || {});
            var total = 0, colors = ['#ea8051', '#eacc51', '#00a5a9', '#3ae1aa'];
            data.forEach(function (value, index) {
                total += (data[index] = parseFloat(value));
                if (!format.colors[index]) format.colors[index] = colors[index % colors.length];
            });
            var items = [], totalPercent = 0;
            data.forEach(function (value, index) {
                var valuePercent = parseInt(100 * value / total, 10);
                totalPercent += valuePercent;
                if (index == data.length - 1) valuePercent += 100 % totalPercent;
                items.push(tool.html.tag('span', {
                    "style": [
                        'flex-basis:' + valuePercent + '%',
                        'background:' + format.colors[index]
                    ].join(';')
                }, format.showValue ? '<i>' + value + format.unit + '</i>' : ''));
            });
            return tool.html.tag('div', {
                "class": 'bi-analysis-stacked-chart',
                "style": 'height:' + format.height + 'px'
            }, items.join(''));
        }

    });

    Analysis.extendStatic({

        lastClickPosition: (function () {
            var position = { clientX: undefined, clientY: undefined };
            jQuery(window.document).click(function (e) {
                position.clientX = e.clientX;
                position.clientY = e.clientY;
            });
            position.overwrite = function (clientX, clientY) {
                if (undefined !== clientX) position.clientX = clientX;
                if (undefined !== clientY) position.clientY = clientY;
            };
            return position;
        })(),

        getPopupSingleton: (function () {
            var cssPrefix = Analysis.LAYOUT.OUTPUT,
                $popup = jQuery('<div class="' + cssPrefix + '-links"></div>');
            function add($item) {
                $popup.append(jQuery($item).addClass(cssPrefix + '-links-item'));
            }
            function open(clientX, clientY) {
                $popup.appendTo('body').css('left', clientX).css('top', clientY);
            }
            function close() {
                $popup.remove();
            }
            return function () {
                // Each time the popup is requested, it's removed from the DOM and emptied...
                $popup.html('').remove().on('click', close);
                jQuery('<a href="#" class="' + cssPrefix + '-links-close">x</a>').click(function (e) {
                    e.preventDefault();
                    close();
                }).appendTo($popup);
                return {
                    add: add,
                    open: open,
                    close: close
                };
            };
        })()

    });

    Analysis.extendStatic({

        preprocessCommunAttr: function (analysisData, attributes, replaceFn) {

            // The array of expressions is like:
            // ["MyNewCol1 = <MyExp1>", "MyNewCol2 = <MyExp2>", ...]
            var evalExpressions = function (expressions) {
                expressions.forEach(function (exp) {
                    // In the method Analysis.Data.evalColExpression, 
                    // you will find the column name pattern, which is: [a-z_][0-9a-z_]*
                    var match = exp.match(/^([a-z_][0-9a-z_]*)\s*=\s*/i),
                    colName = match[1], // MyNewCol
                    colExp = exp.substr(match[0].length); // MyExp
                    analysisData.evalColExpression(colExp, colName, undefined, undefined, replaceFn);
                });
            };

            // Special ColumnExpression (before RowSplitter)
            evalExpressions(attributes.arr('ColumnExpressionBeforeRowSplitter'));

            // Generate analysisData from 'RowSplitter' attribute
            // For each row, each listed column should contains the same number of values separated by ';'
            // Each value represents a new row data for this column

            var rowSplitter = attributes.arr('RowSplitter'),
                limit = attributes.arr('RowSplitterLimit');
            if (limit.length) {
                // theRowToSplit = '1; 2; 3; 4; 5; 6; 7; 8; 9';
                // suppose limit[0] = 5 and limit[1] = 7
                // theSliceFunction(limitFrom, limitTo) should return [5, 6, 7]
                var limitFrom = limit[0] ? (limit[0] - 1) : undefined,
                    limitTo = limit[1] || undefined;
            }
            if (rowSplitter.length && analysisData.data.length) try {
                for (var i = 0; i < rowSplitter.length; i++) {
                    var colName = analysisData.getColName(rowSplitter[i]);
                    if (!colName) throw new Error('Invalid column name "' + rowSplitter[i] + '"');
                    rowSplitter[i] = colName;
                }
                var str2Arr = function (s) {
                    for (var a = tool.string.split(s, ';', false), l = a.length, f, i = 0; i < l; i++) {
                        f = tool.string.toNumber(a[i]);
                        if (!isNaN(f)) a[i] = f;
                    }
                    return a;
                };
                var numRowsTotal = Number.MAX_VALUE, numRowsParts = [], _token = true,
                    targetCols = [], targetData = [],
                    cols = analysisData.getCols();
                for (var col = 0; col < cols.length; col++) {
                    if (!tool.array.exists(cols[col], rowSplitter)) continue;
                    for (var newCol = [], row = 0; row < analysisData.data.length; row++) {
                        var cell = str2Arr(analysisData.data[row][col]);
                        if (limit.length) cell = cell.slice(limitFrom, limitTo);
                        if (_token) numRowsParts[row] = cell.length;
                        newCol = newCol.concat(cell);
                    }
                    _token = false;
                    targetCols[col] = newCol;
                    numRowsTotal = Math.min(numRowsTotal, newCol.length);
                }
                for (var col = 0; col < cols.length; col++) {
                    if (tool.array.exists(cols[col], rowSplitter)) continue;
                    for (var newCol = [], row = 0; row < analysisData.data.length; row++) {
                        for (var r = 0; r < numRowsParts[row]; r++) newCol.push(analysisData.data[row][col]);
                    }
                    targetCols[col] = newCol;
                }
                for (var row = 0; row < numRowsTotal; row++) {
                    for (var newRow = [], col = 0; col < targetCols.length; col++) newRow.push(targetCols[col][row]);
                    targetData.push(newRow);
                }
                // Replace the original analysisData
                analysisData = new Analysis.Data({ columns: cols, data: targetData });
            } catch (e) {
                tool.console.error('Bi.Core.Analysis.preprocessCommunAttr: ' + e.message);
            }
            // End of RowSplitter

            // Regular ColumnExpression
            evalExpressions(attributes.arr('ColumnExpression'));

            // Remove rows based on expression evaluation
            var removeRows = attributes.get('RemoveEmptyRows');
            if (removeRows) {
                analysisData.evalColExpression(removeRows, '_RemoveEmptyRows_', undefined, undefined, replaceFn);
                // For each row of the dataset, if the expression is evaluated to true then remove it
                analysisData.grepData('_RemoveEmptyRows_', true, true);
                analysisData.removeCol('_RemoveEmptyRows_');
            }
            /* -- FIXME: c'est bien pour display.Table mais pas pour display.Charts... --
            // Order analysisData by one ore more columns
            // orderBy = [{ col: '@1', order: 'asc' }, { col: '@2', order: 'desc' }, ...]
            var orderBy = attributes.get('OrderBy');
            if (orderBy) analysisData.multiSortRows(orderBy);
            */
            return analysisData;
        },

        // Code example:
        //
        // [DISPLAY_TYPE_FONCTION]: function (analysisData, attributes, output, ...) {
        //     Bi.Core.Analysis.displayChartPreProcess.call(this, analysisData, attributes, function (analysisData, axis, addons) {
        //         // Display the Chart...
        //     });
        // };
        preprocessChartAttr: function (analysisData, attributes, replaceFn, callback) {

            var addons = {};

            var pivotGraphsColors = attributes.arr("PivotGraphsColorsFromDataSource");
            if (pivotGraphsColors.length) {
                var key = analysisData.getColIndex(pivotGraphsColors[0]), // This should refers to one of the axis.y values (after the pivot process)
                    val = analysisData.getColIndex(pivotGraphsColors[1]); // This refers to a color (like #00ff00)
                for (var pivotGraphsColorsMap = {}, i = 0; i < analysisData.data.length; i++) {
                    if (analysisData.data[i][key] in pivotGraphsColorsMap) continue;
                    pivotGraphsColorsMap[analysisData.data[i][key]] = analysisData.data[i][val]; // Store the colors map
                }
                addons.pivotGraphsColorsMap = pivotGraphsColorsMap;
            }

            var $target = this, axis = { x: undefined, xTitle: undefined, y: [], yTitle: [] };

            // TODO: le processus était asynchrone à cause du PivotTable
            // Mais désormais, PivotTable est synchrone.
            // Donc on peut retirer cette enveloppe...
            var core = new Core().then(function () {

                // AxisX
                axis.x = analysisData.getColName(attributes.get("AxisX"));
                axis.xTitle = replaceFn(attributes.get("AxisXTitle", ''));

                if (!attributes.isAttr("PivotY")) {

                    // AxisY (from direct database attribute)
                    axis.y = attributes.arr("AxisY");
                    axis.yTitle = attributes.arr("AxisYTitle", ";", false); // Do not skipEmpty!
                    axis.yTitle.forEach(function (t, i) { axis.yTitle[i] = replaceFn(t); });

                } else this.then(function () {

                    var pivot = addons.pivotTable = new tool.PivotTable(analysisData.getMap());
                    pivot.addRow(axis.x);

                    var pivotY = attributes.get("PivotY") || []; // [{ col: "", sortType: "", sortKey: "" }, ...]
                    if (pivotY.length) {
                        for (var i = 0; i < pivotY.length; i++) {
                            pivotY[i].col = analysisData.getColName(pivotY[i].col);
                            if (pivotY[i].sortKey) pivotY[i].sortKey = analysisData.getColName(pivotY[i].sortKey);

                            pivot.addCol(pivotY[i].col, pivotY[i].sortType, pivotY[i].sortKey);
                        }
                    } else {
                        pivot.addTotalCols();
                    }

                    // Retrieve PivotIndicators
                    var pivotIndicators = attributes.arr("PivotIndicators", ';');
                    for (var i = 0; i < pivotIndicators.length; i++) {
                        pivotIndicators[i] = tool.string.split(pivotIndicators[i], ',');
                        var col = analysisData.getColName(pivotIndicators[i][0]),
                            type = pivotIndicators[i][1],
                            title = pivotIndicators[i][2],
                            alias = pivotIndicators[i][3],
                            emptyValue = pivotIndicators[i][4];

                        pivot.addIndicator(col, type, title, alias, emptyValue);
                    }

                    /////////////////
                    // NEW VERSION //

                    // Overwrite data
                    analysisData = new Analysis.Data(database.format.fromJson(pivot.getJson()));
                    // Set axis
                    axis.y = pivot.getJsonCols();
                    for (var col = 0; col < pivot.nested.cols.length; col++)
                        for (var i = 0; i < pivot.indicators.length; i++)
                            axis.yTitle.push(pivot.getJsonColAlias(col));

                    core.done();

                    //////////////////////
                    // PREVIOUS VERSION //

                    //pivot.getJson(function (json) {
                    //    //console.log(this); // Note that "this" represents the instance of Bi.tools.PivotTable

                    //    analysisData = new Analysis.Data(database.format.fromJson(json)); // Overwrite !

                    //    axis.y = this.getJsonCols();
                    //    for (var col = 0; col < this.nested.cols.length; col++)
                    //        for (var i = 0; i < this.indicators.length; i++)
                    //            axis.yTitle.push(this.getJsonColAlias(col));

                    //    core.done();
                    //});
                });
                this.done();

            }).then(function () {

                // Eval axis.y and get axis.yTitle translations
                for (var i = 0; i < axis.y.length; i++) {
                    axis.y[i] = analysisData.getColName(axis.y[i]);
                    axis.yTitle[i] = axis.yTitle[i] || ''; // previous version: replaceFn(axis.yTitle[i] || '');
                }
                while (axis.yTitle.length > axis.y.length) axis.yTitle.pop(); // Simple security
                this.done();

            }).onComplete(function () {

                // Display the chart !
                callback.call($target, analysisData, axis, addons);

            });
        }

    });

    Analysis.extendStatic({

        displayPdfJs: function (value) {
            // Convert to binary
            var data = 'data:application/pdf;base64,' + value,
                binary = convertDataURIToBinary(data);
            // Create iframe
            var $iframe = jQuery('<iframe>').on('load', function () {
                // Load PDF file from binary in viewer
                var frame = window.frames[0];
                frame.PDFJS.getDocument(binary).then(function (pdf) {
                    frame.PDFView.load(pdf, 1);
                });
            }).css({
                'border': 'none', 'width': '99%', 'height': '99%'
            });
            // Display iframe in a modal window
            jQuery('<div>').appendTo('body').biModal({
                content: $iframe,
                title: 'PDF viewer',
                width: '90%',
                height: '800px'
            });
            // Load pdfjs viewer in iframe (with "?file=" to tell that there's no file to load directly)
            $iframe.attr('src', 'plugins/pdfjs/web/viewer.html?file=');

            function convertDataURIToBinary(dataURI) {
                var BASE64_MARKER = ';base64,',
                    base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length,
                    base64 = dataURI.substring(base64Index),
                    raw = window.atob(base64),
                    rawLength = raw.length,
                    array = new window.Uint8Array(new window.ArrayBuffer(rawLength));
                for (var i = 0; i < rawLength; i++) array[i] = raw.charCodeAt(i);
                return array;
            }
        },

        exportData2Csv: function (analysis, opts) {

            opts = tool.extend({
                str: '"',       // String delimiter
                col: ';',       // Column delimiter
                row: '\r\n',    // Row delimiter
                indexes: [],    // List of columns indexes to include in the CSV
                titles: []      // Title of each included column
            }, opts || {});

            var csv = [];

            var skipCol = opts.indexes && opts.indexes.length ? function (index) {
                // Use non-strict comparaison to match index against the indexes values
                for (var i = 0; i < opts.indexes.length; i++) if (index == opts.indexes[i]) return false;
                return true;
            } : false;

            var escapeStr;
            try {
                // Kown issue: it might be an invalid regular expression
                var replace = opts.str ? {
                    // Escape string delimiter
                    exp: new RegExp(opts.str, 'g'),
                    val: opts.str + opts.str
                } : {
                    // Escape column and row delimiters
                    exp: new RegExp(opts.col + '|' + opts.row, 'g'),
                    val: ' '
                };
                escapeStr = function (col) { return (col + '').replace(replace.exp, replace.val); };
            } catch (e) {
                escapeStr = function (col) { return (col + ''); };
                tool.console.error('Bi.Core.Analysis.exportData2Csv: unable to escape data properly', analysis, opts, e);
            }

            var getCsvRow = function (row, bypass) {
                var csvRow = [];
                row.forEach(function (col, index) {
                    if (!bypass && skipCol && skipCol(index)) return;
                    csvRow.push(escapeStr(col));
                });
                return opts.str + csvRow.join(opts.str + opts.col + opts.str) + opts.str;
            };

            // Add columns to csv
            if (opts.titles) {
                csv.push(getCsvRow(opts.titles, true));
            } else if (tool.is.array(analysis.cols)) {
                csv.push(getCsvRow(analysis.cols));
            }

            // Add data to csv
            // Careful: this function works on the .safeData property (not on the .data property)
            if (tool.is.array(analysis.safeData)) analysis.safeData.forEach(function (row) {
                csv.push(getCsvRow(row));
            });

            return csv.join(opts.row);
        },

        exportData2CsvLink: function (analysisData, filename, options) {
            var csv = Analysis.exportData2Csv(analysisData, options);
            // UTF-8 BOM (to open the CSV in Excel without specials characters encoding issues)
            var utf8bom = '\uFEFF';
            if (Bi.database.run.isMode('remote')) {
                // When the server is available, do the trick in the safest way...
                return jQuery(
                        '<form data-biz-analysis="export-csv" method="post" target="_blank">' +
                            '<input type="hidden" name="csv" value="' + encodeURIComponent(csv) + '" />' +
                            '<input type="hidden" name="filename" value="' + filename + '" />' +
                            '<button class="bi-form-no-style"><i class="fa fa-file-excel-o"></i></button>' +
                        '</form>'
                    ).attr({ action: tool.url.ROOT + '/api/bi/getAsCsv', title: filename });
            } else {
                // Otherwise, do the trick using the "data:" protocol (might not work in IE)
                return jQuery('<a data-biz-analysis="export-csv"></a>')
                    .attr({ href: '#', title: filename })
                    .append('<i class="fa fa-file-excel-o"></i>')
                    .on('click', function (e) {
                        jQuery(this).attr({
                            'download': filename || 'analysis.csv',
                            'href': 'data:text/csv;charset=utf-8,' + encodeURIComponent(utf8bom + csv),
                            'target': '_blank'
                        });
                    });
            }
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
