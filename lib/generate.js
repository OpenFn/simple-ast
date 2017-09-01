#!/usr/bin/env node
/* eslint no-var: 0 */
const argv  = require('yargs').argv
var babylon = require("babylon");
var fs      = require("fs");
var doctrine = require("doctrine");
var isEqual = require('lodash.isequal');

var filename = argv.adaptor;
if (!filename) {
  console.error("No filename was specified.");
  process.exit(0);
}

var outputDir = argv.output;
if (!outputDir) {
  console.error("No output directory specified");
  process.exit(0);
}

var file = fs.readFileSync(filename, "utf8");
var ast  = babylon.parse(file, {
  sourceType: "module"
}).program.body;

// Pull out relevant functions and variables...
exportedFunctions = ast.filter(function(item){
  return item.type == "FunctionDeclaration";
}).filter(function(item){
  return !item.id.name.startsWith("_")  &&
         item.id.name != "execute"
});

exportedVariables = ast.filter(function(item){
  return item.type == "VariableDeclaration";
}).filter(function(item){
  return !item.declarations[0].id.name.startsWith("_");
})

function parseDocs(item) {

  docs = (item.leadingComments ?

    item.leadingComments.filter(function(item) {
      return item.type == "CommentBlock";
    }).map(function(item) {
      return doctrine.parse(item.value, { unwrap: true });
    }) : []

  )

  return docs;

}

// Check if the documented params match the real params
function checkDocs(name, docs, params) {

  var realParams = ( docs[0] ? docs[0].tags.filter(function(item) {
    return item.title == "param"
  }).map(function(item) {
    return item.name;
  }) : "No docs.")

  if (isEqual(realParams, params)) {
    return true
  } else {
    console.log(`✗ Warning: Invalid documentation for ${name}.`)
    return false
  }

}

// Format them for use on OpenFn...
const formattedFunctions = exportedFunctions.map(function(item) {

  const name = item.id.name;
  const params = item.params.map((item) => { return item.name })
  const docs = parseDocs(item)
  const valid = checkDocs(name, docs, params)

  return {
    name,
    params,
    docs,
    valid
  }
})

const formattedVariables = exportedVariables.map(function(item) {

    const name = item.declarations[0].id.name;
    const params = item.declarations[0].init.right.arguments[0].params.map((item) => {
      return item.name
    })
    const docs = parseDocs(item)
    const valid = checkDocs(name, docs, params)

    return {
      name,
      params,
      docs,
      valid
    }
})

const operations = formattedFunctions.concat(formattedVariables)

writeable = JSON.stringify(operations, null, "  ");
fs.writeFile(`${outputDir}/ast.json`, writeable)
console.log("✓ Open Function AST written.");
