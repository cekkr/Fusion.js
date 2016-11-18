/*

 Fusion.js - Handle .NET objects in JavaScript
 Copyright (C) 2016 Riccardo Cecchini (https://github.com/cekkr)

 This library is free software; you can redistribute it and/or
 modify it under the terms of the GNU Lesser General Public
 License as published by the Free Software Foundation; either
 version 3 of the License.

 This library is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public
 License along with this library; if not, see <http://www.gnu.org/licenses/>.

 */

var reflect = require('harmony-reflect'); //C'è, ma non serve
var net = require('net');
var deasync = require('deasync');
var JSON3 = require("json3");
var S = require('string');

var debuglog = require('debuglog')('fusionjs');

function FusionJS() {

}

//Enumerators
FusionJS.prototype.dontWaitResponse = "X Gon' Give It To Ya";

FusionJS.prototype.settings  =
{
	linker: {
		gc_ttl: 10
	},
	defaultArgs:{
		server: '127.0.0.1:3030'
	},
	aliases: {}
}

var linkers = [], garbageCollectorTimer = undefined, linkerNumber = 0;

FusionJS.prototype.Connect = function Connect(args) {
	if(garbageCollectorTimer === undefined)
		garbageCollectorTimer = setInterval(runGarbageCollector, 5000);

	if(!args) args = {};
	args.server = args.server || FusionJS.prototype.settings.defaultArgs.server;

	var address = '127.0.0.1';
	var port = 3030;

	if(args.server){
		var splserver = args.server.split(':');
		address = splserver[0];

		if(splserver.length>1)
			port = Number(splserver[1]);
		else
		if(isNumeric(address)){
			port = address;
			address = '127.0.0.1';
		}
	}

	var serverLinker = new ServerLinker(address, port, mergeData(this.settings, {sessionId: args.sessionId, linkerNumber:linkerNumber++}));

	linkers.push(serverLinker);
	return serverLinker;
};



///
/// Garbage Collector
///
function runGarbageCollector(){
	debuglog("Running garbage collector");

	var nrem = 0, toremove = [];

	var now = getUnixTime();
	for(var linker of linkers){
		if(linker.istanced && (linker.destroyed || (!linker.connected && linker.lastRequest==0) || (linker.lastRequest > 0 && now - linker.lastRequest > FusionJS.prototype.settings.linker.gc_ttl))){
			linker.end();
			toremove.push(linker);
			nrem++;
		}
	}

	for(var linker of toremove)
		linkers.splice(linkers.indexOf(linker),1);

	if(nrem > 0)
		debuglog("Closed " + nrem + " linkers of " + linkers.length);

	if(linkers.length == 0){
		clearInterval(garbageCollectorTimer);
		garbageCollectorTimer = undefined;
	}

}

function getUnixTime(){
	return Math.floor(new Date() / 1000);
}

function mergeData(v1, v2){
	var vr = {};
	for(var p in v1) vr[p] = v1[p];
	for(var p in v2) vr[p] = v2[p];
	return vr;
}

var isFunction = function isFunction(functionToCheck) {
	var getType = {};
	return functionToCheck && ((typeof functionToCheck != "string" && getType.toString.call(functionToCheck) == '[object Function]') /*|| functionToCheck == FusionJS.prototype.dontWaitResponse*/);
};

var isSpecialArgument = function isSpecialArgument(functionToCheck) {
	return functionToCheck && functionToCheck == FusionJS.prototype.dontWaitResponse;
};

var isNumeric = function isNumeric(input)
{
	return (input - 0) == input && (''+input).trim().length > 0;
}

