'use strict';


const fs = require('fs-extra');
const _ = require('../lodash-extra.js');

function fileStats(file, options) {
  options = _.opts(options, {acceptLinks: true});
  return (options.acceptLinks ? fs.statSync(file) : fs.lstatSync(file));
}

function fileType(file) {
  let type = 'unknown';
  try {
    const stats = fs.lstatSync(file);
    switch (true) {
      case stats.isSymbolicLink():
        type = 'link';
        break;
      case stats.isDirectory():
        type = 'directory';
        break;
      case stats.isFile():
        type = 'file';
        break;
      default:
        type = 'unknown';
    }
  } catch (e) {
    type = 'unknown';
  }
  return type;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternExpander(pattern, options) {
  options = _.opts(options, {simpleMatching: false});
  // We convert * to **/**, which match anything in the path (including 'foo.txt'). ** would not match a/b/foo.txt
  return options.simpleMatching ? pattern.replace(/\*(\*?)/g, '**/**') : pattern;
}

module.exports = {fileStats, fileType, patternExpander, escapeRegExp};
