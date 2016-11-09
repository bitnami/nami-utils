'use strict';

const yaml = require('js-yaml');
const _ = require('../../lodash-extra.js');
const exists = require('../exists.js');
const isFile = require('../is-file.js');
const read = require('../read.js');

/**
 * Get value from .yaml file
 *
 * @function $file~yaml/get
 * @param {string} file - Yaml File to read the value from
 * @param {string} key to read (it can read nested keys: `'outerKey/innerKey'` or `'/outerKey/innerKey'`. `null` or `'/'` will match all the document)
 * @param {Object} [options]
 * @param {string} [options.encoding=utf-8] - Encoding used to read the file
 * @param {string} [options.default=''] - Default value if key not found
 * @throws Will throw an error if the path is not a file
 */
function yamlFileGet(file, key, options) {
  function extractValue(data, keys) {
    if (typeof keys === 'string' ) {
      return data[keys];
    } else {
      if (keys.length === 1) {
        return data[keys[0]];
      } else {
        return extractValue(data[keys.shift()], keys);
      }
    }
  }

  options = _.sanitize(options, {encoding: 'utf-8', default: ''});
  if (key === null) {
    key = '/';
  }
  if (!exists(file)) {
    throw new Error(`File '${file}' does not exist`);
  } else if (!isFile(file)) {
    throw new Error(`File '${file}' is not a file`);
  }

  const config = yaml.safeLoad(read(file, _.pick(options, 'encoding')));
  let value;
  if (key === '/') {
    value = config;
  } else {
    key = key.replace(/^\//, '');
    value = extractValue(config, key.split('/'));
  }

  return _.isUndefined(value) ? options.default : value;
}


module.exports = yamlFileGet;
