'use strict';

const yaml = require('js-yaml');
const _ = require('../../lodash-extra.js');
const exists = require('../exists.js');
const touch = require('../touch.js');
const isFile = require('../is-file.js');
const read = require('../read.js');
const write = require('../write.js');

/**
 * Set value in yaml file
 *
 * @function $file~yaml/set
 * @param {string} file - Yaml file to write the value to
 * @param {string} key
 * @param {string} value
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
  function setValue(data, keys) {
    if (typeof keys === 'string') {
      return data[keys];
    } else {
      if (keys.length === 1) {
        data[keys[0]] = value;
        return data;
      } else {
        const parentKey = keys.shift();
        if (! data[parentKey]) {
          data[parentKey] = {};
        }
        data[parentKey] = setValue(data[parentKey], keys);
        return data[parentKey];
      }
    }
  }

  if (typeof key === 'object') {
    if (typeof value === 'object') {
      options = value;
    } else {
      options = {};
    }
  }
  options = _.sanitize(options, {encoding: 'utf-8', retryOnENOENT: true});
  if (!exists(file)) {
    touch(file);
  } else if (!isFile(file)) {
    throw new Error(`File ${file} is not a file`);
  }

  let config = yaml.safeLoad(read(file, _.pick(options, 'encoding')));
  if (typeof key === 'string') {
    if (key === '/') {
      config = value;
    } else {
      key = key.replace(/^\//, '');
      setValue(config, key.split('/'), value);
    }
  } else {
    _.merge(config, key);
  }

  write(file, yaml.safeDump(config), options);
}


module.exports = yamlFileSet;
