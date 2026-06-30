/* ======================================================================== \
 | 	DOCEBO 																	|
 | 																			|
 | 	Copyright (c) 2014 (Docebo)												|
 | 	http://www.docebo.com													|
 \ ======================================================================== */

/**
 * Main class for the player, this will regulate it
 * @param config
 * @constructor
 */
var DCDPlayer = function (config) {
	this._fullscreen = config.fullscreen || false;

	this._size_diff = config.size_diff || false;

	if (config.viewport_width > config.viewport_height) {
		this._size_diff += this._height - parseInt(config.viewport_height);
	} else {
		this._size_diff += this._width - parseInt(config.viewport_height);
	}

	if (config.init_url !== undefined) {
		this.initFromUrl(config.init_url);
	}
	// ipad viewport fix, related to
	try {
		var isiPad = navigator.userAgent.match(/iPad/i) != null;
		if (!isiPad) {
            setTimeout("window.dcd_player.desktopInit();", 200);
		} else {
			// this is needed to have iframe scrollable on ipad
			$('#wrapper').css({
				'overflow-y': 'scroll',
			});
		}

		setTimeout("window.dcd_player.initWebapp();", 200);

	} catch(e) {
		console.log('Device env inicialization failed.')
	}
	try {
		$(window).on('pagehide', $.proxy(this.browserClose, this));
		$(window).on('beforeunload', $.proxy(this.browserClose, this));
	} catch(e) {
		console.log('Unload events binding failed.');
	}
	try {
		if (this._use_sw) {
			var $this = this;
			navigator.serviceWorker
				.register('service-worker.js', {
					scope: './'
				})
				.then(function (registration) {
					console.log("Service worker registered, scope:", registration.scope);
					try {

						$this.validateSw = async function () {
							if ('serviceWorker' in navigator) {
								var registration = await navigator.serviceWorker.ready;
								return registration.active !== null && $this._use_sw;
							}
							return false;
						}

						$this.validateSw().then(function (result) {
							$this._use_sw = result;
						});

						navigator.serviceWorker.addEventListener('message', function (event) {
							if (event.data && event.data.type === 'SHOW_EXPIRED_SESSION_MODAL') {
								$this.showExpiredSessionModal();
							} else {
								var waitForApiLoad = setInterval(function () {
									var scormApi = window.dcd_player.getApi();
									if (scormApi) {
										clearInterval(waitForApiLoad);
										var next_to_play = typeof event.data.next_to_play !== 'undefined' ? event.data.next_to_play : null;
										var requestChapterId = event.data.chapter_id;
										var dcdPlayerInitChapterId = $this._id_reference + ":" + $this._id_item;
										if (next_to_play && requestChapterId === dcdPlayerInitChapterId) {
											scormApi.scounload(next_to_play);
										}
									}

								}, 500);
							}
						});
					} catch (e) {
						$this._use_sw = false;
					}
					// If we want to, we might do `location.reload();` so that we'd be controlled by it
				})
				.catch(function (error) {
					$this._use_sw = false;
					console.log("Service worker registration failed:", error.message);
				});

		} else {
			navigator.serviceWorker.getRegistrations().then(function (registrations) {
				for (let registration of registrations) {
					registration.unregister()
						.then(function () {
							return self.clients.matchAll();
						})
						.then(function (clients) {
							clients.forEach(client => {
								if (client.url && "navigate" in client) {
									client.navigate(client.url);
								}
							});
						});
				}
			});
		}
	} catch (e) {
		console.log("Service worker registration/unregistration failed.");
		this._use_sw = false;
	}
};

