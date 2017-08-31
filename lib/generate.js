#!/usr/bin/env node
/* eslint no-var: 0 */
console.log("Building AST...");
const argv = require('yargs').argv
var babylon = require("babylon");
var fs      = require("fs");

var filename = argv.adaptor;
if (!filename) {
  console.error("no filename specified");
  process.exit(0);
}

var file = fs.readFileSync(filename, "utf8");
var ast  = babylon.parse(file, {
  sourceType: "module"
});

exportedFunctions = ast.program.body.filter(function(item){
  return item.type == "FunctionDeclaration";
}).filter(function(item){
  return item.id.name != "execute" &&
         item.id.name !="_toConsumableArray";
});

const formattedFunctions = exportedFunctions.map(function(item) {

    const params = item.params.map((item) => {
      return {
        name: item.name,
        type: item.type
      }
    })

    const docs = (
      item.leadingComments ? item.leadingComments.filter(function(item) {
          return item.type == "CommentBlock";
        }).map(function(item) {
          return item.value
        }) : "none."
    )

    return {
      name: item.id.name,
      params,
      docs: docs
    }
})

writeable = JSON.stringify(formattedFunctions, null, "  ");
fs.writeFile('ast.json', writeable)
console.log("Done ✓")
