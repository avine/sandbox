
(function ($) {

    var PATH = 'api/', pathExp = function () { return new RegExp('^' + PATH); };

	var currentHash, codeDisabled = false;

    $(document).ready(function () {

        // Toggle doc index
        $('#bidoc-title').click(function () {

            $('#bidoc-index').toggleClass('bidoc-hide');

        });

        // Anchor doc index
        var anchorUpdate = function (e) {

            var anchor = anchorStatus();
            if (e && 'click' == e.type) {
                e.stopPropagation();
                anchor = !anchor;
            }
            window.sessionStorage.setItem('bidoc-anchor', anchor ? '1' : '0');
            $('#bidoc-index')[anchor ? 'addClass' : 'removeClass']('bidoc-anchor');
            return anchor;

        }, anchorStatus = function () {

            return '1' === window.sessionStorage.getItem('bidoc-anchor');

        };
        anchorUpdate(); // Init
        $('<i class="fa fa-anchor" id="bidoc-anchor"></i>')
            .click(anchorUpdate).appendTo('#bidoc-title'); // Update

        // Toggle doc sub-items
        $('#bidoc-content h3').click(function () {

            $(this).toggleClass('bidoc-content-hide');

        });

        // Handle doc links
        $('#bidoc-content a').click(function (e) {

            var href = $(this).attr('href');

            // External link
            if (!pathExp().test(href)) return;

            e.preventDefault();

            href = href.split('#');
            var hash = href[0].replace(pathExp(), '').replace(/\.html$/, '');
            if (currentHash == hash) document.location.reload();

            // Change hash (notice: add prefix "?bidoc=" to identify links)
            document.location.hash = (href[1] || '') + ('?bidoc=' + hash);

        });
        $(window).on('hashchange', function (e) {

            // Reload page to trigger document.onload
            var hash = getHash();
            if (hash && currentHash != hash) document.location.reload();

        });

        // Load doc api
        (function () {

        	var hash = getHash();
            if (!hash) {
                // Highlight current page link
                $('#bidoc-content .bidoc-link-current').addClass('bidoc-active'); 
                return Prism.highlightAll(); // Highlight existing code in the main page
            }

            var href = PATH + hash + '.html';
            $.get(href, function (content) {

            	// Store hash
            	currentHash = hash;

                // Remove intro
                $('#bidoc-intro').remove();

                // Insert DOM content (this is the main action !)
                $('body').prepend(content);

                var code = getCode(content);
                if (!code || codeDisabled) return Prism.highlightAll(); // Highlight existing code in the main page

                // Display content code
                var $code = $(
                    '<div id="bidoc-code">' +
                        '<a href="#" id="bidoc-code-toggle"></a>' +
                        '<h1>' + hash.replace(/\//g, ' / ') + '</h1>' +
                        '<pre>' +
                            '<code class="language-markup">' +
                                code +
                            '</code>' +
                        '</pre>' +
                    '</div>'
                );

                $code.appendTo('body').children('#bidoc-code-toggle').click(function (e) {
                    e.preventDefault();
                    $code.toggleClass('bidoc-code-show');
                });

                // Highlight code
                Prism.highlightAll();

            });

            // Highlight active link
            $('#bidoc-content a[href="' + href + '"]').addClass('bidoc-active');

            // Hide doc index
            if (!anchorStatus()) $('#bidoc-index').addClass('bidoc-hide');

        })();

        function getHash() {

        	// Remove what is before the first "?"
        	var hash = document.location.hash.match(/\?(.*)/);
        	if (!hash) return;
        	hash = hash[1];

        	// Find the bidoc value (what between "bidoc=" and the next "&")
			hash = hash.match(/bidoc=([^&]+)/);
			if (!hash) return;
        	hash = hash[1];

        	return hash;
        }

        function getCode(html) {

            var code = '';
            html.split('<!-- bidoc-text -->').forEach(function (item, index) {
                (index % 2) || (code += item.replace(/^\s+/, ''));
            });
            return code.replace(/^\s+|\s+$/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        }

    });

    window.biDoc = {

        // Call this method in your doc to disable the code-feature
        disableCode: function (status) {
            codeDisabled = (undefined === status || status);
        }

    };

})(jQuery);

// Overwrite QUnit default configuration
QUnit.config.collapse = false;