DCDPlayer.prototype = {

	/**
	 * url from the main frame or window that open the launcher
	 */
	_parent_url: "",

	_r: {},

	_fullscreen: false,

	/**
	 * This is used to understand if we have already managed the browser close window
	 */
	_browser_close_managed: false,

	/**
	 * query params readed from the url, we are expecting the following
	 * _id_user       : the unique identifier of the user
	 * _id_course     : the course from which the user has arrived
	 * _id_reference  : unique identifier of the resource inside a course
	 * _id_resource   : unique identifier of the original resource
	 * _id_item       : this id of the scorm chapter
	 * _scorm_version : the scorm version can be 1.2 and 1.3
	 * _auth_code     : authorization code
	 * _launch_type   : the open mode 'inline', 'lightbox', 'fullscreen', 'popup'
	 * * Preview Mode
	 * _preview_mode  : parameter passed in order to prevent the tracking when passed to the LMS API
	 * _as_json       : whether to send cmi data as json
	 * _player		  : Determinate if we are in the context of Hydra player
	 * _courseName	  : The course name used to redirect to the hydra player (slugged)
	 * _context		  : The context (where the SCORM was played from)
	 * close          : if true the scounload will close the player no matther the next_to_play returned
	 * rtl            : whether the language is Right-to-Left
	 */
	_id_user:       false,
	_id_course:     false,
	_id_reference:  false,
	_id_resource:   false,
	_id_item:       false,
	_scorm_version: false,
	_auth_code:     false,
    _launch_type:   'lightbox',
    _launch_type_mobile:   'none',
	_mobile_offline: false,
	_close:         false,
	_debug:         false,
	_rtl:           false,
	_show_expired_session_modal: false,
	// Preview
	_preview_mode:  false,
	_as_json:       false,
	_player:		false,
	_courseName:	false,
	_context:		false,
	_use_sw: 		true,
	_width : 1024,
	_height: 768,
	_size_diff:     0,

	/**
	 * Caller Lms url, our main server, will be used to retrive the data for the scorm initializazion trough jsonp
	 */
	_lms_url: "",

	_return_url: '',

	/**
	 * This will be the proxy for the tracking callback to the main lms
	 */
	_proxy_url: "",

	next_to_play: 'about:blank',

    /**
     * Performs some initialization for the Mobile App (scrolling issue fix)
     */
    initWebapp: function () {
        if (this._launch_type == 'webapp')  {
            $('#wrapper')
                .css({
                    overflow: 'auto',
                })
                .on('touchstart', function (event) {});
        }
    },

    initFromUrl: function(url) {

		this._parent_url	= url;

		// parse the get params for info
		this._r = $.url(url).param();
		this._id_user       = this._r.id_user;
		this._id_course     = this._r.id_course;
		this._id_reference  = this._r.id_reference;
		this._id_resource   = this._r.id_resource;
		this._id_item       = this._r.id_item;
		this._scorm_version = this._r.scorm_version;
		this._auth_code     = this._r.auth_code; // this is now returned by the loadremoteSco after the session has been validate, it's reading it only temporarly
		this._launch_type   = this._r.launch_type;
    this._launch_type_mobile  = this._r.launch_type_mobile || 'none';
		this._mobile_offline = this._r.mobile_offline || false;
		this._debug         = this._r.debug || false;
		this._rtl    		= this._r.rtl === 'true';
		this._show_expired_session_modal = this._r.show_expired_session_modal === 'true';
		this._learning_plan_id    = this._r.learning_plan_id || false;
		//Preview
		this._preview_mode  = this._r.preview_mode || false;
		this._as_json       = this._r.as_json || false;
		this._player		= this._r.player || false;
		this._courseName	= this._r.name || false;
		this._context		= this._r.context || false;

		/** Check if the Course Auto play of LO is enabled */
		this._autoplay		= this._r.autoplay_enabled || 0;

		// retrieve, from the url the lms that called this place and from the "distribution"
		this._lms_url 		= '' + this._r.host + '';
		this._proxy_url 	= (this._launch_type_mobile !== 'none' && this._mobile_offline === 'true' ) ? this._r.host : $.url().attr('host');
		if (this._lms_url == '') {
			// if no host is passed we assume that everything is going to happen locally
			this._lms_url = this._proxy_url;
		}

		this._return_url = this._r.return_url || this._lms_url;
	},

	isMobile: function () {
		return ['mobile_android', 'mobile_ios'].includes(this._launch_type_mobile);
	},

	_add_log: function( msg ) {
		try{
			if (this._debug) {
				if (console.log !== undefined) {
					console.log(msg);
				}
			}
		} catch(e) {}
	},

	launch: function() {
    	// set page direction
		document.body.setAttribute('dir', this._rtl ? 'rtl' : 'ltr');

		// We must call back the original server in order to retrive the object that need to be played
		// var init_url = this._server_url + 'index.php?modname=scorm&op=scoload_remote'
		var init_url = '//' + this._lms_url + '/lms/index.php?r=scormorg/scormapi/LoadRemoteSco'
			+ '&id_reference=' + this._id_reference
			+ '&id_user=' + this._id_user
			+ '&id_resource=' + this._id_resource
			+ '&id_item=' + this._id_item
			+ '&auth_code=' + this._auth_code // this is now returned by the loadremoteSco after the session has been validate, it's reading it only temporarly
			+ '&preview_mode=' + this._preview_mode
			+ '&as_json=' + this._as_json
			+ '&context=' + this._context
			+ '&jsoncallback=?';
		this._add_log( 'loading play info from : ' + init_url );

		$.ajax({
			url: init_url,
			jsonpCallback: 'window.dcd_player.scoload',
			contentType: "application/json",
			dataType: 'jsonp',
			xhrFields: {
				'withCredentials': true // this tells firefox to send the cookies
			},
			crossDomain: true,
			fail: function(e) {
				window.dcd_player._add_log( "Error while retriving the chapter to play" );
			}
		});
	},

	localLaunch: function() {
		// We must call back the original server in order to retrive the object that need to be played
		// var init_url = this._server_url + 'index.php?modname=scorm&op=scoload_remote'
		var init_url = '../sample/dummy.php?'
			+ '&id_reference=' + this._id_reference
			+ '&id_user=' + this._id_user
			+ '&id_resource=' + this._id_resource
			+ '&id_item=' + this._id_item
			+ '&scorm_version=' + this._scorm_version
			// + '&auth_code=' + this._auth_code
			+ '&preview_mode=' + this._preview_mode
			+ '&as_json=' + this._as_json
			+ '&context=' + this._context
			+ '&jsoncallback=?';
		this._add_log( 'loading play info from : ' + init_url );

		$.ajax({
			url: init_url,
			jsonpCallback: 'window.dcd_player.scoload',
			contentType: "application/json",
			dataType: 'jsonp',
			fail: function(e) {
				window.dcd_player._add_log( "Error while retriving the chapter to play" );
			}
		});
	},

	getApi: function() {

		if(this._scorm_version == '1.3') return window.API_1484_11;
		else return window.API;
	},

	scoload: function(data) {

		if (!data.success) {
			$('#error').html("There was an error in the intialization of the player, please try reopening the course again.<br/>"
			+ "Info:" + data.message);
			$('#sco').remove();

			if(data.redirectBackToCourse){
				this._close = true;
				this.scounload();
			}
			return;
		}

		this._add_log('loading: ' + data.launch_url );

		// Initialize the auth_code for the others calls
		if(data.auth_code) this._auth_code = data.auth_code;

		// Initialize the scorm api with the data readed
		var api_config = {
			server_url: this._proxy_url,
			lms_url: this._lms_url,
			id_user: this._id_user,
			id_item: this._id_item,
			id_reference: this._id_reference,
			auth_code: this._auth_code,
			debug: this._debug,
			preview_mode: this._preview_mode,
			as_json: this._as_json,
			context: this._context
		};

		if(this._scorm_version == '1.3')  window.API_1484_11 = new ScormApi2004(api_config);
		else window.API = new ScormApi12(api_config);

		try {
			this.getApi().loadInitialtracking(data.initialize);
		} catch(e) {
			this._add_log("There was an issue loading the tracking data");
		}

		// in data.launch_url we have the url of the sco path, we can now load it inside the sco iframe
		$('#sco').attr('src', data.launch_url);

		// start the keep-alive to keep session open
		if (!this._preview_mode) {
			this.keep_alive();
		}

		if (data.title !== undefined) {
			try {
				document.title = data.title;
			} catch(e) {}
			var h1_title = $('.mynavbar h1');
			if (h1_title) h1_title.html(data.title);

            try {
                var frame_title = window.parent.$('.fancybox-docebo-title span');
                if (frame_title) frame_title.html(data.title);
            } catch(e) {}
        }

	},

	keep_alive: function() {
		var trackSessionWorker;
		var keep_url = '//' + this._lms_url + '/learn/v1/lo/'
			+ this._id_reference + ":" + this._id_item
			+ '/session';

		if (typeof Worker !== 'undefined') {
			trackSessionWorker = new Worker('js/workers/session-track.worker.js');
			trackSessionWorker.onmessage = ({ data }) => {
				window.dcd_player.keep_alive_request(keep_url);
			};
		} else {
			setInterval("window.dcd_player.keep_alive_request(keep_url);", 5 * 60 * 1000);
		}

		window.addEventListener('pagehide', () => {
			fetch(keep_url, {
				method: 'POST',
				body: JSON.stringify({ context: this._context }),
				keepalive: true,
				cache: 'no-cache',
				headers: {
					'Authorization': 'Bearer ' + this._auth_code,
					'Content-Type': 'application/json'
				}
			});

			if (trackSessionWorker) {
				trackSessionWorker.terminate();
			}
		});

	},

	keep_alive_request: function (keep_url) {
		this._add_log( 'Keep alive');

		$.ajax({
			type: 'POST',
			url: keep_url,
			jsonpCallback: 'window.dcd_player.keep_alive_success',
			contentType: "application/json",
			headers: {
				Authorization: 'Bearer '+ this._auth_code
			},
			dataType: 'json',
			data: JSON.stringify({ context: this._context }),
			fail: function(e) {
				window.dcd_player._add_log( "Error while performing keep alive" );
			},
			error: this.keep_alive_error
		});
	},

	keep_alive_success: function() {
		// jsonp callback, doing nothing for now
	},

	keep_alive_error: function(response) {
		if (response.status === 401 && window.dcd_player._show_expired_session_modal) {
			window.dcd_player._add_log("Error while performing keep alive, session expired!");
			window.dcd_player.showExpiredSessionModal();
		}
	},

	desktopInit: function() {

		if (this._fullscreen) {
			try {
				// this will set the viewport correct size in case of fullscreen
				var html_height = $('html').height();
				$('#sco').height(html_height - 35);
			} catch(e){}
		}
	},

	attachCloseListener: function(element_selector) {

		$(element_selector).on('click', function(e) {
			e.preventDefault();
			// To close the player just unload the scorm, it will call the finish and this will lead us back to
			// the normal close
			window.dcd_player._close = true;
			$('#sco').attr('src', 'about:blank');
			window.dcd_player.scounload();
		});
	},

	/**
	 * Action that need to be performed when a finish is called and we need either to open a new one or not
	 */
	scounload: function() {
		// if we have to close the player then the next_to_play will contain r=scormorg/default/closePlayer
		var regexp = /scormorg\/default\/closePlayer/gi;
		if ( (regexp.test(this.next_to_play) || this._close == true) && !this._preview_mode) {
			// let's close the player, how to do it depend on how it was launched
			switch (this._launch_type) {
				case "fullscreen" : {
					// We need to go back on a fixed url that is:
					if(this._player == 'hydra'){
						var hydraExitURL = '//' + this._return_url + '/learn/course/' + this._id_course + '/play'+ (this._learning_plan_id ? ';lp='+this._learning_plan_id  : '');
						var params = [];
						if (Number(this._autoplay)) {
							params.push('autoplay=0');
						}
						window.location = hydraExitURL + (params.length ? ';' + params.join('&') : '');
					} else{
						window.location =  '//' + this._return_url + '/lms/index.php?r=player&course_id=' + this._id_course + '&launch_type=' + this._launch_type + '&launch_type_mobile=' + this._launch_type_mobile;
					}
				} break;
				case "popup" : {
					// This is a bit more complex, we need a special close url and refresh the opener
					// i will redirect to original domain with extra param for refresh
					if(this._player){
                        window.opener.postMessage({
                            target: 'dcd',
                            status: 'completed'
                        }, '*');
					} else{
						window.location = this.next_to_play + '&course_id=' + this._id_course + '&launch_type=' + this._launch_type + '&launch_type_mobile=' + this._launch_type_mobile + '&refresh_opener=1';
					}

				} break;

				case "webapp":
                    if (this._launch_type_mobile === 'webapp_mobile_ios') {
                        window.close();
                        break;
                    }

				case "inline" :
				case "lightbox" :
				default : {
					// We have received the original domain close link, it's fine to be used as it is
					if (this._player) {
						window.parent.postMessage({
							target: 'dcd',
							status: 'completed'
						}, '*');
					} else {
						$('#sco').attr('src', this.next_to_play + '&course_id=' + this._id_course + '&launch_type=' + this._launch_type + '&launch_type_mobile=' + this._launch_type_mobile);
					}
				} break;
			} // end switch

		} else {
			// set the next object to play
			try {
				if(this._player && this._launch_type !== 'fullscreen'){
					if(this._launch_type == 'lightbox' || this._launch_type === 'inline'){
                        window.parent.postMessage({
                            target: 'dcd',
                            status: 'next',
                            chapter_id: this._id_reference + ':' + this._id_item
                        }, '*');
					} else if(this._launch_type == 'popup'){
                        window.opener.postMessage({
                            target: 'dcd',
                            status: 'next',
                            chapter_id: this._id_reference + ':' + this._id_item,
                            next: this.next_to_play
                        }, '*');
					}
				} else {
					var url = this.next_to_play;
					if(!this._preview_mode){
						url += '&id_course=' + this._id_course
						window.location = url;
					} else {
						window.parent.postMessage({
							target: 'dcd',
							status: 'next',
							next: this.next_to_play,
							id_resource: this._id_resource
						}, '*');
					}
					// $('#sco').attr('src', this.next_to_play + '&launch_type=' + this._launch_type);
				}
			} catch(e) {}
		}

	},

	/**
	 * Action triggered on browser close
	 * @param event
	 */
	browserClose: function(event) {
		if (this._browser_close_managed) return;
		this._browser_close_managed = true;
		//force the iframe of the sco to blank to try a better trigger of the object unload
		$('#sco').attr('src', 'about:blank');
		try {
			if (this._launch_type == 'popup' && window.opener){
				if(this._player){
					window.opener.postMessage({
						target: 'dcd',
						status: 'closed'
					}, '*');
				} else{
					window.opener.location.reload();
				}
			}
		} catch(e) {}
	},

	shouldFetch: function() {
		return !this.isMobile() && 'fetch' in window && !this.isFirefox();
	},

	shouldPostMessage: function() {
		return !this.isMobile() && this._use_sw && navigator.serviceWorker.controller !== null;
	},

	isFirefox: function () {
		return navigator.userAgent.indexOf("Firefox") !== -1;
	},

	showExpiredSessionModal: function() {
		window.parent.postMessage({
			target: 'dcd',
			status: 'session_expired',
		}, '*');
	},

};
