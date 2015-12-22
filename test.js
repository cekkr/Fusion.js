require('harmony-reflect');

var ColibriJS = require('./index.js');
var clinker = ColibriJS.Connect();

var strtest = clinker.get('strtest');
console.log("strtest = " + strtest);


var test = clinker.get('test');

//Set property as value (string)
console.log("test.ciao = " + test.ciao);
test.ciao = "how are you?";
console.log("test.ciao = " + test.ciao);

console.log("test.Get() returns " + test.Get());

test.Say("ciao uomo"); // Watch your server console

console.log('test.laugh("lol!") returns ' + test.laugh("lol!"));

console.log('test.Sum(10,15) returns ' + test.Sum(10, 15));

//test.Sum("ciao"); //Exception!

//Instance new object from type
var TestClass = clinker.get('TestClass');
var newtest = new TestClass();

console.log("newtest.ciao = " + newtest.ciao);
newtest.ciao = "how are you?";
console.log("newtest.ciao = " + newtest.ciao);

//Set object as reference
console.log("SecondClass name is "+newtest.ReadSecondClassName());
var newsecond = new clinker.get('SecondClass')();
newsecond.name = "giacomo";
//newtest.second = newsecond;
newtest.SetSecondClass(newsecond);
console.log("Now SecondClass name is "+newtest.ReadSecondClassName());

var ArrayClass = clinker.get('ArrayClass');
var arrayObj = new ArrayClass();
console.log("arrayObj['hipe'] = " + arrayObj['hipe']);
console.log("arrayObj[2] = " + arrayObj[2]);

clinker.end();

