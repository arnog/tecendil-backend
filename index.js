"use strict";

var express = require('express');
var app = express();

var fs = require('fs');
var xmlDoc = require('xmldoc').XmlDocument;
var ASCIIFolder = require('./ascii-folder');
var asciiFolder = new ASCIIFolder();
var doc;


/**
 * Return a short-definition (gloss) for a term (lema)
 * @param {string} q 
 */
function shortDef(q) {
	if (q === '?') return '';
	// Use a memoization cache (stored as a property of the function object)
	if (!shortDef.cache) {
		shortDef.cache = {};
		setTimeout(() => {
			console.log('clearing shortDef cache'); 
			shortDef.cache = null;
		}, 5 * 60 * 60 * 1000)
	}
	var result = shortDef.cache[q];
	if (!result) {
		// console.time("short def for " + q);
		result = shortDefRecursive(doc, q);
		shortDef.cache[q] = result;
		// console.timeEnd("short def for " + q);
	} else {
		// console.log('shortdef cache for ' + q);
	}
	return result;
}

/**
 * Return a short gloss for the lemma `q`, starting at node `r`
 * @param {*} r 
 * @param {*} q 
 */
function shortDefRecursive(r, q) {	
	var result = '';
	r.eachChild(n => { 
		if (n.name === 'word' && n.attr.v === q) {
			result = n.attr.gloss;
			return false;	// Found it. Stop iterating.
		}
		if (!result) {
			result = shortDefRecursive(n, q);
		}
	});

	return result;
}

// Recursively return results matching the query q in the node w.
// q should be case and diacritic folded
function eachWord(w, q) {
	var result = [];
	var pos = (w.attr.speech || '');
	
	if (w.name === 'word' && !(pos === 'phonetics' || pos === 'phonetic-rule' || pos === 'phonetic-group' || pos === 'grammar')) {

		// Score how well the current node matches the query
		var score = 0;
		var i = 0;
		var	v = w.attr.vfold;
		if (!v) {
			// Cache an ascii and case folded version of the lemma
			w.attr.vfold = asciiFolder.fold(w.attr.v).toLowerCase();
			v = w.attr.vfold;
		}
  
		if (v === q) {
			score = 100;
		} else {
			// If the entry matches the beginning of the query...
			i = v.indexOf(q);
			if (i === 0) {
				score = 100 * q.length / v.length;
			} else if (i > 0) {
				score = 90 * q.length / v.length;
			}
		}
		if (score === 0 && w.attr.gloss) {
			var g = w.attr.glossfold;
			if (!g) {
				// Cache an ascii and case folded version of the gloss
				w.attr.glossfold = asciiFolder.fold(w.attr.gloss).toLowerCase();
				g = w.attr.glossfold;
			}
			if (g === q) {
				score = 100;
			} else {
				var gscore = 0;	// Score for a gloss entry
				g.replace(/;/g, ',').split(',').map(function (entry) {
					entry = entry.trim();
					i = entry.indexOf(q);
					if (i === 0) {
						gscore = 90 * q.length / entry.length;
					} else if (i > 0) {
						gscore = 70 * q.length / entry.length;
					}
					if (gscore > score) {
						score = gscore;
					}
				});
			}
		}

		// If this node matches, record the result
		if (score > 0) {
			var v = w.attr.v;
			if (v && w.attr.tengwar) {
				// The tengwar attribute contains a thorn or tilde-n to indicate that 
				// súlë or noldo should be used instead of s/n
				if (w.attr.tengwar === 'ñ') {
					v = v.replace('n', 'ñ'); 
					v = v.replace('N', 'Ñ'); 
				} else if (w.attr.tengwar === 'þ') {
					v = v.replace('s', 'þ');
					v = v.replace('S', 'Þ');
				}
			}
			var notes = w.childNamed('notes');
			var elements = w.childrenNamed('element')
				.map(x => x.attr.v)
				.filter(x => x !== undefined)
				.map(x => {
					return {v: x, gloss: shortDef(x)};
				});
			result = [{
				v: 			v,
				score:		Math.round(score),
				language: 	w.attr.l,
				pos:		pos,
				gloss: 		w.attr.gloss,
				stem:		w.attr.stem,
				notes:		notes ? notes.val : undefined,
				tengwar:	w.attr.tengwar,
				elements:	elements
			}];
		}
	}
		
	// Look for other words inside this word
	w.eachChild(function(word) {
		result = result.concat(eachWord(word, q));
	});
	
	return result;
};

