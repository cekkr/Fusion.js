# ColibrìJS

ColibriJS is a javascript library based on [harmony-reflect](https://github.com/tvcutsem/harmony-reflect) that allows you to manipulate .NET objects in your JS application or service.

##Installation
Colibri project is divided in two parts: ColibriJS for client side and [Colibri.NET](https://github.com/cekkr/Colibri.NET) as server and objects manager.

###Client side
Requires [Node.js](https://nodejs.org/) >= v0.7.8 ([read harmony-reflect compatibility](https://www.npmjs.com/package/harmony-reflect#compatibility))    

~~~
$ npm install git+https://github.com/cekkr/ColibriJS.git
~~~

###Server Side
Requires Visual Studio 2015 (Community it's okay) and Framework .NET 4.5

Download the latest version of Colibri.NET solution [as zip](https://github.com/cekkr/Colibri.NET/archive/master.zip) or by cloning its repository `https://github.com/cekkr/Colibri.NET.git`

Open the solution and set ServerTest [as Startup project](https://msdn.microsoft.com/en-us/library/a1awth7y.aspx).

###First run
Run ServerTest, then go to ColibriJS module directory and execute `$ npm test`. This runs [test.js](https://github.com/cekkr/ColibriJS/blob/master/test.js) script.

```
$ npm test

> colibrijs@0.0.1 test C:\Users\cekkr\colibri\ColibriJS
> node --harmony_proxies test.js

strtest = This is a string test
test.ciao = come va
test.ciao = how are you?
test.Get() returns The string is on the table
test.laugh("lol!") returns lol! ahahahahahah
test.Sum(10,15) returns 25
newtest.ciao = come va
newtest.ciao = how are you?
```
For show debug logs, type `$ npm testdebug`, [debuglog](https://www.npmjs.com/package/debuglog) section name is `colibrijs`

##Your first project 

###Server side
Open Visual Studio, create a new Console Application, import Colibri.NET (as project or dll) in the solution and add its reference in main project.<br><br>
The first class to know is `Server`: it allows you to create your first server very quickly. <br>
Server contains two very important properties: `DisputedEntieties` and `SessionPool`. These viariables are homonymous of their classes (inheritable in the comfort of the developer) and allow you to decide which objects you want provide to client and manage connection sessions. To be precise, SessionPool contains in turn another variable DisputedEntities that will be set when Server.StartListening() is performed, if Server.DisputedEntities is not null.

Now edit your `Program.cs` file. 

```C#
class Program
{
	static void Main(string[] args)
	{
		var server = new Colibri.NET.Server();
		
		server.DisputedEntities.Insert("testString", "This is a string test");
		server.DisputedEntities.Insert("happyObject", new HappyClass());
		server.DisputedEntities.Insert("HappyClass", typeof(HappyClass));
		
		server.StartListening(); //Default port: 3030
	}
}

public class HappyClass
{
	public bool isHappy = false;
	private int _number = 1;

	public HappyClass() { }
	public HappyClass(int number) 
	{
		_number = number;
	}
	
	public string areYouOk(string say)
	{
		for(int n=0; n<_number; n++)
			Console.Write(say);
			
		if(isHappy)
			return "YEAH! I'm happy";
		else
			return "no i'm sad :'(";
	}
}
```

###Client side
In your client project directory install ColibriJS: <br>

```
$ npm install git+https://github.com/cekkr/ColibriJS.git --save 
```

In your app.js file write:

```javascript
var ColibriJS = require('colibrijs');
var linker = ColibriJS.Connect(); //Default server: 127.0.0.1:3030

console.log("testString say: " + linker.get("testString"));

var happyObject = linker.get("happyObject");
console.log(happyObject.areYouOk("first"));
happyObject.isHappy = true; //For entire execution of your Colibri server isHappy will remain true
console.log(happyObject.areYouOk("second"));

var HappyClass = linker.get("HappyClass");
var newHappyObject = new HappyClass(3);
console.log(newHappyObject.areYouOk("c'mon"));

```

Now execute your server and run node script:

```
$ node --harmony_proxies app.js 
```

Watch results.

##Development
Project is in alpha version and development is still long. I apologize for the poverty of documentation.

###ColibriJS
- `ColibriJS.Connect(address= '127.0.0.1')` allow to create a ServerLinker instance.
- `ServerLinker.getSession(parameters = {})` allow to have a session reference id and access to objects.
- Added support to passing .NET objects as reference
- `ServerLinker.get(objectName)` returns a .NET object (as value or reference).
- Created class ObjectWrapper as object proxy manager.
- Added properties and methods support to ObjectWrapper.
- Added support to .NET types and objects instance.
- Added support to arrays and indexers

###Colibri.NET
Colibrì.NET GitHub page can be found here: [https://github.com/cekkr/Colibri.NET](https://github.com/cekkr/Colibri.NET). 

