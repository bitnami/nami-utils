'use strict';

const yaml = require('js-yaml');
const _ = require('../../lodash-extra.js');
const read = require('../read.js');

function _extractValue(data, key) {
  if (_.isUndefined(key) || _.isNull(key)) {
    key = '/';
  }
  if (_.isString(key)) { // format '/outerKey/innerKey'
    if (key === '/' || key === '') {
      return data;
    } else {  // convert to format ['outerKey', 'innerKey']
      key = key.replace(/^\//, '').split('/');
    }
  }
  if (_.isArray(key)) {
    if (key.length === 1) {
      return data[key[0]];
    } else {
      const parentKey = key[0];
      key = key.slice(1);
      const newData = data[parentKey];
      if (newData === undefined) {
        return undefined;
      } else if (!_.isPlainObject(newData)) {
        throw new Error(`Cannot get key '${key}', parent key '${parentKey}' does not contain an object.`);
      } else {
        return _extractValue(newData, key); // recursive call with an inner level
      }
    }
  }
  // not array either string
  throw new TypeError('Expected `key` to be an array or a string.');
}

/**
 * Get value from .yaml file
 *
 * @function $file~yaml/get
 * @param {string} file - Yaml File to read the value from
 * @param {string} key to read (it can read nested keys: `'outerKey/innerKey'` or `'/outerKey/innerKey'`. `null` or `'/'` will match all the document). Alternative format: ['outerKey', 'innerKey'].
 * @param {Object} [options]
 * @param {string} [options.encoding=utf-8] - Encoding used to read the file
 * @param {string} [options.default=''] - Default value if key not found
 * @returns {string|Number|boolean|Array|Object} Returns the field extracted from the yaml or the default value
 * @throws Will throw an error if the path is not a file
 */
function yamlFileGet(file, key, options) {
  if (_.isPlainObject(key) && arguments.length === 2) {
    options = key;
    key = undefined;
  }
  options = _.sanitize(options, {encoding: 'utf-8', default: ''});
  const content = yaml.safeLoad(read(file, _.pick(options, 'encoding')));
  const value = _extractValue(content, key);
  return _.isUndefined(value) ? options.default : value;
}


module.exports = yamlFileGet;
