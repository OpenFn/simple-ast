#!/usr/bin/env node
/* eslint no-var: 0 */
const argv  = require('yargs').argv
var babylon = require("babylon");
var fs = require("fs");
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
var ast = babylon.parse(file, {
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
    console.log("\x1b[32m%s\x1b[0m", ` ${name} is properly documented ✓`)
    return true
  } else {
    console.log("\x1b[31m%s\x1b[0m", ` Warning: Invalid documentation for ${name} ✗`)
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

// List the language-common functions this adpator exports...
commonFunctions = ast.filter(function(item){
  return item.type == "ExpressionStatement";
}).filter(function(item){
  if (item.expression.arguments) {
    return item.expression.arguments[2].properties[0].key.name == "enumerable";
  }
})

formattedCommons = commonFunctions.map(function(item){
  return item.expression.arguments[1].value
});

const operations = formattedFunctions.concat(formattedVariables)
const finalAST = {
  operations,
  commons: formattedCommons
}

writeable = JSON.stringify(finalAST, null, "  ");
fs.writeFile(`${outputDir}/ast.json`, writeable)
