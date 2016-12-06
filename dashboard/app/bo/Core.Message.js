
(function (window, jQuery, Bi) {
    "use strict";

    var tool = Bi.tool, database = Bi.database, Core = Bi.Core;

    var Message = Core.module('Message');

    Message.extendStatic({

        OPTIONS: {
            imagesPath: '/dashboard/images', // Path to images directory from tool.url.ROOT
            debug: false
        },

        MARKUP: {
            TITLE: '<h2>{DATA}</h2>',
            SUBTITLE: '<h3>{DATA}</h3>',
            IMAGE: '<img src="{DATA}" />',
            INTRO: '<div>{DATA}</div>',
            LINK: '<a href="#"><i class="fa fa-caret-right"></i> {DATA}</a>',
            MAIN: '<div>{DATA}</div>'
        },

        LAYOUT: 'bi-message-'

    });

    Message.extendProto({

        // Module constructor
        builder: function (options) {
            this.options = tool.extend({}, Message.OPTIONS, options || {});
        },

        initRepository: function (result) {
            this.dbMessage = {
                message: database.format.toJson(result[0])
            };
        }

    });

    Message.extendProto({

        getMessage: function (messageId) {
            if (!messageId) return this.dbMessage.message;
            return this.dbMessage.message.filter(function (row) {
                return messageId == row.ID;
            })[0];
        },

        getDashboardMessage: function (containerId) {
            return this.dbMessage.message.filter(function (row) {
                return containerId == row.CONTAINERID;
            })[0];
        }

    });

    Message.extendProto({

        displayDashboardMessages: function () {
            this.factory.export('Dashboard', 'getOutputContainers')().forEach(function (container) {
                var msg = this.getDashboardMessage(container.ID);
                if (!msg || !container.scope) return;

                //// For debugging, overwrite here the msg properties :
                //console.log(msg)
                //msg.TITLE = 'Title...';
                //msg.SUBTITLE = 'Subtitle...';
                //msg.IMAGE = '';
                //msg.INTRO = 'Intro...';
                //msg.LINK = 'Link...';
                //msg.MAIN = 'Main...';
                //msg.LINKBEHAVIOUR = 'Toggle';
                //msg.TYPE = 'Info';

                this.display(msg.ID, container.scope.wrapper);
            }.bind(this));
        },

        display: function (messageId, domTarget) {
            var msg = this.getMessage(messageId), $domTarget = jQuery(domTarget), $wrapper;
            if (!msg) return;
            if (!msg.scope) {
                if (!$domTarget.size()) return;
                // Create message scope
                $wrapper = jQuery('<div>').attr('data-biz-message-id', messageId).addClass(Message.getClass('wrapper'));
                if (msg.TYPE) $wrapper.addClass(Message.getClass(msg.TYPE));
                msg.scope = {
                    target: $domTarget.get(0),
                    wrapper: $wrapper.appendTo(domTarget).get(0)
                };
            } else if ($domTarget.size() && $domTarget.get(0) !== msg.scope.target) {
                // Update target and move wrapper to new target
                msg.scope.target = $domTarget.get(0);
                jQuery(msg.scope.wrapper).appendTo(msg.scope.target);
            }
            $wrapper = jQuery(msg.scope.wrapper).html(''); // Empty wrapper !
            var replaceText = this.factory.export('Context', 'replaceText'), item, markup;
            for (item in Message.MARKUP) {
                if (msg[item]) {
                    switch (item) {
                        case 'IMAGE':
                            // msg[item] represents the relative path to the image from the images directory
                            var imageUrl = (tool.url.ROOT + this.options.imagesPath + '/' + msg[item]).replace(/(\/)+/, '/');
                            markup = Message.get$markup(item, imageUrl);
                            break;
                        default:
                            markup = Message.get$markup(item, replaceText(msg[item]));
                            break;
                    }
                    msg.scope[item.toLowerCase()] = markup.appendTo(msg.scope.wrapper).get(0);
                } else {
                    msg.scope[item.toLowerCase()] = undefined;
                }
            }
            if (msg.MAIN) Message.addLinkBehaviour(msg);
        },

        refresh: function (messageId) {
            this.getMessage(messageId).forEach(function (msg) {
                if (!msg.scope) return;
                this.display(msg.ID);
            }.bind(this));
        }

    });

    Message.extendStatic({

        getClass: function (item, dot) {
            return (dot ? '.' : '') + Message.LAYOUT + item.toLowerCase();
        },

        get$markup: function (item, data) {
            return jQuery(Message.MARKUP[item.toUpperCase()].replace('{DATA}', data))
                .addClass(Message.getClass(item));
        },

        addLinkBehaviour: function (msg) {
            var method = 'linkBehaviour' + msg.LINKBEHAVIOUR;
            if (method in Message) {
                Message[method](msg.scope);
            } else {
                tool.console.error('Bi.Core.Message.addLinkBehaviour: invalid LINKBEHAVIOUR', msg.LINKBEHAVIOUR);
            }
        }

    });

    Message.extendStatic({

        linkBehaviourToggle: function (scope) {
            var $link = jQuery(scope.link), $main = jQuery(scope.main);
            $main.addClass(Message.getClass('main-hidden'));
            $link.on('click', function (e) {
                e.preventDefault();
                $main.toggleClass(Message.getClass('main-hidden'));
                $link.toggleClass(Message.getClass('link-active'));
            });
        },

        linkBehaviourPopup: function (scope) {
            var $link = jQuery(scope.link),
                $main = jQuery(scope.main).css('margin', '10px');

            var $popupTitle = jQuery('<div>').append(scope.title).append(scope.subtitle);
            if (!$popupTitle.children().size()) $popupTitle.text('Popup');

            // TODO: remplacer jqxWindow par .biModal...

            var $popup = jQuery('<div>').append($popupTitle).append($main).jqxWindow({
                resizable: true,
                autoOpen: false,
                width: '50%',
                height: '50%'
            });
            $link.on('click', function (e) {
                $popup.jqxWindow('open');
                e.preventDefault();
            });
            var closePopup = function () { $popup.jqxWindow('close'); };

            /* TODO: UPGRADE !!! */
            //if (BI.Dashboard) new BI.Core().addListener(BI.Dashboard.EVENT.PAGE, closePopup);
            //if (BI.Filter) new BI.Core().addListener(BI.Filter.EVENT.CHANGE, closePopup);
        }

    });

})(this, this.jQuery, this.Bi = this.Bi || {});
