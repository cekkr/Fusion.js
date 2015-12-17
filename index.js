//Da importate: https://github.com/tvcutsem/harmony-reflect

var net = require('net');
var deasync = require('deasync');

var debuglog = require('debuglog')('colibrijs');

//var Worker = require('webworker-threads').Worker; //Temporaneamente deprecato
//var queue = require('queue'); // se non verrà più utilizzato s'ha da eliminare dal composer.json
function ColibriJS() {
}

ColibriJS.prototype.Connect = function Connect(session, server) {
	
	if(!server && session && session.indexOf(".") > -1 && session.indexOf(":") > -1){
		server = session;
		session = undefined;
	}
	
	var address = '127.0.0.1';
	var port = 3030;
	
	if(server){
		var splserver = server.split(':');
		address = splserver[0];
		
		if(splserver.length>1)
			port = Number(splserver[1]);
		else 
			if(isNan(address)){
				port = address;
				address = '127.0.0.1';
			}
	}
	
	var serverLinker = new ServerLinker(address, port);
	
	if(session)
		return serverLinker.getSession(session);
	
	return serverLinker;
};

function ServerLinker(HOST, PORT){
	///
	/// Client region
	///
	this.client = new net.Socket();
	this.client.serverLinker = this;
	this.sessionId = -1;
	this.connected = false;
	
	this.client.connect(PORT, HOST, function() {
		debuglog('CONNECTED TO: ' + HOST + ':' + PORT);
		this.connected = true;
		// Write a message to the socket as soon as the client is connected, the server will receive it as message from the client 
		//this.write('I am Chuck Norris!');
	});
	
	// Add a 'data' event handler for the client socket
	// data is what the server sent to this socket
	this.client.on('data', function(data) {
		//debuglog('DATA: ' + data);
		// Close the client socket completely
		//debuglog(data);
		//this.destroy();
		
	});

	// Add a 'close' event handler for the client socket
	this.client.on('close', function() {
		debuglog('Connection closed');
		
		var connected = this.serverLinker.connected || this.connected;
		
		if(connected){
			this.serverLinker.end();
			debuglog("I'm going to exit");
			process.exit();
		}
	});
	
	this.client.on('end', function () {
        // This may not been called since we are destroying the stream
        // the first time 'data' event is received
        //debuglog('All the data in the file has been read');
    });
	
	this.client.on('error', function (err) {
		debuglog('error:', err);
	});
	
	
	///
	///	Make requests (synchronous, wait for response)
	///
	this.execRequest = function(args){
		
		if(this.sessionId == -1 && args.request != "getSession")
			this.getSession();
		
		//args["sessionId"] = this.sessionId;
	
		//Executing
		var send = JSON.stringify(args);
		debuglog('Invio: ' + send);
		this.client.write(send);
		
		//Controlla evento risponditore 
		var done = false;
		var datares;
		this.client.once('data', function(data) {
			debuglog('Ricevo: ' + data);
			datares = data;
			done = true;
		});
		
		deasync.loopWhile(function(){return !done;});
		
		datares = JSON.parse(datares);
		
		//Check exceptions
		if(datares.response == 'exception')
			throw new Error(datares.message);
		
		return datares;
	}
	
	///
	/// Fast requests
	///
	this.getSession = function(parameters){
		
		var response = this.execRequest({ request: 'getSession', parameters: parameters});
		
		if(response.response == "reference")
			this.sessionId = response.reference;
		
		debuglog("Il mio session id è " + this.sessionId);
		
		return this.sessionId;
	}
	
	this.get = function(variable){
		var response = this.execRequest({ request: 'get', variable: variable});
		return this.varBoxToJObject(response);
	}
	
	this.getType = function(type){ //Deprecated

		var that = this;
		return function(){
			var args = this.argumentsToJsonArray(arguments);
			var response = that.execRequest({ request: 'instance', type: type, arguments: args });
			return that.varBoxToJObject(response);	
		}
	}
	
	this.argumentsToJsonArray = function(myargs){
		var args = new Array();
		for(a=0; a<myargs.length; a++)
			args.push(this.parseJObject(myargs[a]));
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
					throw new Error(varbox.exception);
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
	this.end = function(){
		//Controllare che tutte le operazioni siano state terminate 
		//con deasync.loopWhile(function(){return !done;});
		
		if(this.connected){
			this.endConnection();
		}
		
		this.client.destroy();
		this.connected = false;
		debuglog("Client destroyed");
		
		/*if(!ttl) ttl = 5;
		else ttl -= 1;
		
		if(ttl<2){
			this.client.destroy();
		}
		else {
			var t = this;
			setTimeout(function() { t.end(ttl); }, 250); //Controlla fino alla fine
			debuglog("setTimeout("+ttl+")");
		}*/
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
		
		return serverLinker.varBoxToJObject(varbox);
	}
	
	var proxyTarget = function() {
		//console.log("function called!");
	};
	
	return new Proxy(proxyTarget, {
		get: function (target, name) {			
			var response = serverLinker.objectHandling(ref, {command: 'get', property: name});
			return varBoxToJObject(response);
		},
		
		set: function (target, name, val) {
			var strval = serverLinker.parseJObject(val);
			var response = serverLinker.objectHandling(ref, {command: 'set', property:name, object: strval})
			return varBoxToJObject(response);
		},
		
		apply: function(target, wetThisArg, wetArgs) {
            debuglog(target + " ha provato ad eseguire " + wetThisArg);
            return 2;
        },
		
		construct: function(target, args) {			
			if(options.isType === "1"){
				args = serverLinker.argumentsToJsonArray(args);
				var response = serverLinker.execRequest({ request: 'instance', typeref: ref, arguments: args });
				return varBoxToJObject(response);
			}
			
			throw new Error("You cannot instance an object");
		}

	});
	
	
};

//Wake me up when process ends
process.once('beforeExit', function() {
	debuglog("Event ends");
});

module.exports = new ColibriJS();
