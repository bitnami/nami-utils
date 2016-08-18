'use strict';

const findInPath = require('../find-in-path.js');
const groupExists = require('./group-exists.js');
const isPlatform = require('../is-platform.js');
const runProgram = require('../run-program.js');
const runningAsRoot = require('../running-as-root.js');
const isBusyboxCommand = require('../../common.js').isBusyboxCommand;


/**
 * Delete system group
 * @function $os~deleteGroup
 * @param {string|number} group - Groupname or group id
 * @example
 * // Delete mysql group
 * $os.deleteGroup('mysql');
 */
function deleteGroup(group) {
  if (!runningAsRoot()) return;
  if (!group) throw new Error('You must provide a group to delete');
  if (!groupExists(group)) {
    return;
  }

  if (isPlatform('linux')) {
    if (findInPath('groupdel')) { // most modern systems
      runProgram('groupdel', [group]);
    } else {
      if (isBusyboxCommand('delgroup')) { // busybox-based systems
        runProgram('delgroup', [group]);
      } else {
        throw new Error(`Don't know how to delete group ${group} on this strange linux`);
      }
    }
  } else if (isPlatform('osx')) {
    runProgram('dscl', ['.', '-delete', `/Groups/${group}`]);
  } else if (isPlatform('windows')) {
    throw new Error(`Don't know how to delete group ${group} on Windows`);
  } else {
    throw new Error(`Don't know how to delete group ${group} on the current platformp`);
  }
}

module.exports = deleteGroup;
