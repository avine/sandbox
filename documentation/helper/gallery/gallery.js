
(function ($) {
    "use strict";

    // Namespace
    var gallery = {};

    /* ---------- User Interface ---------- */

    gallery.ui = {};

    // Simple popup behavior
    gallery.ui.popup = function (role, callback) {
        // Target (should be unique for each role)
        var role = '[data-role="' + role + '"]',
            $popup = $('.gallery-popup' + role); // $popup.size() == 1;
        // Triggers (one or more)
        $('.gallery-popup-toggle' + role).click(function (e) {
            e.preventDefault();
            var cancel = undefined; // Make possible to cancel the trigger effect
            if (callback) {
                var action = $popup.hasClass('gallery-popup-show') ? 'close' : 'open',
                    cancel = callback.call($popup.get(0), action);
            }
            if ('cancel' !== cancel) $popup.toggleClass('gallery-popup-show');
        });
    };

    // Simple content switcher (each time you click on the unique trigger, you see the next available content)
    //
    // <!-- Trigger (use id attribute) -->
    // <a href="#" id="my-name">Switcher</a>
    //
    // <!-- Contents (use class attribute) -->
    // <div class="my-name" data-role="role1">Content 1</div>
    // <div class="my-name" data-role="role2">Content 2</div>
    // ...
    //
    gallery.ui.switcher = function (name, callback) {
        // Contents
        var $contents = $('.' + name).addClass('gallery-switcher'),
            size = $contents.size(),
            index = 0;
        // Trigger (unique)
        $('#' + name).click(function (e) {
            e.preventDefault();
            $contents.removeClass('gallery-switcher-show');
            var $show = $contents.eq(++index % size).addClass('gallery-switcher-show');
            if (callback) callback.call($show.get(0), $show.data('role'));
        });
        // Init
        $contents.eq(0).addClass('gallery-switcher-show');
    };

    // Simple HTML message (that is removed on click)
    gallery.ui.get$message = function (msg, type) {
        var faIcon;
        switch (type) {
            case 'info':
                faIcon = 'check';
                break;
            case 'error':
            default:
                faIcon = 'exclamation-triangle';
                type = 'error'; // default value
                break;
        }
        return $('<p class="gallery-message"><i class="fa fa-' + faIcon + '"></i> ' + msg + '</p>')
            .addClass('gallery-message-' + type)
            .click(function () { this.remove(); });
    };

    // Simple HTML link (using font-awesome icon) with callback
    gallery.ui.get$linkIcon = function (faIcon, role, callback) {
        role = role ? ' role="' + role + '"' : '';
        return $('<a href="#"' + role + '><i class="fa fa-' + faIcon + '"></i></a>').click(function (e) {
            e.preventDefault();
            callback.call(this, e, role);
        });
    };

    /* ---------- Database adapter ---------- */

    gallery.db = {};

    // Database adapter (handle database row of the "Gallery" table)
    gallery.db.adapter = function (dbaNew, dbaOld) {
        return $.extend({
            Id: null,
            Category: null,
            Title: null,
            Description: null,
            Type: null,
            Data: null,
            Order: null,
        }, dbaOld || {}, dbaNew || {});
    };

    // Check dbAdapter object
    gallery.db.isEmpty = function (dba) {
        if (dba) for (var field in dba) if (null !== dba[field]) return false;
        return true;
    };

    // Store dbAdapter object in session storage
    gallery.db.storage = function (key, dbaNew) {
        // Add key prefix
        key = 'biDoc.gallery.' + key;
        // Get old value (if dbaNew is not null)
        var dbaOld = null !== dbaNew ? Bi.tool.storage.session(key) : undefined;
        // Overwrite old value with new one
        dbaNew = gallery.db.adapter(dbaNew, dbaOld);
        // Store new value
        Bi.tool.storage.session(key, dbaNew);
        // Return new value (if revelant)
        return gallery.db.isEmpty(dbaNew) ? null : dbaNew;
    };

    // Serialize dbAdapter object before sending to server (only revelant property)
    gallery.db.serialize = function (dba) {
        if (dba) {
            dba = $.extend({}, dba); // Duplicate
            if (dba.Data) dba.Data = JSON.stringify(dba.Data); // Stringify "Data" property
        }
        return dba;
    };

    // Unserialize dbAdapter object when retrieving from server (only revelant property)
    gallery.db.unserialize = function (dba) {
        if (dba) {
            dba = $.extend({}, dba); // Duplicate
            if (dba.Data) dba.Data = JSON.parse(dba.Data); // Parse "Data" property
        }
        return dba;
    };

    // Upload local dbAdapter object to remote database (insert into or update database)
    gallery.db.upload = function (dba, method, callback) {
        // Check
        var hasId = dba && dba.Id, message;
        // What do we do ?
        if (!hasId || 'PUT' == method.toUpperCase()) {
            method = 'PUT'; // Insert new database item
            message = 'The item has been created.';
        } else {
            method = 'POST'; // Update database item
            message = 'The item has been updated.';
        }
        // Web service url
        var settings = {
            url: Bi.tool.url.ROOT + '/api/bigallery/item'
        };
        var request = {
            'PUT': function () {
                $.ajax($.extend(settings, {
                    method: 'PUT',
                    data: gallery.db.serialize(dba),
                    success: function (newId) {
                        dba.Id = newId; // The 'PUT' web service just insert a new row in the database.
                        request['POST'](); // Update the inserted row with all the item details...
                    }
                }));
            },
            'POST': function () {
                $.ajax($.extend(settings, {
                    method: 'POST',
                    data: gallery.db.serialize(dba),
                    success: function () {
                        callback(dba, gallery.ui.get$message(message, 'info')); // Invoke the callback!
                    }
                }));
            }
        };
        request[method]();
    };

    /* ---------- Conversion layer ---------- */

    gallery.convert = {};

    // Convert csv to data
    gallery.convert.csv2Data = function (csv, sep) {
        sep = gallery.convert.csvSep(sep);
        var analysis = { columns: [], data: [] }, error = false;
        csv = (csv || '').replace(/^\s+|\s+$/g, '');
        if (csv) csv.split(sep.row).forEach(function (row, index) {
            var cols = row.split(sep.col);
            if (0 == index) {
                analysis.columns = cols; // First row defines the columns name and number
            } else if (analysis.columns.length == cols.length) {
                cols.forEach(function (c, i) {
                    isNaN(c = Bi.tool.string.toNumber(c)) || (cols[i] = c); // Try to parse numbers
                });
                analysis.data.push(cols);
            } else {
                error = true;
            }
        });
        return error ? undefined : analysis;
    };

    // Convert data to csv
    gallery.convert.data2Csv = function (analysis, sep) {
        sep = gallery.convert.csvSep(sep);
        var csv = [];
        if (analysis) {
            csv.push(analysis.columns.join(sep.col));
            analysis.data.forEach(function (row) { csv.push(row.join(sep.col)); });
        }
        return csv.join(sep.row);
    };

    // Convert data to json
    gallery.convert.data2Json = function (analysis) {
        var json = [];
        if (analysis) analysis.data.forEach(function (dataRow) {
            var rowIndex = json.push({}) - 1;
            analysis.columns.forEach(function (colName, index) {
                json[rowIndex][colName] = dataRow[index];
            });
        });
        return json;
    };

    // Csv separators
    gallery.convert.csvSep = function (sep) {
        return $.extend({ col: '\t', row: '\n' }, sep || {});
    };

    /* ---------- Business object layer ---------- */

    gallery.bo = {};

    // Display gallery wall
    //
    //    settings = {
    //        wallUrl   : '', // Web service url to get wall items
    //        buildUrl  : '', // Page url where to build a wall item 
    //        storageKey: '', // Key of the associated gallery.db.storage
    //        renderFn  : ''  // How to render the item ?
    //    };
    //
    gallery.bo.displayWall = function (settings) {
        $.get(settings.wallUrl, function (items) {
            // Expected DOM containers
            var $wall = $('#gallery-wall'), $filter = $('#gallery-wall-filter');

            var wallTmpl =
                '<div class="gallery-wall">' +
                    '<div class="gallery-wall-action" data-biz-bind="action">' +
                        '<a data-biz-bind="edit" href="#"><i class="fa fa-edit"></i></a>' +
                        '<a data-biz-bind="delete" href="#"><i class="fa fa-trash"></i></a>' +
                    '</div>' +
                    '<div class="gallery-wall-content" data-biz-bind="content"></div>' +
                    '<div class="gallery-wall-info" data-biz-bind="info"></div>' +
                    '<div class="gallery-wall-type" data-biz-bind="type"><i class="fa fa-bookmark"></i></div>' +
                '</div>';

            var wallItems = [];

            var goToBuildPage = function (item) {
                // Store the item locally
                gallery.db.storage(settings.storageKey, item);
                // Open the builder url to edit this item
                window.location = settings.buildUrl;
            };

            // Filter items by they type
            var filterTypes = [], filterDefault = '--- Type filter ---';
            $filter.append('<option>' + filterDefault + '</option>');

            items.forEach(function (item) {
                item = gallery.db.unserialize(item);

                var tmpl = Bi.Core.Template.bindHtml(wallTmpl);
                wallItems.push(tmpl.$html);

                var itemTitle = gallery.bo.getReadableItemTitle(item.Type);
                $(tmpl.scope.type).append(' ' + itemTitle);

                $(tmpl.scope.info).append(
                    '<b>' + item.Title + (item.Description ? ' : ' : '') + '</b> ' +
                    (item.Description || '')
                );

                $(tmpl.scope.edit).click(function (e) {
                    e.preventDefault();
                    goToBuildPage(item);
                });

                $(tmpl.scope.delete).click(function (e) {
                    e.preventDefault();
                    if (confirm('Delete item ?')) $.ajax({
                        url: Bi.tool.url.ROOT + '/api/bigallery/item/' + item.Id,
                        method: 'DELETE',
                        success: function () { $(tmpl.$html).remove(); }
                    });
                });

                // Add filter option (unique values)
                if (-1 == filterTypes.indexOf(item.Type)) {
                    filterTypes.push(item.Type);
                    $('<option>').val(item.Type).text(itemTitle).appendTo($filter);
                }

                // Insert template in the wall
                tmpl.$html.attr('data-type', item.Type).appendTo($wall);
                
                // Render item
                settings.renderFn(tmpl.scope.content, item);
            });

            // Add new item (just go to build page without item)
            var tmpl = Bi.Core.Template.bindHtml(wallTmpl);
            $(tmpl.scope.content).append('<i class="fa fa-plus-circle"></i>').click(function () {
                goToBuildPage(null);
            });
            tmpl.$html.addClass('gallery-wall-add').appendTo($wall);

            // Filter handler
            $filter.change(function () {
                var selected = $filter.val();
                wallItems.forEach(function ($html) {
                    var show = filterDefault == selected || $html.attr('data-type') == selected;
                    $html[show ? 'removeClass' : 'addClass']('gallery-wall-hide');
                });
            });

        });
    };

    // Hack: Just because the item.Type contains a prefixed name
    // (like: processBuildInput for Filter or displayCharts for Analysis),
    // we needs to remove this prefix and get a more readable info
    gallery.bo.getReadableItemTitle = function (itemTitle) {
        return itemTitle.replace(/^(processBuild|display)/, '');
    };

    gallery.bo.addAttribute = function (name, value) {
        // Expected DOM container
        var $attr = $('#gallery-attr');

        // Add item container
        var $item = $('<div>').appendTo($attr);

        // Add input for name attribute
        var $name = $('<input />').appendTo($item);

        // Add textarea for value attribute (inside a popup)
        var $popup = $('<div class="gallery-popup"><div>' +
                    '<h3>' + $name.val() + '</h3>' +
                    '<textarea></textarea>' +
                    '<button><i class="fa fa-check"></i> Close</button>' +
                '</div></div>').appendTo($item),
            $value = $popup.find('textarea'),
            togglePopup = function () {
                $popup.toggleClass('gallery-popup-show');
            };
        $popup.find('button').click(togglePopup);

        // Init default values
        if (name) $name.val(name);
        if (value) $value.val(value);

        // Copy the name in the popup <h3>
        var copyName = function () { $popup.find('h3').text('Edit "' + $name.val() + '":'); };
        copyName(); // Init
        $name.on('input', copyName); // Update

        // Move up/down or Remove item
        var moveAttribute = function (item, up) {
            var $childs = $attr.children(), size = $childs.size(), index = $childs.index(item), newIndex = index + (up ? -1 : +1);
            if (-1 != index && newIndex >= 0 && newIndex < size) $childs.eq(newIndex)[up ? 'before' : 'after'](item);
        };
        gallery.ui.get$linkIcon('edit', 'edit', togglePopup).appendTo($item);
        gallery.ui.get$linkIcon('long-arrow-up', 'up', function () { moveAttribute($item, true); }).appendTo($item);
        gallery.ui.get$linkIcon('long-arrow-down', 'down', function () { moveAttribute($item, false); }).appendTo($item);
        gallery.ui.get$linkIcon('trash-o', 'trash', function () { $item.remove(); }).appendTo($item);

        //$name.add($value).on('click', function () { this.select(); }); // Select all content on click

        // Adapt textarea height according to its content
        var lineHeight = parseFloat($value.css('line-height'));
        $value.on('input', function () {
            var height = $value.val().split('\n').length;
            if (height > 30) height = 30;
            var minHeight = (height + 1) * lineHeight + 2; // Add small delta...
            if (minHeight < 200) minHeight = 200; // Tips: this value should match the min-height defined inside the CSS...
            $value.css('min-height', minHeight + 'px');
        }).blur(function () {
            //$value.css('min-height', 'auto'); // Restore auto-height on blur
        }).trigger('click');
    };

    gallery.bo.getAttributes = function () {
        // Expected DOM container
        var $attr = $('#gallery-attr'), attributes = {};
        $attr.children().each(function () {
            var $item = $(this),
                name = $item.find('input').val(),
                value = $item.find('textarea').val();
            if (!name) return;
            var number = Bi.tool.string.toNumber(value);
            attributes[name] = isNaN(number) ? value : number;
        });
        return attributes;
    };

    /* ---------- Render Bi Filter and Analysis ---------- */

    gallery.bi = {};

    // Invoke the method Bi.Core.Analysis[type] to render an analysis
    gallery.bi.renderAnalysis = function (node, type, analysisData, attributes) {

        analysisData = new Bi.Core.Analysis.Data(analysisData || { columns: [], data: [] });
        attributes = new Bi.Core.Analysis.Attributes(attributes || {});

        var virtualAnalysisInstance = new Bi.Core.Analysis(),
            virtualOutputInstanceId = 1;

        var tools = {
            replaceText: function (text) { return text; },
            columnFormatting: function (analysisData, colExp, colFormat) {
                return virtualAnalysisInstance.columnFormatting(analysisData, colExp, colFormat, virtualOutputInstanceId);
            },
            outputInstanceId: virtualOutputInstanceId,
            isRefresh: false
        },
        finish = function () { };

        try {
            Bi.Core.Analysis.display[type].apply($(node).get(0), [
                // Full signature of the analysis display type function
                analysisData, attributes, tools, finish
            ]);
        } catch (e) {
            $(node).html('<p class="gallery-message gallery-message-error">' + e + '</p>');
            console.log(' ');
            console.error('Analysis: ' + type + '\nBased on columns: [' + analysisData.cols.join(', ') + ']', '\n' + e, '\n', attributes.attr);
            console.log(' ');
        }
    };

    // Invoke the method Bi.Core.Filter[type] to render a filter
    gallery.bi.renderFilter = function (node, type, data, details) {

        var data = gallery.convert.data2Json(data); // The filter process expects a JSON

        try {
            // Hack: the filter's label is not a part of the "details".
            // However in this documentation, the detail "Title" (when available) is used to add the filter's label.
            // We have used "Title" to be consistant with the Analysis which is using the same attribute to display it's title...
            Bi.Core.Filter.process[type].build($(node), details, data, '<b style="display:block">' + (details.Title || 'Label') + '</b>');
        } catch (e) {
            $(node).html('<p class="gallery-message gallery-message-error">' + e + '</p>');
            console.error(type, data, details, e);
        }
    };

    /* ---------- Expose features ---------- */

    window.biDoc = window.biDoc || {};
    window.biDoc.gallery = gallery;

})(jQuery);
