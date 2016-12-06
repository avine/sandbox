
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Analysis = Bi.Core.Analysis;

    // "DisplayType" methods (Analysis module extension)
    // (by convention, prefix your helper methods by "_", like: Analysis.display._myHelper = ...)
    Analysis.display = {};

    Analysis.display.NoData = function (analysisData, attributes, tools, finish) {
        jQuery(this).html('<div class="bi-analysis-nodata"><i class="fa fa-3x fa-bar-chart"></i></div>');
        finish();
    };

    Analysis.display.QueryResult = function (analysisData, attributes, tools, finish) {
        /*
        // Uncomment to add some basic features...
        analysisData = Analysis.preprocessCommunAttr(analysisData, attributes, tools.replaceText);

        var colsFormat = attributes.startWith('ColumnFormat');
        for (var col in colsFormat) (function (colExp, colFormat) {
            tools.columnFormatting(analysisData, colExp, colFormat);
        })(analysisData.getColName(col), colsFormat[col]);
        */
        jQuery(this).html(tool.html.table({
            cols: analysisData.getCols(),
            rows: analysisData.getData(),
            className: 'bi-table-100pc'
        }));
        finish();
    };

    // Attributes:
    // Row, Column, Type
    Analysis.display.Url = function (analysisData, attributes, tools, finish) {
        var iframe = jQuery('<iframe frameborder="0">').css({
            overflow: "auto",
            width: '100%',
            height: '100%'
        });
        var row = attributes.int('Row', 0),
            col = analysisData.getColIndex(attributes.get('Column', 0));
        if (analysisData.data[row] && analysisData.data[row][col]) {
            var url = analysisData.data[row][col],
                type = attributes.get('Type');
            if (type) url = 'data:application/' + type + ';base64,' + url;
            iframe.attr("src", url);
        } else {
            tool.console.error('Bi.Core.Analysis.display.Url: Invalid row/column = ' + row + '/' + col);
        }
        jQuery(this).css("overflow", "hidden").html(iframe);
        finish();
    };

    // Attributes:
    // Agregate, OrderBy, ColumnOrder, ColumnHierarchy, ColumnFormat, RowsTree, RowsTreeDefaultExpanded,
    // ColumnTitle, ColumnWidth, ColumnAlign, TableWidthInPercentage, FirstColumnPinned, ShowHeader, ColumnResize,
    // SelectionMode, Pagination, Sort, Grouping, GroupingHeader, GroupingExpandAll
    Analysis.display.Table = function (analysisData, attributes, tools, finish) {
        analysisData = Analysis.preprocessCommunAttr(analysisData, attributes, tools.replaceText);

        var agregate = attributes.get('Agregate');
        if (agregate) analysisData.agregate(agregate);

        // Order Dataset by one ore more columns
        var orderBy = attributes.get('OrderBy'); // orderBy = [{ col: '@1', order: 'asc' }, { col: '@2', order: 'desc' }, ...]
        if (orderBy) analysisData.multiSortRows(orderBy);

        // Column order (when available only ordered columns are displayed)
        // Important notice in case the TreeGrid is used:
        //      - The columns used to process the tree ("keyDataField" and "parentDataField") should be included in the ordered columns
        //      - But, in the final displayed grid, those 2 columns will be hidden
        var orderedData,
            columnOrder = attributes.arr('ColumnOrder');
        if (columnOrder.length) {
            for (var i = 0; i < columnOrder.length; i++) {
                columnOrder[i] = analysisData.getColIndex(columnOrder[i]);
            }
            orderedData = analysisData.clone();
            orderedData.subsetCols(columnOrder);
        } else {
            orderedData = analysisData;
        }

        // Column hierarchy (columns of the same group must be contiguous)
        var hierarchy = attributes.startWith('ColumnHierarchy'), columnHierarchy = {}, columnGroups = [], columnGroup = {};
        for (var key in hierarchy) {
            var cols = tool.string.split(hierarchy[key], ';');
            for (var i = 0; i < cols.length; i++) {
                var colName = orderedData.getColName(cols[i]);
                if (colName) cols[i] = colName;
            }
            key = tool.string.split(key, ',');
            var groupTitle = (key[0] || '').replace(/^\s*"|"\s*$/g, ''), // The group title is embedded inside (like "MyTitle")
                groupName = key[1]; // The group name is required!
            groupTitle = tools.replaceText(groupTitle);
            columnHierarchy[groupName] = { title: groupTitle, cols: cols };

            // Group definition (for jqxGrid)
            columnGroups.push({ text: groupTitle, name: groupName, align: 'center' });
        }
        for (var groupName in columnHierarchy) {
            // List of columns in this group
            var cols = columnHierarchy[groupName].cols;
            for (var i = 0; i < cols.length; i++) {
                if (cols[i] in columnHierarchy) { // This column refers to a groupName
                    for (var j = 0; j < columnGroups.length; j++) {
                        if (cols[i] == columnGroups[j].name) columnGroups[j].parentgroup = groupName; // Add parent group
                    }
                } else if (orderedData.getColName(cols[i])) { // This is a regular column
                    columnGroup[cols[i]] = groupName; // Associate this column to this group (for jqxGrid)
                } else {
                    tool.console.error('Bi.Core.Analysis.display.Table: Invalid OutputAttribute "ColumnHierarchy"',
                        '\n\nThe defined hierarchy is:', columnHierarchy,
                        '\n\nThe available columns are:\n\t' + orderedData.cols.join('\n\t'),
                        '\n\nBut the column "' + cols[i] + '" does not refer to a column or a group!');
                }
            }
        }

        // Column format
        var colsFormat = attributes.startWith('ColumnFormat');
        for (var col in colsFormat) (function (colExp, colFormat) {
            tools.columnFormatting(analysisData, colExp, colFormat);
        })(orderedData.getColName(col), colsFormat[col]); // Carefull: col refers to an orderedData column (not an analysisData column)

        // After applying the column formatting, update the orderedData
        if (columnOrder.length) {
            orderedData = analysisData.clone();
            orderedData.subsetCols(columnOrder);
        } else {
            orderedData = analysisData;
        }

        // Use TreeGrid ?
        var rowsTree = attributes.get('RowsTree'), treeSourceHierarchy = {}, treeHiddenColumns = undefined, useTreeGrid = false;
        if (rowsTree) {
            var colIdIndex = orderedData.getColIndex(rowsTree.id),
                colParentIdIndex = orderedData.getColIndex(rowsTree.parentId),
                colIdName = orderedData.getColName(rowsTree.id),
                colParentIdName = orderedData.getColName(rowsTree.parentId),
                parentIdValues = [];
            for (var i = 0; i < orderedData.data.length; i++) {
                if (orderedData.data[i][colParentIdIndex] == orderedData.data[i][colIdIndex]) {
                    orderedData.data[i][colParentIdIndex] = null;
                } else {
                    var colParentIdValue = orderedData.data[i][colParentIdIndex];
                    tool.array.exists(colParentIdValue, parentIdValues) || parentIdValues.push(colParentIdValue);
                }
            }
            treeSourceHierarchy = {
                keyDataField: { name: colIdName },
                parentDataField: { name: colParentIdName }
            };
            treeHiddenColumns = { name: [colIdName, colParentIdName], index: [colIdIndex, colParentIdIndex] };
            useTreeGrid = true;

            // Add a column called "expanded" that tells jqxTreeGrid which row is expanded by default
            var defaultExpanded = attributes.get('RowsTreeDefaultExpanded');
            if (defaultExpanded) {
                defaultExpanded = analysisData.getColIndex(defaultExpanded);
                for (var expanded = [], i = 0; i < analysisData.data.length; i++) {
                    // Notice: The index "defaultExpanded" is relative to analysisData (because it's obviously not a part of orderedData)
                    var expandedExpected = analysisData.data[i][defaultExpanded],
                        // Notice: As before, the index "colIdIndex" is relative to orderedData
                        haveChilds = tool.array.exists(orderedData.data[i][colIdIndex], parentIdValues);
                    // JqWidget bug fix: in case (expandedExpected=1 and haveChilds=false) the widget behavior is broken
                    // For this reason, only items that have children can have expandedExpected=1
                    expanded.push(expandedExpected && haveChilds);
                }
                orderedData.addCol(expanded, "expanded");
                treeHiddenColumns.name.push("expanded");
                treeHiddenColumns.index.push(orderedData.cols.length - 1);
            }
        }

        // Jqx data adapter
        var source = {
            localdata: orderedData.getMap(),
            datatype: "json",
            hierarchy: treeSourceHierarchy
        },
        dataAdapter = new jQuery.jqx.dataAdapter(source, {
            loadComplete: function (data) { },
            loadError: function (xhr, status, error) { }
        });

        // jqWidget function
        var jqxFunction = useTreeGrid ? 'jqxTreeGrid' : 'jqxGrid';

        if (!tools.isRefresh || !jQuery(this).children('.jqx-grid').size()) {

            // Columns
            var columns = [],
                titles = orderedData.mapColsTitle(attributes.arr("ColumnTitle", ";", false), tools.replaceText), // Do not skipEmpty!
                colsWidth = attributes.arr('ColumnWidth', ";", false), // Do not skipEmpty!
                colsAlign = attributes.arr('ColumnAlign', ";", false), // Do not skipEmpty!
                colsLength = orderedData.getCols().length;
            if (colsWidth.length) {
                // Fill missing columns width
                for (var i = colsWidth.length; i < colsLength; i++) colsWidth[i] = colsWidth[colsWidth.length - 1];
            } else {
                if (useTreeGrid) {
                    for (var tmpData = orderedData.clone(), i = 0; i < treeHiddenColumns.index.length; i++) {
                        // Remove the hidden columns before evaluate the columns widths...
                        tmpData.removeCol(treeHiddenColumns.index[i]);
                    }
                    var tmpColsWidth = tmpData.getColsWidthPercentage(attributes.int('TableWidthInPercentage', 100));
                    for (var j = 0, i = 0; i < colsLength; i++) {
                        if (tool.array.exists(i, treeHiddenColumns.index)) {
                            colsWidth[i] = null; // This column will be hidden !
                        } else {
                            colsWidth[i] = tmpColsWidth[j++];
                        }
                    }
                    tmpData = tmpColsWidth = undefined;
                } else {
                    colsWidth = orderedData.getColsWidthPercentage(attributes.int('TableWidthInPercentage', 100), titles.list);
                }
            }
            // Fill missing columns align
            colsAlign.length || colsAlign.push('left');
            for (var i = colsAlign.length; i < colsLength; i++) colsAlign[i] = colsAlign[colsAlign.length - 1];

            var firstColumnPinned = attributes.bool('FirstColumnPinned', false);

            for (var field in titles.map) (function (field) {
                if (useTreeGrid && tool.array.exists(field, treeHiddenColumns.name)) return;
                // definition
                var col = { text: titles.map[field], datafield: field, width: colsWidth.shift() };
                // cell alignement
                col.cellsalign = colsAlign.shift();
                // header alignement (you can choose between copy the cell alignement or set static 'center' value)
                col.align = 'center'; // = col.cellsalign;
                // column group
                if (columnGroup[field]) col.columngroup = columnGroup[field];
                // class name
                col.cellclassname = function (row, column, value, data) {
                    try {
                        // Perhaps the value is just a string that represents a text (without any tag)
                        // So, we need to try to call jQuery on this value...
                        var className = jQuery(value).attr('class');
                    } catch (e) {
                        return;
                    }
                    if (!className) return;
                    className = className.split(/\s+/);
                    for (var i = 0; i < className.length; i++) {
                        // Return the first className that starts with: "bi-analysis-formatting-css-"
                        // For example, in the Bi css stylesheet there's something like:
                        //  .bi-analysis-formatting-css-bg-red { background-color: red; }
                        if (/^bi\-analysis\-formatting\-css\-/.test(className[i])) return className[i];
                    }
                };
                if (firstColumnPinned) {
                    col.pinned = true;
                    firstColumnPinned = false;
                }
                columns.push(col);
            })(field);

            // Settings
            var basics = {
                source: dataAdapter,
                columns: columns,
                theme: 'metro',
                altrows: true,
                showheader: attributes.bool('ShowHeader', true)
            },
            advanced = {
                columnsresize: attributes.bool("ColumnResize", false),
                selectionmode: attributes.get('SelectionMode', 'none'),
                pageable: !!attributes.int("Pagination", 0),
                pagesize: attributes.int("Pagination", 0)
            };
            if (columnGroups.length) {
                basics.columngroups = columnGroups;
            }
            basics.width = '100%';
            basics.height = '100%';
            jQuery(this).css('overflow', 'hidden'); // Remove the container scrollbar (use only the jqxGrid scrollbar)

            // Sortable
            advanced.sortable = attributes.bool("Sort", false);
            if (!useTreeGrid && advanced.sortable) advanced.autoshowcolumnsmenubutton = false; // For touch device

            // Grouping
            var grouping = attributes.arr('Grouping');
            if (grouping.length) {
                var groups = [];
                for (var i = 0; i < grouping.length; i++) {
                    var grp = orderedData.getColName(grouping[i]);
                    grp ? groups.push(grp) : tool.console.error('Bi.Core.Analysis.display.Table: invalid column reference in Grouping attribute = "' + grouping[i] + '"');
                }
                advanced.groups = groups;
                advanced.groupable = true;
                advanced.showgroupsheader = attributes.bool("GroupingHeader", false);
            }

            // Let's display the grid in a new div
            var $div = jQuery('<div>').appendTo(this)[jqxFunction](jQuery.extend({}, basics, advanced));

            // Grouping: call 'expandallgroups' function if requested
            if (advanced.groupable && attributes.bool("GroupingExpandAll", false)) $div[jqxFunction]('expandallgroups');
        } else {
            var $childs = jQuery(this).children();
            $childs[jqxFunction]({ source: dataAdapter });
            $childs[jqxFunction]('refresh');
        }

        // Export to CSV
        Analysis.display._addExportData2CsvButton(tools.$title, orderedData, attributes, tools.replaceText);

        finish();
    };

    // Attributes:
    // Rows, Columns, TotalRows, TotalCols, Indicators, IndicatorsNumPerRow, IndicatorsDisabled, IndicatorFormat
    Analysis.display.PivotTable = function (analysisData, attributes, tools, finish) {
        // Start pivot
        var pivot = new tool.PivotTable(analysisData.getMap());
        // Add axis
        var config = {
            rows: attributes.get('Rows', []),
            cols: attributes.get('Columns', [])
        };
        for (var axis in config) {
            for (var i = 0; i < config[axis].length; i++) {
                var a = config[axis][i],
                    aCol = analysisData.getColName(a.col),
                    aSortKey = a.sortKey ? analysisData.getColName(a.sortKey) : undefined;
                pivot._addAxis(axis, aCol, a.sortType, aSortKey, a.total);
            }
        }
        // Add total
        var totalRows = attributes.get('TotalRows'),
            totalCols = attributes.get('TotalCols');
        if (totalRows) pivot.addTotalRows(totalRows);
        if (totalCols) pivot.addTotalCols(totalCols);
        // Add indicators
        var indicators = attributes.get('Indicators');
        if (indicators) {
            indicators = tool.string.split(indicators, ';');
            for (var i = 0; i < indicators.length; i++) {
                var indicator = tool.string.split(indicators[i], ','),
                    col = analysisData.getColName(indicator[0]),
                    type = indicator[1],
                    title = tools.replaceText(indicator[2] || ''),
                    alias = indicator[3],
                    emptyValue = indicator[4];

                pivot.addIndicator(col, type, title, alias, emptyValue);
            }

            // Indicators setting
            pivot.setOptions({
                htmlIndicatorsPerRow: attributes.int('IndicatorsNumPerRow', 2)
            });

            var indicatorDisabled = attributes.arr('IndicatorsDisabled');

            // Column formatting for indicators in each Pivot slot
            var indicatorFormat = attributes.startWith('IndicatorFormat');
            pivot.setIndicatorsRender(function (values, titles, alias, numPerRow, classPrefix) {
                // Custo
                var renderData = new Analysis.Data(database.format.fromJson([this])); // Inside the function "this" contains the json slot
                for (var indicatorAlias in indicatorFormat) {
                    tools.columnFormatting(renderData, indicatorAlias, indicatorFormat[indicatorAlias]);
                }
                var renderMap = renderData.getMap()[0],
                    indicatorAliasList = pivot.getJsonIndicatorsAlias();
                // Replace the indicators values with the formatted values
                for (var i = 0; i < values.length; i++) {
                    values[i] = renderMap[indicatorAliasList[i]];
                }
                // Remove disabled indicators
                if (indicatorDisabled.length) {
                    for (var i = 0; i < alias.length; i++) if (tool.array.exists(alias[i], indicatorDisabled)) {
                        values.splice(i, 1);
                        titles.splice(i, 1);
                        alias.splice(i, 1);
                        i--;
                    }
                }
                // Call the original function
                return tool.PivotTable.settings.indicatorsRender.call(this, values, titles, alias, numPerRow, classPrefix);
            });

        }
        // Process pivot
        jQuery(this).html(pivot.getHtml());

        finish();
    };

    // Attributes:
    // OrderBy, AxisYFormat, PivotColDefault, ColorRanges, Tooltip, ColorField, Legend,
    // ShowCategoryAxis, ValueAxes, Guides, LabelRotation, Depth3D, Angle, Rotate, ColumnFormat
    Analysis.display.Charts = function (analysisData, attributes, tools, finish) {
        if (tools.isRefresh) {
            try {
                jQuery(this).data('storedChart').write(this);
                finish();
                return;
            } catch (e) {
                tool.console.error('Bi.Core.Analysis.display.Charts: unable to refresh outputInstanceId = ' + tools.outputInstanceId);
                jQuery(this).html('');
            }
        }
        analysisData = Analysis.preprocessCommunAttr(analysisData, attributes, tools.replaceText);
        Analysis.preprocessChartAttr.call(this, analysisData, attributes, tools.replaceText, function (analysisData, axis, addons) {

            // Order Dataset by one ore more columns
            var orderBy = attributes.get('OrderBy'); // orderBy = [{ col: '@1', order: 'asc' }, { col: '@2', order: 'desc' }, ...]
            if (orderBy) analysisData.multiSortRows(orderBy);

            // Get the graphFormat for each axis.y
            var graphFormat = attributes.startWith('AxisYFormat'), graphFormatDefault;
            analysisData.normalizeMapByColName(graphFormat);
            if ('PivotColDefault' in graphFormat) {
                graphFormatDefault = graphFormat['PivotColDefault'];
                delete graphFormat['PivotColDefault'];
            }
            // Duplicate the PivotColDefault for each axis.y
            if (graphFormatDefault && addons.pivotTable) {
                for (var i = 0; i < axis.y.length; i++) if (!graphFormat[axis.y[i]]) {
                    var gfd = tool.extend(null, graphFormatDefault);
                    // We want to be able to customize the graph color (this is the "lineColor" property in amchart graph object)
                    var lineColorExp = graphFormatDefault['lineColor']; // Should be evaluable (example: " @1 < 0 'blue' : 'green' ")
                    if (lineColorExp) {
                        var pvtNestedCols = addons.pivotTable.getNestedCols(i),
                            pvtData = new Analysis.Data(database.format.fromJson([pvtNestedCols])),
                            lineColor = pvtData.evalColExpression(lineColorExp);
                        if (lineColor[0]) {
                            gfd.lineColor = lineColor[0];
                        }
                    }
                    graphFormat[axis.y[i]] = gfd;
                }
            }

            // Another way to customize the "lineColor" property in amchart graph object
            var colorRanges = attributes.arr('ColorRanges'), colorsList = [];
            if (colorRanges.length) colorsList = tool.colorRanges(colorRanges, axis.y.length);

            // Get each graph tooltip (if available)
            var tooltip = attributes.startWith('Tooltip');
            analysisData.normalizeMapByColName(tooltip);
            if ('' in tooltip) {
                var tooltipDefault = tooltip[''];
                delete tooltip[''];
                for (var i = 0; i < axis.y.length; i++) {
                    if (axis.y[i] in tooltip) continue;
                    tooltip[axis.y[i]] = tooltipDefault;
                }
            }
            for (var axisY in tooltip) tooltip[axisY] = (function (tooltip) {
                if (!addons.pivotTable) {
                    return function (graphDataItem) { // balloon fonction (for amchart)
                        var data = new Analysis.Data(database.format.fromJson([graphDataItem.dataContext])),
                            balloon = data.evalColExpression(tooltip); // tooltip should be evaluable
                        if (balloon[0]) return balloon[0];
                    };
                } else {
                    return function (graphDataItem) { // balloon fonction (for amchart)
                        // Retrieve the slot coordinates
                        var row = graphDataItem.index,
                            col = addons.pivotTable.getJsonColIndex(graphDataItem.graph.valueField);

                        var pvtSlot = addons.pivotTable.getJsonSlot(row, col),
                            pvtData = new Analysis.Data(database.format.fromJson([pvtSlot])),
                            balloon = pvtData.evalColExpression(tooltip); // tooltip should be evaluable

                        if (balloon[0]) return balloon[0];
                    };
                }
            })(tooltip[axisY]);

            // Set amchart graphs
            var graphs = [];
            for (var i = 0; i < axis.y.length; i++) (function (i) {

                // IMPORTANT: on ne garde que les graphes du premier indicateur
                // Cependant, tous les indicateurs sont disponibles dans le Tooltip !
                if (addons.pivotTable && 0 !== i % addons.pivotTable.indicators.length) return;
                // end

                var axisY = analysisData.getColName(axis.y[i]),
                graph = {
                    valueField: axisY,
                    title: axis.yTitle[i]
                    //,type: "line"; // Available types: "line", "column", "step", "smoothedLine"
                };
                if (tooltip[axisY]) {
                    graph.balloonFunction = tooltip[axisY];
                } else {
                    graph.balloonText = '[[title]]:<br><b style="font-size:1.4em">[[value]]</b>';
                }
                if (graphFormat[axisY]) {
                    tool.extend(graph, graphFormat[axisY]);
                }
                if ('labelText' in graph) {
                    // Notice: To reference columns in the labelText, use the syntax [[COL]]
                    // For example: graph.labelText = ' The number of doctors is: <b>[[COL_COUNT_DOCS]]</b>';

                    if (!('labelPosition' in graph)) graph.labelPosition = 'middle';
                }
                if (!('lineColor' in graph)) {
                    if (colorsList.length) {
                        graph.lineColor = colorsList[i];
                    } else if (addons.pivotGraphsColorsMap && addons.pivotTable) {
                        var pvtNestedCols = addons.pivotTable.getNestedCols(i);
                        for (var col in pvtNestedCols) {
                            var mapKey = pvtNestedCols[col];
                            break; // Take the value of the first property (this is first PivotY column)
                        }
                        if (mapKey in addons.pivotGraphsColorsMap) graph.lineColor = addons.pivotGraphsColorsMap[mapKey];
                    }
                }
                var colorField = analysisData.getColName(attributes.get('ColorField'));
                if (colorField) {
                    graph.colorField = colorField;
                }
                graphs.push(graph);
            })(i);

            // Legend
            var legend = attributes.get('Legend', false);
            if (false !== legend) legend = { "useGraphSettings": true, "position": legend || 'bottom' };

            // Force items in category axis to be shown
            var showCategoryAxis = attributes.get('ShowCategoryAxis'), forceShowField = undefined;
            if (showCategoryAxis) {
                if (tool.array.exists(showCategoryAxis, ['<all>', '<first|last>', '<first>', '<last>'])) {

                    var forceShowData = [], forceShowDefaultValue = ('<all>' == showCategoryAxis ? true : false);
                    for (var i = 0; i < analysisData.data.length; i++) forceShowData[i] = forceShowDefaultValue;

                    if (tool.array.exists(showCategoryAxis, ['<first|last>', '<first>'])) forceShowData[0] = true;
                    if (tool.array.exists(showCategoryAxis, ['<first|last>', '<last>'])) forceShowData[analysisData.data.length - 1] = true;

                    forceShowField = '_force_show_field_';
                    analysisData.addCol(forceShowData, forceShowField);

                } else if (forceShowField = analysisData.getColName(showCategoryAxis)) { // Assuming that the showCategoryAxis represents an analysisData column

                    for (var fieldIndex = analysisData.getColIndex(showCategoryAxis), i = 0; i < analysisData.data.length; i++) {
                        analysisData.data[i][fieldIndex] = !!analysisData.data[i][fieldIndex];
                    }

                } else {
                    tool.console.error('Bi.Core.Analysis.display.Charts: Invalid OutputAttribute "ShowCategoryAxis"', attributes.get('ShowCategoryAxis'));
                }
            }

            var valueAxes = attributes.get('ValueAxes', []);

            // Associate guides to valueAxes (on the axis Y - horizontal lines)
            //
            // The guides structure is: [{ "value": "", "toValue": "", "label": "", "valueAxisId": "" }, ...]
            // Notice:
            //      Only "value" is required ("toValue" and "label" are optionals)
            // Warning:
            //      If there's only one valueAxes then "valueAxisId" is optional!
            //      Otherwise "valueAxisId" is required since it indicates to which valueAxes the guide should be added!
            //
            var guides = attributes.get('Guides');
            if (guides) guides.forEach(function (guide) {

                // Retrieve to which valueAxes the guide should be added 
                var valueAxis;
                for (var i = 0; i < valueAxes.length; i++) {
                    if (1 == valueAxes.length || guide.valueAxisId == valueAxes[i].id) {
                        valueAxis = valueAxes[i];
                        break;
                    }
                }
                if (!valueAxis) {
                    return tool.console.error('Bi.Core.Analysis.display.Charts: ' +
                        'unable to determine to which valueAxes the guide should be added', guide);
                }

                // Define the guide base
                var guideBase = {
                    inside: true,
                    position: 'right',
                    lineAlpha: 0.5,
                    fillAlpha: 0.075
                };

                // Check the guide "value" and "toValue"
                var guideData = function (data) {
                    if (tool.is.number(data)) {
                        // static: it's a float number
                        return data;
                    }
                    if (analysisData.data.length) {
                        // dynamic: it refers to a dataset column (that should have a unique value for all its rows)
                        return parseFloat(analysisData.data[0][analysisData.getColIndex(data)]);
                    }
                    return NaN;
                };
                // Guide "value" is required
                if (isNaN(guide.value = guideData(guide.value))) {
                    return tool.console.error('Bi.Core.Analysis.display.Charts: ' +
                        'guide.value is missing', guide);
                }
                // Guide "toValue" is optional
                if (('toValue' in guide) && isNaN(guide.toValue = guideData(guide.toValue))) {
                    tool.console.warn('Bi.Core.Analysis.display.Charts: ' +
                        'guide.toValue is not well formed', guide);
                }

                // The guide "label" might contain a reference to the guide "value" and "toValue",
                // using the pattern: [[value]] and [[toValue]]
                guide.label = (guide.label || '')
                    .replace('[[value]]', guide.value)
                    .replace('[[toValue]]', guide.toValue);

                // Guide colors (use defined or adapt to the valueAxis color or use a default color)
                ['color', 'lineColor', 'fillColor'].forEach(function (item) {
                    guide[item] = guide[item] || valueAxis.axisColor || "#DC143C";
                });

                // Add guide to valueAxis
                (valueAxis.guides = valueAxis.guides || []).push(tool.extend({}, guideBase, guide));
            });

            // Finally, make the Chart :-)
            var chart = AmCharts.makeChart(this, {

                type: "serial",

                dataProvider: analysisData.getMap(),

                categoryField: axis.x,
                categoryAxis: {
                    labelRotation: attributes.int('LabelRotation', 0),
                    forceShowField: forceShowField
                },

                graphs: graphs,
                valueAxes: valueAxes,

                legend: legend,

                depth3D: attributes.int('Depth3D', 0),
                angle: attributes.int('Angle', 0),

                rotate: attributes.bool('Rotate', false),

                exportConfig: {
                    menuItems: [] // Be ready to trigger the method chart.AmExport.output()
                }

            });

            // Column formatting
            var colsFormat = attributes.startWith('ColumnFormat');
            analysisData.normalizeMapByColName(colsFormat);
            // Authorized formatting in Charts (only click to action)
            var linkTypes = [], type;
            for (type in Analysis.columnFormattingTypes.link) linkTypes.push(type);
            // Removed unauthorized formatting
            for (var col in colsFormat) {
                for (var i = 0; i < colsFormat[col].length; i++) {
                    if (!tool.array.exists(colsFormat[col][i].type, linkTypes)) {
                        colsFormat[col].splice(i, 1);
                        i--;
                    }
                }
                // FIXME: il y aura un problème s'il y a 'links' et 2 autres trucs (comme 'link' et 'analysisFilter' par exemple)
                // Dans ce cas, le comportement attendu est certainement que lorsqu'on clique, on ouvre la popup relative 'links'
                // Celle-ci contient certainement les 'link' et 'analysisFilter'.
                // Or actuellement, la popup sera ouverte MAIS en même temps 'link' et 'analysisFilter' seront cliqués !
                // -----
                // PATCH: s'il y a 'links' dans la liste des formats, il ne faut conserver que lui uniquement !!!
                // -----
            }
            var prevClick = { graph: null, item: null };
            chart.addListener("clickGraphItem", function (o) {
                var current = { format: undefined, data: undefined },
                    colName = o.graph.valueField;
                if (!addons.pivotTable) {
                    current.format = colsFormat[colName];
                    if (!current.format) return;
                    current.data = o.item.dataContext;
                } else {
                    current.format = colsFormat[colName] || colsFormat['PivotColDefault'];
                    if (!current.format) return;
                    var row = o.index, col = addons.pivotTable.getJsonColIndex(colName);
                    current.data = addons.pivotTable.getJsonSlot(row, col);
                }
                current.data = new Analysis.Data(database.format.fromJson([current.data]));

                // Apply column formatting
                var newCol = '_action_';
                current.data.addCol(['Click to action'], newCol);
                tools.columnFormatting(current.data, newCol, current.format); // Apply formatting to the newCol

                // Click to action
                var isTouch = /^touch/i.test(o.event.type), haveTooltip = tooltip && (o.graph.valueField in tooltip);
                if (!isTouch || !haveTooltip || o.graph.index === prevClick.graph && o.item.index === prevClick.item) {

                    // Overwrite the lastClickPosition according to the clicked map area.
                    // This is required only for the format 'links' that displays a popup.
                    // This popup is positionned near the link that triggers the popup to be openned.
                    // The problem is that this link is not rendered in the DOM, because this is not a table but a chart/map.
                    Analysis.lastClickPosition.overwrite(o.event.clientX, o.event.clientY);

                    // Trigger click!
                    var $format = jQuery(current.data.getData()[0][current.data.getColIndex(newCol)]);
                    $format.trigger('click');                       // For debugging comment this line
                    //console.log(current, $format[0].outerHTML);   // For debugging uncomment this line

                } else {
                    // First touch event on graph item which have a tooltip
                    // Do not trigger the click... Just let amchart display the Tooltip!
                }
                prevClick = { graph: o.graph.index, item: o.item.index };
            });

            var $content = jQuery(this);
            // Store the trigger
            $content.data('amConvert2Image', function () { Analysis.display._amConvert2Image(chart, $content); });
            // Store the chart to be able to refresh it instead of rebuild it !
            $content.data('storedChart', chart);

            // Export to CSV
            Analysis.display._addExportData2CsvButton(tools.$title, analysisData, attributes, tools.replaceText);

            finish();
        });
    };

    // Attributes:
    // Colors, Legend, Label, Tooltip, LegendText, LegendValue
    Analysis.display.PieChart = function (analysisData, attributes, tools, finish) {
        if (tools.isRefresh) {
            try {
                jQuery(this).data('storedChart').write(this);
                finish();
                return;
            } catch (e) {
                tool.console.error('Bi.Core.Analysis.display.PieChart: unable to refresh outputInstanceId = ' + tools.outputInstanceId);
                jQuery(this).html('');
            }
        }
        analysisData = Analysis.preprocessCommunAttr(analysisData, attributes, tools.replaceText);
        Analysis.preprocessChartAttr.call(this, analysisData, attributes, tools.replaceText, function (analysisData, axis, addons) {

            var chart = new AmCharts.AmPieChart();
            chart.dataProvider = analysisData.getMap();

            chart.titleField = axis.x;
            chart.valueField = axis.y[0];

            var colors = attributes.get('Colors');
            if (colors && (colors = analysisData.getColName(colors))) {
                chart.colors = [];
                for (var row in chart.dataProvider) chart.colors.push(chart.dataProvider[row][colors]);
            }

            var label, tooltip, legend = attributes.get('Legend', '');
            if (!legend) {
                label = attributes.get('Label', '[[title]]');
                tooltip = attributes.get('Tooltip', '<b style="font-size:1.4em">[[value]]</b>')
            } else {
                label = '';
                tooltip = attributes.get('Tooltip', '[[title]]:<br><b style="font-size:1.4em">[[value]]</b>')

                var amLegend = new AmCharts.AmLegend();
                amLegend.position = legend.toLowerCase();
                amLegend.labelText = attributes.get('LegendText', '[[title]]');
                amLegend.valueText = attributes.get('LegendValue', '');
                chart.addLegend(amLegend);
            }
            chart.labelText = label;
            chart.balloonText = tooltip;

            // No animation
            chart.startDuration = 0;
            // Lines between slices
            chart.outlineColor = '#fff';
            chart.outlineAlpha = 0.6;
            chart.outlineThickness = 1;
            // Distance between slice and label
            chart.labelRadius = 10;
            // Hide balloon
            chart.hideBalloonTime = 0;
            chart.balloon.fadeOutDuration = 0.1;
            // Font
            chart.fontFamily = "'segoe ui', arial, sans-serif"; // This is from the jqWidget "Metro" theme

            // Be ready to trigger the method chart.AmExport.output()
            chart.exportConfig = { menuItems: [] };

            // Display chart in this DOM element
            chart.write(this);

            var $content = jQuery(this);
            // Store the trigger
            $content.data('amConvert2Image', function () { Analysis.display._amConvert2Image(chart, $content); });
            // Store the chart to be able to refresh it instead of rebuild it !
            $content.data('storedChart', chart);

            // Export to CSV
            Analysis.display._addExportData2CsvButton(tools.$title, analysisData, attributes, tools.replaceText);

            finish();
        });
    };

    // Attributes:
    // AxisX, AxisY, AxisZ, ColorField, AlphaField, BulletField, Tooltip, Series, MinBulletSize, MaxBulletSize,
    // Legend, AxisXValue, AxisYValue, AxisXPosition, AxisYPosition, AxisXTitle, AxisYTitle, GuideX, GuideY
    Analysis.display.BubbleChart = function (analysisData, attributes, tools, finish) {
        if (tools.isRefresh) {
            try {
                jQuery(this).data('storedChart').write(this);
                finish();
                return;
            } catch (e) {
                tool.console.error('Bi.Core.Analysis.display.BubbleChart: unable to refresh outputInstanceId = ' + tools.outputInstanceId);
                jQuery(this).html('');
            }
        }
        analysisData = Analysis.preprocessCommunAttr(analysisData, attributes, tools.replaceText);
        // Note: in Bubble chart, Analysis.preprocessChartAttr is NOT used.

        // Axis X, Y, Z
        var axisX = analysisData.getColIndex(attributes.get('AxisX')),
            axisY = analysisData.getColIndex(attributes.get('AxisY')),
            axisZ = analysisData.getColIndex(attributes.get('AxisZ'));

        // Bubble color based on data column
        var colorField = analysisData.getColName(attributes.get('ColorField')),
            colorFieldIndex = analysisData.getColIndex(colorField),
            colors = []; // Global color of each graph

        // Bubble alpha based on data column
        var alphaField = analysisData.getColName(attributes.get('AlphaField'));

        // Bubble type based on data column
        var bulletField = analysisData.getColName(attributes.get('BulletField')),
            bulletFieldIndex = analysisData.getColIndex(bulletField),
            bullets = [];

        // Tooltip (by serie)
        var tooltip = attributes.startWith('Tooltip');
        analysisData.normalizeMapByColName(tooltip);

        // Data provider and graphs
        var dataProvider = [], graphs = [];

        // Series
        var series = analysisData.getColIndex(attributes.get('Series')),
            hasSeries = undefined !== series,
            seriesValues = [];

        analysisData.data.forEach(function (row) {

            var serieIndex = seriesValues.indexOf(row[series]);
            if (-1 == serieIndex) {
                serieIndex = seriesValues.length;
                seriesValues.push(row[series]); // note: if hasSeries=false then seriesValues=[undefined]

                // First color founded for this serie will set its global color
                if (colorField) colors.push(row[colorFieldIndex]);
                // First type founded for this serie will set its global type
                if (bulletField) bullets.push(row[bulletFieldIndex]);
            }

            var map = {};
            row.forEach(function (value, colIndex) {
                var colName = analysisData.cols[colIndex];
                if (axisX == colIndex || axisY == colIndex) colName += serieIndex;
                map[colName] = value;
            });

            dataProvider.push(map);
        });

        seriesValues.forEach(function (serieTitle, serieIndex) {

            var xField = analysisData.cols[axisX] + serieIndex,
                yField = analysisData.cols[axisY] + serieIndex;

            var graph = {
                title: serieTitle,

                xField: xField,
                yField: yField,
                valueField: analysisData.cols[axisZ],

                // Dynamic config
                colorField: colorField,
                alphaField: alphaField,
                bulletField: bulletField, // Like 'circle', 'diamond', ...
                // Static config
                bulletAlpha: 0.8, // Used if alphaField is undefined
                bullet: bullets[serieIndex] || 'circle', // Used if bulletField is undefined (and for the legend's bullet even if bulletField is defined)

                lineAlpha: 0,
                fillAlphas: 0
            };
            if (attributes.get('MinBulletSize')) graph.minBulletSize = attributes.int('MinBulletSize');
            if (attributes.get('MaxBulletSize')) graph.maxBulletSize = attributes.int('MaxBulletSize');

            // Get special or default tooltip
            var serieTooltip = tooltip[serieTitle] || tooltip[''];
            if (serieTooltip) {
                // Format tooltip according to amchart balloonText
                var balloonKeys = [].concat(analysisData.cols);
                balloonKeys.forEach(function (key, index) {
                    key = (index == axisX) ? xField : (index == axisY) ? yField : key;
                    balloonKeys[index] = '[[' + key + ']]'; // In balloonText, column identified by "[[COL]]"
                });
                var balloonData = new Analysis.Data({
                    columns: [].concat(analysisData.cols),
                    data: [balloonKeys]
                });
                graph.balloonText = balloonData.evalColExpression(serieTooltip)[0];
            }

            graphs.push(graph);
        });

        // Legend (only available if there's more than one series)
        var legend = false;
        if (hasSeries) {
            legend = attributes.get('Legend', false);
            if (false !== legend) legend = { useGraphSettings: true, position: legend || 'bottom' };
        }

        // Value axes (use this object to add some properties to valueAxes like: unit, precision, ...)
        var axisXValue = attributes.get('AxisXValue', {/* unit: '%', precision: 2, ... */}),
            axisYValue = attributes.get('AxisYValue', {/* unit: '%', precision: 2, ... */ });
        // Axes position
        var axisXPos = attributes.get('AxisXPosition'),
            axisYPos = attributes.get('AxisYPosition');
        if ('bottom' != axisXPos && 'top' != axisXPos) axisXPos = 'bottom';
        if ('left' != axisYPos && 'right' != axisYPos) axisYPos = 'left';
        // Guides position
        var guideXPos = 'bottom' == axisXPos ? 'top' : 'bottom',
            guideYPos = 'left' == axisYPos ? 'right' : 'left';

        var settings = {
            type: "xy",
            theme: "light",
            dataProvider: dataProvider,
            graphs: graphs,
            legend: legend,

            valueAxes: [tool.extend(axisXValue, {

                position: axisXPos,
                axisAlpha: 0,
                title: attributes.get('AxisXTitle'),
                includeGuidesInMinMax: true

            }), tool.extend(axisYValue, {

                position: axisYPos,
                axisAlpha: 0,
                title: attributes.get('AxisYTitle'),
                includeGuidesInMinMax: true

            })]
        };
        if (colorField) settings.colors = colors;

        // Chart Guides
        var guideX = attributes.get('GuideX'),
            guideY = attributes.get('GuideY'),
            guideBase = { inside: true, color: "#8B0000", lineColor: "#DC143C", lineAlpha: 0.6 };

        var guideValueAndLabel = function (guide) {
            // The guide-value can be static or dynamic :
            //  - static: it's a float number
            //  - dynamic: it refers to a dataset column (that should have a unique value for all rows)
            if (!tool.is.number(guide.value) && analysisData.data.length) {
                guide.value = parseFloat(analysisData.data[0][analysisData.getColIndex(guide.value)]);
            }
            // The guide-label might contain a reference to the guide value using the pattern: [[value]]
            guide.label = (guide.label || '').replace('[[value]]', guide.value);
        };
        if (guideX) {
            guideValueAndLabel(guideX);
            settings.valueAxes[0].guides = [tool.extend({}, guideBase, {
                value: guideX.value, position: guideXPos, label: guideX.label,

                // Only for axis X: set labelRotation = 90 (default) or = 0.
                // Note: the parameter guideX.labelRotation should be a number 0 or 1.
                labelRotation: (undefined === guideX.labelRotation || guideX.labelRotation) ? 90 : 0
            })];
        }
        if (guideY) {
            guideValueAndLabel(guideY);
            settings.valueAxes[1].guides = [tool.extend({}, guideBase, {
                value: guideY.value, position: guideYPos, label: guideY.label
            })];
        }

        var chart = AmCharts.makeChart(this, settings);

        var $content = jQuery(this);
        // Store the trigger
        $content.data('amConvert2Image', function () { Analysis.display._amConvert2Image(chart, $content); });
        // Store the chart to be able to refresh it instead of rebuild it !
        $content.data('storedChart', chart);

        // Export to CSV
        Analysis.display._addExportData2CsvButton(tools.$title, analysisData, attributes, tools.replaceText);

        finish();
    };

    // Attributes:
    // AxisX, AxisY, Type, Colors
    Analysis.display.Sparkline = function (analysisData, attributes, tools, finish) {
        jQuery(this).html('');

        var axisX = analysisData.getColName(attributes.get("AxisX")), // Get the series column-name from its column-index
            axisY = attributes.arr("AxisY", ','); // Get the measures from expression

        var chart = new AmCharts.AmSerialChart(AmCharts.themes.none);
        chart.dataProvider = analysisData.getMap();
        chart.categoryField = axisX;

        // Configure Sparkline render
        chart.autoMargins = false;
        chart.marginLeft = 0;
        chart.marginRight = 0;
        chart.marginTop = 0;
        chart.marginBottom = 5;

        var type = attributes.get('Type', 'line'), graphType, graphLineAlpha, graphFillAlphas;
        switch (type) {
            case 'column': graphType = 'column'; graphLineAlpha = 0.2; graphFillAlphas = 0.8; break;
            case 'line': default: graphType = 'line'; graphLineAlpha = 1; graphFillAlphas = 0; break;
        }

        var colors = attributes.arr("Colors", ',');
        for (var i = 0; i < axisY.length; i++) {
            var graph = new AmCharts.AmGraph();

            graph.type = graphType;
            graph.lineAlpha = graphLineAlpha;
            graph.fillAlphas = graphFillAlphas;

            graph.valueField = axisY[i];
            graph.showBalloon = false;
            if (colors[i]) graph.lineColor = colors[i];
            chart.addGraph(graph);
        }

        var valueAxis = new AmCharts.ValueAxis();
        valueAxis.gridAlpha = 0;
        valueAxis.axisAlpha = 0;
        chart.addValueAxis(valueAxis);

        var categoryAxis = chart.categoryAxis;
        categoryAxis.gridAlpha = 0;
        categoryAxis.axisAlpha = 0;
        categoryAxis.startOnAxis = true;

        // Display chart in this DOM element
        chart.write(this);
        if (finish) finish(); // Because display.Sparkline can be called to display sparkline inside a outputInstanceId, the finish fonction might be not defined...
    };

    // Attributes:
    // ColumnExpression, Polygons, Series, BackgroundMeasure, AreasColors, Tooltip, AreasImages,
    // LegendFormat, LegendPrecision, LegendUnit, ColumnFormat, EnableZoom, DisableDefaultLegend,
    // ColorSteps, StartColor, EndColor, Selectable, SelectedColor, Legend, LegendAlign
    Analysis.display.Map = function (analysisData, attributes, tools, finish) {
        if (tools.isRefresh) {
            try {
                jQuery(this).data('storedMap').write(this);
                finish();
                return;
            } catch (e) {
                tool.console.error('Bi.Core.Analysis.display.Map: unable to refresh outputInstanceId = ' + tools.outputInstanceId);
                jQuery(this).html('');
            }
        }

        // Regular ColumnExpression
        var expression = attributes.arr('ColumnExpression');
        for (var i = 0; i < expression.length; i++) {
            // In the method Analysis.Data.evalColExpression, 
            // you will find the column name pattern, which is: [a-z_][0-9a-z_]*
            var match = expression[i].match(/^([a-z_][0-9a-z_]*)\s*=\s*/i),
                colName = match[1],
                colExp = expression[i].substr(match[0].length);
            analysisData.evalColExpression(colExp, colName); // TODO! il manque: Context.replaceText...
        }

        // Get the measures from expression
        var polygons = analysisData.getColName(attributes.get("Polygons")),
            series = analysisData.getColName(attributes.get("Series")),
            measures = analysisData.getColName(attributes.get("BackgroundMeasure"));

        var path = [], cols = { 'id': series, 'title': series, 'd': polygons }, analysisMap = analysisData.getMap();
        for (var i = 0; i < analysisMap.length; i++) {
            path[i] = {};
            for (var p in cols) path[i][p] = analysisMap[i][cols[p]];
        }
        var areas = [],
            cols = { 'id': series, 'title': series, 'value': measures },
            colors = analysisData.getColName(attributes.get("AreasColors")), // Indicates a column of the dataset that defines the area color
            tooltip = analysisData.getColName(attributes.get("Tooltip")); // Indicates a column of the dataset that defines the tooltip content
        for (var i = 0; i < analysisMap.length; i++) {
            areas[i] = {};
            for (var p in cols) areas[i][p] = analysisMap[i][cols[p]];
            if (colors) areas[i].color = analysisMap[i][colors];

            // We are using the customData to store the entire areasSettings.balloonText value
            // In case, the Tooltip attribute is not defined, we fallback to balloonText="[[title]]" (which is the series)
            areas[i].customData = analysisMap[i][tooltip || series];
        }

        // Add images to each area
        var images = analysisData.getColName(attributes.get("AreasImages")); // Indicates a column of the dataset that defines the src attribute of the area image
        if (images) {
            for (var imagesPerAreaId = {}, i = 0; i < analysisMap.length; i++) {
                if (!analysisMap[i][images]) continue;

                var image = analysisMap[i][images];

                imagesPerAreaId[analysisMap[i][series]] = {
                    imageURL: tool.url.ROOT + '/dashboard/resources/images/analysis/' + image,
                    width: 24,
                    height: 24,
                    label: "",
                    longitude: undefined, // Will be setted later...
                    latitude: undefined // Will be setted later...
                };
            }
        }

        var dataProvider = {
            svg: {
                "defs": {
                    "amcharts:ammap": {
                        "projection": "mercator",
                        "leftLongitude": "-180",
                        "topLatitude": "90",
                        "rightLongitude": "180",
                        "bottomLatitude": "-90"
                    }
                },
                "g": {
                    "path": path
                }
            }
        };

        var range = analysisData.getColRange(measures);

        // Legend
        var valueLegend = new AmCharts.ValueLegend(), legend = {
            min: range.min,
            max: range.max,
            format: attributes.get('LegendFormat'),
            precision: attributes.get('LegendPrecision', undefined),
            unit: attributes.get('LegendUnit', '')
        };
        switch (legend.format) {
            case 'percentage': legend.min *= 100; legend.max *= 100; break; // We assumes that range.min and range.max are between 0 and 1
        }
        if (undefined !== legend.precision) {
            legend.min = legend.min.toFixed(legend.precision);
            legend.max = legend.max.toFixed(legend.precision);
        }
        valueLegend.right = 10;
        valueLegend.minValue = legend.min + (legend.unit ? ' ' + legend.unit : '');
        valueLegend.maxValue = legend.max + (legend.unit ? ' ' + legend.unit : '');

        // Let's go !
        var map = new AmCharts.AmMap();

        // Column formatting
        var colsFormat = attributes.startWith('ColumnFormat');
        analysisData.normalizeMapByColName(colsFormat);
        
        for (var col in colsFormat) (function (colExp, colFormat) {
            tools.columnFormatting(analysisData, colExp, colFormat);
        })(analysisData.getColName(col), colsFormat[col]);

        // Authorized formatting in Charts (only click to action)
        var linkTypes = [], type;
        for (type in Analysis.columnFormattingTypes.link) linkTypes.push(type);
        // Removed unauthorized formatting
        for (var col in colsFormat) {
            for (var i = 0; i < colsFormat[col].length; i++) {
                if (!tool.array.exists(colsFormat[col][i].type, linkTypes)) {
                    colsFormat[col].splice(i, 1);
                    i--;
                }
            }
            // FIXME: il y aura un problème s'il y a 'links' et 2 autres trucs (comme 'link' et 'analysisFilter' par exemple)
            // Dans ce cas, le comportement attendu est certainement que lorsqu'on clique, on ouvre la popup relative 'links'
            // Celle-ci contient certainement les 'link' et 'analysisFilter'.
            // Or actuellement, la popup sera ouverte MAIS en même temps 'link' et 'analysisFilter' seront cliqués !
            // -----
            // PATCH: s'il y a 'links' dans la liste des formats, il ne faut conserver que lui uniquement !!!
            // -----
        }
        var analysisMap = analysisData.getMap();
        for (var col in colsFormat) (function (col) {
            for (var i = 0; i < analysisMap.length; i++) analysisMap[i][col] = jQuery(analysisMap[i][col]);

            var selectedObject = undefined, toggle = false, clickWatcher = { id: null, handle: 0 };
            map.addListener("clickMapObject", function (o) {

                if (selectedObject != map.selectedObject.id) {
                    toggle = false;
                    selectedObject = map.selectedObject.id;
                } else {
                    toggle = !toggle;
                    if (toggle) {
                        map.selectObject(); // return map to initial view
                        selectedObject = undefined;
                    } else {
                        selectedObject = map.selectedObject.id;
                    }
                }
                var selectedRow = analysisMap.filter(function (row) {
                    // Here is the point ! If the text of the column match the series then this is the clicked row !
                    return row[col].text() == o.mapObject.id;
                });
                if (selectedRow[0]) {
                    if (o.mapObject.id === clickWatcher.id) {
                        clickWatcher.handle = ++clickWatcher.handle % 2;
                    } else {
                        clickWatcher = { id: o.mapObject.id, handle: 0 };
                    }
                    // On touch screen, the first click opens the balloon
                    // the second click closes the balloon and triggers the click action
                    // (On desktop, the balloon appreas on mouseover, so there's no problem...)
                    var isTouch = /^touch/i.test(o.event.type);
                    if (!isTouch || clickWatcher.handle) {
                        // Overwrite the lastClickPosition according to the clicked map area.
                        // This is required only for the format 'links' that displays a popup.
                        // This popup is positionned near the link that triggers the popup to be openned.
                        // The problem is that this link is not rendered in the DOM, because this is not a table but a chart/map.
                        Analysis.lastClickPosition.overwrite(o.event.pageX, o.event.pageY);
                        selectedRow[0][col].trigger('click');
                    }
                }
            });
        })(col);
        // End of Column formatting

        // Zoom controll
        var enableZoom = attributes.bool("EnableZoom", false);
        if (!enableZoom) {
            map.dragMap = false;
            map.zoomOnDoubleClick = false;
            map.zoomControl.zoomControlEnabled = false;
        }
        map.zoomControl.panControlEnabled = false; // The pan is useless for the Bi.
        map.zoomControl.buttonSize = 15;
        map.zoomControl.gridHeight = 100;
        map.zoomControl.buttonFillColor = '#bbb';
        map.zoomControl.buttonRollOverColor = '#777'; // #51c5d4
        map.zoomControl.gridBackgroundAlpha = 0.1;
        // End of: Zoom controll

        map.pathToImages = tool.url.ROOT + "/plugins/am/ammap/images/";
        map.dataProvider = { mapVar: dataProvider };
        map.dataProvider.areas = areas;
        if (!attributes.bool("DisableDefaultLegend", false)) {
            map.valueLegend = valueLegend;
        }

        map.colorSteps = attributes.get("ColorSteps", 8);
        map.minValue = range.min;
        map.maxValue = range.max;
        map.areasSettings = {
            color: attributes.get("StartColor", '#FFCC00'),
            colorSolid: attributes.get("EndColor", '#990000'),
            selectable: attributes.bool("Selectable", false),
            minValue: range.min,
            maxValue: range.max,
            //autoZoom: enableZoom,
            selectedColor: attributes.get("SelectedColor", '#CC0000'),
            selectedOutlineColor: undefined,
            rollOverColor: undefined,
            rollOverOutlineColor: undefined,
            outlineThickness: 0.5,
            balloonText: "[[customData]]" // The customData contains the [[title]] (default behavior) or the Tooltip (if the attributes was defined...)
        };
        var legend = attributes.get('Legend');
        if (legend) map.legend = {
            width: "100%",
            marginRight: 0,
            marginLeft: 0,
            equalWidths: false,
            borderColor: "#ffffff",
            borderAlpha: 0,
            backgroundColor: "#ffffff",
            backgroundAlpha: 0,
            bottom: 0,
            right: 0,
            horizontalGap: 0,
            align: attributes.get('LegendAlign', 'right'),
            data: legend
        };
        map.validateData();

        // Be ready to trigger the method chart.AmExport.output()
        map.exportConfig = { menuItems: [] };

        // Display map in this DOM element
        map.write(this);

        // Hack: the .amChartsLegend does not appears because it's a child of the main map container <div style="position:relative;"> which have no height
        jQuery(this).addClass('bi-analysis-ammap-hack'); // .bi-analysis-ammap-hack > * { height:100% !important; }

        // Add images in the center of each area (must be done after the map has been rendered once...)
        if (images) {
            var mapImages = [];
            for (var i = 0; i < map.dataProvider.areas.length; i++) {
                var mapArea = map.dataProvider.areas[i],
                    areaImage = imagesPerAreaId[mapArea.id];
                if (!areaImage) continue;
                areaImage.longitude = map.getAreaCenterLongitude(mapArea);
                areaImage.latitude = map.getAreaCenterLatitude(mapArea);

                mapImages.push(areaImage);
            }
            map.dataProvider.images = mapImages;
            map.validateData();

            map.write(this); // Display again the map with the centered images
        }

        var $content = jQuery(this);
        // Store the trigger
        $content.data('amConvert2Image', function () { Analysis.display._amConvert2Image(map, $content); });
        // Store the map to be able to refresh it instead of rebuild it !
        $content.data('storedMap', map);

        // Export to CSV
        Analysis.display._addExportData2CsvButton(tools.$title, analysisData, attributes, tools.replaceText);

        finish();
    };

    // Addon for amChart and amMap: Convert svg to image
    Analysis.display._amConvert2Image = function (chartOrMap, $content) {
        try {
            chartOrMap.AmExport.output({ format: "png", output: "datastring" }, function (imgSrc) {
                if ($content) $content.html(jQuery('<img alt="">').attr('src', imgSrc));
                return imgSrc;
            });
        } catch (e) {
            if ($content) $content.html('<p style="margin:10px 0; text-align:center; color:grey;">Print not available...</p>');
        }
    };

    // Add button to Export to CSV
    Analysis.display._addExportData2CsvButton = function (nodeTarget, analysisData, attributes, replaceFn) {
        var csv = attributes.get('ExportToCsv');
        //// Uncomment the following config example to see the effect :
        //csv = {
        //    str: '"', // String delimiter
        //    col: ';', // Column delimiter
        //    row: '\r\n', // Row delimiter
        //    includeCols: ['@1', '@2'], // List of columns to include in the CSV
        //    titles: ['A', 'B'], // Title of each included column
        //    filename: 'myExport' // File name like 'myExport', without '.csv' extension
        //};
        if (!csv) return;
        csv.indexes = [];
        if (csv.includeCols) csv.includeCols.forEach(function (col) {
            csv.indexes.push(analysisData.getColIndex(col));
        });
        if (csv.titles && replaceFn) csv.titles.forEach(function (col, index) {
            csv.titles[index] = replaceFn(col);
        });
        if (csv.filename) {
            if (replaceFn) csv.filename = replaceFn(csv.filename);
            csv.filename = csv.filename.replace(/\.csv$/, '') + '.csv';
        }
        Analysis.exportData2CsvLink(analysisData, csv.filename, csv).appendTo(nodeTarget);
    };

})(this, this.jQuery, this.Bi = this.Bi || {});
