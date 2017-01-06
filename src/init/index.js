'use strict';
var utils = require('../utils'),
  unixStylePath = utils.unixStylePath,
  PLUGIN_NAME = utils.PLUGIN_NAME,
  through = require('through2'),
  path = require('path'),
  acorn = require('acorn'),
  SourceMapGenerator = require('source-map').SourceMapGenerator,
  css = require('css'),
  loadMaps = require('./loadMaps');

/**
 * Initialize source mapping chain
 */
function init(options) {
  var debug = require('debug-fabulous')()(PLUGIN_NAME + ':init');

  function sourceMapInit(file, encoding, callback) {
    /*jshint validthis:true */

    // pass through if file is null or already has a source map
    if (file.isNull() || file.sourceMap) {
      this.push(file);
      return callback();
    }

    if (file.isStream()) {
      return callback(new Error(PLUGIN_NAME + '-init: Streaming not supported'));
    }

    if (options === undefined) {
      options = {};
    }
    debug(function() {
      return options;
    });

    var fileContent = file.contents.toString();
    var sourceMap, preExistingComment;

    if (options.loadMaps) {
      var result = loadMaps({file:file, fileContent:fileContent}, options);
      sourceMap = result.map;
      fileContent = result.content;
      preExistingComment = result.preExistingComment;
    }

    if (!sourceMap && options.identityMap) {
      debug(function() {
        return 'identityMap';
      });
      var fileType = path.extname(file.path);
      var source = unixStylePath(file.relative);
      var generator = new SourceMapGenerator({file: source});

      if (fileType === '.js') {
        var tokenizer = acorn.tokenizer(fileContent, {locations: true});
        while (true) {
          var token = tokenizer.getToken();
          if (token.type.label === "eof")
            break;
          var mapping = {
            original: token.loc.start,
            generated: token.loc.start,
            source: source
          };
          if (token.type.label === 'name') {
            mapping.name = token.value;
          }
          generator.addMapping(mapping);
        }
        generator.setSourceContent(source, fileContent);
        sourceMap = generator.toJSON();

      } else if (fileType === '.css') {
        debug('css');
        var ast = css.parse(fileContent, {silent: true});
        debug(function() {
          return ast;
        });
        var registerTokens = function(ast) {
          if (ast.position) {
            generator.addMapping({original: ast.position.start, generated: ast.position.start, source: source});
          }

          function logAst(key, ast) {
            debug(function() {
              return 'key: ' + key;
            });
            debug(function() {
              return ast[key];
            });
          }

          for (var key in ast) {
            logAst(key, ast);
            if (key !== "position") {
              if (Object.prototype.toString.call(ast[key]) === '[object Object]') {
                registerTokens(ast[key]);
              } else if (Array.isArray(ast[key])) {
                debug(function() {
                  return "@@@@ ast[key] isArray @@@@";
                });
                for (var i = 0; i < ast[key].length; i++) {
                  registerTokens(ast[key][i]);
                }
              }
            }
          }
        };
        registerTokens(ast);
        generator.setSourceContent(source, fileContent);
        sourceMap = generator.toJSON();
      }
    }

    if (!sourceMap) {
      // Make an empty source map
      sourceMap = {
        version: 3,
        names: [],
        mappings: '',
        sources: [unixStylePath(file.relative)],
        sourcesContent: [fileContent]
      };
    }
    else if(preExistingComment !== null && typeof preExistingComment !== 'undefined')
      sourceMap.preExistingComment = preExistingComment;

    sourceMap.file = unixStylePath(file.relative);
    file.sourceMap = sourceMap;

    this.push(file);
    callback();
  }

  return through.obj(sourceMapInit);
}

module.exports = init;
