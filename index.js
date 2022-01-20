"use strict";

const express = require("express");
const app = express();

const os = require("os");
const fs = require("fs");
const xmlDoc = require("xmldoc").XmlDocument;
const ASCIIFolder = require("./ascii-folder");
const asciiFolder = new ASCIIFolder();

// Ignore the following words when building the index from the lemma (v)
// and the gloss (definition)
const STOP_WORDS = [
  "?",
  "[]",
  "[=",
  "&",
  "=",
  "-",
  "*-",
  "/",
  ">>}",
  "a",
  "b",
  "c.",
  "am",
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "f.",
  "go",
  "he",
  "i",
  "if",
  "in",
  "it",
  "is",
  "m.",
  "me",
  "my",
  "n.",
  "no",
  "o",
  "of",
  "on",
  "or",
  "q.",
  "sg",
  "so",
  "t.",
  "to",
  "the",
  "up",
  "us",
  "we",
  "(lit.", // For the "*(lit.)" case
  "lit.", // For the "(lit.)" case
  "...",
];

const gShortDefinitions = new Map();

const gEldamoDictionary = loadDictionary();

/**
 * Give a query string, return an array of entries that match.
 * Each entry includes a score property from 1-100 indicating how
 * closely it matches the query. The entries are in no particular order.
 */
function matchQuery(q) {
  let result = [];
  for (const entry of gEldamoDictionary) {
    const score = computeScore(entry, q);
    if (score > 0) {
      result.push({
        ...entry,
        score,
        elements: entry.elements.map((v) => {
          return { v, gloss: gShortDefinitions.get(q) ?? "" };
        }),
      });
    }
  }
  return result;
}

// gRing is a dynamic, fixed-size cache
const RING_SIZE = 40;
const gRing = new Array(RING_SIZE);

let gRingIndex = 0;

function addToRing(k, v) {
  gRing[gRingIndex] = { key: k, value: v };
  gRingIndex = (gRingIndex + 1) % RING_SIZE;
}

function getFromRing(k) {
  let result;
  let i = 0;
  while (!result && i < gRing.length) {
    if (gRing[i] && gRing[i].key === k) {
      // Found a matching key in the ring buffer
      result = gRing[i].value;

      if (gRingIndex !== i) {
        gRing[gRingIndex] = gRing[i];
        // Remove the key/value pair from its previous location
        gRing.splice(i, 1);

        // Adjust the ring index if the removed element was after it
        if (i > gRingIndex) {
          gRingIndex = (gRingIndex + 1) % gRing.length;
        }

        // Insert an empty element at the new ring buffer index
        gRing.splice(gRingIndex, 0, undefined);
      } else {
        gRingIndex = (gRingIndex + 1) % gRing.length;
      }
    }
    i++;
  }
  return result;
}

/**
 * Compute a score from 0 to 100 indicate how well this node
 * matches the query q. q should be ascii and case folded.
 */
function computeScore(node, q) {
  let score = 0;
  for (const word of node.index) {
    score = Math.max(score, computeWordScore(word, q));
    if (score === 99) {
      // The whole word matched.
      // Check if this is a perfect match for the lemma or the gloss.
      if (asciiFolder.fold(node.v).toLowerCase() === q) return 100;
      if (asciiFolder.fold(node.gloss).toLowerCase() === q) return 100;
    }
  }

  return Math.round(score);
}

function computeWordScore(word, q) {
  if (word === q) return 99;
  if (word.startsWith(q)) return (98 * q.length) / word.length;
  if (word.indexOf(q) >= 0) return (70 * q.length) / word.length;

  return 0;
}

/**
 * Debugging function to display the content of the ring
 */
function dumpRing() {
  if (!isDevelopment()) return;
  let result = "";
  let i = 0;
  while (i < gRing.length) {
    if (i === gRingIndex) result += ">";
    result += gRing[i] ? gRing[i].key : "?";
    result += " ";
    i++;
  }
  console.log(result);
}

// Startup the app
app.set("port", process.env.PORT ?? 39999);

// Search route
app.get("/define/:word", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  let q = asciiFolder.fold(req.params.word).toLowerCase();

  let r = getFromRing(q);
  if (r) {
    if (isDevelopment()) console.log(`Definition "${q}" from ring`);
  } else {
    console.time(`Definition "${q}"`);
    r = JSON.stringify(matchQuery(q));
    addToRing(q, r);
    console.timeEnd(`Definition "${q}"`);
  }

  // dumpRing();

  res.setHeader("Content-Type", "application/json");
  res.send(r);
});

app.use((_req, res, _next) => {
  res.status(404).send("Unknown route. Use /define/:word");
});

app.listen(app.get("port"), () => {
  if (isDevelopment())
    console.log(
      "Listening at",
      `http://${os.hostname()}:${app.get("port")}/define/`
    );
});

/**
 * Return an array of strings representing terms to index this entry with.
 * The index is composed of the lemma (v) and the gloss (definition) for the
 * entry.
 */
