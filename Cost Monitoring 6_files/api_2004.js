/*
DOCEBO - The E-Learning Ecosystem
http://www.docebo.com
*/

/**
 * class ScormAPI
 */
var ScormApi2004 = function (config) {

	this._server_url    = config.server_url;
	this._lms_url       = config.lms_url;
	this._id_user       = config.id_user;
	this._id_item       = config.id_item;
	this._id_reference  = config.id_reference;
	this._debug         = config.debug || false;
	// Preview Mode
	this._preview_mode	= config.preview_mode || false;
	this._as_json		= config.as_json || false;
	this._context		= config.context || false;

	// TODO: check if really needed
	if (this._api_status == this._status.RUNNING) {
		this.Terminate("");
	}
	this._api_status = this._status.NOT_INITIALIZED;
	this._new_data = false;
	this.reset_error();
};

ScormApi2004.prototype = {

	_server_url: 'lms.url.local',

	_lms_url: 'lms.url.remote',

	_id_user: 0,

	_id_item: 0,

	_id_reference: 0,

	/**
	 * after a setvlue will be moved to true, when the data are saved is moved back to false
	 */
	_new_data: false,

	/**
	 * Api log
	 */
	_debug: false,

	// Preview Mode
	_preview_mode: false,

	_as_json: false,

	_context: false,

	_add_log: function( msg ) {
		try{
			if (this._debug) {
				if (console.log !== undefined) {
					console.log(msg);
				}
			}
		} catch(e) {}
	},

	/**
	 * Api error management
	 */
	_lastErrorCode: "0",

	_diagnostic: '',

	_errors: {
		// No Error 0
		0: "No Error",
		// General Errors 100 – 199
		101: "General exception",
		102: "General Initialization Failure",
		103: "Already Initialized",
		104: "Content Instance Terminated",
		111: "General Termination Failure",
		112: "Termination Before Initialization",
		113: "Termination After Termination",
		122: "Retrieve Data Before Initialization",
		123: "Retrieve Data After Termination",
		132: "Store Data Before Initialization",
		133: "Store Data After Termination",
		142: "Commit Before Initialization",
		143: "Commit After Termination",
		// Syntax Errors 200 – 299
		201: "General Argument Error",

		// RTS Errors 300 – 399
		301: "General Get Failure",
		351: "General Set Failure",
		391: "General Commit Failure",

		// Data Model Errors 400 – 499
		401: "Undefined Data Model Element",
		402: "Unimplemented Data Model Element",
		403: "Data Model Element Value Not Initialized",
		404: "Data Model Element Is Read Only",
		405: "Data Model Element Is Write Only",
		406: "Data Model Element Type Mismatch",
		407: "Data Model Element Value Out Of Range",
		408: "Data Model Dependency Not Established"

		// Implementation-defined Errors 1000 - 65535
	},

	/**
	 * Reset last error
	 */
	reset_error: function() {

		this._lastErrorCode = "0";
		this._diagnostic = "";
	},

	/**
	 * @param rvalue
	 * @param ecode
	 * @param ediag
	 * @returns {*}
	 */
	throw_error: function( rvalue, ecode, ediag ) {

		this._lastErrorCode = "" + ecode;
		if(ediag != undefined) this._diagnostic = ediag;
		else this._diagnostic = "";

		this._add_log( 'Scorm API error :' + this._lastErrorCode + " - " + this.GetErrorString(this._lastErrorCode) );
		return rvalue;
	},

	/**
	 * The api status
	 */
	_api_status: 0,

	_status: {
		NOT_INITIALIZED: 0,
		RUNNING: 1,
		TERMINATED: 2
	},

	/**
	 * A list of regexp for valid dme and info abpout the elements
	 */
	dme: [
		{regexp: /^cmi\._version$/i,
			type: "spm", subtype: 250, readable: true, writable: false},
		{regexp: /^cmi\.comments_from_learner\._children$/i,
			type: "_children", readable: true, writable: false, values:"comment,location,timestamp"},
		{regexp: /^cmi\.comments_from_learner\._count$/i,
			type: "_count", count: /^cmi\.comments_from_learner\.([0-9]+)./i, readable: true, writable: false},
		{regexp: /^cmi\.comments_from_learner\.[0-9]+\.comment$/i,
			type: "spm", subtype: 4000, readable: true, writable: true},
		{regexp: /^cmi\.comments_from_learner\.[0-9]+\.location$/i,
			type: "spm", subtype: 250, readable: true, writable: true},
		{regexp: /^cmi\.comments_from_learner\.[0-9]+\.timestamp$/i,
			type: "time", subtype: "second(10,0)", readable: true, writable: true},

		{regexp: /^cmi\.comments_from_lms\._children$/i,
			type: "_children", readable: true, writable: false, values:"comment,location,timestamp"},
		{regexp: /^cmi\.comments_from_lms\._count$/i,
			type: "_count", count: /^cmi\.comments_from_lms\.([0-9]+)/, readable: true, writable: false},
		{regexp: /^cmi\.comments_from_lms\.[0-9]+\.comment$/i,
			type: "spm", subtype: "4000", readable: true, writable: false},
		{regexp: /^cmi\.comments_from_lms\.[0-9]+\.location$/i,
			type: "spm", subtype: "250", readable: true, writable: false},
		{regexp: /^cmi\.comments_from_lms\.[0-9]+\.timestamp$/i,
			type: "time", subtype: "second(10,0)", readable: true, writable: false},
		{regexp: /^cmi\.completion_status$/i,
			type: "state", readable: true, writable: true, values:["completed","incomplete","unknown"]},// ,"not attempted" not settble at runtime
		{regexp: /^cmi\.completion_threshold$/i,
			type: "real(10,7)", subtype: "0..1", readable: true, writable: false},
		{regexp: /^cmi\.credit$/i,
			type: "state", readable: true, writable: false, values:["credit","no_credit"]},
		{regexp: /^cmi\.entry$/i,
			type: "state", readable: true, writable: false, values:["ab-initio","resume",""]},

		{regexp: /^cmi\.exit$/i,
			type: "state", readable: false, writable: true, values:["time-out","suspend","logout","normal",""]},
		{regexp: /^cmi\.interactions\._children$/i,
			type: "_children", readable: true, writable: false, values:"description,id,type,objectives,timestamp,result,learner_response,weighting,latency,correct_responses"},
		{regexp: /^cmi\.interactions\._count$/i,
			type: "_count", count: /^cmi\.interactions\.([0-9]+)\.id$/i, readable: true, writable: false},
		{regexp: /^cmi\.interactions\.[0-9]+\.id$/i,
			type: "long_identifier_type", readable: true, writable: true},
		{regexp: /^cmi\.interactions\.[0-9]+\.type$/i,
			type: "state", readable: true, writable: true, values:["true-false","choice","multiple-choice","fill-in","long-fill-in","matching","performance","sequencing","likert","numeric","other"]},
		{regexp: /^cmi\.interactions\.[0-9]+\.objectives\._count$/i,
			type: "_count", count: /^cmi\.interactions\.[0-9]+\.objectives\.([0-9]+)\.id$/i, readable: true, writable: false},
		{regexp: /^cmi\.interactions\.[0-9]+\.objectives\.[0-9]+\.id$/i,
			type: "long_identifier_type", readable: true, writable: true},
		{regexp: /^cmi\.interactions\.[0-9]+\.timestamp$/i,
			type: "time", subtype: "second(10,0)", readable: true, writable: true},
		{regexp: /^cmi\.interactions\.[0-9]+\.correct_responses\._count$/i,
			type: "_count", count: /^cmi\.interactions\.[0-9]+\.correct_responses\.([0-9]+)/, readable: true, writable: false},
		{regexp: /^cmi\.interactions\.[0-9]+\.correct_responses\.[0-9]+\.pattern$/i,
			type: "interaction", readable: true, writable: true},	//the type depends on interaction type
		{regexp: /^cmi\.interactions\.[0-9]+\.weighting$/i,
			type: "real(10,7)", subtype: "false", readable: true, writable: true},
		{regexp: /^cmi\.interactions\.[0-9]+\.learner_response$/i,
			type: "interaction", readable: true, writable: true},	//the type depends on interaction type
		{regexp: /^cmi\.interactions\.[0-9]+\.result$/i,
			type: "state", readable: true, writable: true, values:["correct","incorrect","unanticipated","neutral","real(10,7)"]},
		{regexp: /^cmi\.interactions\.[0-9]+\.latency$/i,
			type: "time", subtype: "second(10,2)", readable: true, writable: true},
		{regexp: /^cmi\.interactions\.[0-9]+\.description$/i,
			type: "spm", subtype: 250, readable: true, writable: true},
		{regexp: /^cmi\.launch_data$/i,

			type: "spm", subtype: 4000, readable: true, writable: false},
		{regexp: /^cmi\.learner_id$/i,
			type: "spm", subtype: 4000, readable: true, writable: false},
		{regexp: /^cmi\.learner_name$/i,
			type: "spm", subtype: 250, readable: true, writable: false},
		{regexp: /^cmi\.learner_preference\._children$/i,
			type: "_children", readable: true, writable: false, values:"audio_level,language,delivery_speed,audio_captioning"},
		{regexp: /^cmi\.learner_preference\.audio_level$/i,
			type: "real(10,7)", subtype:"0..*", readable: true, writable: true},
		{regexp: /^cmi\.learner_preference\.language$/i,
			type: "spm", subtype: 250, readable: true, writable: true},
		{regexp: /^cmi\.learner_preference\.delivery_speed$/i,

			type: "real(10,7)", subtype: "0..*", readable: true, writable: true},
		{regexp: /^cmi\.learner_preference\.audio_captioning$/i,
			type: "state", readable: true, writable: true, values:["-1","0","1"]},
		{regexp: /^cmi\.location$/i,
			type: "spm", subtype: 1000, readable: true, writable: true},

		{regexp: /^cmi\.max_time_allowed$/i,
			type: "time", subtype: "second(10,2)", readable: true, writable: false},
		{regexp: /^cmi\.mode$/i,
			type: "state", readable: true, writable: false, values:["browse","normal","review"]},

		{regexp: /^cmi\.objectives\._children$/i,
			type: "_children", readable: true, writable: false, values:"success_status,progress_measure,description,id,completion_status,score"},
		{regexp: /^cmi\.objectives\._count$/i,
			type: "_count", count: /^cmi\.objectives\.([0-9]+)\.id$/i, readable: true, writable: false},
		{regexp: /^cmi\.objectives\.[0-9]+\.id$/i,
			type: "long_identifier_type", readable: true, writable: true},
		{regexp: /^cmi\.objectives\.[0-9]+\.score\._children$/i,
			type: "_children", readable: true, writable: false, values:"scaled,raw,min,max"},
		{regexp: /^cmi\.objectives\.[0-9]+\.score\.scaled$/i,
			type: "real(10,7)", subtype: "-1..1", readable: true, writable: true},
		{regexp: /^cmi\.objectives\.[0-9]+\.score\.raw$/i,
			type: "real(10,7)", subtype: false, readable: true, writable: true},
		{regexp: /^cmi\.objectives\.[0-9]+\.score\.min$/i,
			type: "real(10,7)", subtype: false, readable: true, writable: true},
		{regexp: /^cmi\.objectives\.[0-9]+\.score\.max$/i,
			type: "real(10,7)", subtype: false, readable: true, writable: true},
		{regexp: /^cmi\.objectives\.[0-9]+\.success_status$/i,
			type: "state", readable: true, writable: true, values:["passed","failed","unknown"]},
		{regexp: /^cmi\.objectives\.[0-9]+\.completion_status$/i,
			type: "state", readable: true, writable: true, values:["completed","incomplete","not attempted","unknown"]},
		{regexp: /^cmi\.objectives\.[0-9]+\.progress_measure$/i,
			type: "real(10,7)", subtype: "0..1", readable: true, writable: true},
		{regexp: /^cmi\.objectives\.[0-9]+\.description$/i,
			type: "spm", subtype: 250, readable: true, writable: true},

		{regexp: /^cmi\.progress_measure$/i,
			type: "real(10,7)", subtype: "0..1", readable: true, writable: true},
		{regexp: /^cmi\.scaled_passing_score$/i,
			type: "real(10,7)", subtype: "0..1", readable: true, writable: false},
		{regexp: /^cmi\.score\._children$/i,
			type: "_children", readable: true, writable: false, values:"scaled,raw,min,max"},
		{regexp: /^cmi\.score\.scaled$/i,
			type: "real(10,7)", subtype: "-1..1", readable: true, writable: true},
		{regexp: /^cmi\.score\.raw$/i,
			type: "real(10,7)", subtype: false, readable: true, writable: true},
		{regexp: /^cmi\.score\.min$/i,
			type: "real(10,7)", subtype: false, readable: true, writable: true},

		{regexp: /^cmi\.score\.max$/i,
			type: "real(10,7)", subtype: false, readable: true, writable: true},
		{regexp: /^cmi\.session_time$/i,
			type: "time", subtype: "second(10,2)", readable: false, writable: true},
		{regexp: /^cmi\.success_status$/i,
			type: "state", readable: true, writable: true, values:["passed","failed","unknown"]},
		{regexp: /^cmi\.suspend_data$/i,
			type: "spm", subtype: 64000, readable: true, writable: true},

		{regexp: /^cmi\.time_limit_action$/i,
			type: "state", readable: true, writable: false, values:["exit,message","continue,message","exit,no message","continue,no message"]},
		{regexp: /^cmi\.total_time$/i,
			type: "time", subtype: "second(10,2)", readable: true, writable: false},

		// adl.data
		{regexp: /^adl\.data\._children/i,
			type: "_children", readable: true, writable: false, values:"id,store"},
		{regexp: /^adl\.data\._count$/i,
			type: "_count", readable: true, writable: false},
		{regexp: /^adl\.data\.[0-9]+\.id$/i,

			type: "spm", subtype:"4000", readable: true, writable: false},
		{regexp: /^adl\.data\.[0-9]+\.store$/i,
			type: "spm", subtype:"64000", readable: true, writable: true},

		// adl.nav
		{regexp: /^adl\.nav\.request$/i,
			type: "spm", readable: true, writable: true, values:["exit"]},
		{regexp: /^adl\.nav\.request_valid\.continue+$/i,
			type: "spm", subtype:"4000", readable: true, writable: false},
		{regexp: /^adl\.nav\.request_valid\.previous/i,
			type: "spm", subtype:"4000", readable: true, writable: false},
		{regexp: /^adl\.nav\.request_valid\.choice\.\{([a-zA-Z0-9]+)=([a-zA-Z0-9\-_]+)\}$/i,
			type: "spm", subtype:"4000", readable: true, writable: false},
		{regexp: /^adl\.nav\.request_valid\.jump.\{([a-zA-Z0-9]+)=([a-zA-Z0-9\-_]+)\}$/i,
			type: "spm", subtype:"4000", readable: true, writable: false}

	],

	/**
	 * User sco track data (refer to a single sco)
	 */
	_cmi: [],

	/**
	 * User shared sco data (refer to a single sco)
	 */

	_adlnav: {},

	_adlcp: {},

	/**
	 * Scorm api official version params
	 */
	version: "1.0",

	loadInitialtracking: function(data) {
		this._cmi = data;
	},

	/**
	 * @param param
	 * @returns {string}
	 */
	Initialize: function( param ) {
		this._add_log("Initialize ("+param+")");
		this.reset_error();
		// Require an empty param
		if(param != "") return this.throw_error("false", 201);
		// Already Initialized
		if(this._api_status == this._status.RUNNING) return this.throw_error("false", 103);
		// Content Instance Terminated
		if(this._api_status == this._status.TERMINATED) return this.throw_error("false", 104);

		// Initialize done
		this._api_status = this._status.RUNNING;
		return "true";
	},

	/**
	 * @param param
	 * @returns {string}
	 */
	GetValue: function( param ) {
		this._add_log("GetValue ("+param+")");
		this.reset_error();
		// Retrieve Data Before Initialization
		if(this._api_status == this._status.NOT_INITIALIZED) return this.throw_error("", 122);
		// Retrieve Data After Termination
		if(this._api_status == this._status.TERMINATED) return this.throw_error("", 123);
		// Require a non empty param
		if(param === "") return this.throw_error("", 301, "The data model element was not specified");
		// check if the param is a valid scorm api param, else throw 401 and return an empty string
		var element = this.check_dme(param);
		if(!element) {
			// check for data model element specific error (error type 301)
			var get_dme_error = this.check_get_dme(param);
			if(get_dme_error != 0) return this.throw_error("", get_dme_error);
			// just the required dme doesn't exist
			return this.throw_error("", 401, "The param "+param+" doens't exist in the Scorm 2004 dme");
		}

		//check if the user can write the current param
		if(!element.readable) return this.throw_error("", 405, param);
		//children special type
		if(element.type == '_children') return element.values;
		//count special type
		if(element.type == '_count') return this._count( element, param );

		// check if the param is already initialized or return 403 and an empty string
		switch(this.is_initialized(element, param)) {
			case 301:return this.throw_error("", 301, param);
			case 403:return this.throw_error("", 403, param);
		}

		this._add_log( this._cmi[param] );

		// retrive the value
		return this._cmi[param];
	},


	/**
	 * @param param
	 * @returns {string}
	 */
	SetValue: function( param, data ) {
		this._add_log("SetValue ("+param+", "+data+")");
		this.reset_error();
		// Store Data Before Initialization
		if(this._api_status == this._status.NOT_INITIALIZED) return this.throw_error("false", 132);
		// Store Data After Termination
		if(this._api_status == this._status.TERMINATED) return this.throw_error("false", 133);
		// Require a non empty param
		if(param === "") return this.throw_error("false", 351, "The data model element was not specified");
		// check if the param is a valid scorm api param, else throw 401 and return false
		var element = this.check_dme(param);
		if(!element) return this.throw_error("false", 401, "The param "+param+" doens't exist in the Scorm 2004 dme");

		//check if the user can write the current param
		if(!element.writable) return this.throw_error("false", 404, param);
		// data type controls
		switch(this.check_set_dme(element, param, data)) {
			// the data type doesn't match the param type
			case 406:return this.throw_error("false", 406, param + ": " + data);
			// the data is out of range
			case 407:return this.throw_error("false", 407, param + ": " + data);
			// a previous mandatory value should have been setted before this one
			case 408:return this.throw_error("false", 408, param);
			// generic error, look in dignostic for more info
			case 351:return this.throw_error("false", 351);
		}

		if(element.type == "long_identifier_type" && this.is_initialized(element, param) != 0 ) {

			// first initialization of an id, we should also set something else
			if( param.search(/objectives/i) > -1 ) {

				var info = this.split_param( param );
				this._cmi[ info.base + '.' + info.number + '.success_status' ] = 'unknown';
				this._cmi[ info.base + '.' + info.number + '.completion_status' ] = 'unknown';
			}

		}

		// set the value
		try {
			if (element.concatenate_write != undefined && this._cmi[param] != undefined) {
				this._cmi[param] = this._cmi[param] + data;
			} else {
				this._cmi[param] = data;
			}
		} catch(e) {
			this._cmi[param] = data;
		}
		// rise the flag for new data to save
		this._new_data = true;
		return "true";
	},

	/**
	 * @param param must be empty
	 * @returns {string}
	 */
	Commit: function( param ){
		this._add_log("Commit ("+param+")");
		this.reset_error();
		// Require an empty param
		if(param != "") return this.throw_error("false", 201, "An empty param is required");
		// Commit Before Initialization
		if(this._api_status == this._status.NOT_INITIALIZED) return this.throw_error("false", 142);
		// Commit After Termination
		if(this._api_status == this._status.TERMINATED) return this.throw_error("false", 143);

		// do Commit
		if (this._new_data) {
			// save only if there are new data
			var date = new Date();
			var url = '//' + this._server_url + "/scormcmd/Commit?host=" + encodeURIComponent(this._lms_url) + '&time=' + date.getTime();
			var apiObject = this;
			var lms_url = this._lms_url;
			var data = {
				id_user: this._id_user,
				id_item: this._id_item,
				id_reference: this._id_reference,
				auth_code: window.dcd_player._auth_code,
				preview_mode: this._preview_mode,
				cmi: (this._as_json)? JSON.stringify(this._cmi) : this._cmi
			};
			if (this._context) {
				data['context'] = this._context;
			}
			var successCallback = function (responseData) {
				try{ apiObject._add_log(responseData); } catch(e) {}
			};
			var errorCallback = function (isInvalidToken) {
				try {
					apiObject._add_log('Commit failed.');
					if (!isInvalidToken) {
						apiObject.sendCommitErrorLogRequest(data, lms_url);
					}
				} catch (e) {}
			};

			this.sendRequest(url, data, successCallback, errorCallback, true);
		}

		// raise the flag for new data to save (only exception is if only the time was updated do to some "continuos committing" authoring tool output)
		if (param != 'cmi.session_time') this._new_data = true;

		return "true";
	},

	/**
	 * @param param must be empty
	 * @returns {string}
	 */
	Terminate: function( param ) {
		this._add_log("Terminate ("+param+")");
		this.reset_error();
		// Require an empty param
		if(param != "") return this.throw_error("false", 201);
		// Termination Before Initialization
		if(this._api_status == this._status.NOT_INITIALIZED) return this.throw_error("false", 112);
		// Termination After Termination
		if(this._api_status == this._status.TERMINATED) return this.throw_error("false", 113);

		// do Terminate
		//if (this._new_data) {
			// save only if there are new data
			var date = new Date();

			var url = '//' + this._server_url + "/scormcmd/Finish?host=" + encodeURIComponent(this._lms_url) + '&time=' + date.getTime();
			var apiObject = this;
			var data = {
				id_user: this._id_user,
				id_item: this._id_item,
				id_reference: this._id_reference,
				auth_code: window.dcd_player._auth_code,
				launch_type: window.dcd_player._launch_type,
				preview_mode: this._preview_mode,
				cmi: (this._as_json)? JSON.stringify(this._cmi) : this._cmi,
				return_url: window.dcd_player._return_url,
			};
			if (this._context) {
				data['context'] = this._context;
			}
			var successCallback = function (responseData) {
				try {
					if (responseData.next_to_play != undefined) {
						apiObject.scounload(responseData.next_to_play);
					}
					apiObject._add_log(responseData);
				} catch (e) {}
			};
			var errorCallback = function () {
				try { apiObject._add_log('Finish failed.'); } catch(e) {}
			};
			this.sendRequest(url, data, successCallback, errorCallback, true);

		// Terminate done
		this._api_status = this._status.TERMINATED;
		this._new_data = false;
		return "true";
	},

	sendRequest : function(url, data, successCallback, errorCallback, retry) {
		if (window.dcd_player.shouldPostMessage() && this.postMessage(url, data)) {
			return true;
		} else if (window.dcd_player.shouldFetch()) {
			this.sendFetchRequest(url, data, successCallback, errorCallback, retry)
		} else {
			this.sendAjaxRequest(url, data, successCallback, errorCallback, retry)
		}
	},

	scounload: function(next_to_play) {

		window.dcd_player.next_to_play = next_to_play;
		window.dcd_player.scounload();
	},

	/**
	 * @returns {string}
	 */
	GetLastError: function() {
		this._add_log("GetLastError() : " + this._lastErrorCode);
		return this._lastErrorCode;
	},

	/**

	 * @returns {string}
	 */
	GetErrorString: function( ecode ) {
		ecode = parseInt(ecode);
		if( this._errors[ecode] != undefined ) return  this._errors[ecode]
		return "";
	},

	/**

	 * @returns {string}
	 */
	GetDiagnostic: function( ecode ) {
		this._add_log("GetDiagnostic("+ecode+") : " + this._diagnostic);

		return ecode + ": "
			+ this._errors[ ecode ]
			+  " - " + this._diagnostic;
	},

	/**




	 * Check if a param is a valid data model element
	 */
	check_dme: function( param ) {

		for(var i = 0;i < this.dme.length;i++) {

			if(this.dme[i].regexp.exec( param ) != null ) {
				return this.dme[i];
			}
		}
		return false;
	},

	/**
	 * Check if a param was initialized, either by the LMS or the SCO
	 */
	is_initialized: function( element, param ) {

		if( this._cmi[param] == undefined ) {

			if(/\.[0-9]+\./i.test( param )) {
				var info = this.split_param(param);
				// the sco had attempt to access a numerable param not setted yet
				if(parseInt(info.number) >= this._count(false, info.base + '._count') ) {

					this._diagnostic = "The data model element request failed to be processed due to an index out of range error";
					return 301;
				}
			}
			return 403;
		}
		return 0;
	},

	/**
	 * the program flow will reach this function only if the element isn't in the data model
	 * we must search for specific cases (such as a _count not in the data model
	 */
	check_get_dme: function( param ) {
		// the data model doesn't have _children
		if( param.search(/_children/i) > -1 ) {
			this._diagnostic = "The data model element does not have children";
			return 301;
		}
		// the data model doesn't support _count
		if( param.search(/_count/i) > -1 ) {
			this._diagnostic = "The data model element is not a collection and therefore does not have a count";
			return 301;
		}
		// the sco had attempt to access a _version param other than cmi._version
		if( param.search(/_version/i) > -1 ) {
			this._diagnostic = "The _version keyword was used incorrectly";
			return 301;
		}
		return 0;
	},

	/**
	 * This function accept a numerable and return it in various modality.
	 * if the param is : cmi.element.1.id
	 * The out put will be
	 *
	 * base: cmi.element
	 * numeric: cmi.element.1
	 * number: 1
	 * last: id
	 */
	split_param: function( param ) {

		var splitted = param.match(/^(.+)\.([0-9]+)\.(.+)$/);
		if(!splitted) {

			splitted = param.match(/^(.+)\._count$/);
			if(!splitted) return false;
			return {
				base:	splitted[1],
				numeric:'',
				number:	'',
				last:	'_count'
			};

		}
		return {
			base:	splitted[1],
			numeric:splitted[1] + '.' + splitted[2],
			number:	splitted[2],
			last:	splitted[3]
		};
	},

	_count: function ( element, param ) {

		var splitted = param.match(/^(.+)\._count$/),
			regexp = new RegExp(splitted[1] + ".([0-9]+)") ;
		var count = 0;
		for( cme in this._cmi ) {

			var match = regexp.exec( cme );
			if(  match != null && parseInt(match[1])+1 > count ) count = parseInt(match[1])+1;
		}
		return count;
	},

	_count_param: function ( element, param ) {
		var splitted = param.match(/^([a-z-_.]+)\.[0-9]+\.(.+)$/),
			regexp = new RegExp("^" + splitted[1] + ".([0-9]+)") ;
		var count = 0;
		for( cme in this._cmi ) {

			var match = regexp.exec( cme );
			if(  match != null && parseInt(match[1])+1 > count ) count = parseInt(match[1])+1;
		}
		return count;
	},


	/**
	 * Check if the current data type match the param datatype,
	 * if the value of the data if in range or value out
	 * if a previous value should have been setted
	 * can return 406, 407, 408, 351 or 0
	 */
	check_set_dme: function( element, param, data ) {

		// the data type doesn't match the param type
		switch(element.type) {
			case "long_identifier_type" : {
				if(data == "") return 406;
				if(data == "urn:") return 406;
				if( param.search(/^urn:/i) > -1 ) {
					if(!/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#\s]*)(\?([^#]*))?(#(.*))?/i.test( data )) return 406;

				}
				else if(!/^[^.!~*'()]{0,4000}$/.test( data )) return 406;
			};break;
			case "state" : {
				// the data must be in element.state
				var match_found = false;
				for(var i = 0;i < element.values.length;i++) {

					if(data == element.values[i]) match_found = true;
					if (element.values[i] == 'real(10,7)' && !match_found) {
						// decimal must be the last of the list
						if (!/^-?(\d)+(\.)?(\d)*$/.test(data)) return 405;
						if (data < 0 || data > 100) return 405;
						match_found = true;
					}
				}
				if(!match_found) return 406;
			};break;
			case "spm" : {
				// truncate?
				if(data != undefined && data.length > element.subtype) {

					// a data will be truncated
					//this is not a real error but a notification track should be leaved inside the diagnostic
					this._diagnostic = "The value to be used to set the data model element exceeds the SPM for the data model element. The value was truncated";
					data = data.substring(0, element.subtype);
				}
			};break;
			case "real(10,7)" : {

				if( !/^-?(\d)+(\.)?(\d)*$/.test( data ) ) return 406;

				var real = ( data.replace === undefined ? data : parseFloat(data.replace(/,/,'.')) );
				// the data is out of range
				switch( element.subtype ) {
					case "0..1":
						if( real < 0 || real > 1 ) return 407;
					break;
					case "0..*":
						if( real < 0 ) return 407;
					break;
					case "-1..1":
						if( real < -1 || real > 1 ) return 407;
					break;
				}
			};break;
			case "second(10,0)" : {

				//	YYYY[-MM[-DD[Thh[:mm[:ss[.s[TZD]]]]]]]

			};break;
			case "second(10,2)" : {
				//	||P[yY][mM][dD][T[hH][nM][s[.s]S]] where:
				var data = data.match( /^(P)(?:(\d+)Y|Y)?(?:(\d+)M|M)?(?:(\d+)D|D)?(?:(T)(?:(\d+)H|H)?(?:(\d+)M|M)?(?:(\d+)(?:\.(\d{1,2}))?S|S)?)?$/ );
				if(!data) return 406;
				// we can check our data now
				var p_symbol = data[1] || false,
					year = data[2] || false,
					month = data[3] || false,
					day = data[4] || false,
					t_symbol = data[5] || false,
					hour = data[6] || false,
					minutes = data[7] || false,
					second = data[8] || false,
					millisecond = data[9] || false;
				// P symbol not setted
				if(!p_symbol) return 406;
				// T symbol given but no time setted
				if(t_symbol && !(hour || minutes || second || millisecond)) return 406;
				if(!t_symbol && (hour || minutes || second || millisecond)) return 406;
			};break;
		}

		// a previous mandatory value should have been setted before this one
		// the data to save had jump an availabel numerable position (ex.
		// SetValue(cmi.objectives.0.id, identifier_1);
		// SetValue(cmi.objectives.2.id, identifier_2);
		// cmi.objectives.1 jumped
		if (/^([a-z-_.]+)\.([0-9]+)\.(.+)$/i.test(param)) {

			var current_max = this._count_param( element, param );
			var new_id = /^([a-z-_.]+)\.([0-9]+)\.(.+)$/i.exec( param );
			if(new_id[1] > current_max) {
				this._diagnostic = "The data model element collection was attempted to be set out of order";
				return 351;
			}
		}

		if( element.type == "long_identifier_type" ) {

			// The param identifier that the sco want to save was alredy saved and the param can only be set once
			// and the new value is different from the stored one (if the stored value and the new value are equal the system should not raise the error)
			if( this._cmi[param] != undefined && this._cmi[param] != data  ) {
				this._diagnostic = "The data model element’s value is already set and cannot be changed";
				return 351;
			}

			// The param that the sco want to save is an identifier and is not unique
			for( cme in this._cmi ) {

				var splitted = param.match(/^(.+)\.[0-9]+\.id$/),
					regexp = new RegExp(splitted[1] + ".[0-9]+.id") ;
				if( cme != param && this._cmi[cme] == data && regexp.test( cme ) && splitted[1] != "cmi.interactions") {

					this._diagnostic = "The data model element’s value is already in use and is not unique";
					return 351;
				}
			}
		}
		return 0;
	},

	sendAjaxRequest: function (url, data, successCallback, errorCallback, retry, bearerToken) {
		var apiObject = this;
		var handleError = function (isInvalidToken) {
			if (!isInvalidToken && retry) {
				apiObject.sendAjaxRequest(url, data, successCallback, errorCallback, false)
			} else {
				if(isInvalidToken && window.dcd_player._show_expired_session_modal) {
					window.dcd_player.showExpiredSessionModal();
				} else {
					errorCallback(isInvalidToken);
				}
			}
		};
		$.ajax({
			type: 'POST',
			beforeSend: function(request) {
				if (bearerToken) {
					request.setRequestHeader('Authorization', 'Bearer ' + bearerToken);
					request.setRequestHeader('Content-Type','application/json');
				}
			},
			async: false,
			dataType: 'json',
			cache: false,
			url: url,
			data: data,
			context: this,
			success: function (responseData, textStatus, jqXHR) {
				if (!responseData.success) {
					var isInvalidToken = responseData.hasOwnProperty('invalidOrExpiredToken') && responseData.invalidOrExpiredToken === true;
					handleError(isInvalidToken);
				} else {
					successCallback(responseData);
				}
			},
			error: function (responseData, textStatus, errorThrown) {
				handleError();
			}
		});
	},

	sendFetchRequest: function (url, data, successCallback, errorCallback, retry) {
		var apiObject = this;
		var formData = new FormData();
		for (var key in data) {
			formData.append(key, data[key]);
		}
		var handleError = function (isInvalidToken) {
			if (!isInvalidToken && retry) {
				apiObject.sendFetchRequest(url, data, successCallback, errorCallback, false);
			} else {
				if(isInvalidToken && window.dcd_player._show_expired_session_modal) {
					window.dcd_player.showExpiredSessionModal();
				} else {
					errorCallback(isInvalidToken);
				}
			}
		};
		fetch(url, {
			method: 'POST',
			body: formData,
			keepalive: true,
			cache: 'no-cache'
		}).then(function(response) {
			if (!response.ok) {
				this._add_log( 'Scorm API error, will try to send ajax request. Error:' + response.statusText);
				throw new TypeError(response.statusText);
			}
			return response.json();
		}).then(function(responseData) {
			if (!responseData.success) {
				var isInvalidToken = responseData.hasOwnProperty('invalidOrExpiredToken') && responseData.invalidOrExpiredToken === true;
				handleError(isInvalidToken);
			} else {
				successCallback(responseData);
			}
		}).catch(function(responseData) {
			if (responseData instanceof TypeError) {
				apiObject.sendAjaxRequest(url, data, successCallback, errorCallback, false);
			} else {
				handleError();
			}
		});
	},


	postMessage: function (url, data) {
		try {
			if (JSON.stringify(data).length > 65536) {
				return false;
			}
			var $this = this;
			if (navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage({
					type: 'SEND_TRACKING_DATA',
					payload: {
						url: url,
						body: data,
						chapter_id: $this._id_reference + ':' + $this._id_item,
						host: $this._lms_url,
						auth_code: window.dcd_player._auth_code,
						show_expired_session_modal: window.dcd_player._show_expired_session_modal
					}
				});
				return true;
			}
		} catch (e) {
			console.log('Cannot Post Message to SW:', e);
		}
		return false;
	},

	/**
	 * Sends an ajax request to Loki to save an error log file on Loggly and S3.
	 *
	 * @param data
	 * @param lms_url
	 */
	sendCommitErrorLogRequest: function (data, lms_url) {
		var purgedData = {};
		var dataKeys = Object.keys(data);
		var params = $.url(document.location.href).param();
		purgedData.id_course = params.id_course;
		purgedData.course_name = params.name;

		// Removing the auth_code from the sent payload
		for (var i = 0; i < dataKeys.length; i++) {
			if (dataKeys[i] !== 'auth_code') {
				purgedData[dataKeys[i]] = data[dataKeys[i]];
			}
		}

		this.sendAjaxRequest(
			'https://' + encodeURIComponent(lms_url) + '/loki/dcd/v1/write_error_logs',
			JSON.stringify(purgedData),
			function () {},
			function () {},
			false,
			data.auth_code);
	},
}
