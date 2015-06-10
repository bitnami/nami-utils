'use strict';

const path = require('path');
const _ = require('../lodash-extra.js');
const fileExists = require('../file/exists.js');

/**
 * Get full path to a binary in the system PATH
 * @function $os~findInPath
 * @param {string} binary - Binary to look for
 * @returns {string} - The full path to the binary or null if it is not in the PATH
 * @example
 * // Get the path of the 'node' binary
 * $os.findInPath('node');
 * => '/usr/local/bin/node'
 */
function findInPath(binary) {
  const envPath = (process.env.PATH || '').split(path.delimiter);
  const foundPath = _.first(_.filter(envPath, (dir) => {
    return fileExists(path.join(dir, binary));
  }));
  return foundPath ? path.join(foundPath, binary) : null;
}

module.exports = findInPath;
