require('harmony-reflect');

var FusionJS = require('./index.js');
var linker = FusionJS.Connect();

var strtest = linker.get('strtest');
console.log("strtest = " + strtest);

var stringArray = linker.get('stringArray');
console.log(stringArray);
console.log(stringArray.valueOf());
console.log(stringArray.toString());
console.log(typeof(stringArray));

var refStringArray = linker.get('&stringArray');
console.log(stringArray);
console.log(stringArray.valueOf());
console.log(stringArray.toString());
console.log(typeof(stringArray));

var passengerStruct = linker.get('passengerStruct');
console.log(passengerStruct);
console.log(passengerStruct.name);
console.log(passengerStruct.valueOf());
console.log(passengerStruct.toString());
console.log(typeof(passengerStruct));

var refPassengerStruct = linker.get('&passengerStruct');
console.log(refPassengerStruct);
console.log(passengerStruct.name);
console.log(refPassengerStruct.valueOf());
console.log(refPassengerStruct.toString());
console.log(typeof(refPassengerStruct));
console.log("refPassengerStruct.Name = " + passengerStruct.Name);

var test = linker.get('test');

//Set property as value (string)
console.log("test.ciao = " + test.ciao);
test.ciao = "how are you?";
console.log("test.ciao = " + test.ciao);

console.log("test.Get() returns " + test.Get());

test.Say("Sir, I'm not sure why the President was dressed in women's clothing."); // Watch your server console

console.log('test.laugh("lol!") returns ' + test.laugh("lol!"));

console.log('test.Sum(10,15) returns ' + test.Sum(10, 15));

//test.Sum("ciao"); //Exception!

//Instance new object from type
var TestClass = linker.get('TestClass');
var newtest = new TestClass();

console.log("newtest.ciao = " + newtest.ciao);
newtest.ciao = "how are you?";
console.log("newtest.ciao = " + newtest.ciao);

//Set object as reference
console.log("SecondClass name is "+newtest.ReadSecondClassName());
var newsecond = new linker.get('SecondClass')();
newsecond.name = "giacomo";
newtest.SetSecondClass(newsecond); //newtest.second = newsecond;
console.log("Now SecondClass name is "+newtest.ReadSecondClassName());

var ArrayClass = linker.get('ArrayClass');
var arrayObj = new ArrayClass();
console.log("arrayObj['hipe'] = " + arrayObj['hipe']);
console.log("arrayObj[2] = " + arrayObj[2]);
console.log("arrayObj.Words = " + arrayObj.Words.valueOf());

var wordsAsReference = arrayObj['&Words'];
console.log("wordsAsReference[0] = " + wordsAsReference[0]);

linker.end();

