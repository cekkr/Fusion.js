require('harmony-reflect');

var ColibriJS = require('./index.js');
var clinker = ColibriJS.Connect();

var strtest = clinker.get('strtest');
console.log("strtest = " + strtest);


var test = clinker.get('test');

console.log("test.ciao = " + test.ciao);
test.ciao = "how are you?";
console.log("test.ciao = " + test.ciao);

console.log("test.Get() returns " + test.Get());

test.Say("ciao uomo"); // Watch your server console
console.log(test.laugh("lol!"));


clinker.end();

