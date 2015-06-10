'use strict';

const _ = require('../../lodash-extra.js');

const isPlatform = require('../is-platform.js');
const runProgram = require('../run-program.js');
const runningAsRoot = require('../running-as-root.js');
const groupExists = require('./group-exists.js');
const _getNextOsxGid = require('./common.js').getNextOsxGid;

/**
 * Add a group to the system
 * @function $os~addGroup
 * @param {string} group - Groupname
 * @param {Object} [options]
 * @param {string|number} [options.gid=null] - Group ID
 * @example
 * // Creates group 'mysql'
 * $os.addGroup('mysql');
 */
function addGroup(group, options) {
  options = _.opts(options, {gid: null});
  if (!runningAsRoot()) return;
  if (!group) throw new Error('You must provide a group');
  if (groupExists(group)) {
    return;
  }

  if (isPlatform('linux')) {
    runProgram('groupadd', [group]);
  } else if (isPlatform('osx')) {
    const gid = options.gid || _getNextOsxGid();
    runProgram('dscl', ['.', '-create', `/Groups/${group}`, 'gid', gid]);
  } else if (isPlatform('windows')) {
    throw new Error(`Don't know how to add group ${group} on Windows`);
  } else {
    throw new Error(`Don't know how to add group ${group}in current platform`);
  }
}

module.exports = addGroup;
