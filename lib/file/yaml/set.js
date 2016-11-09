'use strict';

const yaml = require('js-yaml');
const _ = require('../../lodash-extra.js');
const exists = require('../exists.js');
const touch = require('../touch.js');
const read = require('../read.js');
const write = require('../write.js');

function _setValue(data, key, value) {
  if (_.isPlainObject(key)) { // keyMapping
    return _.merge(data, key);
  } else {
    if (_.isUndefined(key) || _.isNull(key)) {
      key = '/';
    }
    if (_.isString(key)) {
      if (key === '/' || key === '') {
        data = value;
        return data;
      } else {
        key = key.replace(/^\//, '').split('/');
      }
    }
    if (_.isArray(key)) {
      const parentKey = key[0];
      key = key.slice(1);
      if (!_.isString(parentKey)) {
        throw new TypeError(`All the components in the array 'key' should be strings.`);
      }
      if (key.length === 0) {
        data[parentKey] = value;
        return data;
      }
      if (_.isUndefined(data[parentKey])) {
        data[parentKey] = {};
      } else if (!_.isPlainObject(data[parentKey])) {
        throw new Error(`Cannot set key, parent key '${parentKey}' does not contain an object.`);
      }
      data[parentKey] = _setValue(data[parentKey], key, value); // recursive call with an inner level
      return data;
    } else {
      throw new TypeError(`'key' must be a string ('/outerKey/innerKey') or an array of of strings ('['outerKey', 'innerKey']')`);
    }
  }
}

/**
 * Set value in yaml file
 *
 * @function $file~yaml/set
 * @param {string} file - Yaml file to write the value to
 * @param {string} key (it can read nested keys: `'outerKey/innerKey'` or `'/outerKey/innerKey'`. `null` or `'/'` will match all the document). Alternative format: ['outerKey', 'innerKey'].
 * @param {string|Number|boolean|Array|Object} value
 * @param {Object} [options]
 * @param {string} [options.encoding=utf-8] - Encoding used to read the file
 * @param {boolean} [options.retryOnENOENT=true] - Retry if writing files because of the parent directory does not exists
 * @throws Will throw an error if the path is not a file
 */
/**
 * Set value in yaml file
 *
 * @function $file~yaml/set²
 * @param {string} file - Yaml file to write the value to
 * @param {Object} keyMapping - key-value map to set in the file
 * @param {Object} [options]
 * @param {string} [options.encoding=utf-8] - Encoding used to read the file
 * @param {boolean} [options.retryOnENOENT=true] - Retry if writing files because of the parent directory does not exists
 * @throws Will throw an error if the path is not a file
 */
function yamlFileSet(file, key, value, options) {
  if (_.isPlainObject(key)) { // key is keyMapping
    if (!_.isUndefined(options)) {
      throw new Error('Wrong parameters. Cannot specify a keymapping and a value at the same time.');
    }
    if (_.isPlainObject(value)) {
      options = value;
    } else {
      options = {};
    }
  } else if (!_.isString(key) && !_.isArray(key)) {
    throw new Error('Wrong parameter `key`.');
  }
  options = _.sanitize(options, {encoding: 'utf-8', retryOnENOENT: true});
  if (!exists(file)) {
    touch(file);
  }

  let content = yaml.safeLoad(read(file, _.pick(options, 'encoding')));
  if (_.isUndefined(content)) {
    content = {};
  }
  content = _setValue(content, key, value);
  write(file, yaml.safeDump(content), options);
}

module.exports = yamlFileSet;