var cache = {};
const RING_SIZE = 20;
var ring = new Array(RING_SIZE);


ring.ringIndex = 0;

function addToRing(k, v) {
	ring[ring.ringIndex] = {key: k, value: v};
	ring.ringIndex = (ring.ringIndex + 1) % ring.length;
}


function getFromRing(k) {
	var result = undefined;
	var i = 0;
	while (!result && i < ring.length) {
		if (ring[i] && ring[i].key === k) {
			// Found a matching key in the ring buffer
			result = ring[i].value;

			if (ring.ringIndex !== i) {

				ring[ring.ringIndex] = ring[i];
				// Remove the key/value pair from its previous location
				ring.splice(i, 1);

				// Adjust the ring index if the removed element was after it
				if (i > ring.ringIndex) {
					ring.ringIndex = (ring.ringIndex + 1) % ring.length;	
				}
				
				// Insert an empty element at the new ring buffer index
				ring.splice(ring.ringIndex, 0, undefined);
			} else {
				ring.ringIndex = (ring.ringIndex + 1) % ring.length;	
			}
		}
		i++;
	}
	return result;
}

function dumpRing() {
	var result = '';
	var i = 0;
	while (i < ring.length) {
		if (i === ring.ringIndex) result += '>';
		result += ring[i] ? ring[i].key : '?';
		result += ' ';
		i++;
	}
	console.log(result);
}


// Load up the dictionary
console.time("read dictionary");
fs.readFile(__dirname + '/eldamo-data.xml', 'utf8', function (err, data) {
	if (err) {
		return console.log(err);
	}
	console.timeEnd("read dictionary");
	console.time("parse dictionary");
    doc = new xmlDoc(data);
	console.timeEnd("parse dictionary");

	console.time("cache preload");
	// Preload a cache
	[	'gondor', 'silver', 'hello', 'namarie', 'star', 'aragorn', 'legolas',
		'galad', 'gilthoniel', 'pedo', 'mountain',
		
		'fire', 'white', 'black', 'grey', 'glass', 'ash', 'one', 'nine',
		'friend', 'family',
		
		'day', 'sky', 'fly', 'wood',  'tree', 'forest', 'right', 'sam',

		'the', 'always', 'speak', 'all', 'you', 'your', 'are',
		"i'm", 'how', 'for', 'from', 'when', 'what', 'this', 'their',
		
		'mount', 'gilth', 'nama', 'ara', 'arag', 'aragor'
	]
	.forEach(x => cache[x] = JSON.stringify(eachWord(doc, x)));
	console.timeEnd("cache preload");

	console.log("ready");
});

// Startup the app
app.set('port', (process.env.PORT || 5000));

// Search route
app.get('/define/:word', function(req, res) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET');
	res.header("Access-Control-Allow-Headers", "X-Requested-With");

	var q = asciiFolder.fold(req.params.word).toLowerCase();

	if (cache[q]) {
		console.time("define (cached): " + q);
	    res.setHeader('Content-Type', 'application/json');
    	res.send(cache[q]);
		console.timeEnd("define (cached): " + q);
		return;
	}


	var r = getFromRing(q);
	if (r) {
		console.log("define (ring): " + q);
	} else {
		console.time("define: " + q);
		r = JSON.stringify(eachWord(doc, q));
		addToRing(q, r);
		console.timeEnd("define: " + q);
	}

	dumpRing();


	res.setHeader('Content-Type', 'application/json');
	res.send(r);
	// res.json(eachWord(doc, q));
});

app.use(function (req, res, next) {
	res.status(404).send('Not found :( ');
});

app.listen(app.get('port'), function () {
  console.log('Running on port', app.get('port'));
});