function computeIndex(node) {
  const index = [];

  // The index includes an ascii and case folded version of the words of the
  // lemma (v)
  const v = asciiFolder.fold(node.attr.v).toLowerCase().split(" ");
  for (const word of v) if (word) index.push(word);

  // ...and the words from the gloss (definition)
  // (ngloss is the gloss including neo- definitions, use it
  // if present)
  const phrases = asciiFolder
    .fold(node.attr.ngloss ?? node.attr.gloss ?? "")
    .toLowerCase()
    .split(/[,;]/);

  for (const phrase of phrases) {
    for (let word of phrase.split(" ")) {
      if (word) {
        const firstChar = word[0];
        if (/[\*\?\(\{\[]/.test(firstChar)) word = word.substring(1);

        const lastChar = word[word.length - 1];
        if (/[\]\)]/.test(lastChar)) word = word.substring(0, -1);

        if (word && !/[0-9]+/.test(word) && !STOP_WORDS.includes(word)) {
          index.push(word);
        }
      }
    }
  }
  return index;
}

/**
 * Return the lemma for the node, with any necessary tengwar correction
 * applied (i.e. initial noldo, suule, etc...)
 */
function correctTengwar(node) {
  let v = node.attr.v;
  const tengwar = node.attr.tengwar;
  if (!v || !tengwar) return v;

  // The `tengwar` attribute contains a hint for the tengwar spelling
  // of some words.
  // This is useful for words that begin with "n" (some of which should
  // be written with noldo rather than nuumen) or that contain an
  // "s" that should be written with a
  // thorn or tilde-n to indicate that suule rather than silme
  if (tengwar === "ñ" || tengwar === "ñ-") {
    // The ñ/noldo can only be the initial letter
    if (v[0] === "n") v = "ñ" + v.substring(1);
    else if (v[0] === "N") v = "Ñ" + v.substring(1);
  } else if (tengwar === "þ" || tengwar === "þ-") {
    // Firs "s" in word is assumed to be the one the tengwar correction applies to
    const index = v.toLowerCase().indexOf("s");
    if (index >= 0) {
      v =
        v.substr(0, index) +
        (v[index] === "S" ? "Þ" : "þ") +
        v.substr(index + 1);
    }
  } else if (tengwar === "ñorþus") {
    v = "Ñorþus";
  }

  return v;
}

/**
 * Turn the eldamo XML dictionary into an array of entries
 */
function compileDictionary(eldamoRoot) {
  const result = compileDictionaryRecursive(eldamoRoot);
  for (const entry of result) {
    if (entry.gloss && entry.gloss !== "[unglossed]") {
      if (!gShortDefinitions.has(entry.v)) {
        gShortDefinitions.set(entry.v, entry.gloss);
      } else {
        const def = gShortDefinitions.get(entry.v);
        if (def !== entry.gloss) {
          gShortDefinitions.set(entry.v, def + " / " + entry.gloss);
        }
      }
    }
  }
  return result;
}

function compileDictionaryRecursive(node) {
  let result = [];
  if (node.name === "word") {
    const pos = node.attr.speech ?? ""; // Part of speech
    if (
      pos !== "suf" &&
      pos !== "pref" &&
      pos !== "phoneme" &&
      pos !== "phonetics" &&
      pos !== "phonetic-rule" &&
      pos !== "phonetic-group" &&
      pos !== "grammar"
    ) {
      const elements = node
        .childrenNamed("element")
        .map((x) => x.attr.v)
        .filter((x) => x !== undefined);
      const notes = node.childNamed("notes");
      result = [
        {
          v: correctTengwar(node),
          index: computeIndex(node),
          language: node.attr.l,
          pos,
          gloss: node.attr.ngloss ?? node.attr.gloss,
          stem: node.attr.stem,
          notes: notes ? notes.val : undefined,
          tengwar: node.attr.tengwar,
          elements,
        },
      ];
    }
  }
  node.eachChild((child) => {
    result.push(...compileDictionaryRecursive(child));
  });

  return result;
}

/**
 * Read the dictionary as a JSON file, if available.
 * If the JSON file is not present, create it from the XML file,
 * then write it to disk.
 * When updating eldamo, simply delete the JSON file, and run once
 */
function loadDictionary() {
  let result = undefined;
  try {
    console.time("Load dictionary");
    try {
      result = JSON.parse(
        fs.readFileSync(__dirname + "/eldamo-data.json", {
          encoding: "utf8",
        })
      );
    } catch (err) {
      const data = fs.readFileSync(__dirname + "/eldamo-data.xml", {
        encoding: "utf8",
      });

      result = compileDictionary(new xmlDoc(data));
      fs.writeFile(
        __dirname + "/eldamo-data.json",
        JSON.stringify(result),
        {
          encoding: "utf8",
        },
        (status) => {
          if (status) console.log("Error writing dictionary", status);
        }
      );
    }
    console.timeEnd("Load dictionary");

    console.log("Ready");
  } catch (err) {
    console.error("Error loading dictionary", err);
  }
  return result;
}

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}
