
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, Filter = Bi.Core.Filter;

    // To use this filters, you need to set the option:
    //
    //      Bi.Core.Filter.OPTIONS.processSuffix = 'Html';
    //
    Filter.processHtml = {};

    /* -----
       Input
       ----- */

    Filter.processHtml.Input = {

        // Insert the input and the label in the jQuery $layout object.
        // Requirement: The input must have the CSS class Filter.LAYOUT.INPUT
        build: function ($layout, details, data, label) {
            var val = data && data.length ? data[0].VALUE : '',
                input = tool.html.tag('input', { type: "text", value: val, "class": Filter.LAYOUT.INPUT }, null);
            $layout.html(label + input);
        },
        // Requirement: The function must return true if the selection is successfully set
        set: function ($input, details, selectionType, selection) {
            var success = false;
            if (selection.length) {
                $input.val(selection[0] || '');
                success = true;
            }
            return success;
        },
        // Requirement: The function must return an object with the structure { Value: [], Caption: [] }
        get: function ($input, details) {
            var val = $input.val();
            val = val ? [val] : [];
            var selection = Filter.getEmptySelection();
            selection.Value = val;
            selection.Caption = val;
            return selection;
        },
        // Requirement: Set the event type that must be listened to handle the filter status changes
        event: 'change'

    };

    /* --------
       Calandar
       -------- */

    Filter.processHtml.Calendar = {

        build: function ($layout, details, data, label) {
            $layout.html(label);

            var $input = jQuery(tool.html.tag('input', {
                "type": "date",
                "class": Filter.LAYOUT.INPUT
            }, null)).appendTo($layout);

            var date = data.length ? Filter.processHtml.Calendar._formatDate(data[0].VALUE) : '';
            if (date) $input.val(date);
        },
        set: function ($input, details, selectionType, selection) {
            var success = false;
            if (selection.length) {
                var date = Filter.processHtml.Calendar._formatDate(selection[0]);
                if (date) {
                    $input.val(date);
                    success = true;
                }
            }
            return success;
        },
        get: function ($input, details) {
            var val = ($input.val() || '').replace(/\-/g, ''); // yyyy-MM-dd => yyyyMMdd
            val = val ? [val] : [];
            var selection = Filter.getEmptySelection();
            selection.Value = val;
            selection.Caption = val;
            return selection;
        },
        event: 'change',

        _formatDate: function (date) {
            date = date + '';
            if (/^[0-9]{8}$/.test(date)) { // yyyyMMdd
                return [date.substr(0, 4), date.substr(4, 2), date.substr(6, 2)].join('-'); // yyyy-MM-dd
            } else {
                tool.console.error(
                    'Bi.Core.Filter.processHtml.Calendar._formatDate: Invalid date format', date, '(expected: yyyyMMdd)'
                );
            }
        }

    };

    /* ----------------
       Radio & Checkbox
       ---------------- */

    Filter.processHtml.Radio = {

        // Radio
        build: function ($layout, details, data, label) {
            return Filter.processHtml._RadioAndCheckbox.build($layout, details, data, label, 'radio');
        },
        set: function ($input, details, selectionType, selection) {
            return Filter.processHtml._RadioAndCheckbox.set($input, details, selectionType, selection, 'radio');
        },
        get: function ($input, details) {
            return Filter.processHtml._RadioAndCheckbox.get($input, details, 'radio');
        },
        event: 'change'

    };

    Filter.processHtml.Checkbox = {

        // Checkbox
        build: function ($layout, details, data, label) {
            return Filter.processHtml._RadioAndCheckbox.build($layout, details, data, label, 'checkbox');
        },
        set: function ($input, details, selectionType, selection) {
            return Filter.processHtml._RadioAndCheckbox.set($input, details, selectionType, selection, 'checkbox');
        },
        get: function ($input, details) {
            return Filter.processHtml._RadioAndCheckbox.get($input, details, 'checkbox');
        },
        event: 'change'

    };

    Filter.processHtml._RadioAndCheckbox = {

        build: function ($layout, details, data, label, type) {
            var input = '',
                name = Filter.LAYOUT.INPUT + details['_InstanceId'] + '-radio',
                br = 'horizontal' == details['orientation'] ? '' : '<br />';
            for (var i = 0; i < data.length; i++) {
                var id = name + i;
                input += tool.html.tag('label', { "class": Filter.LAYOUT.INPUT + '-label bi-form-nested-inverted' },
                    tool.html.tag('input', {
                        name: ('radio' == type) ? name : id, value: data[i].VALUE, "data-caption": data[i].CAPTION, type: type
                    }, null) + data[i].CAPTION
                );
                input += '<span class="custom-' + type + '"></span>'; // For Bootstrap integration
                if (i < data.length - 1) input += br;
            }
            input = tool.html.tag('div', { "class": Filter.LAYOUT.INPUT }, input);
            $layout.html(label + input);
        },
        set: function ($input, details, selectionType, selection, type) {
            var success = false;
            $input.find("input").each(function (index) {
                var $this = jQuery(this), checked = false;
                if ('All' == selectionType || (0 == index && 'First' == selectionType)) {
                    checked = true;
                } else {
                    var item = ('Caption' == selectionType) ? $this.data('caption') : $this.val();
                    if (tool.array.exists(item, selection)) checked = true;
                }
                $this.prop("checked", checked);
                if (checked) {
                    $this.trigger('change'); // To inform the biButtonGroup plugin
                    success = true;
                }
            });
            return success;
        },
        get: function ($input, details, type) {
            var selection = Filter.getEmptySelection();
            $input.find("input:checked").each(function () {
                var $this = jQuery(this);
                selection.Value.push($this.val());
                selection.Caption.push($this.data('caption'));
            });
            return selection;
        }

    };

    /* ------
       Select
       ------ */

    Filter.processHtml.Select = {

        build: function ($layout, details, data, label) {
            var option = '';
            for (var i = 0; i < data.length; i++) {
                option += '\n\t' + tool.html.tag('option', { value: data[i].VALUE }, data[i].CAPTION, true);
            }
            var attr = { "class": Filter.LAYOUT.INPUT };
            if ('Multi' == details['_Type']) attr.multiple = "multiple";
            if (details['size']) attr.size = data.length > details['size'] ? details['size'] : data.length;
            var input = tool.html.tag('select', attr, option);
            $layout.html(label + input);

            if (jQuery.fn.chosen) $layout.find('select').chosen({ disable_search: true });
        },
        set: function ($input, details, selectionType, selection) {
            var success = false;
            $input.find("option").each(function (index) {
                var $this = jQuery(this), selected = false;
                if ('All' == selectionType || (0 == index && 'First' == selectionType)) {
                    selected = true;
                } else {
                    var item = ('Caption' == selectionType) ? $this.text() : $this.val();
                    if (tool.array.exists(item, selection)) selected = true;
                }
                $this.prop("selected", selected);
                if (selected) success = true;
            });
            return success;
        },
        get: function ($input, details) {
            var selection = Filter.getEmptySelection();
            $input.find('option:selected').each(function () {
                var $this = jQuery(this);
                selection.Value.push($this.val());
                selection.Caption.push($this.text());
            });
            return selection;
        },
        event: 'change'

    };

    /* ------------
       ButtonGroup
       ----------- */

    Filter.processHtml.ButtonGroup = {

        build: function ($layout, details, data, label) {
            /*
                Available details
                -----------------
                type            : 'radio' or 'checkbox'
                uncheckRadio    : 0 or 1 // (only when type='radio') make possible to uncheck radio buttons
                vertical        : 1 or 0
                fullWidth       : 1 or 0 // (only for horizontal buttons)
                fixedWidth      : 1 or 0 // (only for horizontal buttons)
            */
            var type = 'checkbox' == details['type'] ? 'checkbox' : 'radio'; // Default is 'radio'

            $layout.append(label).append(
                jQuery('<div>').addClass(Filter.LAYOUT.INPUT).biButtonGroup({

                    type: type,
                    uncheckRadio: !!details['uncheckRadio'],
                    vertical: !!details['vertical'],
                    fullWidth: undefined !== details['fullWidth'] ? !!details['fullWidth'] : true,
                    fixedWidth: undefined !== details['fixedWidth'] ? !!details['fixedWidth'] : true

                }).biButtonGroup('build', data, { label: 'CAPTION', value: 'VALUE' })
            );
        },
        set: function ($input, details, selectionType, selection) {
            if ('All' == selectionType) {
                selection = 'all';
            } else if ('First' == selectionType) {
                selection = 'first';
            }
            var $checked = $input.biButtonGroup('setSelection', selection, 'Caption' == selectionType);
            if ('first' == selection || 'all' == selection) {
                return !!$checked.size();
            } else {
                return !selection.length || !!$checked.size();
            }
        },
        get: function ($input, details) {
            var selection = Filter.getEmptySelection();
            $input.biButtonGroup('getSelection').forEach(function (item) {
                selection.Value.push(item.value);
                selection.Caption.push(item.label);
            });
            return selection;
        },
        event: 'change'

    };

    /* ---------
        TreeView
        -------- */

    Filter.processHtml.TreeView = {

        build: function ($layout, details, data, label) {
            /*
                Available details
                -----------------
                type            : 'radio' or 'checkbox'
                uncheckRadio    : 0 or 1 // (only when type='radio') make possible to uncheck radio buttons
                threeStates     : 0 or 1 // (only when type='checkbox')
                dropDown        : 0 or 1
                closeButton     : 0 or 1
                uncheckButton   : 0 or 1
                maxHeight       : 0 or any number in px like 200px (this is an addon - not a part of the .biTreeView plugin)
            */
            var type = 'checkbox' == details['type'] ? 'checkbox' : 'radio'; // Default is 'radio'

            $layout.append(label).append(
                jQuery('<div>').addClass(Filter.LAYOUT.INPUT).biTreeView({

                    type: type,
                    uncheckRadio: 'radio' == type ? !!details['uncheckRadio'] : false,
                    threeStates: 'checkbox' == type ? !!details['threeStates'] : false,
                    dropDown: !!details['dropDown'],
                    closeButton: !!details['closeButton'],
                    uncheckButton: !!details['uncheckButton']

                }).biTreeView('build', data, { // [{ CAPTION: '', VALUE: '', PARENTVALUE: '', SELECTABLE: '' }, ...]
                    label: 'CAPTION', value: 'VALUE', parentValue: 'PARENTVALUE', checkable: 'SELECTABLE', checked: 'SELECTED'
                })
            );
            if (details['maxHeight']) $layout.find('.bi-form-tree-view').css('max-height', parseFloat(details['maxHeight']) + 'px');
        },
        set: function ($input, details, selectionType, selection) {
            if ('All' == selectionType) {
                selection = 'all';
            } else if ('First' == selectionType) {
                selection = 'first';
            }
            var $checked = $input.biTreeView('setSelection', selection, 'Caption' == selectionType);
            if ('first' == selection || 'all' == selection) {
                return !!$checked.size();
            } else {
                return !selection.length || !!$checked.size();
            }
        },
        get: function ($input, details) {
            var selection = Filter.getEmptySelection();
            $input.biTreeView('getSelection').forEach(function (item) {
                selection.Value.push(item.value);
                selection.Caption.push(item.label);
            });
            return selection;
        },
        event: 'change'

    };

})(this, this.jQuery, this.Bi = this.Bi || {});
