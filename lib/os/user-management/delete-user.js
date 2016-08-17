'use strict';

const findInPath = require('../find-in-path.js');
const userExists = require('./user-exists.js');
const isPlatform = require('../is-platform.js');
const runProgram = require('../run-program.js');
const runningAsRoot = require('../running-as-root.js');
const isBusyboxCommand = require('../../common.js').isBusyboxCommand;


/**
 * Delete system user
 * @function $os~deleteUser
 * @param {string|number} user - Username or user id
 * @example
 * // Delete mysql user
 * $os.deleteUser('mysql');
 */
function deleteUser(user) {
  if (!runningAsRoot()) return;
  if (!user) throw new Error('You must provide an username');
  if (!userExists(user)) {
    return;
  }
  if (isPlatform('linux')) {
    if (findInPath('userdel')) { // most modern systems
      runProgram('userdel', [user]);
    } else {
      if (isBusyboxCommand('deluser')) { // busybox-based systems
        runProgram('deluser', [user]);
      } else {
        throw new Error(`Don't know how to delete user ${user} on this strange linux`);
      }
    }
  } else if (isPlatform('osx')) {
    runProgram('dscl', ['.', '-delete', `/Users/${user}`]);
  } else if (isPlatform('windows')) {
    throw new Error('Don\'t know how to delete user in Windows');
  } else {
    throw new Error('Don\'t know how to delete user in current platform');
  }
}

module.exports = deleteUser;
