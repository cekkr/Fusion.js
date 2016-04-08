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

var reflect = require('harmony-reflect');
var net = require('net');
var deasync = require('deasync');
var JSON3 = require("json3");
var S = require('string');

var debuglog = require('debuglog')('fusionjs');

function FusionJS() {

}

FusionJS.prototype.settings  = 
{
	linker: {
		gc_ttl: 5
	},
	defaultArgs:{
		server: '127.0.0.1:3030'
	}
}

var linkers = [], garbageCollectorTimer = undefined;

FusionJS.prototype.Connect = function Connect(args) {
	if(garbageCollectorTimer === undefined)
		garbageCollectorTimer = setInterval(runGarbageCollector, 5000);

	if(!args)
		args = {server: FusionJS.prototype.settings.defaultArgs.server};
	
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
	
	var serverLinker = new ServerLinker(address, port);
	
	if(args.session)
		return serverLinker.getSession(args.session);
	
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
		if(linker.destroyed || (!linker.connected && linker.lastRequest==0) || (linker.lastRequest > 0 && now - linker.lastRequest > FusionJS.prototype.settings.linker.gc_ttl)){
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


var isFunction = function isFunction(functionToCheck) {
	var getType = {};
	return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}

var isNumeric = function isNumeric(input)
{
    return (input - 0) == input && (''+input).trim().length > 0;
}

function ServerLinker(HOST, PORT){
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

		debuglog('Connection closed');
		this.serverLinker.connected = false;

	});
	
	this.client.on('end', function () {
        // This may not been called since we are destroying the stream
        // the first time 'data' event is received
        //debuglog('All the data in the file has been read');
        this.serverLinker.connected = false;
        this.serverLinker.destroyed = true;
    });
	
	this.client.on('error', function (err) {
		debuglog('error:', err);

		if(this.connected)
			this.serverLinker.end();
		else
			this.destroyed = true;
	});
	
	
	///
	///	Make requests (synchronous, wait for response if callback is undefined)
	///
	this.execRequest = function(args, callback){
		this.lastRequest = 0;

		if(this.sessionId == -1 && args.request != "getSession")
			this.getSession();
		
		var jsonStream = new JsonStream();

		//Executing
		var send = JSON.stringify(args);
		debuglog('Sending: ' + send);
		this.client.write(send);
		
		//Check data events 
		var that = this;
		var done = false;
		var datares;

		var receiveData = function(data) {
			debuglog('Receive: ' + data);
			jsonStream.appendJson(data);

			if(jsonStream.isValid()){ //Json validated
				if(isFunction(callback)) //If has callback
					callback(JSON3.parse(jsonStream.json));

				done = true;
			}
			else 
				that.client.once('data', receiveData);
		}

		this.client.once('data', receiveData);
		if(callback === undefined)
			deasync.loopWhile(function(){return !done;});
		
		datares = JSON3.parse(jsonStream.json);

		//Check exceptions
		if(datares.response == 'exception')
			throw new Error(datares.message);
		
		this.lastRequest = getUnixTime();
		return datares;
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
	
	this.objectHandling = function(ref, parameters){
		return this.execRequest({request: 'object', ref: ref, parameters: parameters});
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
			debuglog("Client destroyed");
		}
	};
	
	
	/// Exit events
	function exitHandler(options, err) {

		if (options.cleanup){ 
			options.serverLinker.client.destroy();
			debuglog('ServerLinker cleaned.');
			process.exit();
		}
		
		if (err) debuglog(err.stack);
		if (options.exit) process.exit();
	}

	//do something when app is closing
	process.on('exit', exitHandler.bind(null,{serverLinker: this, cleanup:true}));

	//catches ctrl+c event
	process.on('SIGINT', exitHandler.bind(null, {serverLinker: this, exit:true}));

	//catches uncaught exceptions
	process.on('uncaughtException', exitHandler.bind(null, {serverLinker: this, exit:true}));
	
	
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
	
	var varBoxToJObject = function varBoxToJObject(varbox){
		if(varbox.propertyType){
			switch(varbox.propertyType){
				case 'Method':
					return function(){
						var args = serverLinker.argumentsToJsonArray(arguments);
						var response = serverLinker.objectHandling(ref, {command: 'methodExec', property: varbox.method, arguments: args});
						return varBoxToJObject(response);
					}
					
			}
		}
		
		if(varbox.type == 'exception'){

		}

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
	
	/*
		https://github.com/tvcutsem/harmony-reflect/blob/master/doc/traps.md
		http://soft.vub.ac.be/~tvcutsem/invokedynamic/proxies_tutorial
	*/
	return new Proxy(proxyTarget, { 
		get: function (target, name) {	
			
			if(options.isArray == "1" && name == "toString")
				name = "valueOf";

			switch(name){
				case 'inspect':
					/* 
						C'è un utilizzo errato del comando inspect, che chiede solo di indicare gli elementi contenuti in un array 
						https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
					*/
					var response = serverLinker.objectHandling(ref, {command: 'jsonSerialized'});
					var valof = varBoxToJObject(response);
					return JSON3.parse(valof);

				case 'valueOf':
					return function valueOf(){
						var response = serverLinker.objectHandling(ref, {command: 'jsonSerialized'});
						return varBoxToJObject(response);
					}

				case 'toString':
					return function toString(){
						return "[object Object]";
					}

				case 'cjsDeepClone':
					return function(){
						var response = serverLinker.objectHandling(ref, {command: 'jsonSerialized'});
						var valof = varBoxToJObject(response);
						return JSON3.parse(valof);
					}

				case 'cjsGetObjectRef':
					return ref;
			}
		
			var response = serverLinker.objectHandling(ref, {command: 'get', property: name});
			return varBoxToJObject(response);
		},
		
		set: function (target, name, val) {
			var cmd = {command: 'set', property:name};
			
			if(val !== undefined){
				var objref = -1;
				if((objref = val.cjsGetObjectRef) === undefined)
					cmd.val = serverLinker.parseJObject(val);
				else 
					cmd.objref = objref;
			}
			else
				cmd.val = "null";

			var response = serverLinker.objectHandling(ref, cmd);
			return varBoxToJObject(response);
		},
		
		apply: function(target, wetThisArg, args) {
			if(options.isType === "1")
				return instanceType(args);
			else{
				debuglog(target + " ha provato ad eseguire ");
				debuglog(wetThisArg);
				debuglog(wetArgs);
				
				return 2;
			}
        },
		
		construct: function(target, args) {			
			return instanceType(args);
		}

	});
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

//Wake me up when process ends
process.once('beforeExit', function() {
	debuglog("Event ends");
});

module.exports = new FusionJS();
