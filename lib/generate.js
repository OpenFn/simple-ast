#!/usr/bin/env node
/* eslint no-var: 0 */
const argv = require("yargs").argv;
var babylon = require("@babel/parser");
var fs = require("fs");
var path = require("path");
var doctrine = require("doctrine");
var isEqual = require("lodash.isequal");

var filename = argv.adaptor;
if (!filename) {
  console.error("No filename was specified.");
  process.exit(0);
}

var outputPath = argv.output;
if (!outputPath) {
  console.error("No output directory specified");
  process.exit(0);
}

var file = fs.readFileSync(filename, "utf8");
console.log(`Parsing ${filename}`);
var ast = babylon.parse(file, {
  sourceType: "module",
}).program.body;

// Pull out relevant functions and variables...
function exportedExpressions(ast) {
  exportedFunctions = ast
    .filter(function (item) {
      return item.type == "FunctionDeclaration";
    })
    .filter(function (item) {
      return !item.id.name.startsWith("_") && item.id.name != "execute";
    });

  exportedVariables = ast
    .filter(function (item) {
      return item.type == "VariableDeclaration";
    })
    .filter(function (item) {
      return !item.declarations[0].id.name.startsWith("_");
    })
    .filter(function (item) {
      return item.declarations[0].init && item.declarations[0].init.right;
    });

  externalFunctions = ast
    .filter(function (item) {
      return item.type == "ExpressionStatement";
    })
    .filter(function (item) {
      if (item.expression.arguments && item.expression.arguments.length > 2) {
        return (
          item.expression.arguments[2].properties[0].key.name == "enumerable"
        );
      }
    })
    .map(function (item) {
      return item.expression.arguments[1].value;
    });

  return { exportedFunctions, exportedVariables, externalFunctions };
}

function parseDocs(item) {
  docs = item.leadingComments
    ? item.leadingComments
        .filter(function (item) {
          return item.type == "CommentBlock";
        })
        .map(function (item) {
          return doctrine.parse(item.value, { unwrap: true, sloppy: true });
        })
    : [];

  if (docs.length > 1) {
    console.log(
      "\x1b[31m%s\x1b[0m",
      `Warning: Multiple leading comment blocks found. Discarding all but first:`
    );
    item.leadingComments.map(function (item) {
      console.log(item.value);
    });
  }

  return docs[0];
}

// Check if the documented params match the real params
function checkDocs(name, docs, params, last) {
  var statedParams = docs
    ? docs.tags
        .filter(function (item) {
          return item.title == "param";
        })
        .map(function (item) {
          return item.name;
        })
    : "No docs.";

  if (isEqual(statedParams, params)) {
    process.stdout.write(`${last ? "└─ " : "├─ "}`);
    console.log("\x1b[32m%s\x1b[0m", `${name} is properly documented ✓`);
    return true;
  } else {
    process.stdout.write(`${last ? "└─ " : "├─ "}`);
    console.log(
      "\x1b[33m%s\x1b[0m",
      `Warning: Invalid documentation for ${name} ✗`
    );
    return false;
  }
}

// Format them for use on OpenFn...
function format(exp) {
  const countFuncs = exp.exportedFunctions.length;
  const formattedFunctions = exp.exportedFunctions.map(function (item, index) {
    countFuncs === index + 1 ? (last = true) : (last = false);
    const name = item.id.name;
    const params = item.params.map((item) => {
      return item.name;
    });
    const docs = parseDocs(item);
    const valid = checkDocs(name, docs, params, last);

    return {
      name,
      params,
      docs,
      valid,
    };
  });

  const countVars = exp.exportedVariables.length;

  const formattedVariables = exp.exportedVariables.map(function (item, index) {
    countVars === index + 1 ? (last = true) : (last = false);
    const name = item.declarations[0].id.name;
    const params = item.declarations[0].init.right.arguments[0].params.map(
      (item) => {
        return item.name;
      }
    );
    const docs = parseDocs(item);
    const valid = checkDocs(name, docs, params, last);

    return {
      name,
      params,
      docs,
      valid,
    };
  });

  return { formattedFunctions, formattedVariables };
}

var adaptorAst = exportedExpressions(ast);

const formattedAst = format(adaptorAst);

const operations = formattedAst.formattedFunctions
  .concat(formattedAst.formattedVariables)
  .filter(function (op) {
    const public =
      (op.docs ? op.docs.tags : []).filter(function (tag) {
        return tag.title == "public";
      }).length > 0;

    if (public) {
      console.assert(
        op.valid,
        "\x1b[31m%s\x1b[0m",
        `Functions tagged as @public must pass validation: "${op.name}" failed ✗`
      );
    }
    return public;
  });

//Parses functions from other files inside the same folder
var dirname = path.dirname(filename);
filepaths = ast
  .filter(function (item) {
    return item.type == "VariableDeclaration";
  })
  .filter(function (item) {
    if (item.declarations[0].init.callee) {
      return (
        item.declarations[0].init.callee.name == "require" &&
        item.declarations[0].init.arguments[0].value.includes("./")
      );
    }
  })
  .map(function (item) {
    return path.resolve(
      dirname,
      item.declarations[0].init.arguments[0].value + ".js"
    );
  });

exportsAst = filepaths.map(function (item) {
  var exportsFile = fs.readFileSync(item, "utf8");
  console.log(`Parsing ${item}`);
  var astExport = babylon.parse(exportsFile, {
    sourceType: "module",
  }).program.body;
  return exportedExpressions(astExport);
});

//Imports function from language-common AST
var commonPath = path.resolve(
  filename,
  "../../node_modules/language-common/ast.json"
);
var commonFile;
try {
  commonFile = fs.readFileSync(commonPath, "utf8");
} catch (error) {}
if (commonFile) {
  var commonAst = JSON.parse(commonFile).operations;
} else {
  var commonAst = [];
}

//Checks for exported functions from other files inside the same folder
const formattedExports = exportsAst.map(function (item) {
  return format(item);
});

const exported = formattedExports.map(function (item) {
  const exp = item.formattedFunctions
    .concat(item.formattedVariables)
    .filter(function (c) {
      return adaptorAst.externalFunctions.includes(c.name);
    })
    .filter(function (p) {
      const public =
        (p.docs ? p.docs.tags : []).filter(function (tag) {
          return tag.title == "public";
        }).length > 0;

      if (public) {
        console.assert(
          p.valid,
          "\x1b[31m%s\x1b[0m",
          `Functions tagged as @public must pass validation: "${p.name}" failed ✗`
        );
      }
      return public;
    });
  return exp;
});

//Checks for exported functions from language-common
var commons = commonAst.filter(function (item) {
  return adaptorAst.externalFunctions.includes(item.name);
});

const finalAST = {
  operations,
  exports: exported,
  common: commons,
};

writeable = JSON.stringify(finalAST, null, "  ");
fs.writeFile(outputPath, writeable, (err) => {
  if (err) throw err;
  console.log("The AST has been written.");
});