function ServerLinker(HOST, PORT, settings){
	this.linkerNumber = settings.linkerNumber;
	this.istanced = false;
	var that = this;

	///
	/// Client region
	///
	this.client = new net.Socket();
	this.client.serverLinker = this;
	this.sessionId = -1;
	this.connected = false;
	this.lastRequest = getUnixTime();

	this.client.connect(PORT, HOST, function() {
		this.serverLinker.istanced = true;
		debuglog('Connected to Fusion.NET server: ' + HOST + ':' + PORT);
		this.serverLinker.connected = true;
	});

	// Add a 'data' event handler for the client socket
	// data is what the server sent to this socket
	/*this.client.on('data', function(data) {
	 //debuglog('DATA: ' + data);
	 // Close the client socket completely
	 //debuglog(data);
	 //this.destroy();

	 });*/

	// Add a 'close' event handler for the client socket
	this.client.on('close', function() {
		this.serverLinker.istanced = true;
		debuglog('Connection closed');
		this.serverLinker.connected = false;

	});

	this.client.on('end', function (data) {
		// This may not been called since we are destroying the stream
		// the first time 'data' event is received
		// debuglog('All the data in the file has been read');
		debuglog('['+that.linkerNumber+' : '+that.sessionId+'] End connection');
		//this.serverLinker.connected = false;
		//this.serverLinker.destroyed = true;
	});

	this.client.on('error', function (err) {
		this.serverLinker.istanced = true;
		debuglog('error:', err);

		if(this.connected)
			this.serverLinker.end();
		else
			this.destroyed = true;
	});


	///
	///	Make requests (synchronous, wait for response if callback is undefined)
	///
	this.workingRequest = false;
	this.execRequest = function(args, callback, options){
		if(!options) options={};

		this.lastRequest = 0;

		if(this.workingRequest){
			var tempLinker = FusionJS.prototype.Connect({sessionId: this.sessionId});
			var res = tempLinker.execRequest(args, callback, {dieAtEnd: true});
			this.lastRequest = getUnixTime();
			if(res) return res;
		}

		try{
			if(this.sessionId == -1 && args.request != "getSession")
				this.getSession();

			var jsonStream = new JsonStream();

			//Executing
			var send = JSON.stringify(args);

			//Check data events
			var that = this;
			jsonStream.done = false;
			that.workingRequest = true;

			var receiveData = function(data) {
				debuglog('['+that.linkerNumber+' : '+that.sessionId+'] Receive: ' + data);
				jsonStream.appendJson(data);

				if(jsonStream.isValid()){ //Json validated

					if(isFunction(callback)) { //If has callback
						that.lastRequest = getUnixTime();

						if (callback != FusionJS.prototype.dontWaitResponse) {
							var err = null, datares = null;
							try {
								var datares = JSON3.parse(jsonStream.json);

								//Check exceptions
								var err = null;
								if (datares.response == 'exception')
									err = new Error(datares.message);
							} catch (error) {
								datares = jsonStream.json;
								err = error;
							}

							setTimeout(function () {
								callback(datares, err);
							}, 0);

						}
					}

					that.workingRequest = false;
					jsonStream.done = true;

					/*if(options.dieAtEnd)
					 that.end();*/
				}
				else
					that.client.once('data', receiveData);
			}

			debuglog('['+that.linkerNumber+' : '+that.sessionId+'] Sending: ' + send);
			this.client.write(send);
			this.client.once('data', receiveData);
			if(!isFunction(callback) && args.request != 'endConnection'){
				var waitTick = 0;
				deasync.loopWhile(function(){
					return !jsonStream.done && waitTick++ < 100;
				});
				while(!jsonStream.done) require('deasync').sleep(20);

				var datares = null;
				try {
					datares = JSON3.parse(jsonStream.json);
				}catch(err){
					datares = jsonStream.json;
				}

				//Check exceptions
				if(datares.response == 'exception')
					throw new Error(datares.message);

				this.lastRequest = getUnixTime();
				return datares;
			}

		}
		catch(err){
			throw err;
		}
	}

	///
	/// Fast requests
	///
	this.getSession = function(parameters){

		var response = this.execRequest({ request: 'getSession', parameters: parameters});

		if(response.response == "reference")
			this.sessionId = response.reference;

		debuglog("My session id is " + this.sessionId);

		return this.sessionId;
	}

	this.get = function(variable){
		if(settings.aliases[variable]!==undefined)
			variable = settings.aliases[variable];

		var response = that.execRequest({ request: 'get', variable: variable});
		return that.varBoxToJObject(response);
	}

	this.getType = function(type){ //Deprecated
		return function(){
			var args = this.argumentsToJsonArray(arguments);
			var response = that.execRequest({ request: 'instance', type: type, arguments: args });
			return that.varBoxToJObject(response);
		}
	}

	///
	/// Internal functions
	///

	this.argumentsToJsonArray = function(myargs){
		var args = new Array();

		for(a=0; a<myargs.length; a++){
			var arg = myargs[a];
			var	oref;
			if(arg !== undefined && (oref=arg.cjsGetObjectRef) !== undefined)
				args.push({cjsObjectRef: oref});
			else
				args.push(this.parseJObject(arg));
		}

		return args;
	}

	this.varBoxToJObject = function(varbox){
		if(varbox.response == 'varbox'){
			switch(varbox.type){
				case 'valued':
					return JSON.parse(varbox.object);
				case 'ref':
					return new ObjectWrapper(this, varbox.object, varbox);

				case 'exception':
					/*  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!  **
					 **	      EXCEPTION HANDLING        **
					 **  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!  */

					//if(varbox.excode === 'UNDEFINED_MEMBER')
					//	return undefined;

					var error = new Error(varbox.exception);

					if(varbox.exStacks !== undefined){
						var nex = varbox.exStacks;
						var sstack = error.stack.split('\n');

						//Hide references to fusionjs and harmony-reflect
						if(process.env.NODE_DEBUG !== "fusionjs"){
							for(var s=0; s<sstack.length; s++){
								var stack = sstack[s].replace(/\\/g, '/');

								var tohide =
									stack.indexOf('node_modules/fusionjs') > -1 ||
									stack.indexOf('node_modules/harmony-reflect') > -1;

								if(tohide)
									sstack.splice(s--, 1);
							}
						}

						//Write CLR stack
						var clrstack = "";
						if(nex>0)
						{
							for(var ex=nex-1; ex>=0; ex--){
								var exdescr = JSON3.parse(varbox['exStack_' + ex]);

								clrstack += ' * ' + exdescr.message.trim() + "\r\n";

								var splitrace = exdescr.stacktrace.split('\n');
								for(var st=0; st<splitrace.length-1; st++){
									var str = splitrace[st];

									for(c = 0; c<str.length; c++)
										if(str[c] != ' ')
											break;

									var substr = str.substr(c).trim();
									if(substr)
										clrstack += '    ' + str.substr(c) + '\r\n';
								}
							}

							clrstack += "   === Colibri.NET Runtime ===";
						}
					}

					error.stack = "\r\n" + sstack[0] + "\r\n" + clrstack + "\r\n";
					sstack.shift();
					error.stack += sstack.join('\n');

					throw error;
			}
		}

		return undefined;
	}

	//In futuro si potrebbe approfondire il passaggio di variabili da js
	this.parseJObject = function(obj){
		return JSON.stringify(obj);
	}

	this.objectHandling = function(ref, parameters, callback){
		return this.execRequest({request: 'object', ref: ref, parameters: parameters}, callback);
	}

	this.objectGetPropertyType = function(ref, property){
		//var res = this.execRequest({ request: 'object', ref: ref, operation: 'getPropertyType', property: property});
		var res = this.objectHandling(ref, {command: 'getPropertyType', property: property});

		if(res.response == "propertyType")
			return res.type;

		return "0";
	}

	this.readResponseAsObject = function(response){
		var resobj = null;

		if(response.response == 'object'){
			switch(response.type){
				case 'valued':
					resobj = JSON.parse(response.object);
					break;

				case 'ref':
					resobj = new ObjectWrapper(this, response.object);
					break;
			}
		}

		return resobj;
	}

	this.endConnection = function(){
		return this.execRequest({ request: 'endConnection' });
	}


	///
	///	Linker region
	///
	this.destroyed = false;
	this.end = function(){
		//todo: Controllare che tutte le operazioni siano state terminate
		//con deasync.loopWhile(function(){return !done;});

		if(!this.destroyed){
			if(this.connected){
				this.endConnection();
			}

			this.client.destroy();
			this.connected = false;
			this.destroyed = true;
			debuglog('['+that.linkerNumber+' : '+that.sessionId+'] Client destroyed');
		}
	};

	//Related classes
	function Request() {
		this.Arguments = [];
		this.IsSent = false;
		this.HasResponse = false;
	}

	////////
	///////
	//////
	///// After load
	////
	///
	//Init session (if forced)
	if(settings.sessionId)
		this.getSession(settings.sessionId);

	// SET GLOBAL VARIABLES
	this.$GLOBAL = this.get('$GLOBAL');
	this.$GLOBAL_POOL = this.get('$GLOBAL_POOL');

}


