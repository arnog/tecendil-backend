"use strict";

var express = require("express");
var app = express();

var fs = require("fs");
var xmlDoc = require("xmldoc").XmlDocument;
var ASCIIFolder = require("./ascii-folder");
var asciiFolder = new ASCIIFolder();
var doc;

/**
 * Return a short-definition (gloss) for a term (lemma)
 * @param {string} q
 * @return {string}
 */
function getShortDefinition(q) {
  if (q === "?") return "";
  // Use a memoization cache (stored as a property of the function object)
  if (!getShortDefinition.cache) {
    getShortDefinition.cache = {};
    setTimeout(() => {
      console.log("clearing shortDef cache");
      getShortDefinition.cache = null;
    }, 5 * 60 * 60 * 1000);
  }
  var result = getShortDefinition.cache[q];
  if (!result) {
    // console.time("short def for " + q);
    result = getShortDefinitionRecursive(doc, q);
    getShortDefinition.cache[q] = result;
    // console.timeEnd("short def for " + q);
  } else {
    // console.log('shortdef cache for ' + q);
  }
  return result;
}

/**
 * Return a short gloss for the lemma `q`, starting at node `r`
 */
function getShortDefinitionRecursive(r, q) {
  var result = "";
  r.eachChild((n) => {
    if (n.name === "word" && n.attr.v === q) {
      result = n.attr.gloss;
      return false; // Found it. Stop iterating.
    }
    if (!result) {
      result = getShortDefinitionRecursive(n, q);
    }
  });

  return result;
}

/**
 * Recursively return results matching the query q in the node w.
 *  q should be case and diacritic folded
 * @param {string} w
 * @param {string} q
 */
function eachWord(w, q) {
  var result = [];
  var pos = w.attr.speech || "";

  if (
    w.name === "word" &&
    !(
      pos === "phonetics" ||
      pos === "phonetic-rule" ||
      pos === "phonetic-group" ||
      pos === "grammar"
    )
  ) {
    // Score how well the current node matches the query
    var score = 0;
    var i = 0;
    var v = w.attr.vfold;
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
        score = (100 * q.length) / v.length;
      } else if (i > 0) {
        score = (90 * q.length) / v.length;
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
        var gscore = 0; // Score for a gloss entry
        g.replace(/;/g, ",")
          .split(",")
          .map(function (entry) {
            entry = entry.trim();
            i = entry.indexOf(q);
            if (i === 0) {
              gscore = (90 * q.length) / entry.length;
            } else if (i > 0) {
              gscore = (70 * q.length) / entry.length;
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
        if (w.attr.tengwar === "ñ") {
          v = v.replace("n", "ñ");
          v = v.replace("N", "Ñ");
        } else if (w.attr.tengwar === "þ") {
          v = v.replace("s", "þ");
          v = v.replace("S", "Þ");
        }
      }
      var notes = w.childNamed("notes");
      var elements = w
        .childrenNamed("element")
        .map((x) => x.attr.v)
        .filter((x) => x !== undefined)
        .map((x) => {
          return { v: x, gloss: getShortDefinition(x) };
        });
      result = [
        {
          v: v,
          score: Math.round(score),
          language: w.attr.l,
          pos: pos,
          gloss: w.attr.gloss,
          stem: w.attr.stem,
          notes: notes ? notes.val : undefined,
          tengwar: w.attr.tengwar,
          elements: elements,
        },
      ];
    }
  }

  // Look for other words inside this word
  w.eachChild((word) => {
    result = result.concat(eachWord(word, q));
  });

  return result;
}

let gCache = {};
const RING_SIZE = 40;
let gRing = new Array(RING_SIZE);

gRing.ringIndex = 0;

function addToRing(k, v) {
  gRing[gRing.ringIndex] = { key: k, value: v };
  gRing.ringIndex = (gRing.ringIndex + 1) % gRing.length;
}

function getFromRing(k) {
  let result;
  let i = 0;
  while (!result && i < gRing.length) {
    if (gRing[i] && gRing[i].key === k) {
      // Found a matching key in the ring buffer
      result = gRing[i].value;

      if (gRing.ringIndex !== i) {
        gRing[gRing.ringIndex] = gRing[i];
        // Remove the key/value pair from its previous location
        gRing.splice(i, 1);

        // Adjust the ring index if the removed element was after it
        if (i > gRing.ringIndex) {
          gRing.ringIndex = (gRing.ringIndex + 1) % gRing.length;
        }

        // Insert an empty element at the new ring buffer index
        gRing.splice(gRing.ringIndex, 0, undefined);
      } else {
        gRing.ringIndex = (gRing.ringIndex + 1) % gRing.length;
      }
    }
    i++;
  }
  return result;
}

/**
 * Debugging function to display the content of the ring
 */
function dumpRing() {
  var result = "";
  var i = 0;
  while (i < gRing.length) {
    if (i === gRing.ringIndex) result += ">";
    result += gRing[i] ? gRing[i].key : "?";
    result += " ";
    i++;
  }
  console.log(result);
}

// Load up the dictionary
console.time("read dictionary");
fs.readFile(__dirname + "/eldamo-data.xml", "utf8", (err, data) => {
  if (err) {
    console.error(err);
    return;
  }
  console.timeEnd("read dictionary");
  console.time("parse dictionary");
  doc = new xmlDoc(data);
  console.timeEnd("parse dictionary");

  console.time("cache preload");
  // Preload a cache
  [
    "gondor",
    "silver",
    "hello",
    "namarie",
    "star",
    "aragorn",
    "legolas",
    "galad",
    "gilthoniel",
    "pedo",
    "mountain",

    "fire",
    "white",
    "black",
    "grey",
    "glass",
    "ash",
    "one",
    "nine",
    "friend",
    "family",

    "day",
    "sky",
    "fly",
    "wood",
    "tree",
    "forest",
    "right",
    "sam",

    "the",
    "always",
    "speak",
    "all",
    "you",
    "your",
    "are",
    "i'm",
    "how",
    "for",
    "from",
    "when",
    "what",
    "this",
    "their",

    "mount",
    "gilth",
    "nama",
    "ara",
    "arag",
    "aragor",
  ].forEach((x) => (gCache[x] = JSON.stringify(eachWord(doc, x))));
  console.timeEnd("cache preload");

  console.log("ready");
});

// Startup the app
app.set("port", process.env.PORT || 5000);

// Search route
app.get("/define/:word", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  var q = asciiFolder.fold(req.params.word).toLowerCase();

  if (gCache[q]) {
    console.time("define (cached): " + q);
    res.setHeader("Content-Type", "application/json");
    res.send(gCache[q]);
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

  res.setHeader("Content-Type", "application/json");
  res.send(r);
  // res.json(eachWord(doc, q));
});

app.use((_req, res, _next) => {
  res.status(404).send("Not found :( ");
});

app.listen(app.get("port"), () => {
  console.log("Running on port", app.get("port"));
});
