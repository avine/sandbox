
(function (window, Bi) {
    "use strict";

    var tool = Bi.tool;

    function Pivot(data, options, debug) {

        this.options = tool.extend({}, Pivot.settings);
        if (options) this.setOptions(options);
        if (data) this.setData(data);
        this.debug = !!debug;

        this.basic = { rows: {}, cols: {}, total: { rows: {}, cols: {} } };

        this.nested = { rows: [], cols: [] }; // full nested (axis and total)
        this.nested.basic = { rows: [], cols: [] }; // nested axis only (without total)

        this.result = [];
        this.indicators = [];
        this.filled = { result: { rows: [], cols: [] }, indicators: undefined };

        this.output = { html: '', json: [] };

        this.timer = { total: 0 };
    }

    Pivot.prototype = {

        setData: function (data) {
            this.data = data;
            this._checkUndefinedData();
            this._checkAllAxisAlias();
        },
        // Replace undefined data values by null
        // This is necessary because undefined is a reserved value in this class
        // It's indeed used to determine if this.nested[axis] is a total axis or not
        _checkUndefinedData: function () {
            for (var row = 0; row < this.data.length; row++)
                for (var col in this.data[row])
                    if (undefined === this.data[row][col]) this.data[row][col] = null;
        },
        // Check the alias availability of the total column "[[[all]]]"
        _checkAllAxisAlias: function () {
            if (!this.data.length) return;
            var cols = Pivot.tools.propList(this.data[0]);
            while (tool.array.exists(this.options._allAxisAlias, cols)) {
                this.options._allAxisAlias = '[[[all.' + (Math.random() + '').substr(2, 5) + ']]]';
            }
        },



        // Add a row/col to pivot from the original columns
        // Sort the row/col values 'asc' or 'desc' (false to not sort)
        // Sort the values relative to another column key
        // Set if the total row/col should be added 'after' or 'before'
        addRow: function (col, sortType, sortKey, total) {
            this._addAxis('rows', col, sortType, sortKey, total);
        },
        addCol: function (col, sortType, sortKey, total) {
            this._addAxis('cols', col, sortType, sortKey, total);
        },
        _addAxis: function (axis, col, sortType, sortKey, total) {
            this.addTimer();
            if (/^[0-9]$/.test(col)) {
                this.error('Integers are not supported as name of pivot column: "' + col + '".');
                return;
            }
            var _C = this.options.jsonColumnPrefix,
                _I = this.options.jsonIndicatorPrefix,
                pattern = '^(' + _C + '[0-9]+)?' + _I + '[0-9]+$'; // _C1_I1, _C1_I2, _C2_I1, ... or _I1, _I2, ...
            if (new RegExp(pattern).test(col)) {
                this.error('The pattern /' + pattern + '/ is not supported as name of pivot column: "' + col + '".');
                return;
            }
            var values = [];
            sortKey = sortKey || col;
            for (var row = 0; row < this.data.length; row++) {
                if (!Pivot.tools.inValues(this.data[row][col], values)) {
                    values.push({
                        val: this.data[row][col],
                        key: this.data[row][sortKey]
                    });
                }
            }
            if (tool.array.exists(sortType, ['asc', 'desc'])) {
                values = values.sort(Pivot.tools.compareKeys);
                if ('desc' == sortType) values = values.reverse();
            }
            for (var i = 0; i < values.length; i++) values[i] = values[i].val;
            this.basic[axis][col] = values;
            if (total) this._addTotalAxis(axis, col, total);
            this.addTimer('addAxis', col);
        },



        // Add the total rows/cols 'after' or 'before'
        addTotalRows: function (pos) {
            this._addTotalAxis('rows', this.options._allAxisAlias, pos);
        },
        addTotalCols: function (pos) {
            this._addTotalAxis('cols', this.options._allAxisAlias, pos);
        },
        _addTotalAxis: function (axis, col, pos) {
            this.basic.total[axis][col] = ('before' == pos) ? pos : 'after'; // default position = 'after'
        },



        // Add a basic indicator based on one column using a named rendorCol function
        addIndicator: function (col, type, title, alias, emptyValue) {
            if (!(type in Pivot.tools.indicators)) {
                this.error('Unkown indicator type: "' + type + '".');
                return;
            }
            this.addIndicatorAdvanced([col], function (col) {
                return col;
            }, Pivot.tools.indicators[type], title, alias, emptyValue);
        },
        // Add an advanced indicator based on one or more columns
        // The function renderRow determine how to combine the slot item cols to get a value
        // The function renderCol determine how to combine all thoses values (sum, average, ...)
        addIndicatorAdvanced: function (cols, renderRow, renderCol, title, alias, emptyValue) {
            if (tool.is.string(cols)) cols = [cols];
            if (undefined !== alias) for (var i = 0; i < this.indicators.length; i++) {
                if (alias == this.indicators[i].alias) this.error('Duplicate indicator alias "' + alias + '"');
            }
            this.indicators.push({
                "cols": cols,
                "renderRow": renderRow,
                "renderCol": renderCol,
                "title": title || '',
                "alias": alias,
                "emptyValue": emptyValue,
                "result": []
            });
        },
        // The function render determines how to render the availables indicators in a slot
        setIndicatorsRender: function (render) {
            this.indicators.render = render;
        },



        // Process the pivot in different formats
        getHtml: function () {
            this._process().setHtml();
            return this.output.html;
        },
        getJson: function () {
            this._process().setJson();
            return this.output.json;
        },
        // Note: you should not change the pivot configuration after the ._process() method has been called once
        _process: function () {
            if (!this.processDone) {
                this._setResult()._setIndicators()._skipEmpty(); // Do this once
                this.processDone = true;
                this.log(this);
            }
            return this;
        },



        // Get the pivot result
        _setResult: function () {
            for (var axis = ['rows', 'cols'], i = 0; i < axis.length; i++) {
                this._nestedBasicAxis(axis[i]);
                this._nestedAxisWithTotal(axis[i]);
            }
            this._initResult();
            for (var row = 0; row < this.data.length; row++) this._insertResult(this.data[row]);
            return this;
        },
        // Cross the expected rows and cols (set .nested.basic.rows and .nested.basic.cols properties)
        _nestedBasicAxis: function (axis) {
            this.addTimer();
            var list = [];
            for (var prop in this.basic[axis]) {
                list.push(Pivot.tools.arrayStr2Obj(this.basic[axis][prop], prop));
            }
            var cross = list.shift(), addon;
            while (addon = list.shift()) {
                cross = Pivot.tools.crossLists(cross, addon);
            }
            this.nested.basic[axis] = cross || [];
            this.addTimer('nestedBasicAxis', axis);
        },
        // Add the expected total rows and cols (set .nested.rows and .nested.cols properties)
        _nestedAxisWithTotal: function (axis) {
            this.addTimer();
            this.log('\n----- Nested ' + axis + ' -----');
            var previous, current,
                nestedBasicAxis = this.nested.basic[axis], n = nestedBasicAxis.length || 1, // Prevent n = 0
                totalAxis = this._getTotalAxisByPosition(axis);
            for (var line = 0; line < n; line++) {
                current = nestedBasicAxis[line];
                previous = previous || current;
                var isFirst = (0 == line), isLast = (n - 1 == line);
                // Check that current is defined (to prevent the case nestedBasicAxis.length = 0)
                if (isLast && undefined !== current) {
                    this.nested[axis].push(current); // add nested
                    this.log(line, current);
                }
                for (var pos in totalAxis) { // In the first loop, pos='after' and in the second loop pos='before'
                    var choose = (isFirst && 'before' == pos) ? previous : (isLast && 'after' == pos) ? current : null;
                    for (var col = 0; col < totalAxis[pos].length; col++) {
                        var alias = totalAxis[pos][col],
                            notAllAxis = (this.options._allAxisAlias != alias);
                        if (undefined === current || notAllAxis && current[alias] != previous[alias] || choose) {
                            var currentTotal = {};
                            for (var basicAxis in this.basic[axis]) currentTotal[basicAxis] = undefined;
                            var header = '', index = line + (isLast ? 1 : 0);
                            if (notAllAxis) {
                                for (var basicAxis in this.basic[axis]) {
                                    header = (choose || ('after' == pos) ? previous : current)[basicAxis];
                                    currentTotal[basicAxis] = header;
                                    if (basicAxis == alias) break;
                                }
                            }
                            this.nested[axis].push(currentTotal); // add total
                            this.log('\t>', 'total ' + pos, notAllAxis ? alias : '[all]', header);
                        }
                    }
                }
                if (!isLast) {
                    this.nested[axis].push(current); // add nested
                    this.log(line, current);
                }
                previous = current;
            }
            this.log('');
            this.addTimer('nestedAxisWithTotal', axis);
        },
        // Go through the nested axis in both directions.
        // This is necessary to add the rows/cols total at the right place.
        // For example, assuming we have 2 nested columns for pivot rows: region, activity (in this order).
        // (*)  If the total is required "before",
        //      then we expect the total region (which is more global) to be added before the total activity.
        // (**) But if the total is required "after",
        //      then we expect the total activity (which is more detail) to be added before the total region.
        _getTotalAxisByPosition: function (axis) {
            var totalAxis = { after: [], before: [] }, // The properties order is important
                basicTotalAxis = tool.extend({}, this.basic.total[axis]),
                all = this.options._allAxisAlias,
                totalPos = basicTotalAxis[all];
            if (totalPos) delete basicTotalAxis[all];
            // The last basic axis cannot be added as total
            var lastBasicAxis;
            for (var col in this.basic[axis]) lastBasicAxis = col;
            var errorMsg = function (col) {
                this.error('The last pivoted column "' + col + '" cannot be added in the ' + axis + ' total.');
            }.bind(this);
            // Put the total before the cols (*)
            if ('before' === totalPos) totalAxis.before.push(all);
            for (var col in basicTotalAxis) if ('before' == basicTotalAxis[col]) {
                lastBasicAxis !== col ? totalAxis.before.push(col) : errorMsg(col);
            }
            // Put the total after the cols (**)
            for (var col in Pivot.tools.reverseProp(basicTotalAxis)) if ('after' == basicTotalAxis[col]) {
                lastBasicAxis !== col ? totalAxis.after.push(col) : errorMsg(col);
            }
            if ('after' === totalPos) totalAxis.after.push(all);
            return totalAxis;
        },
        // Fill the result with empty slots
        _initResult: function () {
            for (var row = 0; row < this.nested.rows.length; row++) {
                this.result[row] = [];
                for (var col = 0; col < this.nested.cols.length; col++) {
                    this.result[row][col] = [];
                }
            }
        },
        // Insert original data row in every matched slot
        _insertResult: function (dataRow) {
            this.addTimer();
            // Determine the best way to cross the matrix (performance optimization)
            var rows = 'rows', cols = 'cols', reverse = false;
            if (this.nested.cols.length > this.nested.rows.length) {
                rows = 'cols'; cols = 'rows', reverse = true;
            }
            for (var row = 0; row < this.nested[rows].length; row++)
                if (this._matchSlot(this.nested[rows][row], dataRow))
                    for (var col = 0; col < this.nested[cols].length; col++)
                        if (this._matchSlot(this.nested[cols][col], dataRow))
                            this._addSlot(dataRow, row, col, reverse);
            this.addTimer('insertResult');
        },
        _matchSlot: function (slot, dataRow) {
            for (var col in slot) if (undefined !== slot[col] && slot[col] != dataRow[col]) return false;
            return true;
        },
        _addSlot: function (dataRow, row, col, reverse) {
            var r = row, c = col;
            if (reverse) {
                r = col; c = row;
            }
            this.result[r][c].push(tool.extend({}, dataRow));
            this._tagSlot(r, c);
        },
        // Tag every non-empty slot as filled
        _tagSlot: function (row, col) {
            if (!tool.array.exists(row, this.filled.result.rows)) this.filled.result.rows.push(row);
            if (!tool.array.exists(col, this.filled.result.cols)) this.filled.result.cols.push(col);
        },
        getNestedAxis: function (row, col) {
            return tool.extend({}, this.nested.rows[row], this.nested.cols[col]);
        },
        getNestedRows: function (row) {
            return tool.extend({}, this.nested.rows[row]);
        },
        getNestedCols: function (col) {
            return tool.extend({}, this.nested.cols[col]);
        },



        _setIndicators: function () {
            this.addTimer();
            var filled = { rows: [], cols: [] }, isFilled = false;
            for (var i = 0; i < this.indicators.length; i++) {
                var indic = this.indicators[i];
                if (undefined !== indic.emptyValue) isFilled = true;
                for (var row = 0; row < this.nested.rows.length; row++) {
                    indic.result[row] = [];
                    for (var col = 0; col < this.nested.cols.length; col++) {
                        var value = indic.result[row][col] = this._setIndicator(row, col, i);
                        if (undefined !== indic.emptyValue && undefined !== value && indic.emptyValue != value) {
                            // This row and this col contains at least one valuable indicator
                            tool.array.exists(row, filled.rows) || filled.rows.push(row);
                            tool.array.exists(col, filled.cols) || filled.cols.push(col);
                        }
                    }
                }
            }
            if (isFilled) this.filled.indicators = filled;
            this.addTimer('setIndicators');
            return this;
        },
        _setIndicator: function (row, col, i) {
            var slot = this.result[row][col];
            if (!slot.length) return undefined; // Empty slot returns undefined
            var indicator = this.indicators[i];
            for (var values = [], s = 0; s < slot.length; s++) {
                for (var rowCols = [], c = 0; c < indicator.cols.length; c++) {
                    rowCols[c] = slot[s][indicator.cols[c]];
                }
                values.push(indicator.renderRow.apply(this.getNestedAxis(row, col), rowCols));
            }
            return indicator.renderCol(values);
        },
        _renderIndicators: function (row, col) {
            var indicators = this.getIndicators(row, col);
            this.indicators.render = this.indicators.render || Pivot.settings.indicatorsRender;
            return this.indicators.render.call(this.getJsonSlot(row, col),
                indicators.values,
                indicators.titles,
                indicators.alias,
                this.options.htmlIndicatorsPerRow,
                this.options.htmlClassPrefix
            );
        },
        getIndicators: function (row, col) {
            var slot = this.result[row][col], indicators = {
                values: [], titles: [], alias: []
            };
            if (slot.length) this.indicators.forEach(function (indicator) {
                indicators.values.push(indicator.result[row][col]);
                indicators.titles.push(indicator.title);
                indicators.alias.push(indicator.alias);
            });
            return indicators;
        },
        getJsonIndicators: function (row, col) {
            var json = {},
                slot = this.result[row][col],
                _I = this.options.jsonIndicatorPrefix;
            if (slot.length) for (var i = 0; i < this.indicators.length; i++) {
                var alias = this.indicators[i].alias || (_I + (i + 1));
                json[alias] = this.indicators[i].result[row][col];
            }
            return json;
        },
        getJsonIndicatorsAlias: function () {
            var alias = [], _I = this.options.jsonIndicatorPrefix;
            for (var i = 0; i < this.indicators.length; i++) alias.push(this.indicators[i].alias || (_I + (i + 1)));
            return alias;
        },



        // Remove empty rows and cols according to this.filled informations
        _skipEmpty: function () {
            if (!this.options.skipEmpty) return this;
            this.addTimer();
            // Skip empty against .filled.indicators (when emptyValue has been defined). Otherwise take .filled.result
            var filled = this.filled.indicators ? this.filled.indicators : this.filled.result;
            // Init indicators
            var indicators = [];
            this.indicators.forEach(function () { indicators.push([]); });
            var forEachIndicator = function (callback) {
                for (var i = 0; i < this.indicators.length; i++) callback.call(this.indicators[i], indicators[i]);
            }.bind(this);
            // Traverse this.result and create new result and indicators
            for (var result = [], rowIndex = 0, row = 0; row < this.result.length; row++) {
                if (!tool.array.exists(row, filled.rows)) continue;
                result[rowIndex] = [];
                forEachIndicator(function (indicator) {
                    indicator[rowIndex] = [];
                });
                for (var colIndex = 0, col = 0; col < this.result[row].length; col++) {
                    if (!tool.array.exists(col, filled.cols)) continue;
                    result[rowIndex][colIndex] = this.result[row][col];
                    forEachIndicator(function (indicator) {
                        indicator[rowIndex][colIndex] = this.result[row][col];
                    });
                    colIndex++;
                }
                rowIndex++;
            }
            for (var nestedRows = [], row = 0; row < this.nested.rows.length; row++) {
                if (tool.array.exists(row, filled.rows)) nestedRows.push(this.nested.rows[row]);
            }
            for (var nestedCols = [], col = 0; col < this.nested.cols.length; col++) {
                if (tool.array.exists(col, filled.cols)) nestedCols.push(this.nested.cols[col]);
            }
            // Replace this.result
            this.result = result;
            // Replace this.indicators[i].result
            forEachIndicator(function (indicator) { this.result = indicator; });
            // Replace this.nested.rows and this.nested.cols
            this.nested.rows = nestedRows;
            this.nested.cols = nestedCols;
            this.addTimer('skipEmpty');
            return this;
        },
        // this.result size before ._skipEmpty() was applied
        getNestedBasicSize: function () {
            return { rows: this.nested.basic.rows.length, cols: this.nested.basic.cols.length };
        },
        // this.result final size after ._skipEmpty() was applied
        getNestedSize: function () {
            return { rows: this.nested.rows.length, cols: this.nested.cols.length };
        },

        // Get the pivot as HTML table
        setHtml: function () {
            this.addTimer();
            var nbsp = '&nbsp;',
            all = this.options.allTranslation,
            hcp = this.options.htmlClassPrefix,
            getClass = function (/*css1, css2, ...*/) {
                for (var css = [], i = 0; i < arguments.length; i++) {
                    var suffix = arguments[i];
                    if (undefined !== suffix) css.push(hcp + (suffix ? '-' + suffix : ''));
                }
                return ' class="' + css.join(' ') + '"';
            },
            getSpan = function (axis, num) {
                return num > 1 ? (' ' + axis + 'pan="' + num + '"') : ''; // axis + 'pan' == 'colspan' or 'rowspan'
            },
            getTh = function (nested, axis) {
                nested = nested[axis];
                var th = {}, span = {}, token = [];
                for (var col in nested[0]) {
                    th[col] = [];
                    span[col] = 1;
                    token.push([]);
                }
                var isUndefined = function (o) {
                    for (var p in o) if (undefined !== o[p]) return false;
                    return true;
                };
                for (var n = nested.length, i = 0; i < n; i++) {
                    var colIndex = 0, colPrev = undefined, isAll = isUndefined(nested[i]);
                    for (var col in nested[i]) {
                        if (
                            n - 1 == i || undefined === nested[i][col] ||
                            nested[i][col] != nested[i + 1][col] || tool.array.exists(i, token[colIndex])
                        ) {
                            var content = nested[i][col], isTotal = (undefined === content); // strict comparison
                            if (isTotal) {
                                content = isAll ? all : nested[i][colPrev] ? (all + ' ' + nested[i][colPrev]) : '';
                            }
                            th[col].push({
                                text: nested[i][col],
                                span: span[col],
                                html: '<th' + getClass(axis, isTotal ? 'total' : undefined) +
                                    getSpan(axis, span[col]) + '>' + content + '</th>'
                            });
                            span[col] = 1;
                            for (var j = colIndex; j < token.length; j++)
                                if (!tool.array.exists(i, token[j])) token[j].push(i);
                        } else {
                            span[col]++;
                        }
                        colIndex++;
                        colPrev = col;
                    }
                }
                return th;
            },
            getCount = function (o) {
                var c = 0; for (var p in o) c++; return c;
            };
            var thCols = getTh(this.nested, 'cols'), thColSpan = getCount(thCols),
                thRows = getTh(this.nested, 'rows'), thRowSpan = getCount(thRows);
            var table = [], first = true;
            for (var col in thCols) {
                var th = '';
                if (first && thRowSpan) {
                    th += '<th' + getClass('first') + ' colspan="' + thRowSpan + '" rowspan="' + thColSpan + '">' +
                        nbsp + '</th>';
                    first = false;
                }
                for (var i = 0; i < thCols[col].length; i++) {
                    th += thCols[col][i].html;
                }
                table.push('<tr>\n\t' + th + '\n</tr>');
            }
            var thRowsSpan = {};
            for (var row = 0; row < this.result.length; row++) {
                var td = [], trOdd = row % 2 ? ' class="odd"' : '';
                for (var col = 0; col < this.result[row].length; col++) {
                    var slot = this.indicators.length ?
                        this._renderIndicators(row, col) :
                        this._viewSlot(row, col);
                    td.push('\t<td>' + (slot || nbsp) + '</td>');
                }
                var th = '';
                for (var r in thRows) {
                    thRowsSpan[r] = thRowsSpan[r] || 0;
                    if (0 == thRowsSpan[r]) {
                        var thRow = thRows[r].shift();
                        thRowsSpan[r] = thRow.span - 1;
                        th += '\t' + thRow.html + '\n';
                    } else {
                        thRowsSpan[r]--;
                    }
                }
                th += td.join('\n');
                table.push('<tr' + trOdd + '>\n' + th + '\n</tr>');
            }
            this.output.html = '<table' + getClass('') + '>\n' + table.join('\n') + '\n</table>';
            this.addTimer('setHtml');
            return this;
        },

        // Get the pivot as JSON
        setJson: function () {
            this.addTimer();
            var json = this.output.json,
                _C = this.options.jsonColumnPrefix,
                _I = this.options.jsonIndicatorPrefix,
                pvt = this;
            for (var row = 0; row < this.result.length; row++) {
                json[row] = tool.extend({}, pvt.nested.rows[row]);
                for (var col = 0; col < this.result[row].length; col++) (function (row, col) {
                    if (pvt.indicators.length) {
                        for (var i = 0; i < pvt.indicators.length; i++) {
                            json[row][(_C + (col + 1)) + (_I + (i + 1))] = pvt.indicators[i].result[row][col];
                        }
                    } else {
                        json[row][(_C + (col + 1)) + (_I + (0 + 1))] = pvt._viewSlot(row, col);
                    }
                })(row, col);
            }
            this.addTimer('setJson');
            return this;
        },
        getJsonCols: function () {
            var _C = this.options.jsonColumnPrefix,
                _I = this.options.jsonIndicatorPrefix;
            for (var cols = [], col = 0; col < this.nested.cols.length; col++)
                for (var i = 0; i < this.indicators.length; i++)
                    cols.push((_C + (col + 1)) + (_I + (i + 1)));

            return cols;
        },
        getJsonSlot: function (row, col) {
            return tool.extend(this.getNestedAxis(row, col), this.getJsonIndicators(row, col));
        },
        getJsonRowAlias: function (index) {
            return this._getJsonAxisAlias('rows', index);
        },
        getJsonColAlias: function (index) {
            return this._getJsonAxisAlias('cols', index);
        },
        _getJsonAxisAlias: function (axis, index) {
            if (!(index in this.nested[axis])) return undefined; // Should not append (unless Murphy law is right...) !
            var nested = Pivot.tools.splitObj(this.nested[axis][index]),
                alias = (Pivot.tools.arr2Str(nested.val, ', ') || this.options.allTranslation);
            return alias;
        },
        getJsonColIndex: function (alias) {
            var _C = this.options.jsonColumnPrefix,
                _I = this.options.jsonIndicatorPrefix,
                pattern = '^' + _C + '([0-9]+)' + _I + '[0-9]+$'; // ie: if (alias = "_C3_I2") then (index = 3)
            var result = new RegExp(pattern).exec(alias);
            if (result) {
                var index = parseInt(result[1], 10) - 1;
                if (0 <= index && this.nested.cols.length > index) return index;
            }
        },



        // Get the slot items when no indicators available...
        _viewSlot: function (row, col) {
            var slot = tool.extend([], this.result[row][col]);
            if (this.options.diff) {
                for (var item = 0; item < slot.length; item++)
                    slot[item] = Pivot.tools.diffObj(slot[item], this.getNestedAxis(row, col));
            }
            var size = this.options.stringify;
            if (size) {
                slot = JSON.stringify(slot);
                if (tool.is.number(size) && slot.length > size) slot = slot.substr(0, size) + '...';
            }
            return slot;
        },



        // Overwrite the default settings for this pivot
        setOptions: function (options) {
            if (!tool.is.object(options)) return;
            for (var key in options) this.setOption(key, options[key]);
        },
        setOption: function (key, val) {
            if (key in this.options) this.options[key] = val;
        },



        // Test the pivot performances
        addTimer: function (key1, key2) {
            // Start timer
            if (!this._timerStart) return (this._timerStart = Pivot.tools.timer());
            // Stop timer
            var delay = Pivot.tools.timer(this._timerStart);
            delete this._timerStart;
            // Update detail timer
            if (!key2) {
                this.timer[key1] = (this.timer[key1] || 0) + delay;
            } else {
                this.timer[key1] = this.timer[key1] || {};
                this.timer[key1][key2] = (this.timer[key1][key2] || 0) + delay;
            }
            // Update total timer
            this.timer.total += delay;
        },

        log: function () {
            if (this.debug) tool.console.log.apply(undefined, arguments);
        },

        error: function (message) {
            tool.console.error('Bi.tool.PivotTable: ' + message);
        }

    };

    Pivot.settings = {
        _allAxisAlias: '[[[all]]]', // Alias of the rows/cols total

        allTranslation: 'Total',

        useSetTimeout: true,

        skipEmpty: true, // Skip the entire rows/cols of empty slots (and against indicators emptyValue if defined)

        // Render the slot indicators in setHtml() method
        indicatorsRender: function (values, titles, alias, numPerRow, classPrefix) {
            // Inside the function "this" contains the json slot (.getJsonSlot())
            if (!values.length) return '';
            if (values.length < numPerRow) numPerRow = values.length; // overwrite
            var cp = classPrefix + '-indicator'; // bi-pivot-table-indicator
            for (var buffer = [''], row = 0, i = 0; i < values.length + (values.length % numPerRow) ; i++) {
                if (i && !(i % numPerRow)) buffer[++row] = '';
                if (i < values.length) {
                    var css = 'class="' + cp + ' ' + cp + '-' + (i + 1) + '"';
                    buffer[row] += '\t<span ' + css + ' title="' + (titles[i] || '') + '">' +
                        values[i] + '</span>\n';
                } else {
                    var css = 'class="' + cp + ' ' + cp + '-empty' + '"';
                    buffer[row] += '\t<span ' + css + '>&nbsp;</span>\n';
                }
            }
            for (var html = '', row = 0; row < buffer.length; row++) {
                html += '<div class="' + cp + '-wrapper">\n' + buffer[row] + '</div>\n';
            }
            return html;
        },
        htmlClassPrefix: 'bi-pivot-table',
        htmlIndicatorsPerRow: 2,

        jsonColumnPrefix: '_PIVOT',
        jsonIndicatorPrefix: '_INDICATOR',

        // For debugging (when no indicator defined to render the slots)
        diff: false, // Set if the json slots contains only the "diff" intersection

        stringify: false // Stringify the json slots. Set true (or a integer to limit the number of characters).
    };

    Pivot.tools = {
        propList: function (obj) {
            var list = [];
            for (var prop in obj) list.push(prop);
            return list;
        },
        inValues: function (val, values) {
            for (var i = 0; i < values.length; i++) if (val == values[i].val) return true;
            return false;
        },
        compareKeys: function (a, b) {
            a = a.key; b = b.key;
            if (tool.is.number(a) && tool.is.number(b)) return a > b ? 1 : b > a ? -1 : 0;
            return (a + '').localeCompare(b + '');
        },
        timer: function (before) {
            var now = new Date().getTime();
            return now - (before || 0);
        },
        arrayStr2Obj: function (arr, prop) {
            var list = [];
            for (var i = 0; i < arr.length; i++) {
                var o = {};
                o[prop] = arr[i];
                list.push(o);
            }
            return list;
        },
        crossLists: function (list1, list2) {
            var cross = [];
            for (var i = 0; i < list1.length; i++) {
                for (var j = 0; j < list2.length; j++) {
                    cross.push(tool.extend({}, list1[i], list2[j]));
                }
            }
            return cross;
        },
        reverseProp: function (obj) {
            var reverse = {}, prop = Pivot.tools.propList(obj);
            for (var i = prop.length - 1; i >= 0; i--) reverse[prop[i]] = obj[prop[i]];
            return reverse;
        },
        splitObj: function (obj) {
            var split = { key: [], val: [] };
            for (var prop in obj) {
                split.key.push(prop);
                split.val.push(obj[prop]);
            }
            return split;
        },
        arr2Str: function (arr, sep) {
            var str = [];
            for (var i = 0; i < arr.length; i++) if ((undefined !== arr[i]) && (arr[i] + '')) str.push(arr[i]);
            return str.join(sep);
        },
        diffObj: function (obj, against) {
            var diff = {};
            for (var prop in obj) if (!(prop in against)) diff[prop] = obj[prop];
            return diff;
        },
        indicators: {
            // v=values, r=result
            sum: function (v) {
                var r = 0;
                for (var i = 0; i < v.length; i++) r += v[i];
                return r;
            },
            average: function (v) {
                if (!v.length) return 0;
                return Pivot.tools.indicators.sum(v) / v.length;
            },
            count: function (v) {
                return v.length;
            },
            countDistinct: function (v) {
                var r = [];
                for (var i = 0; i < v.length; i++) if (!tool.array.exists(v[i], r)) r.push(v[i]);
                return r.length;
            },
            min: function (v) {
                if (!v.length) return undefined;
                var r = v[0];
                for (var i = 1; i < v.length; i++) if (r > v[i]) r = v[i];
                return r;
            },
            max: function (v) {
                if (!v.length) return undefined;
                var r = v[0];
                for (var i = 1; i < v.length; i++) if (r < v[i]) r = v[i];
                return r;
            }
        }
    };

    // Expose
    tool.PivotTable = Pivot;

})(this, this.Bi = this.Bi || {});