function ObjectWrapper (serverLinker, ref, options) {
	if (isNaN(ref)) {
		throw new TypeError('Invalid object reference');
	}

	if(options == undefined)
		options = {type: ''};

	var varBoxToJObject = function varBoxToJObject(varbox, forceValue){
		if(varbox.propertyType){
			switch(varbox.propertyType){
				case 'Method':
					return function(){
						var args = Array.prototype.slice.call(arguments);

						var userCallback = undefined, callback = undefined;
						if(args.length > 0 && args[args.length-1].cjsGetObjectRef === undefined && (isFunction(args[args.length-1])||isSpecialArgument(args[args.length-1]))){
							userCallback = args[args.length-1];
							args.pop();


							callback = userCallback == FusionJS.prototype.dontWaitResponse ? FusionJS.prototype.dontWaitResponse : function(response, err){
								if(!err)
									response = varBoxToJObject(response, true)

								userCallback(response, err);
							};
						}

						args = serverLinker.argumentsToJsonArray(args);
						var response = serverLinker.objectHandling(ref, {command: 'methodExec', property: varbox.method, arguments: args}, callback);

						if(callback === undefined) {
							return varBoxToJObject(response);
						}
					}

			}
		}

		if(varbox.type == 'exception'){

		}

		if(varbox.type == 'ref' && forceValue)
			return serverLinker.varBoxToJObject(varbox).refAsValue();
		else
			return serverLinker.varBoxToJObject(varbox);
	}

	//todo: Attenzione alla "false istanze"
	var instanceType = function instanceType(args){
		if(options.isType === "1"){
			args = serverLinker.argumentsToJsonArray(args);
			var response = serverLinker.execRequest({ request: 'instance', typeref: ref, arguments: args });
			return varBoxToJObject(response);
		}
		else
			throw new Error("You cannot instance this object, is not a type.");
	}

	var proxyTarget = function() {
		//console.log("function called!");
	};

	function createFunctionForProperty(ref, name){
		return function() {
			try {
				var args = Array.prototype.slice.call(arguments);

				var userCallback = undefined, callback = undefined;
				if (args.length > 0 && args[args.length - 1].cjsGetObjectRef === undefined && (isFunction(args[args.length - 1]) || isSpecialArgument(args[args.length - 1]))) {
					userCallback = args[args.length - 1];
					args.pop();


					callback = userCallback == FusionJS.prototype.dontWaitResponse ? FusionJS.prototype.dontWaitResponse : function (response, err) {
						if (!err)
							response = varBoxToJObject(response, true)

						userCallback(response, err);
					};
				}

				args = serverLinker.argumentsToJsonArray(args);
				var response = serverLinker.objectHandling(ref, {
					command: 'methodExec',
					property: name,
					arguments: args
				}, callback);

				if (callback === undefined) {
					return varBoxToJObject(response);
				}
			}
			catch(err){
				console.log(err);
			}
		};
	}

	function createGetFunctionForProperty(ref, name){
		return function() {
			try {
				if (options.isArray == "1" && name == "toString")
					name = "valueOf";

				switch (name) {
					case 'inspect':
						/*
						 C'è un utilizzo errato del comando inspect, che chiede solo di indicare gli elementi contenuti in un array
						 https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
						 */
						var response = serverLinker.objectHandling(ref, {command: 'jsonSerialized'});
						var valof = varBoxToJObject(response);
						return JSON3.parse(valof);

					case 'valueOf':
						return function valueOf() {
							var response = serverLinker.objectHandling(ref, {command: 'jsonSerialized'});
							return varBoxToJObject(response);
						}

					case 'toString':
						return function toString() {
							return "[object Object]";
						}

					case 'refAsValue':
					case 'cjsDeepClone':
						return function () {
							var response = serverLinker.objectHandling(ref, {command: 'jsonSerialized'});
							var valof = varBoxToJObject(response);
							return JSON3.parse(valof);
						}

					case 'cjsGetObjectRef':
						return ref;

					case 'cjsBadMotherfuckers':
						return true;
				}

				var response = serverLinker.objectHandling(ref, {command: 'get', property: name});
				return varBoxToJObject(response);
			}catch(err){
				console.log(err);
			}
		};
	}

	function createSetFunctionForProperty(ref, name){
		return function(val) {
			try {
				var cmd = {command: 'set', property: name};

				if (val !== undefined) {
					var objref = -1;
					if ((objref = val.cjsGetObjectRef) === undefined)
						cmd.val = serverLinker.parseJObject(val);
					else
						cmd.objref = objref;
				}
				else
					cmd.val = "null";

				var response = serverLinker.objectHandling(ref, cmd);
				return varBoxToJObject(response);
			}
			catch(err){
				console.log(err);
			}
		};
	}

	var properties = varBoxToJObject(serverLinker.objectHandling(ref, {command: 'inspect'}));
	properties.push("inspect", "valueOf", "toString", "refAsValue", "cjsDeepClone", "cjsGetObjectRef", "cjsBadMotherfuckers");

	var proxy = {};
	for(var property of properties){
		var isMethod = false;

		if(property.endsWith("()")){
			isMethod = true;
			property = property.substr(0, property.length-2);
		}

		if(isMethod){
			proxy[property] = createFunctionForProperty(ref, property);
		}
		else {
			Object.defineProperty(proxy, property, {
				get: createGetFunctionForProperty(ref, property),
				set: createSetFunctionForProperty(ref, property),
				enumerable: true,
				configurable: true
			});
		}
	}

	return proxy;
};

//From Fusion.NET with love (Server.cs)
function JsonStream(){
	this.json = "";

	this._numBraces = 0;
	this._numBrackets = 0;
	this._inJsonString = false;
	this._escapeDepth = 0;
	this._totalLen = 0;

	this.appendJson = function(json){

		if(typeof json !== 'string')
			json = json.toString();

		this.json += json;

		for(var j=0; j<json.length; j++){
			var c = json.charAt(j);

			if(c == '\\')
				this._escapeDepth++;
			else {
				if (c == '"' && this._escapeDepth % 2 == 0)
					this._inJsonString = !this._inJsonString;

				this._escapeDepth = 0;
			}

			if(!this._inJsonString){
				switch(c){
					case '{':
						this._numBraces++;
						break;
					case '}':
						this._numBraces--;
						break;
					case '[':
						this._numBrackets++;
						break;
					case ']':
						this._numBrackets--;
						break;
				}
			}

			this._totalLen++;
		}

		debuglog('JsonStream Length:'+this._totalLen+'\t{'+this._numBraces+'}\t['+this._numBrackets+']\t"'+this._inJsonString+'"');
	};

	this.isValid = function(){
		if(this._totalLen == 0)
			return false;

		return !this._inJsonString && this._numBraces == 0 && this._numBrackets == 0;
	};

	this.clear = function(){
		this.json = "";
		this._numBraces = this._numBrackets = this._totalLen = 0;
		this._inJsonString = this._afterEscape = false;
	}
}

//Utils
function cloneFunction(that) {
	var temp = function temporary() { return that.apply(that, arguments); };
	for(var key in that) {
		if (that.hasOwnProperty(key)) {
			temp[key] = that[key];
		}
	}
	return temp;
};

//Wake me up when process ends
process.once('beforeExit', function() {
	debuglog("Event ends");
});

/// Exit events
function exitHandler(options, err) {

	if (options.cleanup){
		for(var linker of linkers){
			linker.client.destroy();
		}

		debuglog('ServerLinker cleaned.');
		process.exit();
	}

	if (err) debuglog(err.stack);
	if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
/*process.on('uncaughtException', function(err){
 console.log('Uncaught exception: ', err);
 });*/

module.exports = new FusionJS();
